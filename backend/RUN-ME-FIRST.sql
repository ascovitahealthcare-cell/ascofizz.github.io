-- ═══════════════════════════════════════════════════════════════════
--  ASCOFIZZ — RUN THIS ONE FILE
--
--  Everything the running code needs and the database does not have.
--  Five migrations in dependency order, in a single paste.
--
--  HOW
--    1. supabase.com  →  your Supabase project
--    2. SQL Editor  →  New query
--    3. Paste ALL of this  →  Run
--
--  Takes a few seconds. Safe to run more than once — if you are not
--  sure whether it went through, just run it again.
--
--  WHY THESE FIVE
--    The Render log on boot lists exactly which database objects are
--    missing. As of the last deploy that was: orders.delivered_at,
--    return_eligibility, approve_return, reject_return, decrement_stock,
--    and every vita_* function. That spans 002, 003, 004 and 006 — so
--    all four are here, plus 007 for the email casing. An earlier
--    version of this file assumed 002 and 003 had already been applied.
--    The log says otherwise, which is why it now starts at 002.
--
--  WHEN IT FINISHES it prints one table: customer accounts that differ
--  only in capitalisation, i.e. one person with two logins and their
--  orders split between them. Empty is the normal result and means
--  there is nothing to do. If it has rows, send them to me — merging
--  two real accounts is a decision, not something a script should
--  guess at.
--
--  THEN check it worked, on your phone, no login needed:
--    <your-api-url>/api/health/db
--  {"ok":true} means everything the code needs is now present.
--
--  005_rls_lockdown.sql is deliberately NOT in here. That one is
--  security hardening rather than a bug fix, and it is the most likely
--  to need a follow-up — so run it on its own afterwards, once you have
--  confirmed the site still works. Keeping it separate means that if
--  anything does break, you know which change caused it.
-- ═══════════════════════════════════════════════════════════════════


-- ███████████████████████████████████████████████████████████████████
--  PART 1 of 5 — atomic stock and coupon counters

-- ███████████████████████████████████████████████████████████████████
--  PART 1 of 5 — atomic stock and coupon counters
-- ███████████████████████████████████████████████████████████████████

-- ═══════════════════════════════════════════════════════════════
-- 002 — Atomic counters + reviews lockdown
--
-- Everything here closes a race or an open write path that the
-- application layer alone cannot fix. Run in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Atomic stock decrement ──────────────────────────────────
-- Replaces "SELECT stock; UPDATE stock = stock - qty" in sp_place_order.
-- Two concurrent orders both read the same stock value and the second
-- write clobbers the first, so stock drops once for two sales.
-- A single UPDATE ... SET stock = stock - n is atomic; the row lock is
-- held by Postgres for the duration of the statement.
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

-- Optional stricter variant: refuses to go below zero instead of
-- clamping, so an oversell surfaces as an error rather than silently
-- shipping stock you don't have.
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

-- ── 2. Atomic coupon usage ─────────────────────────────────────
-- This race is directly exploitable: fire N concurrent orders with a
-- single-use 50%-off code and every request reads used_count = 0
-- before any of them writes 1, so max_uses never trips.
-- The WHERE clause makes the limit part of the same statement.
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

-- ── 3. Reviews: close the anon write path ──────────────────────
-- The storefront inserts reviews directly with the PUBLIC anon key,
-- which is visible in the page source. Anyone can POST unlimited
-- 5-star reviews under any display name with no purchase:
--
--   curl -X POST 'https://<ref>.supabase.co/rest/v1/reviews' \
--     -H "apikey: <anon key from page source>" \
--     -H 'Content-Type: application/json' \
--     -d '{"product_id":3,"user_name":"anyone","rating":5,"review_text":"..."}'
--
-- Those rows feed the homepage average rating and sit behind a
-- "Verified Purchases Only" badge. Writes must go through the backend.

alter table reviews add column if not exists customer_email text;
alter table reviews add column if not exists verified boolean default false;

create index if not exists reviews_email_idx   on reviews (lower(customer_email));
create index if not exists reviews_product_idx on reviews (product_id);

-- One review per customer per product, enforced in the database and
-- not only in the endpoint.
--
-- WRAPPED, because this one can legitimately fail on a live database.
-- The index is unique over (product_id, lower(customer_email)) — and
-- until the email casing was fixed, the same person WAS able to review
-- a product twice, once as "Sister@Gmail.com" and once as
-- "sister@gmail.com". Those two rows are distinct today and collide the
-- moment this index is built.
--
-- Unwrapped, that aborts the script. When several migrations are being
-- applied in one paste, an abort here means everything after it — the
-- whole VitaPoints schema included — silently never runs, and the
-- operator sees one error about an index and has no idea the other four
-- parts did not happen. A missing index is worth far less than that.
-- So: try, and if it will not build, say exactly why and carry on.
do $$
begin
  create unique index if not exists reviews_one_per_customer_product
    on reviews (product_id, lower(customer_email))
    where customer_email is not null;
