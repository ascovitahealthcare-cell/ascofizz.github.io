-- 016 — VitaPoints: cancellation/return no longer leaves "Lifetime Collected" stuck
--
-- THE BUG (owner report, 2026-08-16, order AVC-05719216):
--   A customer earned +855 VitaPoints on an order. The order was then
--   returned, and the activity log correctly showed "Reversed — order
--   returned  -855" — but "Lifetime Collected" stayed at 855 forever.
--
-- ROOT CAUSE
--   vita_earn_on_order() adds the points it awards to `lifetime_earned`
--   in vita_accounts. vita_reverse_order() — the function every
--   cancellation and return path calls — took the points back out of
--   `pending` and `available` (and booked any shortfall as `debt`), but
--   never touched `lifetime_earned`. The lifetime counter only ever
--   went up.
--
-- THE FIX
--   The reversal now also decrements `lifetime_earned` by exactly the
--   points it claws back into the company's hands — `pending` plus
--   `available` — via greatest(0, ...) so it can never go negative.
--
--   Why NOT by the full reversal target? Because an order's earnings
--   can be partly consumed by a debt settlement at earn time (points
--   the customer was already "behind" from a previous reversal are
--   collected from the new order before anything enters a balance).
--   That portion was never spendable, so it was never truly "collected"
--   either — but it did reduce the customer's debt, and we must not
--   create debt a second time. Clawing back only what actually left
--   the account keeps the ledger, the balances and the lifetime counter
--   all in agreement. Points the customer already SPENT on a different
--   order (now carried as new debt) likewise never reduce the lifetime
--   counter: they were spent, which by definition means they were
--   collected.
--
-- IDIOT-PROOF NOTE
--   `create or replace function` is safe to run more than once and
--   changes nothing else — it only rewrites this one function body.
--
-- VERIFY AFTER RUNNING
--   The lifetime counter now moves:
--     select user_id, available, pending, lifetime_earned, debt
--       from vita_accounts;
--   And nothing drifts:
--     select * from vita_reconciliation where drift <> 0;   -- expect none

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
