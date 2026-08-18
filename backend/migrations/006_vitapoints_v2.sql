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
  -- they could have spent. NULL released rows are unreleased (bug #015).
  update vita_pending vp set released = true
   where vp.order_id = p_order and vp.released is distinct from true
   returning vp.points into v_from_pending;
  v_from_pending := least(coalesce(v_from_pending, 0), v_want);

  v_from_available := least(v_want - v_from_pending, coalesce(a.available, 0));
  v_debt := v_want - v_from_pending - v_from_available;

  update vita_accounts
     set pending         = greatest(0, pending - v_from_pending),
         available       = greatest(0, available - v_from_available),
         debt            = debt + v_debt,
         lifetime_earned = greatest(0, lifetime_earned - (v_from_pending + v_from_available)),
         updated_at      = now()
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