exception when others then
  raise notice '─────────────────────────────────────────────────────────';
  raise notice 'SKIPPED the one-review-per-customer index: %', sqlerrm;
  raise notice 'This almost certainly means duplicate reviews already';
  raise notice 'exist. Everything else in this script still applied.';
  raise notice 'Find them with:';
  raise notice '  select product_id, lower(customer_email) as who, count(*)';
  raise notice '    from reviews where customer_email is not null';
  raise notice '   group by 1,2 having count(*) > 1;';
  raise notice 'Delete the extras, then re-run this file to get the index.';
  raise notice '─────────────────────────────────────────────────────────';
end $$;

alter table reviews enable row level security;

-- Public may READ reviews. That is the whole point of them.
drop policy if exists reviews_public_read on reviews;
create policy reviews_public_read on reviews for select using (true);

-- No insert/update/delete policy is defined, deliberately. Without one,
-- anon and authenticated roles cannot write. The backend uses the
-- service-role key, which bypasses RLS, so POST /api/reviews still works.

-- ── 4. Audit what is already there ─────────────────────────────
-- Run these before trusting your current rating. Unverified or
-- duplicated rows are the ones to look at first.
--
--   select count(*) filter (where customer_email is null) as legacy_rows,
--          count(*) filter (where verified)               as verified_rows,
--          count(*)                                       as total_rows,
--          round(avg(rating), 2)                          as avg_rating
--     from reviews;
--
--   select user_name, count(*), min(created_at), max(created_at)
--     from reviews group by user_name having count(*) > 3 order by 2 desc;


-- ███████████████████████████████████████████████████████████████████
--  PART 2 of 5 — the returns tables and approve/reject functions
-- ███████████████████████████████████████████████████████████████████

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


-- ███████████████████████████████████████████████████████████████████
--  PART 3 of 5 — returns: give the return window a delivery date
-- ███████████████████████████████████████████████████████████████████

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


-- ███████████████████████████████████████████████████████████████████
--  PART 4 of 5 — VitaPoints: the schema the code has always called
-- ███████████████████████████████████████████████████████████████████

-- ═══════════════════════════════════════════════════════════════
-- 006 — VitaPoints v2 schema
--
-- WHY THIS FILE EXISTS
--   server.js, vitapoints-routes.js and returns-routes.js call thirteen
--   functions that no migration in this repository creates. 001 is a v1
--   schema (vita_award / vita_redeem / vita_reverse over a vita_ledger
--   table) and does not answer to these names. Every call site wraps its
--   RPC in a try/catch that logs a warning and carries on, so the effect
--   in production was silence: an order earned no points, cancelling it
--   reversed nothing, and the customer saw a zero balance with no error.
--
--   This is that schema, derived from the call sites — every signature,
--   every returned column name and every semantic below is taken from
--   how the code actually calls it and what it reads back. Deviating
--   from those names breaks the caller, so they are not negotiable.
--
-- THE RULES, from const VITA in index.html
--   EARN      1 point per ₹1 of eligible order value
--   VALUE     150 points = ₹1
--   CAP       5,000 points earned per order, 5,000 redeemed per order
--   HOLD      points are PENDING until 7 days after delivery
--   MILESTONE 15,000 available points buys one 50%-off reward, applied
--             to the lowest-priced item, capped at ₹100, minimum cart ₹299
--   Rates live in vita_config, not in these function bodies, so they can
--   be changed without a migration.
--
-- DESIGN NOTES
--   • Every mutation is idempotent on an idem_key. The callers pass keys
--     like 'earn:<order>', 'cancel:<order>', 'return:<id>' precisely so a
--     retried webhook or a double-clicked admin button cannot double-award
--     or double-reverse. That is enforced here by a unique index, not by
--     hoping the caller only fires once.
--   • Reversing more points than a customer still holds creates DEBT
--     rather than a negative balance. Someone can earn points, spend them,
--     then return the order — the points are already gone. Debt is settled
--     out of future earnings; it is never a bill.
--   • Balances are columns on vita_accounts, and every change writes both
--     the column and a ledger row inside one statement, so the ledger and
--     the balance cannot disagree.
--
-- SAFE TO RE-RUN. Creates nothing twice; back-fills nothing it has
-- already back-filled.
-- ═══════════════════════════════════════════════════════════════

