-- ASCOFIZZ — BASE FUNCTIONS (000)

create or replace function decrement_stock(p_id bigint, p_qty integer)
returns integer as $$
declare v_new integer;
begin
  update products
     set stock = greatest(0, coalesce(stock, 0) - p_qty),
         updated_at = now()
   where id = p_id
  returning stock into v_new;
  return v_new;
end;
$$ language plpgsql;

create or replace function decrement_stock_strict(p_id bigint, p_qty integer)
returns integer as $$
declare v_new integer;
begin
  update products
     set stock = stock - p_qty, updated_at = now()
   where id = p_id and stock >= p_qty
  returning stock into v_new;
  if v_new is null then
    raise exception 'Insufficient stock for product %', p_id;
  end if;
  return v_new;
end;
$$ language plpgsql;

create or replace function increment_coupon_use(p_code text)
returns integer as $$
declare v_used integer;
begin
  update coupons
     set used_count = coalesce(used_count, 0) + 1
   where lower(code) = lower(p_code)
     and (max_uses is null or coalesce(used_count, 0) < max_uses)
  returning used_count into v_used;
  return v_used;   -- null means the limit was already reached
end;
$$ language plpgsql;

create or replace function return_eligibility(p_order_id text)
returns table(eligible boolean, days_left integer, reason text) as $$
declare
  o record;
  v_start timestamptz;
  v_deadline timestamptz;
begin
  select id, fulfillment, created_at, delivered_at, customer_email
    into o from orders where id = p_order_id;

  if o.id is null then
    return query select false, 0, 'Order not found'; return;
  end if;
  if o.fulfillment in ('Cancelled','Returned') then
    return query select false, 0, 'This order was already ' || lower(o.fulfillment); return;
  end if;
  if exists (select 1 from returns
              where order_id = p_order_id
                and status in ('requested','approved','picked_up')) then
    return query select false, 0, 'A return request is already open for this order'; return;
  end if;

  v_start := coalesce(o.delivered_at, o.created_at);
  v_deadline := v_start + interval '7 days';

  if now() > v_deadline then
    return query select false, 0, 'The 7-day return window has closed'; return;
  end if;

  return query select true, greatest(0, extract(day from v_deadline - now())::integer), null::text;
end;
$$ language plpgsql;

create or replace function approve_return(
  p_return_id uuid,
  p_actor     text,
  p_note      text default null
) returns table(ok boolean, points_reversed integer, message text) as $$
declare
  r record;
  v_before integer;
  v_after  integer;
  v_delta  integer := 0;
begin
  select * into r from returns where id = p_return_id for update;
  if r.id is null then
    return query select false, 0, 'Return request not found'; return;
  end if;
  if r.status <> 'requested' then
    return query select false, 0, 'Only a requested return can be approved'; return;
  end if;

  select coalesce(balance, 0) into v_before
    from vita_balance where user_id = r.customer_email;
  v_before := coalesce(v_before, 0);

  -- Clawback. vita_reverse is idempotent (unique on order_id+type), so
  -- a double-approval cannot double-deduct.
  begin
    perform vita_reverse(r.order_id, 'return approved');
  exception when others then
    return query select false, 0, 'Points clawback failed: ' || sqlerrm; return;
  end;

  select coalesce(balance, 0) into v_after
    from vita_balance where user_id = r.customer_email;
  v_after := coalesce(v_after, 0);
  v_delta := v_after - v_before;

  update returns
     set status = 'approved',
         points_reversed = abs(v_delta),
         reviewed_by = p_actor,
         reviewed_at = now(),
         admin_note = coalesce(p_note, admin_note),
         updated_at = now()
   where id = p_return_id;

  update orders set fulfillment = 'Returned', updated_at = now()
   where id = r.order_id;

  insert into vita_audit (customer_email, order_id, return_id, action,
                          points_delta, balance_before, balance_after, actor, note)
  values (r.customer_email, r.order_id, p_return_id, 'return_approved',
          v_delta, v_before, v_after, p_actor, coalesce(p_note, 'return approved'));

  return query select true, abs(v_delta), 'Return approved and points reversed';
end;
$$ language plpgsql;

create or replace function reject_return(
  p_return_id uuid,
  p_actor     text,
  p_note      text default null
) returns table(ok boolean, message text) as $$
declare r record;
begin
  select * into r from returns where id = p_return_id for update;
  if r.id is null then
    return query select false, 'Return request not found'; return;
  end if;
  if r.status <> 'requested' then
    return query select false, 'Only a requested return can be rejected'; return;
  end if;

  update returns
     set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(),
         admin_note = coalesce(p_note, admin_note), updated_at = now()
   where id = p_return_id;

  -- No points move on a rejection, but the decision is still logged.
  insert into vita_audit (customer_email, order_id, return_id, action, points_delta, actor, note)
  values (r.customer_email, r.order_id, p_return_id, 'return_rejected', 0, p_actor,
          coalesce(p_note, 'return rejected'));

  return query select true, 'Return rejected';
end;
$$ language plpgsql;

create or replace function vita_clamp_negative(p_email text, p_actor text default 'system')
returns integer as $$
declare v_bal integer; v_fix integer;
begin
  select coalesce(balance, 0) into v_bal from vita_balance where user_id = p_email;
  v_bal := coalesce(v_bal, 0);
  if v_bal >= 0 then return v_bal; end if;

  v_fix := -v_bal;
  insert into vita_ledger (user_id, type, points, reason)
  values (p_email, 'admin_adjust', v_fix, 'write-off: clawback exceeded balance');

  insert into vita_audit (customer_email, action, points_delta, balance_before, balance_after, actor, note)
  values (p_email, 'negative_write_off', v_fix, v_bal, 0, p_actor,
          'clawback exceeded available balance');
  return 0;
end;
$$ language plpgsql;

create or replace function return_eligibility(p_order_id text)
returns table(eligible boolean, days_left integer, reason text) as $$
declare
  o record;
  v_window   constant interval := interval '7 days';
  v_grace    constant interval := interval '10 days';
  v_delivered timestamptz;
  v_deadline  timestamptz;
begin
  select id, fulfillment, created_at, updated_at, delivered_at, customer_email
    into o from orders where id = p_order_id;

  if o.id is null then
    return query select false, 0, 'Order not found'; return;
  end if;
  if o.fulfillment in ('Cancelled','Returned') then
    return query select false, 0, 'This order was already ' || lower(o.fulfillment); return;
  end if;
  if exists (select 1 from returns
              where order_id = p_order_id
                and status in ('requested','approved','picked_up')) then
    return query select false, 0, 'A return request is already open for this order'; return;
  end if;

  v_delivered := o.delivered_at;

  -- delivered_at can still be null on a row written by an older build, so
  -- fall back to the log, then to the flag on the order itself.
  if v_delivered is null then
    select min(created_at) into v_delivered
      from order_status_logs
     where order_id = p_order_id and new_status = 'Delivered';
  end if;
  if v_delivered is null and o.fulfillment = 'Delivered' then
    v_delivered := o.updated_at;
  end if;

  if v_delivered is not null then
    v_deadline := v_delivered + v_window;
  else
    v_deadline := o.created_at + v_grace + v_window;
  end if;

  if now() > v_deadline then
    return query select false, 0,
      'The 7-day return window closed on ' || to_char(v_deadline, 'DD Mon YYYY');
    return;
  end if;

  return query select true,
    greatest(0, ceil(extract(epoch from (v_deadline - now())) / 86400)::integer),
    null::text;
end;
$$ language plpgsql;

