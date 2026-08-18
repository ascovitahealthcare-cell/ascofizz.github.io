-- ═══════════════════════════════════════════════════════════════
-- 004 — Give the return window a delivery date to start from
--
-- THE BUG
--   003_returns.sql declared the rule as "7 days from delivery":
--       v_start := coalesce(o.delivered_at, o.created_at);
--   but no migration in this repo ever creates orders.delivered_at, and
--   nothing writes it. So the plpgsql body failed at runtime with
--   "column delivered_at does not exist", returns-routes.js caught the
--   RPC error, logged a warning nobody reads, and fell through to its JS
--   fallback — which reads order.delivered_at off a row that has no such
--   column, gets undefined, and starts the clock at created_at.
--
--   The result was a return window that opens the moment an order is
--   PLACED and closes seven days later. Delivery across India takes 3–5
--   business days. By the time a customer had the product in their hands
--   the window had usually shut, /api/returns/eligible reported every
--   order ineligible, the Returns & Refunds panel said "No orders are
--   currently eligible", and there was no way to raise a refund request
--   at all. Nothing errored; the feature was just silently unusable.
--
-- WHAT THIS DOES
--   1. Adds orders.delivered_at and backfills it from the status log,
--      which has been recording the Delivered transition all along.
--   2. Rewrites return_eligibility() so the window starts at delivery,
--      and so an order that has NOT been delivered yet cannot have its
--      window expire underneath it.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

alter table orders add column if not exists delivered_at timestamptz;

create index if not exists orders_delivered_at_idx on orders (delivered_at);

-- Backfill from order_status_logs: the first row that moved the order to
-- Delivered is the delivery moment. Orders marked Delivered before the
-- log existed fall back to updated_at, which is when someone last touched
-- the row and is the closest thing to a delivery stamp we have.
update orders o
   set delivered_at = l.first_delivered
  from (
    select order_id, min(created_at) as first_delivered
      from order_status_logs
     where new_status = 'Delivered'
     group by order_id
  ) l
 where l.order_id = o.id
   and o.delivered_at is null;

update orders
   set delivered_at = updated_at
 where delivered_at is null
   and fulfillment = 'Delivered'
   and updated_at is not null;

-- ── Eligibility, corrected ────────────────────────────────────
-- Returns stay open for 7 days after the parcel arrives.
--
-- The awkward case is an order we have no delivery stamp for: a COD
-- parcel the courier never scanned, or one an admin has not marked yet.
-- Starting its clock at created_at is what broke this feature, so the
-- window instead starts at created_at + DELIVERY_GRACE and the customer
-- keeps the full 7 days on top. That can leave a never-delivered order
-- returnable for longer than intended, which is the right way round to
-- be wrong: an admin can reject a return request, but a customer cannot
-- raise one the API refuses to create.
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