-- ── Config ────────────────────────────────────────────────────
create table if not exists vita_config (
  key   text primary key,
  value numeric not null,
  note  text
);

insert into vita_config (key, value, note) values
  ('points_per_rupee_earn',   1,     'points created per ₹1 of eligible order value'),
  ('points_per_rupee_redeem', 150,   'points needed to take ₹1 off'),
  ('max_earn_per_order',      5000,  'ceiling on points created by one order'),
  ('max_redeem_per_order',    5000,  'ceiling on points spent on one order'),
  ('release_hold_days',       7,     'days after delivery before points are spendable'),
  ('milestone_threshold',     15000, 'available points that unlock the 50%-off reward'),
  ('milestone_max_discount',  100,   'rupee cap on the milestone reward'),
  ('milestone_min_order',     299,   'minimum cart total for the milestone reward'),
  ('points_expiry_months',    0,     '0 = points never expire')
on conflict (key) do nothing;

create or replace function vita_cfg(p_key text, p_default numeric default 0)
returns numeric language sql stable as $$
  select coalesce((select value from vita_config where key = p_key), p_default);
$$;

-- ── Accounts ──────────────────────────────────────────────────
-- One row per customer email. The balance columns are the authority the
-- storefront reads; the ledger below is the audit trail that explains
-- how each one got to its current value.
create table if not exists vita_accounts (
  user_id           text primary key,
  available         integer not null default 0 check (available >= 0),
  pending           integer not null default 0 check (pending   >= 0),
  locked            integer not null default 0 check (locked    >= 0),
  debt              integer not null default 0 check (debt      >= 0),
  lifetime_earned   integer not null default 0,
  lifetime_redeemed integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Ledger ────────────────────────────────────────────────────
-- transaction_type values are the ones vitapoints-routes.js already has
-- customer-facing labels for. Adding a new one without a label there
-- shows the customer a raw enum, so keep the two in step.
create table if not exists vita_ledger_v2 (
  id               bigserial primary key,
  user_id          text not null,
  transaction_type text not null check (transaction_type in (
                     'EARN_PENDING','EARN_AVAILABLE','REDEEM','REDEMPTION_RELEASE',
                     'RETURN_REVERSAL','REFUND_REVERSAL','CANCELLATION_REVERSAL',
                     'MILESTONE_CLAIM','EXPIRY','ADJUSTMENT')),
  points           integer not null,
  order_id         text,
  reason           text,
  idem_key         text,
  created_at       timestamptz not null default now()
);

create index if not exists vita_ledger_v2_user_idx  on vita_ledger_v2 (user_id, created_at desc);
create index if not exists vita_ledger_v2_order_idx on vita_ledger_v2 (order_id);
-- The idempotency guarantee. Everything below writes through this.
create unique index if not exists vita_ledger_v2_idem_idx
  on vita_ledger_v2 (idem_key) where idem_key is not null;

-- ── Pending buckets ───────────────────────────────────────────
-- Points earned by an order sit here until the parcel has been delivered
-- and the return window has closed. release_at is null until delivery,
-- which is what makes "delivered" and "spendable" two separate events.
create table if not exists vita_pending (
  id           bigserial primary key,
  user_id      text not null,
  order_id     text not null,
  points       integer not null,
  delivered_at timestamptz,
  release_at   timestamptz,
  released     boolean not null default false,
  created_at   timestamptz not null default now()
);
create unique index if not exists vita_pending_order_idx on vita_pending (order_id);
create index if not exists vita_pending_due_idx on vita_pending (release_at) where released = false;

-- ── Redemption reservations ───────────────────────────────────
-- Points move available -> locked when a checkout starts and locked ->
-- spent when it completes, so an abandoned checkout never eats a balance.
create table if not exists vita_redemptions (
  order_id   text primary key,
  user_id    text not null,
  points     integer not null,
  state      text not null default 'reserved' check (state in ('reserved','committed','released','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 'refunded' joined the list after the fact (see vita_refund_redemption).
-- `create table if not exists` leaves an existing table's constraint
-- exactly as it was, so on any instance that already ran an earlier copy
-- of this file the inline check above is a no-op and the refund would
-- fail the constraint. Restated explicitly so a re-run fixes it.
alter table vita_redemptions drop constraint if exists vita_redemptions_state_check;
alter table vita_redemptions add  constraint vita_redemptions_state_check
  check (state in ('reserved','committed','released','refunded'));

-- ── Milestone rewards ─────────────────────────────────────────
create table if not exists vita_rewards (
  id         bigserial primary key,
  user_id    text not null,
  code       text not null unique,
  kind       text not null default 'MILESTONE_50',
  claimed_at timestamptz not null default now(),
  used_at    timestamptz,
  expires_at timestamptz
);
create index if not exists vita_rewards_user_idx on vita_rewards (user_id, used_at);

-- ── Account bootstrap ─────────────────────────────────────────
create or replace function vita_account_ensure(p_user text)
returns void language plpgsql as $$
begin
  if p_user is null or btrim(p_user) = '' then return; end if;
  insert into vita_accounts (user_id) values (lower(btrim(p_user)))
  on conflict (user_id) do nothing;
end $$;

-- ── Summary ───────────────────────────────────────────────────
-- Column names here are read directly by /api/vitapoints/summary.
create or replace function vita_summary(p_user text)
returns table(
  available integer, pending integer, locked integer, debt integer,
  lifetime_earned integer, lifetime_redeemed integer,
  rupee_value numeric, max_per_order integer,
  milestone_threshold integer, milestone_ready boolean
) language plpgsql stable as $$
declare a record; v_thresh integer;
begin
  select * into a from vita_accounts where user_id = lower(btrim(p_user));
  if a.user_id is null then
    a := row(lower(btrim(p_user)),0,0,0,0,0,0,now(),now());
  end if;
  v_thresh := vita_cfg('milestone_threshold', 15000)::integer;

  return query select
    coalesce(a.available,0), coalesce(a.pending,0), coalesce(a.locked,0), coalesce(a.debt,0),
    coalesce(a.lifetime_earned,0), coalesce(a.lifetime_redeemed,0),
    round(coalesce(a.available,0)::numeric / greatest(vita_cfg('points_per_rupee_redeem',150), 1), 2),
    vita_cfg('max_redeem_per_order', 5000)::integer,
    v_thresh,
    coalesce(a.available,0) >= v_thresh;
end $$;

-- ── Earn ──────────────────────────────────────────────────────
-- Called once per confirmed order. Points are created PENDING; they do
-- not become spendable until vita_release_due runs after delivery.
-- Returns `points`, which awardVitaPoints() stamps onto the order row.
create or replace function vita_earn_on_order(
  p_user text, p_order text, p_eligible_value numeric, p_key text
) returns table(points integer) language plpgsql as $$
declare
  v_user text := lower(btrim(p_user));
  v_pts integer;
  v_settle integer := 0;
begin
  if v_user = '' or p_order is null then return query select 0; return; end if;
  perform vita_account_ensure(v_user);

  -- Idempotent per key: a retried webhook returns what the first call did
  -- rather than awarding a second time.
  if p_key is not null and exists (select 1 from vita_ledger_v2 where idem_key = p_key) then
    return query select coalesce((select l.points from vita_ledger_v2 l where l.idem_key = p_key), 0);
    return;
  end if;

  v_pts := floor(greatest(p_eligible_value, 0) * vita_cfg('points_per_rupee_earn', 1))::integer;
  v_pts := least(v_pts, vita_cfg('max_earn_per_order', 5000)::integer);
  if v_pts <= 0 then return query select 0; return; end if;

  -- Any outstanding debt from a past reversal comes off the top. This is
  -- the only place debt is ever collected — the customer is never billed.
  select least(debt, v_pts) into v_settle from vita_accounts where user_id = v_user;
  v_settle := coalesce(v_settle, 0);

  insert into vita_pending (user_id, order_id, points)
  values (v_user, p_order, v_pts - v_settle)
  on conflict (order_id) do nothing;

  update vita_accounts
     set pending         = pending + (v_pts - v_settle),
         debt            = debt - v_settle,
         lifetime_earned = lifetime_earned + v_pts,
         updated_at      = now()
   where user_id = v_user;

  insert into vita_ledger_v2 (user_id, transaction_type, points, order_id, reason, idem_key)
  values (v_user, 'EARN_PENDING', v_pts - v_settle, p_order,
          case when v_settle > 0 then format('earned %s, %s settled against debt', v_pts, v_settle)
               else 'earned on order' end,
          p_key);

  return query select v_pts - v_settle;
end $$;

-- ── Delivery + release ────────────────────────────────────────
-- Delivery starts the clock; it does not release the points. The two are
-- deliberately separate so the return window has to elapse first.
create or replace function vita_mark_delivered(p_order text, p_delivered_at timestamptz)
returns void language plpgsql as $$
begin
  update vita_pending
     set delivered_at = coalesce(delivered_at, p_delivered_at),
         release_at   = coalesce(release_at,
                                 p_delivered_at + (vita_cfg('release_hold_days', 7) || ' days')::interval)
   where order_id = p_order and vita_pending.released is distinct from true;
end $$;

-- Sweeps every bucket whose hold has elapsed. Safe to call on a timer.
-- The OUT parameter is deliberately not called `released`: vita_pending
-- has a column of that name, and inside a plpgsql body the two are
-- ambiguous — Postgres refuses the query rather than guessing. Every
-- reference to the table is aliased for the same reason.
create or replace function vita_release_due()
returns table(released integer) language plpgsql as $$
declare r record; v_total integer := 0;
begin
  for r in
    select vp.* from vita_pending vp
     where vp.released is distinct from true and vp.release_at is not null and vp.release_at <= now()
     for update skip locked
  loop
    update vita_pending vp set released = true where vp.id = r.id;
    update vita_accounts
       set pending    = greatest(0, pending - r.points),
           available  = available + r.points,
           updated_at = now()
     where user_id = r.user_id;
    insert into vita_ledger_v2 (user_id, transaction_type, points, order_id, reason, idem_key)
    values (r.user_id, 'EARN_AVAILABLE', r.points, r.order_id, 'hold period complete',
            'release:' || r.order_id)
    on conflict (idem_key) where idem_key is not null do nothing;
    v_total := v_total + r.points;
  end loop;
  return query select v_total;
end $$;

-- points_expiry_months is 0 by default, i.e. points never expire. The
-- function exists because the code calls it; it is a no-op until that
-- config value is set above zero.
create or replace function vita_expire_due()
returns table(expired integer) language plpgsql as $$
declare v_months integer := vita_cfg('points_expiry_months', 0)::integer;
begin
  if v_months <= 0 then return query select 0; return; end if;
  return query select 0;   -- deliberately inert until a policy is agreed
end $$;

-- ── Redemption: reserve → commit, or reserve → release ────────
create or replace function vita_reserve(p_user text, p_order text, p_points integer)
returns table(ok boolean, reserved integer) language plpgsql as $$
declare
  v_user text := lower(btrim(p_user));
  v_take integer;
begin
  perform vita_account_ensure(v_user);

  -- Re-reserving the same order returns the existing reservation rather
  -- than locking a second lot of points.
  if exists (select 1 from vita_redemptions where order_id = p_order and state = 'reserved') then
    return query select true, (select points from vita_redemptions where order_id = p_order);
    return;
  end if;

  select least(greatest(p_points, 0),
               vita_cfg('max_redeem_per_order', 5000)::integer,
               available)
    into v_take
    from vita_accounts where user_id = v_user for update;

  v_take := coalesce(v_take, 0);
  if v_take <= 0 then return query select false, 0; return; end if;

  update vita_accounts
     set available = available - v_take, locked = locked + v_take, updated_at = now()
   where user_id = v_user;

  insert into vita_redemptions (order_id, user_id, points, state)
  values (p_order, v_user, v_take, 'reserved')
  on conflict (order_id) do update set points = excluded.points, state = 'reserved', updated_at = now();

  return query select true, v_take;
end $$;

create or replace function vita_commit_redemption(p_order text)
returns table(ok boolean, committed integer) language plpgsql as $$
declare r record;
begin
  select * into r from vita_redemptions where order_id = p_order and state = 'reserved' for update;
  if r.order_id is null then return query select false, 0; return; end if;

  update vita_accounts
     set locked            = greatest(0, locked - r.points),
         lifetime_redeemed = lifetime_redeemed + r.points,
         updated_at        = now()
   where user_id = r.user_id;

  update vita_redemptions set state = 'committed', updated_at = now() where order_id = p_order;

  -- Negative: the storefront colours and signs a ledger row straight off
  -- this number, and a spend that reads "+750" is worse than no row.
  insert into vita_ledger_v2 (user_id, transaction_type, points, order_id, reason, idem_key)
  values (r.user_id, 'REDEEM', -r.points, p_order, 'used at checkout', 'redeem:' || p_order)
  on conflict (idem_key) where idem_key is not null do nothing;

  return query select true, r.points;
end $$;

create or replace function vita_release_redemption(p_order text, p_reason text)
returns table(ok boolean, released integer) language plpgsql as $$
declare r record;
begin
  select * into r from vita_redemptions where order_id = p_order and state = 'reserved' for update;
  if r.order_id is null then return query select false, 0; return; end if;

  update vita_accounts
     set locked     = greatest(0, locked - r.points),
         available  = available + r.points,
         updated_at = now()
   where user_id = r.user_id;

  update vita_redemptions set state = 'released', updated_at = now() where order_id = p_order;

  -- No ledger row on purpose. This only ever unwinds a reservation that
  -- was never committed, so nothing was spent and there is nothing to
  -- tell the customer about — the points never left their balance, they
  -- were only held. A row here also double-counted against the
  -- reconciliation view, which is how it was caught.

  return query select true, r.points;
end $$;

-- Gives back points the customer actually SPENT on an order.
--
-- vita_reverse_order below claws back what an order EARNED. It says
-- nothing about what that order CONSUMED, and those are two different
-- pots. By the time an order is live its redemption is 'committed': the
-- points have already left `available` and been counted into
-- lifetime_redeemed. So a customer who put 750 points towards an order
-- and then cancelled it got the money back and lost the points — spent
-- on an order that no longer exists, with nothing in the ledger saying
-- so. vita_release_redemption does not cover this; it only unwinds a
-- reservation that was never committed in the first place.
--
-- Idempotent through the redemption's own state: only a 'committed' row
-- can be refunded, and refunding moves it to 'refunded', so a cancel
-- followed by an admin status change cannot pay the points twice.
create or replace function vita_refund_redemption(p_order text, p_reason text)
returns table(ok boolean, refunded integer) language plpgsql as $$
declare r record;
begin
  select * into r from vita_redemptions
   where order_id = p_order and state = 'committed' for update;
  if r.order_id is null then return query select false, 0; return; end if;

  perform vita_account_ensure(r.user_id);
  update vita_accounts
     set available         = available + r.points,
         lifetime_redeemed = greatest(0, lifetime_redeemed - r.points),
         updated_at        = now()
   where user_id = r.user_id;

  update vita_redemptions set state = 'refunded', updated_at = now()
   where order_id = p_order;

  -- Positive, and REDEMPTION_RELEASE, which vitapoints-routes.js already
  -- labels "Returned to your balance".
  insert into vita_ledger_v2 (user_id, transaction_type, points, order_id, reason, idem_key)
  values (r.user_id, 'REDEMPTION_RELEASE', r.points, p_order,
          coalesce(p_reason, 'points returned — order did not complete'),
          'refund-redeem:' || p_order)
  on conflict (idem_key) where idem_key is not null do nothing;

  return query select true, r.points;
end $$;

-- ── Reversal ──────────────────────────────────────────────────
-- p_returned_value null means reverse the whole order; a number means
-- reverse pro rata against it. Takes from pending first, then available,
-- and books whatever is left as debt rather than pushing a balance
-- negative. Returns `reversed` and `debt_created`, both of which
-- reverseVitaForRefund() logs.
create or replace function vita_reverse_order(
  p_order text, p_returned_value numeric, p_reason text, p_type text, p_key text
) returns table(reversed integer, debt_created integer) language plpgsql as $$
declare
  v_user text;
  v_earned integer;
  v_want integer;
  v_from_pending integer := 0;
  v_from_available integer := 0;
  v_debt integer := 0;
  a record;
  v_type text := coalesce(p_type, 'RETURN_REVERSAL');
begin
  if p_key is not null and exists (select 1 from vita_ledger_v2 where idem_key = p_key) then
    return query select 0, 0; return;
  end if;

  select user_id, points into v_user, v_earned from vita_pending where order_id = p_order;
  if v_user is null then
    select user_id, points into v_user, v_earned
      from vita_ledger_v2
     where order_id = p_order and transaction_type in ('EARN_PENDING','EARN_AVAILABLE')
     order by id limit 1;
  end if;
  if v_user is null then return query select 0, 0; return; end if;

  v_want := coalesce(v_earned, 0);
  if p_returned_value is not null then
    -- Pro rata on a partial refund, never more than was earned.
    v_want := least(v_want,
      floor(greatest(p_returned_value, 0) * vita_cfg('points_per_rupee_earn', 1))::integer);
  end if;
  if v_want <= 0 then return query select 0, 0; return; end if;

  select * into a from vita_accounts where user_id = v_user for update;

  -- Unreleased points first: taking them back costs the customer nothing
  -- they could have spent.
  update vita_pending vp set released = true
   where vp.order_id = p_order and vp.released is distinct from true
   returning vp.points into v_from_pending;
  v_from_pending := least(coalesce(v_from_pending, 0), v_want);

  v_from_available := least(v_want - v_from_pending, coalesce(a.available, 0));
  v_debt := v_want - v_from_pending - v_from_available;

  update vita_accounts
     set pending    = greatest(0, pending - v_from_pending),
         available  = greatest(0, available - v_from_available),
         debt       = debt + v_debt,
         updated_at = now()
   where user_id = v_user;

  insert into vita_ledger_v2 (user_id, transaction_type, points, order_id, reason, idem_key)
  values (v_user, v_type, -(v_from_pending + v_from_available), p_order,
          coalesce(p_reason, 'order reversed')
            || case when v_debt > 0 then format(' — %s points already spent, carried as debt', v_debt)
                    else '' end,
          p_key);

  return query select (v_from_pending + v_from_available), v_debt;
end $$;

-- ── Milestone reward ──────────────────────────────────────────
create or replace function vita_milestone_discount(
  p_lowest_item_price numeric, p_cart_total numeric
) returns numeric language sql stable as $$
  select case
    when coalesce(p_cart_total, 0) < vita_cfg('milestone_min_order', 299) then 0
    else least(round(greatest(coalesce(p_lowest_item_price, 0), 0) * 0.5, 2),
               vita_cfg('milestone_max_discount', 100))
  end;
$$;

create or replace function vita_claim_milestone(p_user text)
returns table(ok boolean, code text, message text) language plpgsql as $$
declare
  v_user text := lower(btrim(p_user));
  v_thresh integer := vita_cfg('milestone_threshold', 15000)::integer;
  v_avail integer;
  v_code text;
begin
  perform vita_account_ensure(v_user);
  select available into v_avail from vita_accounts where user_id = v_user for update;
  v_avail := coalesce(v_avail, 0);

  if v_avail < v_thresh then
    return query select false, null::text,
      format('You need %s more points to claim this reward.', v_thresh - v_avail);
    return;
  end if;

  if exists (select 1 from vita_rewards where user_id = v_user and used_at is null) then
    return query select false, (select r.code from vita_rewards r
                                 where r.user_id = v_user and r.used_at is null limit 1),
      'You already have an unused reward waiting.';
    return;
  end if;

  -- Claiming SPENDS the points, matching TIER_50_CONSUMES in the storefront.
  v_code := 'VITA50-' || upper(substr(md5(v_user || clock_timestamp()::text), 1, 8));

  update vita_accounts
     set available = available - v_thresh, updated_at = now()
   where user_id = v_user;

  insert into vita_rewards (user_id, code) values (v_user, v_code);
  insert into vita_ledger_v2 (user_id, transaction_type, points, reason)
  values (v_user, 'MILESTONE_CLAIM', -v_thresh, 'claimed 50% off reward ' || v_code);

  return query select true, v_code,
    'Reward unlocked — 50% off your lowest-priced item, up to ₹'
    || vita_cfg('milestone_max_discount', 100)::integer || '.';
end $$;

-- ── Admin reconciliation view ─────────────────────────────────
-- The ledger and the balance columns must agree. This is how you check.
create or replace view vita_reconciliation as
select a.user_id,
       a.available, a.pending, a.locked, a.debt,
       a.lifetime_earned, a.lifetime_redeemed,
       coalesce(l.ledger_sum, 0)                              as ledger_sum,
       (a.available + a.pending + a.locked)                   as balance_sum,
       (a.available + a.pending + a.locked) - coalesce(l.ledger_sum, 0) as drift
  from vita_accounts a
  left join (
    select user_id, sum(points) as ledger_sum
      from vita_ledger_v2
     where transaction_type <> 'EARN_AVAILABLE'   -- a move, not a change in total
     group by user_id
  ) l on l.user_id = a.user_id;

-- ── Coupon claim ──────────────────────────────────────────────
-- Also called by server.js and also defined nowhere. Checks the usage
-- limit and increments in one statement, so two simultaneous checkouts
-- cannot both take a coupon's last use.
--
-- The limit column is `max_uses`. Everything that touches coupons —
-- computeServerSideTotal, /api/coupons/validate, the admin coupon form,
-- both admin tables — reads and writes max_uses; `usage_limit` exists
-- nowhere in this codebase. Naming it wrong here would not have been a
-- loud failure: PostgREST returns 42703, sp_place_order catches it and
-- falls back to the read-then-write JS path, and the coupon race this
-- function exists to close would have quietly stayed open.
-- Every reference to a coupons column is alias-qualified. `used_count`
-- is also the name of this function's second OUT parameter, and an
-- unqualified one inside the UPDATE is ambiguous between the two —
-- Postgres raises 42702 at call time, not at definition time, so the
-- function creates cleanly and then fails on first use. sp_place_order
-- catches that, logs "RPC unavailable", and falls back to the
-- read-then-write path, leaving the coupon race wide open with nothing
-- but a warning line to show for it. Same trap vita_release_due fell
-- into with its `released` parameter.
create or replace function claim_coupon_use(p_code text)
returns table(ok boolean, used_count integer) language plpgsql as $$
declare r record;
begin
  update coupons c
     set used_count = coalesce(c.used_count, 0) + 1
   where lower(c.code) = lower(btrim(p_code))
     and (c.max_uses is null or c.max_uses <= 0 or coalesce(c.used_count, 0) < c.max_uses)
  returning * into r;

  if r.id is null then
    return query select false, coalesce(
      (select c2.used_count from coupons c2 where lower(c2.code) = lower(btrim(p_code))), 0);
    return;
  end if;
  return query select true, r.used_count;
end $$;

-- ── Verify ────────────────────────────────────────────────────
--   select * from vita_reconciliation where drift <> 0;   -- expect none
--   select routine_name from information_schema.routines
--    where routine_schema = 'public' and routine_name like 'vita_%' order by 1;
--
-- Then hit GET /api/health/db — it should report ok.


-- ███████████████████████████████████████████████████████████████████
--  PART 5 of 5 — reviews and returns: one capitalisation for every email
-- ███████████████████████████████████████████████████████████████████

-- ═══════════════════════════════════════════════════════════════
-- 007 — Normalise email casing
--
-- WHY
--   Email is the join key between customers, orders, returns, reviews
--   and VitaPoints, and nothing ever forced it to a single case.
--
--   signToken() puts `customer.email` — the stored row — into the JWT,
--   and /api/auth/email-login finds that row with .ilike(), so signing
--   in as "Sister@Gmail.com" against a row stored lowercase succeeds
--   and mints a mixed-case token. Checkout then filed the order under
--   whatever the checkout form said. Downstream, some lookups used
--   .eq() (exact, case-sensitive) and others .ilike(), so whether a
--   customer could see their own data depended on which route they hit.
--
--   Two reported bugs are exactly this:
--     • Reviews gate on "have you bought this?" with an .eq() on
--       customer_email. No case match, no orders found, no purchase —
--       403 "You can only review products you have purchased" shown to
--       people who had.
--     • Submitting a return looked the order up with .eq() on id AND
--       email, and returned "Order not found" for an order the customer
--       was looking straight at.
--
--   The application now lowercases every token identity and every order
--   it writes. This is the other half: the rows already stored.
--
-- SAFE TO RE-RUN. Read the SELECT at the bottom after applying.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ── 1. Customers ───────────────────────────────────────────────
-- Done first and most carefully: if two rows differ only by case then
-- lowercasing both collides, and if there is a unique index on email
-- the statement fails and takes the whole migration with it.
--
-- Rather than guess how to merge two accounts, this leaves any such
-- pair ALONE and reports them at the end for a human to look at.
-- Everything else is normalised.
update customers c
   set email = lower(btrim(c.email))
 where c.email is distinct from lower(btrim(c.email))
   and not exists (
     select 1 from customers other
      where other.id <> c.id
        and lower(btrim(other.email)) = lower(btrim(c.email))
   );

-- ── 2. Orders ──────────────────────────────────────────────────
-- No uniqueness on customer_email, so this is unconditional.
update orders
   set customer_email = lower(btrim(customer_email))
 where customer_email is distinct from lower(btrim(customer_email));

-- ── 3. Returns ─────────────────────────────────────────────────
update returns
   set customer_email = lower(btrim(customer_email))
 where customer_email is distinct from lower(btrim(customer_email));

-- ── 4. Reviews ─────────────────────────────────────────────────
-- The one-review-per-product check is (customer_email, product_id), so
-- a mixed-case row let the same person review a product twice. After
-- this they cannot — and any pair that already exists stays, because
-- deleting a customer's review is not a migration's decision to make.
update reviews
   set customer_email = lower(btrim(customer_email))
 where customer_email is distinct from lower(btrim(customer_email));

commit;

-- ── 5. What still needs a human ────────────────────────────────
-- Customer accounts that differ only by case. Each pair is two logins
-- over one real person, with their orders and points split between
-- them. Merge or delete deliberately; this migration will not.
select lower(btrim(email)) as address,
       count(*)            as accounts,
       array_agg(id order by id)    as ids,
       array_agg(email order by id) as spellings
  from customers
 group by lower(btrim(email))
having count(*) > 1
 order by 1;

-- ── 6. Verify ──────────────────────────────────────────────────
--   Every count below should be 0.
--
--   select count(*) from orders  where customer_email <> lower(btrim(customer_email));
--   select count(*) from returns where customer_email <> lower(btrim(customer_email));
--   select count(*) from reviews where customer_email <> lower(btrim(customer_email));
--
--   Orders that no longer match any customer row would mean something
--   went wrong — expect 0:
--
--   select count(*) from orders o
--    where o.customer_email is not null
--      and not exists (select 1 from customers c where c.email = o.customer_email);
