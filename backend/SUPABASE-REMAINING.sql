-- ═══════════════════════════════════════════════════════════════════
--  ASCOFIZZ — THE ONLY MIGRATION LEFT TO RUN
--
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  It is small, it is safe to run more than once, and it is the last
--  database change outstanding for the bug fixes.
--
--  ────────────────────────────────────────────────────────────────
--  DO NOT run 006_vitapoints_v2.sql or RUN-ME-FIRST.sql on this
--  database. Those were written for an EMPTY schema. Your live database
--  already has a richer VitaPoints schema (idempotency_key,
--  vita_pending.state, uuid keys, vita_ledger_v2 with available_delta /
--  balance_after / created_by) that a real person built and that holds
--  real customer points. Running my generic 006 would replace working
--  functions with ones that reference columns yours does not have and
--  break the loyalty ledger. This file is written to match YOUR schema
--  exactly, from reading your live function definitions.
--  ────────────────────────────────────────────────────────────────
--
--  WHAT WAS ALREADY DONE
--    I applied 004_returns_delivered_at over MCP already — returns work
--    now, verified against your real orders. This file is the rest.
--
--  WHAT THIS FIXES (two things, both confirmed broken on your live DB)
--
--    1. claim_coupon_use  — currently errors "column reference
--       used_count is ambiguous" on EVERY call. The name is both a
--       coupons column and the function's own OUT parameter. The server
--       then silently falls back to a path with no limit check, so the
--       usage cap on every coupon is unenforced and two checkouts can
--       both take a single-use code. Same 3-column signature as yours,
--       so it replaces in place; every column reference is now qualified.
--
--    2. vita_refund_redemption — does not exist yet. Your server calls
--       it to give back points a customer SPENT on an order that was
--       then cancelled or returned. Without it, cancelling refunds the
--       money and keeps the points spent on an order that no longer
--       exists. Written to your conventions, idempotent through the
--       ledger's unique idempotency_key.
--
--  After running, check on your phone (no login needed):
--    <your-api-url>/api/health/db
--    {"ok":true} means every object the code needs is present.
--
--  005_rls_lockdown.sql is SEPARATE and still outstanding — that is the
--  security hardening (Row-Level Security). Run it on its own, after
--  you have confirmed the site still works, exactly as before. It is not
--  in this file on purpose.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Fix claim_coupon_use ────────────────────────────────────────
-- Kept identical to your live version — same 3-column return, same
-- active / not-deleted / not-expired / under-limit conditions — with
-- one change: every reference to a coupons column is alias-qualified, so
-- `used_count` can no longer be read as the OUT parameter. The unused
-- `select max_uses` from your version is dropped (it was dead code).
create or replace function claim_coupon_use(p_code text)
returns table(ok boolean, used_count integer, message text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_used integer;
begin
  update coupons c
     set used_count = coalesce(c.used_count, 0) + 1
   where lower(c.code) = lower(p_code)
     and c.active = true
     and c.deleted_at is null
     and (c.expires_at is null or c.expires_at >= now())
     and (c.max_uses is null or coalesce(c.used_count, 0) < c.max_uses)
  returning c.used_count into v_used;

  if v_used is null then
    return query select false, null::integer, 'Coupon is no longer available';
  else
    return query select true, v_used, 'Claimed';
  end if;
end;
$function$;


-- ── 2. vita_refund_redemption ──────────────────────────────────────
-- Belt-and-braces: make sure the column the function credits back
-- exists. add column if not exists is a no-op when it already does, and
-- never touches existing data. This guarantees the function runs even
-- if your vita_accounts happens not to carry the lifetime stat.
alter table vita_accounts
  add column if not exists lifetime_redeemed integer not null default 0;

-- Gives back points the customer SPENT on an order that is then
-- cancelled or returned. This is a different pot from what an order
-- EARNED (that is vita_reverse_order's job). By the time an order can be
-- cancelled its redemption is 'committed' — the points already left
-- `available` — so without this the customer is refunded the money and
-- silently loses the points.
--
-- Modelled on your own vita_release_redemption: same locking, same
-- ledger columns, same 'REDEMPTION_RELEASE' type (which your
-- vitapoints-routes.js already labels "Returned to your balance").
-- Idempotent through the ledger: a stable idempotency_key means a
-- cancel followed by an admin marking the same order cancelled cannot
-- pay the points twice. Returns `refunded` so the server's log line
-- reads correctly.
create or replace function vita_refund_redemption(
  p_order text,
  p_reason text default 'order cancelled'
)
returns table(ok boolean, refunded integer, message text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare r record; v_bal integer;
begin
  -- The ledger is the source of truth for whether this already happened.
  if exists (
    select 1 from vita_ledger_v2 where idempotency_key = 'refundredeem:' || p_order
  ) then
    return query select true, 0, 'Already refunded'; return;
  end if;

  -- Only points that were actually spent (committed) can come back. A
  -- reservation that never committed is vita_release_redemption's job.
  select * into r
    from vita_redemptions
   where order_id = p_order and state = 'committed'
   for update;
  if r.id is null then
    return query select true, 0, 'Nothing committed to refund'; return;
  end if;

  -- Lock the account row before changing the balance — the same guard
  -- your other loyalty functions use against two updates racing.
  perform 1 from vita_accounts where user_id = r.user_id for update;

  update vita_accounts
     set available         = available + r.points,
         lifetime_redeemed = greatest(0, coalesce(lifetime_redeemed, 0) - r.points),
         updated_at        = now()
   where user_id = r.user_id
   returning available into v_bal;

  insert into vita_ledger_v2
    (user_id, order_id, transaction_type, points,
     available_delta, balance_after, reason, idempotency_key, created_by)
  values
    (r.user_id, p_order, 'REDEMPTION_RELEASE', r.points,
     r.points, v_bal, coalesce(p_reason, 'order cancelled'),
     'refundredeem:' || p_order, 'system');

  return query select true, r.points, 'Redemption refunded';
end;
$function$;


-- ── 3. Verify ──────────────────────────────────────────────────────
-- Both should print a clean row rather than an error.
--   select * from claim_coupon_use('__probe_no_such_code__');
--     → (false, , 'Coupon is no longer available')
--   select proname from pg_proc
--    where proname in ('claim_coupon_use','vita_refund_redemption');
--     → two rows
