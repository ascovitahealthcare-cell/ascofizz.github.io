-- 014: Drop duplicate indexes found in the full index audit.
-- Each dropped index is an identical btree on the same columns as the
-- survivor kept in place — removing them cuts write amplification
-- (every INSERT/UPDATE rewrites fewer index pages = less Disk IO).
DROP INDEX IF EXISTS idx_status_order;            -- dup of idx_osl_order (order_id)
DROP INDEX IF EXISTS idx_orders_status;           -- dup of idx_orders_fulfillment (fulfillment) partial
DROP INDEX IF EXISTS reviews_product_idx;         -- dup of reviews_product_id_idx (product_id)
DROP INDEX IF EXISTS vita_pending_order_idx;      -- dup of vita_pending_order_id_key (order_id, unique)
DROP INDEX IF EXISTS idx_products_active;         -- dup; survivor products_active_idx is the partial one
DROP INDEX IF EXISTS idx_products_category;       -- dup of products_category_idx (category)
DROP INDEX IF EXISTS idx_products_deleted;        -- dup of products_deleted_idx (deleted_at)
