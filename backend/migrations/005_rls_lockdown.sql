-- ═══════════════════════════════════════════════════════════════
-- 005 — Row Level Security lockdown
--
-- WHY
--   The Supabase anon key is embedded in the storefront's JavaScript.
--   That is by design — it is a public key — but it is only safe when
--   every table carries an RLS policy, because the key grants direct
--   PostgREST access to the database from anywhere. A reconnaissance
--   pass against the live project found `orders` and `customers`
--   answering anonymous REST queries with 200 rather than refusing
--   them, which means the protection was relying on those tables
--   happening to be empty rather than on a policy.
--
--   Anyone with the key — it is in the page source — can enumerate
--   tables and read anything RLS is not covering. This migration turns
--   that from "no rows today" into "no access, ever".
--
-- WHAT THE BROWSER ACTUALLY NEEDS
--   Audited against the storefront: the only Supabase calls made with
--   the anon key are SELECTs on `reviews` (product reviews, the live
--   rating counters and the reviews wall). Reviews are WRITTEN through
--   POST /api/reviews on the Render backend, not by the browser — the
--   old anonymous-insert policy was removed when that moved. `products`
--   is read through the backend's /api/products, but it is public
--   catalogue data and is kept readable so a missed call site cannot
--   take the storefront down.
--
--   Everything else — orders, customers, returns, the VitaPoints
--   ledger, audit logs, coupons, settings — gets no anon policy at all,
--   which under RLS means no rows.
--
-- WHY THIS DOES NOT BREAK THE BACKEND
--   server.js connects with SUPABASE_SERVICE_KEY (see the createClient
--   call at the top of the file). The service role bypasses RLS
--   entirely, so every API route keeps working exactly as before.
--   Confirm the env var is the service key, not the anon key, before
--   running this.
--
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Enable RLS on every table in the public schema ─────────
-- Written as a loop rather than a list on purpose: the risk being
-- closed here is a table nobody remembered to protect, so enumerating
-- them by hand would reproduce the original mistake.
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    -- FORCE also applies RLS to the table's owner. The service role is
    -- BYPASSRLS, so the backend is unaffected; this closes the case
    -- where a policy-less table is queried by a role that happens to
    -- own it.
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- ── 2. Drop every existing anon/public policy ─────────────────
-- Any policy granted to `anon` or `public` is re-created below if it is
-- still wanted. Anything not re-created was not needed.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname, roles
      from pg_policies
     where schemaname = 'public'
       and (roles::text[] && array['anon','public'])
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ── 3. The only two things the browser may read ───────────────
-- Reviews: public content, shown on every product page and the reviews
-- wall. Read only — writes go through POST /api/reviews, which checks
-- the JWT and the purchase before inserting with the service key.
drop policy if exists "reviews_anon_select" on public.reviews;
create policy "reviews_anon_select"
  on public.reviews
  for select
  to anon, authenticated
  using (true);

-- Products: the same catalogue the storefront already serves publicly
-- through /api/products. Kept readable so a call site missed in the
-- audit degrades to "works" rather than "storefront empty".
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='products') then
    drop policy if exists "products_anon_select" on public.products;
    create policy "products_anon_select"
      on public.products
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

-- ── 4. Revoke the write grants underneath the policies ────────
-- RLS filters rows; the table-level GRANT decides whether the role may
-- attempt the statement at all. Supabase hands anon broad grants by
-- default, so take the write verbs back and leave SELECT to be
-- governed by the policies above.
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on all sequences in schema public from anon;

alter default privileges in schema public
  revoke insert, update, delete on tables from anon;

-- ── 5. Verify ─────────────────────────────────────────────────
-- Run these after applying. The first should return zero rows: every
-- table has RLS on. The second lists exactly what anon can still read —
-- it should be `products` and `reviews`, nothing else.
--
--   select tablename
--     from pg_tables t
--    where schemaname = 'public'
--      and not exists (
--        select 1 from pg_class c
--         where c.relname = t.tablename and c.relrowsecurity
--      );
--
--   select tablename, policyname, cmd, roles
--     from pg_policies
--    where schemaname = 'public'
--      and roles::text[] && array['anon','public']
--    order by tablename;
--
-- And from a shell, with the anon key that is in the page source —
-- both of these should come back empty or 401/403, not 200 with rows:
--
--   curl -s "$SUPABASE_URL/rest/v1/orders?select=*&limit=1"    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
--   curl -s "$SUPABASE_URL/rest/v1/customers?select=*&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
