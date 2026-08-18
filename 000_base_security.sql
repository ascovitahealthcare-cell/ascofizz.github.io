-- ASCOFIZZ — BASE SECURITY & RLS (000)

-- 1. Enable RLS on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_velocity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_themes ENABLE ROW LEVEL SECURITY;

-- 2. Public Read Policies (Anonymous storefront access)
CREATE POLICY products_public_read ON public.products FOR SELECT TO public USING (active = true AND deleted_at IS NULL);
CREATE POLICY reviews_public_read ON public.reviews FOR SELECT TO public USING (active = true AND deleted_at IS NULL);
CREATE POLICY store_themes_public_read ON public.store_themes FOR SELECT TO public USING (true);

-- 3. Owner/JWT Scoped Policies (Customer account access)
-- 021_ownership_quals_public_read.sql
-- Hardens public SELECT policies with per-owner filters so that any anon-key
-- caller can only see rows belonging to their own account (JWT email).
-- The Node backend uses the service role and is unaffected.
-- Applied live to production 2026-08-17 after fake/test data cleanup.

DROP POLICY IF EXISTS customers_public_read ON customers;
DROP POLICY IF EXISTS orders_public_read ON orders;
DROP POLICY IF EXISTS refunds_public_read ON refunds;
DROP POLICY IF EXISTS vita_accounts_public_read ON vita_accounts;
DROP POLICY IF EXISTS vita_ledger_v2_public_read ON vita_ledger_v2;
DROP POLICY IF EXISTS vita_pending_public_read ON vita_pending;

CREATE POLICY customers_public_read ON customers
  FOR SELECT TO public
  USING (email = lower(auth.jwt() ->> 'email'));

CREATE POLICY orders_public_read ON orders
  FOR SELECT TO public
  USING (lower(customer_email) = lower(auth.jwt() ->> 'email'));

-- refunds has no email column; scope via the parent order.
CREATE POLICY refunds_public_read ON refunds
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = refunds.order_id
      AND lower(o.customer_email) = lower(auth.jwt() ->> 'email')
  ));

CREATE POLICY vita_accounts_public_read ON vita_accounts
  FOR SELECT TO public
  USING (user_id = lower(auth.jwt() ->> 'email'));

CREATE POLICY vita_ledger_v2_public_read ON vita_ledger_v2
  FOR SELECT TO public
  USING (user_id = lower(auth.jwt() ->> 'email'));

CREATE POLICY vita_pending_public_read ON vita_pending
  FOR SELECT TO public
  USING (user_id = lower(auth.jwt() ->> 'email'));

-- 4. Service Role / Admin Access
-- The service_role bypasses RLS by default, so the Node backend is unaffected.
-- For the admin panel (staff), we grant all access based on the role claim:
CREATE POLICY products_admin_all ON public.products FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY customers_admin_all ON public.customers FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY orders_admin_all ON public.orders FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY order_status_logs_admin_all ON public.order_status_logs FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY coupons_admin_all ON public.coupons FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY reviews_admin_all ON public.reviews FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY refunds_admin_all ON public.refunds FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY audit_logs_admin_all ON public.audit_logs FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY fraud_velocity_admin_all ON public.fraud_velocity FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY system_alerts_admin_all ON public.system_alerts FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
CREATE POLICY store_themes_admin_all ON public.store_themes FOR ALL TO authenticated USING (auth.jwt() ->> 'role' IN ('owner', 'admin'));
