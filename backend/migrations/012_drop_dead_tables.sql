-- 012: Database cleanup — archive and drop dead/duplicate tables.
-- Dead tables identified 2026-08-14 by full code-reference scan of
-- backend (server.js, routes, db-selfcheck) + admin panel (index.html).
-- None of these are read or written by any live code path.

-- 1. Archive historical rows into dedicated archive tables (lossless).
CREATE TABLE IF NOT EXISTS vita_ledger_archive (LIKE vita_ledger INCLUDING ALL);
INSERT INTO vita_ledger_archive SELECT * FROM vita_ledger ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS vita_redemptions_archive (LIKE vita_redemptions INCLUDING ALL);
INSERT INTO vita_redemptions_archive SELECT * FROM vita_redemptions ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS vita_audit_archive (LIKE vita_audit INCLUDING ALL);
INSERT INTO vita_audit_archive SELECT * FROM vita_audit ON CONFLICT DO NOTHING;

-- 2. Drop dead tables. (No triggers or functions depend on them — verified
--    via pg_trigger and code grep before execution.)
DROP TABLE IF EXISTS vita_ledger CASCADE;
DROP TABLE IF EXISTS vita_risk_events CASCADE;
DROP TABLE IF EXISTS product_reviews CASCADE;
DROP TABLE IF EXISTS vita_audit CASCADE;
DROP TABLE IF EXISTS vita_redemptions CASCADE;
DROP TABLE IF EXISTS blog_posts CASCADE;
DROP TABLE IF EXISTS image_library CASCADE;
