-- Store theme store (v9.5 Front Store Editor)
-- One row per storefront ("ascofizz"), free-form theme JSON persisted here
-- so the static store can fetch its live palette at runtime.
CREATE TABLE IF NOT EXISTS public.store_themes (
  id            BIGSERIAL PRIMARY KEY,
  store_key     TEXT NOT NULL UNIQUE,          -- e.g. 'ascofizz'
  theme         JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public read (the storefront has no admin context)
ALTER TABLE public.store_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_themes_select_public ON public.store_themes
  FOR SELECT USING (true);
-- Only the admin role can write themes
CREATE POLICY store_themes_write_admin ON public.store_themes
  FOR ALL
  USING (COALESCE(current_setting('request.jwt.claims', true), '')::JSONB->>'role' IN ('owner','admin'));
