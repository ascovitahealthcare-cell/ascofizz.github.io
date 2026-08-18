-- ═══════════════════════════════════════════════════════════════
-- VitaPoints — server-side schema (Supabase / Postgres)
-- Ledger design: never store a mutable "balance" column that two
-- requests can race on. Balance = SUM(points) over immutable rows.
-- ═══════════════════════════════════════════════════════════════

create table if not exists vita_ledger (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,               -- from JWT (req.user.email), never from body
  order_id     text,                         -- null for e.g. manual admin adjustments
  type         text not null check (type in ('earn_pending','mature','redeem','reverse','tier_coupon','admin_adjust')),
  points       integer not null,             -- positive for credit, negative for debit
  mature_at    timestamptz,                  -- only set for type = 'earn_pending'
  reason       text,
  created_at   timestamptz not null default now(),

  -- Idempotency: a given order can only be earned-from once, redeemed-from
  -- once, and reversed once. A retried webhook or a double-tapped "Place
  -- Order" button hits this constraint and no-ops instead of double-crediting.
  constraint vita_ledger_order_type_unique unique (order_id, type)
);

create index if not exists vita_ledger_user_idx on vita_ledger (user_id);
create index if not exists vita_ledger_mature_idx on vita_ledger (type, mature_at) where type = 'earn_pending';

-- Spendable balance: matured earns + redeems + reverses + admin adjustments.
-- 'earn_pending' rows are NOT counted until mature_at has passed — this
-- IS the 8-day hold, enforced by a read, not by a client timer.
create or replace view vita_balance as
select
  user_id,
  sum(case
        when type = 'earn_pending' and mature_at <= now() then points
        when type in ('redeem','reverse','admin_adjust') then points
        when type = 'tier_coupon' then points
        else 0
      end) as balance,
  sum(case when type = 'earn_pending' and mature_at > now() then points else 0 end) as pending,
  sum(case when type = 'earn_pending' then points else 0 end) as lifetime
from vita_ledger
group by user_id;

-- ── Atomic redeem ────────────────────────────────────────────────
-- This is the piece that stops the double-spend race the balance-check
-- pattern misses: "check balance >= N, then insert -N" is two statements,
-- and two parallel requests can both pass the check before either commits.
-- Wrapping it in one function with a row lock on the user's own rows
-- makes it a single atomic decision.
create or replace function vita_redeem(
  p_user_id  text,
  p_points   integer,
  p_order_id text
) returns table(ok boolean, redeemed integer, new_balance integer) as $$
declare
  v_balance integer;
begin
  if p_points <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  -- Lock this user's ledger rows for the duration of the transaction so a
  -- concurrent redeem on the same user_id blocks until this one commits.
  perform 1 from vita_ledger where user_id = p_user_id for update;

  select coalesce(sum(case
           when type = 'earn_pending' and mature_at <= now() then points
           when type in ('redeem','reverse','admin_adjust','tier_coupon') then points
           else 0 end), 0)
    into v_balance
    from vita_ledger where user_id = p_user_id;

  if v_balance < p_points then
    return query select false, 0, v_balance;
    return;
  end if;

  insert into vita_ledger (user_id, order_id, type, points, reason)
  values (p_user_id, p_order_id, 'redeem', -p_points, 'checkout redemption')
  on conflict (order_id, type) do nothing;  -- idempotent: retried request, no double-debit

  if not found then
    -- conflict happened: this order_id already redeemed, don't debit again
    return query select true, 0, v_balance;
    return;
  end if;

  return query select true, p_points, v_balance - p_points;
end;
$$ language plpgsql;

-- ── Award (called only from server after payment confirms) ────────
create or replace function vita_award(
  p_user_id    text,
  p_points     integer,
  p_order_id   text,
  p_hold_days  integer default 8
) returns void as $$
begin
  if p_points <= 0 then return; end if;
  insert into vita_ledger (user_id, order_id, type, points, mature_at, reason)
  values (p_user_id, p_order_id, 'earn_pending', p_points, now() + (p_hold_days || ' days')::interval, 'order earn')
  on conflict (order_id, type) do nothing;  -- idempotent: webhook retries can't double-award
end;
$$ language plpgsql;

-- ── Reverse (called from refund/RTO/cancel events) ─────────────────
create or replace function vita_reverse(
  p_order_id text,
  p_reason   text default 'returned'
) returns void as $$
declare
  v_user_id text;
  v_total_awarded integer;
begin
  select user_id into v_user_id from vita_ledger where order_id = p_order_id and type = 'earn_pending' limit 1;
  if v_user_id is null then return; end if;

  select coalesce(sum(points),0) into v_total_awarded
    from vita_ledger where order_id = p_order_id and type = 'earn_pending';

  insert into vita_ledger (user_id, order_id, type, points, reason)
  values (v_user_id, p_order_id, 'reverse', -v_total_awarded, p_reason)
  on conflict (order_id, type) do nothing;
end;
$$ language plpgsql;
