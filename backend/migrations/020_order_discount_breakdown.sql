-- ═══════════════════════════════════════════════════════════════════
-- 020 — Per-order discount breakdown columns
--
-- WHY: the order row only used to carry one aggregated `discount`
-- number. The invoice renderer needs to list each discount by name and
-- amount (pack/tier savings, Mix & Match, coupon, VitaPoints redemption),
-- and the storefront My Account / thank-you pages want to show the same
-- breakdown the customer saw at checkout. One aggregated column cannot
-- answer "which discounts did this order get, and how much each?" —
-- so each component gets its own column and the aggregate stays as the
-- row-level foot check (assertOrderFoots).
--
-- RUN: paste into the Supabase SQL editor once. `add column if not exists`
-- makes re-runs safe. Default 0 keeps every existing row valid and every
-- existing query unchanged — old rows simply show "no component discounts".
-- ═══════════════════════════════════════════════════════════════════

alter table orders add column if not exists tier_discount numeric default 0;
alter table orders add column if not exists mix_match_discount numeric default 0;
alter table orders add column if not exists coupon_discount numeric default 0;
alter table orders add column if not exists vita_points_discount numeric default 0;
alter table orders add column if not exists vita_points_used integer default 0;

-- The aggregate still has to foot: the sum of the components can never
-- exceed the written discount by more than rounding, so any row that
-- silently drifted (as happened historically) is findable after deploy.
create or replace function orders_breakdown_foots()
returns table (id text, subtotal numeric, discount numeric, components numeric, drift numeric)
as $$
  select o.id, o.subtotal, o.discount,
         coalesce(o.tier_discount,0) + coalesce(o.mix_match_discount,0)
       + coalesce(o.coupon_discount,0) + coalesce(o.vita_points_discount,0),
         o.discount - (coalesce(o.tier_discount,0) + coalesce(o.mix_match_discount,0)
       + coalesce(o.coupon_discount,0) + coalesce(o.vita_points_discount,0))
  from orders o
  where o.deleted_at is null
    and abs(o.discount - (coalesce(o.tier_discount,0) + coalesce(o.mix_match_discount,0)
       + coalesce(o.coupon_discount,0) + coalesce(o.vita_points_discount,0))) > 0.06;
$$ language sql;
