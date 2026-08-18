-- Migration 019: per-person staff identities, TOTP 2FA, owner settings keys
-- Enables the staff system: each person gets their own username, password,
-- 2FA secret, backup codes, role and custom permission set.
--
-- The two built-in identities (owner / admin) are seeded by the server at
-- boot (identityBootstrap() in server.js) — it bcrypts the existing
-- ADMIN_PASSWORD / OWNER_PASSWORD env values and upserts the rows. If no
-- identity rows exist yet, login transparently falls back to the env
-- passwords, so this migration never breaks an existing login.

CREATE TABLE IF NOT EXISTS auth_identities (
  id            bigserial PRIMARY KEY,
  username      text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  totp_secret   text NULL,                     -- base32, NULL = not enrolled
  backup_codes  jsonb NOT NULL DEFAULT '[]',   -- bcrypt hashes of 8 one-time codes
  role          text NOT NULL DEFAULT 'admin', -- owner | admin
  permissions   jsonb NULL,                    -- custom permission set (null = role's full list)
  enforced      boolean NOT NULL DEFAULT false,-- owner can force 2FA enrollment on this person
  enabled       boolean NOT NULL DEFAULT true, -- suspend without deleting
  token_version integer NOT NULL DEFAULT 1,
  last_login_at timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_identities_username ON auth_identities (lower(username));

-- The backend always queries with the service key (RLS bypass). Explicitly
-- deny every anon/authenticated Supabase client: this table never appears
-- in the public API surface.
ALTER TABLE auth_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_identities_deny_anon ON auth_identities;
CREATE POLICY auth_identities_deny_anon ON auth_identities FOR ALL USING (false) WITH CHECK (false);

-- Two small keys live in the existing store settings key/value table, next
-- to every other store setting. 2fa_master_enabled is OWNER-ONLY to edit.
-- Guarded with NOT EXISTS rather than ON CONFLICT, because the settings
-- table carries no declared unique constraint in older installations.
INSERT INTO settings (key, value)
SELECT k, v FROM (VALUES ('2fa_master_enabled','true'), ('2fa_enforce_default','false')) t(k,v)
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = t.k);
