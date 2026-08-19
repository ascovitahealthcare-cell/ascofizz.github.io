-- ═══════════════════════════════════════════════════════════════════════
-- ASCOFIZZ — SEED DATA
--
-- Run AFTER the migrations, on a fresh database, to get a store that
-- actually works: settings the server reads at boot, storefront copy, the
-- site-image keys the page looks up, a demo coupon and a small catalogue.
--
-- WHAT THIS DOES NOT DO
--   • No customer data. Nothing here is imported from another deployment;
--     the store starts with an empty customer, order and loyalty ledger.
--   • No admin password. The admin identity comes from ADMIN_PASSWORD /
--     OWNER_PASSWORD in the environment, or from a row in auth_identities
--     created through the panel. A seeded credential is a backdoor.
--   • No loyalty config. 006_vitapoints_v2.sql already seeds vita_config
--     with the earn/redeem rates; re-seeding it here could silently
--     contradict a deliberate change.
--
-- IDEMPOTENT. Every statement is an upsert or is guarded, so re-running
-- changes nothing. Product rows are matched on name.
--
-- ⚠️ The products below are PLACEHOLDERS so the storefront renders with
--    something in it. Replace or delete them before taking real orders —
--    prices and stock here are not real.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── Settings the server reads ─────────────────────────────────────────
-- discount_ceiling_* cap the total discount any one order may receive.
-- getDiscountCeilings() falls back to built-in defaults when absent, so
-- these are made explicit rather than left implicit.
insert into public.settings (key, value, updated_by) values
  ('2fa_master_enabled',                'true',  'seed'),
  ('discount_ceiling_standard',         '40',    'seed'),
  ('discount_ceiling_glutathione_acv',  '25',    'seed')
on conflict (key) do nothing;

-- ── Storefront copy ───────────────────────────────────────────────────
-- Editable afterwards from the admin panel's Store Editor, which writes
-- to this same row. Keys follow the shape contract in server.js; anything
-- outside it is dropped on save.
insert into public.store_contents (store_key, contents, updated_by)
values ('ascofizz', jsonb_build_object(
  'announcement', jsonb_build_array(
      jsonb_build_object('text', 'Free delivery on every order',        'icon', '🚚'),
      jsonb_build_object('text', 'FSSAI approved & lab tested',          'icon', '🧪'),
      jsonb_build_object('text', 'Made in India',                        'icon', '🇮🇳')
  ),
  'hero', jsonb_build_object(
      'badge', 'FSSAI APPROVED · LAB TESTED',
      'line1', 'Effervescent',
      'line2', 'Wellness',
      'line3', 'Made Properly',
      'sub',   'Fast-absorbing effervescent vitamins and daily supplements, made in our own facility.',
      'cta',   'Shop All Products'
  ),
  'stats', jsonb_build_array('500+ pin codes served', '24h dispatch', 'Lab tested batches'),
  'trust', jsonb_build_object(
      'tiles', jsonb_build_array(
          jsonb_build_object('icon', '🚚', 'label', 'Free delivery'),
          jsonb_build_object('icon', '🧪', 'label', 'Lab tested'),
          jsonb_build_object('icon', '🔒', 'label', 'Secure payments'),
          jsonb_build_object('icon', '↩️', 'label', '7-day returns')
      ),
      'items', jsonb_build_array('FSSAI approved facility', 'Third-party lab tested', 'No added sugar')
  ),
  'vitaMicro', jsonb_build_object(
      'earnText',  '1 point per ₹1',
      'valueText', '150 points = ₹1 off'
  ),
  'footer', jsonb_build_object(
      'tagline', 'Effervescent nutrition, made properly.',
      'badges',  jsonb_build_array('FSSAI Approved', 'Lab Tested', 'Made in India')
  )
), 'seed')
on conflict (store_key) do nothing;

-- ── Site image slots ──────────────────────────────────────────────────
-- The storefront resolves these by key (data-media-key in index.html)
-- instead of hard-coding paths, so artwork is swapped from the admin
-- panel without a deploy. Seeded pointing at the bundled brand assets;
-- replace the URLs when real photography arrives.
insert into public.site_media (key, url, alt, updated_by) values
  ('site.logo',                 '/assets/ascofizz-logo.svg', 'Ascofizz',                 'seed'),
  ('shop.banner.1',             '',                          'Shop banner 1',            'seed'),
  ('shop.banner.2',             '',                          'Shop banner 2',            'seed'),
  ('shop.banner.mix_match',     '',                          'Mix & Match offer banner', 'seed'),
  ('about.manufacturing_photo', '',                          'Our manufacturing facility','seed')
