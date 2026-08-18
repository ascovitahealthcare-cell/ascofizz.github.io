-- 013: Retention policies to stop analytics tables growing forever
-- (direct cause of the Disk IO budget warning).
-- purge_growth_tables() removes old rows in one transaction. Retention:
--   audit_logs          -> 180 days  (admin operational events)
--   visitor_pageviews   ->  90 days  (traffic analytics, col "at")
--   visitor_sessions    ->  90 days  (session analytics, col first_seen)
--   fraud_velocity      ->  30 days  (velocity counters, col occurred_at)
-- Deliberately NOT purged: orders, refunds, reviews, returns, customers,
-- vita_*, coupons, products (revenue/loyalty data — permanent).
CREATE OR REPLACE FUNCTION purge_growth_tables()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  n int := 0;
  a int;
BEGIN
  DELETE FROM audit_logs        WHERE created_at < now() - interval '180 days'; GET DIAGNOSTICS a = ROW_COUNT; n := n + a;
  DELETE FROM visitor_pageviews WHERE at        < now() - interval '90 days';  GET DIAGNOSTICS a = ROW_COUNT; n := n + a;
  DELETE FROM visitor_sessions  WHERE first_seen < now() - interval '90 days'; GET DIAGNOSTICS a = ROW_COUNT; n := n + a;
  DELETE FROM fraud_velocity    WHERE occurred_at < now() - interval '30 days';GET DIAGNOSTICS a = ROW_COUNT; n := n + a;
  RETURN n;
END $$;
