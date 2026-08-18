# Delhivery B2C — integration reference

Verified against the official docs (`delhivery-express-api-doc.readme.io`,
fetched July 2026), not from memory. Endpoints and payload rules below are
quoted from Delhivery's own pages.

## Already in your server before this change
| Purpose | Endpoint |
|---|---|
| Pincode serviceability | `GET /c/api/pin-codes/json/?filter_codes=` |
| Order creation / manifest | `POST /api/cmu/create.json` |
| Order tracking | `GET /api/v1/packages/json/?waybill=` |
| Health check | (internal) |

## Added now
| Your route | Auth | Delhivery endpoint |
|---|---|---|
| `GET /api/delhivery/waybill?count=N` | admin | `/waybill/api/bulk/json/` |
| `GET /api/delhivery/rate` | public, 20/min/IP | `/api/kinko/v1/invoice/charges/.json` |
| `POST /api/delhivery/edit` | admin | `/api/p/edit` |
| `POST /api/delhivery/cancel` | admin | `/api/p/edit` + `cancellation:"true"` |
| `GET /api/delhivery/packing-slip/:waybill` | admin | `/api/p/packing_slip` |
| `POST /api/delhivery/pickup` | admin | `/fm/request/new/` |
| `POST /api/delhivery/warehouse` | admin | `/api/backend/clientwarehouse/create/` |
| `PUT /api/delhivery/warehouse` | admin | `/api/backend/clientwarehouse/edit/` |
| `POST /api/delhivery/warehouse/status` | admin | `/api/backend/clientwarehouse/status/` |
| `POST /api/delhivery/ndr` | admin | `/api/p/update` |
| `GET /api/delhivery/ndr/status/:uplId` | admin | `/api/cmu/get_bulk_upl/` |
| `POST /api/delhivery/webhook` | public (scan push) | — inbound |

## New env var
```
DELHIVERY_CLIENT_NAME    registered client name (waybill + rate APIs require it)
                         falls back to DELHIVERY_PICKUP_LOCATION
```

## Notes taken straight from Delhivery's docs
- **Cancellation is not a separate endpoint.** It is `/api/p/edit` with
  `cancellation:"true"`. Allowed while the package is Manifested, In Transit,
  Pending, Open or Scheduled. Prepaid/COD become **"Returned"**; pickups
  become **"Cancelled"**.
- **Rate is approximate.** Delhivery: *"actually amount charged by delhivery
  can be different from what is calculated by this API."* Do not book it as
  your cost. Weight (`cgm`) is in **grams**. `md`: `E`=express, `S`=surface.
- **Rate API is throttled at 40 requests/min per IP** and blocks the IP for a
  minute on breach. Your whole backend shares one egress IP on Render, so I
  capped the route at 20/min/IP.
- **Packing slip returns JSON, not a PDF.** You render it yourself. Delhivery
  confirm the slip is optional — you may print your own.
- **Bulk waybill limits**: 10,000 per request, 50,000 per 5 minutes.
- **One open pickup request per warehouse** at a time; the next can only be
  raised after the previous is completed. Multiple warehouses can each have one.
- **NDR is asynchronous** — it always returns a UPL id; poll the status route.
  `DEFER_DLV` max is first-pending-date + 6 days. `EDIT_DETAILS` only works
  while the package is in *pending* status.
- **Warehouse create rejects unknown keys** — only documented fields are sent.

## The webhook is worth wiring up
Give Delhivery `POST https://<your-backend>/api/delhivery/webhook` and they push
every scan instead of you polling. It is treated as untrusted input: the handler
only matches waybills you already issued, ignores statuses it does not recognise,
writes an `order_status_logs` row for each real change, and on **RTO/Returned**
calls `vita_reverse` so a returned order's VitaPoints are clawed back automatically.
That closes the return-fraud loop end to end without manual admin action.

## Suggested next step — fix the shipping mismatch with real rates
Finding **M2** in the audit: checkout hard-codes `ship = 0` while the server
adds ₹60 under ₹599. Now that `/api/delhivery/rate` exists, you can show the
real figure at checkout. Keep charging your own flat rule if you prefer — just
make the number the customer sees match the number they are charged.

## Verification
All 13 routes registered, no path collisions, `node --check` passes. Smoke
tested against a stubbed client — outbound URLs built correctly and input
validation rejects bad pincodes, missing waybills, invalid NDR actions and
incomplete warehouse payloads.
