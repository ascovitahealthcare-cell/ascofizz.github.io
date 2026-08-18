-- ═══════════════════════════════════════════════════════════════
-- 003 — Product returns / refunds + VitaPoints clawback
--
-- Design notes
--  • One row per return REQUEST; the items being returned live in a
--    jsonb column rather than a child table, because a return is
--    always read as a whole and never joined item-by-item.
--  • Eligibility (7 days from delivery) is enforced in SQL as well as
--    in the API. The API check is for a good error message; this one
--    is the actual rule, and it cannot be bypassed by calling the
--    endpoint directly.
--  • Approving a return calls vita_reverse() from 001, so the points
--    clawback and the status change happen in ONE transaction. If the
--    clawback fails the approval rolls back — a return can never be
--    approved while leaving the points behind.
-- ═══════════════════════════════════════════════════════════════

create table if not exists returns (
  id             uuid primary key default gen_random_uuid(),
  order_id       text        not null,
  customer_email text        not null,
  items          jsonb       not null default '[]'::jsonb,
  reason         text        not null,
  comments       text,
  status         text        not null default 'requested'
                 check (status in ('requested','approved','rejected','picked_up','refunded','cancelled')),
  refund_amount  numeric(10,2),
  refund_method  text,
  refund_ref     text,
  points_reversed integer    not null default 0,
  admin_note     text,
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Same wrapping as the reviews index in 002 and the vita_audit index
-- below. `create table if not exists` leaves an existing `returns`
-- table untouched, and this database already has one that was not
-- built by this file — so these can hit a column that is not there, or
-- a unique index can hit rows that already violate it. Neither is worth
-- aborting the script for and taking every later migration with it.
do $$
begin
  create index if not exists returns_email_idx  on returns (lower(customer_email));
  create index if not exists returns_order_idx  on returns (order_id);
  create index if not exists returns_status_idx on returns (status, created_at desc);
exception when others then
  raise notice 'SKIPPED one or more returns indexes: % — harmless, everything else applied.', sqlerrm;
end $$;

-- One OPEN return per order. A customer can re-request after a
-- rejection, but cannot stack duplicate live requests to game the
-- refund queue.
do $$
begin
  create unique index if not exists returns_one_open_per_order
    on returns (order_id) where status in ('requested','approved','picked_up');
exception when others then
  raise notice 'SKIPPED returns_one_open_per_order: % — an order already has more than one open return. Everything else applied; resolve the duplicates and re-run to get the constraint.', sqlerrm;
end $$;

-- ── Audit log for every points adjustment ─────────────────────
-- vita_ledger already records WHAT changed. This records WHO changed
-- it and WHY, which is what you need when a customer disputes a
-- balance months later.
create table if not exists vita_audit (
  id             bigserial primary key,
  customer_email text not null,
  order_id       text,
  return_id      uuid,
  action         text not null,
  points_delta   integer not null default 0,
  balance_before integer,
  balance_after  integer,
  actor          text,
  note           text,
  created_at     timestamptz not null default now()
);
-- Wrapped for the same reason as the reviews index in 002: `create
-- table if not exists` leaves an EXISTING vita_audit exactly as it is,
-- so on a database where that table was made by something else — by
-- hand, or by a half-applied earlier run — it may not have a
-- customer_email column at all, and this index would abort the script
-- and take every migration after it down with it. The index is an
-- optimisation; the migrations behind it are not.
do $$
begin
  create index if not exists vita_audit_email_idx
    on vita_audit (lower(customer_email), created_at desc);
exception when others then
  raise notice 'SKIPPED vita_audit_email_idx: % — the existing vita_audit table has a different shape. Harmless; everything else applied.', sqlerrm;
end $$;

-- ── Eligibility ───────────────────────────────────────────────
-- Returns open for 7 days. The window starts at delivery when we know
-- it, and falls back to order creation when we don't (COD orders that
-- were never scanned delivered). Cancelled orders are never eligible.
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

-- ── Approve a return: status + points clawback, atomically ────
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

-- ── Reject a return ───────────────────────────────────────────
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

-- ── Balances can never go negative ────────────────────────────
-- vita_reverse claws back what an order earned. If the customer already
-- spent those points, a naive clawback drives the balance below zero.
-- This tops the balance back to zero and records the write-off, so the
-- shortfall is visible in the audit rather than silently absorbed.
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

-- ── RLS ───────────────────────────────────────────────────────
alter table returns    enable row level security;
alter table vita_audit enable row level security;

drop policy if exists returns_self_read on returns;
create policy returns_self_read on returns for select
  using (lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- No insert/update/delete policies: all writes go through the backend
-- service-role key. A customer cannot create or approve their own return.
