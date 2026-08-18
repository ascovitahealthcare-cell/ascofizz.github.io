-- 015 — VitaPoints: NULL `released` made reversals invisible
--
-- THE BUG (owner report, 2026-08-16, order AVC-72198741):
--   A customer earned +4,176 VitaPoints on an order, the order was
--   returned, and the points were NOT deducted. The activity log showed
--   "Reversed — order returned" with no amount, the balance stayed
--   pending, and a fake "points to settle" debt appeared instead.
--
-- ROOT CAUSE
--   vita_pending.released is declared boolean with NO default, so every
--   row inserted by vita_earn_on_order carries released = NULL. The
--   reversal predicate
--       where vp.released = false
--   never matches NULL rows: in SQL, `NULL = false` evaluates to NULL,
--   which the WHERE clause treats as false. The pending bucket was
--   therefore invisible to every reversal — the function fell through
--   to available (also 0 for unreleased points) and booked the whole
--   amount as debt.
--
-- THE FIX
--   1. Predicate changed to `vp.released IS DISTINCT FROM true` —
--      matches both false and NULL unreleased rows.
--   2. Backfill: every NULL `released` in vita_pending becomes false,
--      so historical earned points are now reversible.
--   3. The released column gets a proper default (false) so no future
--      row can be born NULL.
--
-- DATA REPAIR (done by hand alongside this migration, see 015 notes):
--   - The original failed reversal (key 'return:3089145a-...') stays as
--     historical record; a correction run with a new idempotency key
--     posts the proper -4,176 entry.
--   - vita_accounts values are reconciled by that correction run, not
--     here, so the ledger and the account always reconcile.

-- 1. Backfill historical NULLs first (fix the predicate order doesn't matter,
--    but backfilling first means the corrected function does the right thing
--    the moment it is created).
update vita_pending set released = false where released is null;

-- 2. Default so future rows can never be NULL.
alter table vita_pending alter column released set default false;

-- 3. Corrected reversal function. Diff vs. old: one predicate.
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
