-- ═══════════════════════════════════════════════════════════════
-- 002 — Atomic counters + reviews lockdown
--
-- Everything here closes a race or an open write path that the
-- application layer alone cannot fix. Run in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Atomic stock decrement ──────────────────────────────────
-- Replaces "SELECT stock; UPDATE stock = stock - qty" in sp_place_order.
-- Two concurrent orders both read the same stock value and the second
-- write clobbers the first, so stock drops once for two sales.
-- A single UPDATE ... SET stock = stock - n is atomic; the row lock is
-- held by Postgres for the duration of the statement.
create or replace function decrement_stock(p_id bigint, p_qty integer)
returns integer as $$
declare v_new integer;
begin
  update products
     set stock = greatest(0, coalesce(stock, 0) - p_qty),
         updated_at = now()
   where id = p_id
  returning stock into v_new;
  return v_new;
end;
$$ language plpgsql;

-- Optional stricter variant: refuses to go below zero instead of
-- clamping, so an oversell surfaces as an error rather than silently
-- shipping stock you don't have.
create or replace function decrement_stock_strict(p_id bigint, p_qty integer)
returns integer as $$
declare v_new integer;
begin
  update products
     set stock = stock - p_qty, updated_at = now()
   where id = p_id and stock >= p_qty
  returning stock into v_new;
  if v_new is null then
    raise exception 'Insufficient stock for product %', p_id;
  end if;
  return v_new;
end;
$$ language plpgsql;

-- ── 2. Atomic coupon usage ─────────────────────────────────────
-- This race is directly exploitable: fire N concurrent orders with a
-- single-use 50%-off code and every request reads used_count = 0
-- before any of them writes 1, so max_uses never trips.
-- The WHERE clause makes the limit part of the same statement.
create or replace function increment_coupon_use(p_code text)
returns integer as $$
declare v_used integer;
begin
  update coupons
     set used_count = coalesce(used_count, 0) + 1
   where lower(code) = lower(p_code)
     and (max_uses is null or coalesce(used_count, 0) < max_uses)
  returning used_count into v_used;
  return v_used;   -- null means the limit was already reached
end;
$$ language plpgsql;

-- ── 3. Reviews: close the anon write path ──────────────────────
-- The storefront inserts reviews directly with the PUBLIC anon key,
-- which is visible in the page source. Anyone can POST unlimited
-- 5-star reviews under any display name with no purchase:
--
--   curl -X POST 'https://<ref>.supabase.co/rest/v1/reviews' \
--     -H "apikey: <anon key from page source>" \
--     -H 'Content-Type: application/json' \
--     -d '{"product_id":3,"user_name":"anyone","rating":5,"review_text":"..."}'
--
-- Those rows feed the homepage average rating and sit behind a
-- "Verified Purchases Only" badge. Writes must go through the backend.

alter table reviews add column if not exists customer_email text;
alter table reviews add column if not exists verified boolean default false;

create index if not exists reviews_email_idx   on reviews (lower(customer_email));
create index if not exists reviews_product_idx on reviews (product_id);

-- One review per customer per product, enforced in the database and
-- not only in the endpoint.
--
-- WRAPPED, because this one can legitimately fail on a live database.
-- The index is unique over (product_id, lower(customer_email)) — and
-- until the email casing was fixed, the same person WAS able to review
-- a product twice, once as "Sister@Gmail.com" and once as
-- "sister@gmail.com". Those two rows are distinct today and collide the
-- moment this index is built.
--
-- Unwrapped, that aborts the script. When several migrations are being
-- applied in one paste, an abort here means everything after it — the
-- whole VitaPoints schema included — silently never runs, and the
-- operator sees one error about an index and has no idea the other four
-- parts did not happen. A missing index is worth far less than that.
-- So: try, and if it will not build, say exactly why and carry on.
do $$
begin
  create unique index if not exists reviews_one_per_customer_product
    on reviews (product_id, lower(customer_email))
    where customer_email is not null;
exception when others then
  raise notice '─────────────────────────────────────────────────────────';
  raise notice 'SKIPPED the one-review-per-customer index: %', sqlerrm;
  raise notice 'This almost certainly means duplicate reviews already';
  raise notice 'exist. Everything else in this script still applied.';
  raise notice 'Find them with:';
  raise notice '  select product_id, lower(customer_email) as who, count(*)';
  raise notice '    from reviews where customer_email is not null';
  raise notice '   group by 1,2 having count(*) > 1;';
  raise notice 'Delete the extras, then re-run this file to get the index.';
  raise notice '─────────────────────────────────────────────────────────';
end $$;

alter table reviews enable row level security;

-- Public may READ reviews. That is the whole point of them.
drop policy if exists reviews_public_read on reviews;
create policy reviews_public_read on reviews for select using (true);

-- No insert/update/delete policy is defined, deliberately. Without one,
-- anon and authenticated roles cannot write. The backend uses the
-- service-role key, which bypasses RLS, so POST /api/reviews still works.

-- ── 4. Audit what is already there ─────────────────────────────
-- Run these before trusting your current rating. Unverified or
-- duplicated rows are the ones to look at first.
--
--   select count(*) filter (where customer_email is null) as legacy_rows,
--          count(*) filter (where verified)               as verified_rows,
--          count(*)                                       as total_rows,
--          round(avg(rating), 2)                          as avg_rating
--     from reviews;
--
--   select user_name, count(*), min(created_at), max(created_at)
--     from reviews group by user_name having count(*) > 3 order by 2 desc;
