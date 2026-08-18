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
