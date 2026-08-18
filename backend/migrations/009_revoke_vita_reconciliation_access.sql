-- 009: Close the vita_reconciliation data leak found by the Security Advisor.
-- The SECURITY DEFINER view public.vita_reconciliation was readable by anon and
-- authenticated roles, exposing every customer's VitaPoints balances, lifetime
-- earnings/redemptions, and ledger drift through the public anon key.
-- The only consumer is the admin-only backend route /api/admin/vitapoints/reconciliation
-- which runs on the service key, so revoking public access has zero website impact.

REVOKE SELECT ON public.vita_reconciliation FROM anon, authenticated;
GRANT SELECT ON public.vita_reconciliation TO service_role;
