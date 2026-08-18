-- 015 · Revoke direct RPC access to the VitaPoints and coupon functions.
--
-- The 2026-08 discount audit found 18 functions answering true to
-- has_function_privilege('anon', …, 'EXECUTE'), including vita_earn_on_order
-- and vita_claim_milestone. Anyone minting points is minting rupees, so this
-- read as critical at first glance.
--
-- It was not exploitable. All of them are SECURITY DEFINER = false, so they
-- execute as the caller; RLS is enabled AND forced on vita_ledger_v2, orders
-- and coupons with zero policies, and anon holds no INSERT or UPDATE on any
-- of them. The calls were dead ends. But a grant that survives only because
-- nobody revoked it is one schema change away from mattering.
--
-- Note on the first attempt: `revoke … from anon, authenticated` succeeded
-- and changed nothing, because EXECUTE was held via PUBLIC —
-- has_function_privilege() still answered true for both roles. PUBLIC is the
-- grant that had to go.
--
-- service_role must be granted back explicitly. It bypasses RLS; it does NOT
-- bypass function EXECUTE grants, and the backend authenticates as it — so
-- without the grant below this migration takes VitaPoints down.
--
-- Trigger functions (fn_auto_*, fn_prevent_negative_stock,
-- fn_sync_order_status, vita_ledger_immutable) are deliberately untouched:
-- they are fired by triggers, never called by name.
--
-- Applied to production 2026-08-15. Verified after: anon 0, authenticated 0,
-- service_role 20 of 20.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'vita\_%' or p.proname = 'claim_coupon_use')
      and p.proname <> 'vita_ledger_immutable'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant  execute on function %s to service_role, postgres', f.sig);
  end loop;
end $$;