on conflict (key) do nothing;

-- ── A demo coupon ─────────────────────────────────────────────────────
-- Deliberately small, capped and limited, so an unnoticed seed cannot
-- become an expensive live discount.
insert into public.coupons (code, type, value, min_order, max_discount, max_uses,
                            max_uses_per_customer, description, active)
values ('WELCOME10', 'percent', 10, 499, 150, 100, 1, 'Seed demo coupon — 10% off, capped at ₹150', false)
on conflict (upper(code)) do nothing;

-- ── Placeholder catalogue ─────────────────────────────────────────────
-- Enough rows for the grid, filters, product pages and cart to be
-- exercised. `active` is true so they render; set it false (or delete
-- them) once real products exist.
insert into public.products (name, brand, category, description, how_to_use,
                             price, mrp, sale_price, stock, rating, reviews, active, tags)
select v.name, 'Ascofizz', v.category, v.description, v.how_to_use,
       v.price, v.mrp, v.sale_price, v.stock, v.rating, v.reviews, true, v.tags
from (values
  ('Vitamin C + Amla Effervescent', 'Vitamins',
   'Effervescent vitamin C with amla extract. 20 tablets.',
   'Drop one tablet in 200 ml water. Once daily, after a meal.',
   499::numeric, 599::numeric, 449::numeric, 100, 4.6::numeric, 0,
   '["immunity","vitamin c","effervescent"]'::jsonb),
  ('Glutathione Effervescent', 'Skin & Beauty',
   'Glutathione with vitamin C for skin health. 15 tablets.',
   'Drop one tablet in 200 ml water. Once daily.',
   899::numeric, 1099::numeric, 799::numeric, 60, 4.5::numeric, 0,
   '["skin","glutathione","antioxidant"]'::jsonb),
  ('Apple Cider Vinegar Effervescent', 'Wellness',
   'ACV with mother, in an effervescent tablet. 20 tablets.',
   'Drop one tablet in 200 ml water. Once daily, before a meal.',
   449::numeric, 549::numeric, null::numeric, 80, 4.4::numeric, 0,
   '["acv","metabolism","wellness"]'::jsonb),
  ('Ashwagandha Effervescent', 'Ayurvedic',
   'KSM-66 ashwagandha for stress and sleep. 20 tablets.',
   'Drop one tablet in 200 ml water. Once daily, in the evening.',
   599::numeric, 699::numeric, null::numeric, 70, 4.7::numeric, 0,
   '["ashwagandha","stress","sleep"]'::jsonb),
  ('Daily Multivitamin Effervescent', 'Vitamins',
   'A full daily multivitamin and mineral blend. 20 tablets.',
   'Drop one tablet in 200 ml water. Once daily, with breakfast.',
   549::numeric, 649::numeric, 499::numeric, 120, 4.5::numeric, 0,
   '["multivitamin","daily","energy"]'::jsonb),
  ('Spirulina + B12 Effervescent', 'Wellness',
   'Plant-based spirulina with vitamin B12. 20 tablets.',
   'Drop one tablet in 200 ml water. Once daily.',
   649::numeric, 749::numeric, null::numeric, 45, 4.3::numeric, 0,
   '["spirulina","b12","vegan"]'::jsonb)
) as v(name, category, description, how_to_use, price, mrp, sale_price, stock, rating, reviews, tags)
where not exists (
  select 1 from public.products p where p.name = v.name
);

commit;

-- ── Report ────────────────────────────────────────────────────────────
do $$
declare n_p int; n_s int; n_c int; n_m int; n_ct int;
begin
  select count(*) into n_p  from public.products       where deleted_at is null;
  select count(*) into n_s  from public.settings;
  select count(*) into n_c  from public.coupons        where deleted_at is null;
  select count(*) into n_m  from public.site_media;
  select count(*) into n_ct from public.store_contents;
  raise notice 'SEEDED — % product(s), % setting(s), % coupon(s), % image slot(s), % content row(s).',
               n_p, n_s, n_c, n_m, n_ct;
  raise notice 'Customers, orders and the loyalty ledger are intentionally empty.';
  raise notice 'Admin access comes from ADMIN_PASSWORD / OWNER_PASSWORD in the environment.';
end $$;
