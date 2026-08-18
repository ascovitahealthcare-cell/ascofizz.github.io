# Backend improvements — August 2026 pass

Requested: better admin panel support, issue fixes, stronger backend.
Everything here was implemented against the code as it stood on
`main` at commit 40dc078, syntax-checked with `node --check` on
every file, and the full route registry was verified at boot.

---

## 1 · Unauthenticated AWB tracking closed (security fix)

`GET /api/track/:awb` proxied any AWB through the Shiprocket
credentials with no auth — anyone enumerating AWBs could read
shipment status for parcels that are not theirs (flagged in
`AUDIT-2026-08.md` as "needs a decision"). Decision made and applied:
the endpoint now requires `authMiddleware + adminOnly`. The public,
scoped alternative `GET /api/track-order/:orderId` (tracking columns
only, bound to an order) is unchanged and remains the customer path.

| Option weighed | Outcome |
|---|---|
| Bind to a linked order id | Rejected for now — breaks existing admin-panel and carrier-email deep links to this endpoint |
| Admin auth only | **Chosen** — admin panel is the only known caller; customers already have `/api/track-order/:orderId` |

## 2 · Admin activity feed + moderation summary (new: `admin-events.js`)

Two new endpoints give the admin panel a single live view instead of
polling three endpoints and reading Render logs:

- `GET /api/admin/events` — last 200 server events (orders, payments,
  webhooks, auth failures, carrier calls), in-memory, queryable by
  `type`, `limit`, `since`.
- `GET /api/admin/moderation` — one call returning pending reviews,
  pending returns and open alerts for dashboard badge counts.

Push helper exported as `pushEvent()` for the other modules to
instrument (orders, payments, webhooks) in a follow-up wiring pass.

**Trade-off (recorded in the module):** in-memory ring buffer, not a
DB table. Ephemeral request-volume telemetry does not belong on the
checkout hot path of an OLTP table; the durable record already lives
in `audit_logs` / `order_status_logs` / `fraud_velocity`.

## 3 · Pagination on admin list endpoints (new: `paginate.js`)

`/api/admin/orders`, `/reviews`, `/returns`, `/audit`, `/customers`
previously returned the entire table (or a blind `limit(200)` with no
"older" access). They now accept `page`/`limit` (default 50, max 200)
and return `{ data, page, limit, total, pages }`. Keyset/cursor
pagination is deferred deliberately — the panel's "page X of Y" needs
the total count, and offset is fine until orders reach millions.

## 4 · Machine-readable route registry (new: `route-docs.js` + `GET /api/docs`)

One source of truth for the entire admin API: method, path, required
permission and description for every admin route, served live at
`GET /api/docs` and self-tested at boot (`checkDocs()` warns if the
app has a route the registry is missing). This is the structural
answer to the site-media dead tab — the panel can now drive its
navigation and permission hints from the server instead of mirroring
routes by hand.

## 5 · Documentation (new: `API.md`, `IMPROVEMENT-PLAN.md`)

`API.md` documents architecture, the v9.3 permission matrix, endpoint
groups, conventions (idempotency, soft deletes, server-side repricing)
and every external integration with its circuit-breaker budget.

## Not touched — deliberately

The existing code is well-built where it counts (server-side totals,
HMAC webhooks, order idempotency, token revocation, RLS). No
refactoring of `server.js`'s 5,500 lines: splitting the monolith into
modules is a larger project with real deploy risk and no user-visible
benefit yet. The admin panel frontend itself lives in
`ascovitahealthcare-cell.github.io` — the feed, moderation and docs
endpoints added here are what let that panel get better without
hard-coded route knowledge.

## Verification

All `.js` files pass `node --check`. The server boots cleanly (exits
only for missing Render env vars, which is the intended fail-closed
behaviour). `checkDocs()` reports all registered routes present once
`server.js` wires in the two new modules (see integration notes in
`track-fix.md` and the module headers).
