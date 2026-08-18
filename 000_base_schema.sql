-- ═══════════════════════════════════════════════════════════════════
--  ASCOFIZZ — BASE SCHEMA (000)
--
--  Derived from ASCOFIZZ codebase call sites. This file creates the core
--  tables required for the e-commerce storefront, admin panel, and
--  backend to function on a clean Supabase project.
-- ═══════════════════════════════════════════════════════════════════

-- 1. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id           BIGSERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  mrp          NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  stock        INTEGER NOT NULL DEFAULT 0,
  category     TEXT,
  brand        TEXT DEFAULT 'ASCOFIZZ',
  image        TEXT,
  images       JSONB DEFAULT '[]'::JSONB,
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  -- SEO Fields (referenced in admin.html)
  seo_slug            TEXT,
  seo_canonical_url   TEXT,
  seo_og_image        TEXT,
  seo_twitter_image   TEXT,
  seo_schema_type     TEXT,
  seo_robots          TEXT,
  seo_sitemap_include BOOLEAN DEFAULT TRUE
);

-- 2. CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  name         TEXT,
  phone        TEXT,
  password     TEXT, -- hashed
  city         TEXT,
  state        TEXT,
  pincode      TEXT,
  total_orders INTEGER DEFAULT 0,
  total_spent  NUMERIC(12,2) DEFAULT 0.00,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- 3. ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id              BIGSERIAL PRIMARY KEY,
  customer_email  TEXT NOT NULL,
  customer_name   TEXT,
  customer_phone  TEXT,
  items           JSONB NOT NULL, -- Stored as JSON string in ASCOFIZZ (legacy compatibility)
  total           NUMERIC(12,2) NOT NULL,
  subtotal        NUMERIC(12,2),
  shipping        NUMERIC(10,2) DEFAULT 0.00,
  discount        NUMERIC(10,2) DEFAULT 0.00,
  payment_method  TEXT,
  payment_gateway TEXT,
  payment_id      TEXT,
  status          TEXT DEFAULT 'Pending',
  fulfillment     TEXT DEFAULT 'Pending',
  address         TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  state           TEXT,
  pincode         TEXT,
  notes           TEXT,
  coupon_code     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);

-- 4. ORDER STATUS LOGS
CREATE TABLE IF NOT EXISTS public.order_status_logs (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT REFERENCES public.orders(id),
  old_status  TEXT,
  new_status  TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 5. COUPONS
CREATE TABLE IF NOT EXISTS public.coupons (
  id                  BIGSERIAL PRIMARY KEY,
  code                TEXT UNIQUE NOT NULL,
  type                TEXT NOT NULL, -- 'percent' or 'fixed'
  value               NUMERIC(10,2) NOT NULL,
  min_order           NUMERIC(10,2),
  max_uses            INTEGER,
  max_uses_per_customer INTEGER,
  used_count          INTEGER DEFAULT 0,
  active              BOOLEAN DEFAULT TRUE,
  description         TEXT,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- 6. REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT REFERENCES public.products(id),
  customer_id BIGINT REFERENCES public.customers(id),
  rating      INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  active      BOOLEAN DEFAULT FALSE, -- needs approval
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- 7. REFUNDS
CREATE TABLE IF NOT EXISTS public.refunds (
  id                BIGSERIAL PRIMARY KEY,
  order_id          BIGINT REFERENCES public.orders(id),
  return_id         BIGINT, -- if applicable
  gateway           TEXT,
  gateway_refund_id TEXT,
  amount            NUMERIC(12,2) NOT NULL,
  status            TEXT DEFAULT 'pending',
  note              TEXT,
  raw_response      JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 8. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT, -- staff email
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_values  JSONB,
  new_values  JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 9. FRAUD VELOCITY & SYSTEM ALERTS
CREATE TABLE IF NOT EXISTS public.fraud_velocity (
  id          BIGSERIAL PRIMARY KEY,
  scope       TEXT,
  scope_value TEXT,
  event       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_alerts (
  id          BIGSERIAL PRIMARY KEY,
  severity    TEXT DEFAULT 'warn',
  category    TEXT,
  title       TEXT,
  detail      TEXT,
  order_id    BIGINT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 10. STORE THEMES
CREATE TABLE IF NOT EXISTS public.store_themes (
  id            BIGSERIAL PRIMARY KEY,
  store_key     TEXT NOT NULL UNIQUE,
  theme         JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
