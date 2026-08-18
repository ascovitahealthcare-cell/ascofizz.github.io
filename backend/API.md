# Ozylix Backend API — quick reference

This is the single source of truth for the admin API surface. The
machine-readable version lives in `route-docs.js` and is served live
at `GET /api/docs` — the admin panel (separate static repo) drives
its navigation and permission hints from that endpoint, so the two
can never drift apart again.

## Architecture at a glance

Node.js 18+ · Express · Supabase (PostgreSQL) · deployed on Render.
The storefront (`ascovitahealthcare-cell.github.io`) is a static
site that consumes this API; the admin panel (`admin.html`) is the
same repo under `back.ozylix.com`.

| Layer | What |
|---|---|
| Edge | Render terminates TLS; `trust proxy = 1` (exactly one hop) |
| Entry | Helmet, compression, CORS exact-match allow-list, helmet CSP off (frontend owns CSP) |
| Auth | JWT (`authMiddleware`), token-version revocation for admin/owner, 1h admin sessions |
| Roles | `admin` (staff operations) and `owner` (money, destruction, config) — v9.3 role split |
| Limits | express-rate-limit keyed per real client IP: login 5/min, order 20/10min, payment 15/10min, review 20/h |
| Resilience | Circuit breakers per external dependency (Google, GoKwik, Shiprocket, Delhivery, Cashfree, Twilio, GA4, Gemini) |
| Data | Supabase Postgres, RLS lockdown (`005_rls_lockdown.sql`), soft deletes via `deleted_at` |
| Telemetry | `admin-events.js` in-memory event bus (last 200 events) + durable `audit_logs` / `order_status_logs` / `fraud_velocity` |

## Permission matrix (v9.3)

| Permission | admin | owner | Covers |
|---|---|---|---|
| orders.view | ✓ | ✓ | List / read orders |
| orders.fulfil | ✓ | ✓ | Status, tracking, dispatch, carriers |
| products.view / stock | ✓ | ✓ | Catalog + stock levels |
| customers.view | ✓ | ✓ | Customer list |
| alerts.view / resolve | ✓ | ✓ | System alerts |
| stats.operational | ✓ | ✓ | Counts, fulfilment, heatmap |
| analytics.view | ✓ | ✓ | Live visitor analytics |
| media.manage | ✓ | ✓ | Photo/video/site-media uploads |
| returns.process | ✓ | ✓ | Approve/refund/pickup |
| reviews.moderate | ✓ | ✓ | Approve/reject reviews |
| orders.edit_money, orders.delete, orders.refund | — | ✓ | Money & destruction |
| products.create/pricing/delete, customers.delete | — | ✓ | Catalog changes |
| coupons.manage, settings.manage, stats.revenue | — | ✓ | Money & config |
| fraud.view, audit.view, marketing.manage, whatsapp.send | — | ✓ | Sensitive/owner-only |
| system.maintenance | — | ✓ | Product sync, test email |
| ai.agents, tokens.revoke | — | ✓ | AI team, token revocation |

## Endpoint groups

| Group | Prefix | Auth |
|---|---|---|
| Storefront (public) | `/api/products`, `/api/settings`, `/api/coupons/validate`, `/api/track-order/:id`, `/api/reviews`, `/api/returns` (customer, auth) | varies |
| Checkout | `/api/orders`, `/api/confirm-cod-order`, `/api/create-cashfree-order`, `/api/create-gokwik-order` | signed-in customer + server-side repricing |
| Admin | `/api/admin/*` | `authMiddleware + adminOnly` (+ `requirePerm` per action) |
| Carriers | `/api/delhivery/*`, `/api/track/:awb` (admin-only now), `/api/create-shiprocket-order` | admin / rate-limited |
| Payments | `/api/cashfree-webhook`, `/api/gokwik-webhook`, `/api/shopify-webhook` | HMAC-verified |
| Health | `/api/health/db|cache|gokwik|shiprocket|delhivery`, `/health`, `/api/docs` | public |

## Conventions

Every admin endpoint returns `{ data, ... }` (or `{ ok, ... }`) with
HTTP 200; 400 for bad input with a plain-English `error`; 401 for
missing/invalid tokens; 403 with the required permission name when
`requirePerm` refuses; 404 for missing rows; 500 never leaks stack
traces or SQL. List endpoints accept `page`/`limit` (default 50,
max 200) and return `{ data, page, limit, total, pages }`.

Idempotency: every payment and order path is idempotent per order
id. Deletes are soft deletes (`deleted_at`). Coupon administration uses
`POST /api/admin/coupons` to create, `PUT /api/admin/coupons/:id` to
edit, `DELETE /api/admin/coupons/:id` to deactivate and soft-delete, and
`POST /api/admin/coupons/:id/restore` to reactivate a deleted coupon.
All money-affecting paths recompute the total server-side from the
products table — a tampered cart can never change what a customer pays.

## Database

Migrations: `MIGRATIONS.md` (run `RUN-ME-FIRST.sql` in Supabase,
then `005_rls_lockdown.sql`). App never alters its own schema.
Schema: `orders`, `customers`, `products`, `reviews`, `returns`,
`coupons`, `audit_logs`, `system_alerts`, `fraud_velocity`,
`vita_accounts`/`vita_ledger_v2`, `site_media`, `media`, `settings`,
`auth_token_versions`.

## External integrations

| Service | Purpose | Breaker budget |
|---|---|---|
| Supabase | Database + storage + email auth | — |
| Cashfree | UPI/card payments, HMAC-verified webhooks | paymentLimiter |
| GoKwik | Alternative payment gateway, webhook re-verified against GoKwik API | gokwik 20s/8 conc |
| Shiprocket | Courier + tracking | 15s/4 conc |
| Delhivery | B2C courier + NDR + packing slips | 10s/6 conc |
| Twilio | SMS/WhatsApp notifications | 10s/2 conc |
| Google OAuth / reCAPTCHA | Customer sign-in + bot check | 8s/8 conc |
| GA4 | Analytics ingestion | 8s/2 conc |
| Gemini | On-page AI advisor (input-only proxy) | 30s/2 conc |
