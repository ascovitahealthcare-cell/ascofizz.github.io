-- ═══════════════════════════════════════════════════════════════
-- 008 — Store the Delhivery waybill on the order
--
-- WHY
--   /api/create-delhivery-order finishes a successful shipment with:
--
--     .update({ delhivery_waybill: pkg.waybill, fulfillment: 'Processing' })
--
--   orders.delhivery_waybill does not exist. Postgres rejects the whole
--   statement over the unknown column, so BOTH fields fail to save — and
--   the failure is only console.error'd, never surfaced. A shipment could
--   be created and billed at Delhivery while the order silently kept its
--   old status and lost the waybill for good.
--
--   shiprocket_id is the equivalent field for the old carrier and is left
--   alone; 51 of 103 orders still carry one.
--
-- SAFE TO RE-RUN.
-- ═══════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists delhivery_waybill text;

comment on column public.orders.delhivery_waybill is
  'Delhivery AWB / waybill number returned by /api/cmu/create.json. Set by the backend after a successful shipment push.';

-- Webhooks and the tracking screen look orders up by waybill, and it is
-- unique per shipment. Partial, because almost every row is null until an
-- order actually ships.
create unique index if not exists orders_delhivery_waybill_key
  on public.orders (delhivery_waybill)
  where delhivery_waybill is not null;

-- Read this after applying — expect one row, and 0 shipped until the first
-- order is pushed.
select
  count(*)                                          as orders_total,
  count(*) filter (where delhivery_waybill is not null) as with_waybill,
  count(*) filter (where shiprocket_id is not null)     as legacy_shiprocket
from public.orders;
