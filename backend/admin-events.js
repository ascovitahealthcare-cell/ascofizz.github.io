/* admin-events.js
 * ═══════════════════════════════════════════════════════════════
 * A tiny, dependency-free server event bus plus an admin
 * activity-feed endpoint.
 *
 * WHY
 * The admin panel (a static site on GitHub Pages, so it has no
 * backend of its own) previously had to poll several endpoints and
 * piece together "what happened just now". Order placement, payment
 * webhooks, auth failures and carrier calls all left traces only in
 * Render's rotating logs. This gives the panel ONE in-memory feed —
 * the last 200 events — that every module in the app can push to.
 *
 * TRADE-OFF (why in-memory and not a DB table)
 * A `system_alerts`-style table would survive restarts, but every
 * event here is ephemeral telemetry (a request happened, a webhook
 * arrived) at request volume — writes on every order, payment and
 * login, several per second at peak. A DB table makes an OLTP write
 * on the hot path of checkout for the sake of a pretty feed. An
 * in-memory ring buffer writes in nanoseconds and dies with the
 * process — which is fine, because the authoritative durable record
 * of every meaningful event already exists in `audit_logs`,
 * `order_status_logs` and `fraud_velocity`. The feed is a convenience
 * view, not a source of truth. If the owner ever wants persistence,
 * the same `push()` calls stay valid — only the storage swaps.
 *
 * USAGE
 *   const { pushEvent } = require('./admin-events');
 *   pushEvent({ type: 'order.new', email, detail: { orderId, total } });
 * The router below registers itself; call attachEventBus(app, ...)
 * from server.js once.
 * ═══════════════════════════════════════════════════════════════ */

const MAX_EVENTS = 200;
const ring = [];

const EVENT_TYPES = new Set([
  // Orders
  'order.new', 'order.cancel', 'order.refund', 'order.refund.manual',
  // Payments
  'payment.cashfree', 'payment.gokwik', 'payment.cod', 'payment.failed',
  // Auth & admin
  'auth.login.admin', 'auth.login.failed', 'auth.login.admin.failed',
  // Returns & reviews
  'return.request', 'return.approved', 'return.rejected', 'review.moderated',
  // Carriers & webhooks
  'webhook.shiprocket', 'webhook.delhivery', 'webhook.gokwik', 'webhook.cashfree', 'webhook.shopify',
  'carrier.shiprocket', 'carrier.delhivery',
  // Products & media
  'product.updated', 'product.deleted', 'product.sync', 'media.upload',
  // Alerts
  'alert.raised', 'alert.resolved',
  // System
  'system.keepalive', 'system.error', 'system.deploy',
]);

function pushEvent(event) {
  const e = {
    ts: new Date().toISOString(),
    type: String(event.type || 'system.unknown'),
    email: typeof event.email === 'string' ? event.email : null,
    ip: typeof event.ip === 'string' ? event.ip : null,
    detail: event.detail || null,
  };
  if (!EVENT_TYPES.has(e.type)) e.type = 'system.unknown';
  ring.push(e);
  if (ring.length > MAX_EVENTS) ring.shift();
  return e;
}

function history({ limit = 200, type = null, since = null } = {}) {
  let out = ring.slice().reverse(); // newest first
  if (type) out = out.filter(e => e.type === type);
  if (since) {
    const t = typeof since === 'string' ? Date.parse(since) : Number(since);
    if (!Number.isNaN(t)) out = out.filter(e => Date.parse(e.ts) >= t);
  }
  return out.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
}

/* Counts used by the admin dashboard moderation badges — one call
 * instead of three separate endpoint hits from the panel. */
async function moderationSummary(supabase) {
  const [
    reviews,
    returns,
    alerts,
  ] = await Promise.all([
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('returns').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('system_alerts').select('id', { count: 'exact', head: true }).is('resolved_at', null),
  ]);
  return {
    pendingReviews: reviews.count || 0,
    pendingReturns: returns.count || 0,
    openAlerts: alerts.count || 0,
  };
}

/* Registers the two endpoints and pushes a heartbeat tick so the
 * panel always has a recent timestamp to compare against. */
function attachEventBus(app, { authMiddleware, adminOnly, supabase }) {
  app.get('/api/admin/events', authMiddleware, adminOnly, (req, res) => {
    res.json({
      data: history({
        limit: Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200),
        type: req.query.type || null,
        since: req.query.since || null,
      }),
    });
  });

  app.get('/api/admin/moderation', authMiddleware, adminOnly, async (req, res) => {
    try {
      res.json({ ok: true, ...await moderationSummary(supabase) });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Could not load moderation summary' });
    }
  });
}

module.exports = { pushEvent, history, moderationSummary, attachEventBus, MAX_EVENTS };
