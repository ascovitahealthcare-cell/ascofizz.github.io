/* route-docs.js
 * ═══════════════════════════════════════════════════════════════
 * Machine-readable registry of the admin API surface, used by
 * GET /api/docs and by the admin panel (the storefront repo
 * github.io) to drive its navigation and permission hints.
 *
 * WHY
 * The admin panel is a static site that mirrors this backend's
 * routes by hand. Every new endpoint meant a second place to
 * update — and the site-media dead tab (a stray filename breaking
 * require()) showed what happens when the two drift apart. One
 * source of truth here, consumed by both.
 *
 * DESIGN NOTE
 * This intentionally does NOT scan the Express app with regex or
 * reflection. Middleware chains (`adminOnly`, `requirePerm('x')`,
 * limiters) are plain functions with no inspectable metadata, so
 * any auto-scan would under-report guards — and an under-reported
 * guard in docs is worse than no docs, because the panel would
 * show a button the server will refuse. The registry below is
 * written by hand, one line per route, and a self-test at boot
 * (checkDocs()) warns if a route here cannot be found on the app.
 * ═══════════════════════════════════════════════════════════════ */

const DOCS = {
  name: 'ascofizz-backend',
  version: '9.5.0',
  generated: '2026-08-16',
  admin: [
    // Orders
    { method: 'GET',  path: '/api/admin/orders',            perm: 'orders.view',        desc: 'List non-deleted orders, newest first' },
    { method: 'GET',  path: '/api/admin/orders/:id',        perm: 'orders.view',        desc: 'One order with its status history' },
    { method: 'PUT',  path: '/api/admin/orders/:id',        perm: 'orders.fulfil',      desc: 'Update fulfilment status, tracking, courier ids' },
    { method: 'POST', path: '/api/create-shiprocket-order',   perm: 'orders.fulfil',      desc: 'Create a Shiprocket shipment / dispatch for an order' },
    { method: 'POST', path: '/api/create-delhivery-order',    perm: 'orders.fulfil',      desc: 'Create a Delhivery shipment / dispatch for an order' },
    { method: 'DELETE', path: '/api/admin/orders/:id',      perm: 'orders.delete',      desc: 'Owner only — soft-delete an order' },
    // Payments & refunds
    { method: 'POST', path: '/api/admin/orders/:id/manual-refund', perm: 'orders.refund', desc: 'Owner only — manual refund with ledger reversal' },
    // Products
    { method: 'GET',  path: '/api/admin/products',          perm: 'products.view',      desc: 'All products including deleted (list)' },
    { method: 'POST', path: '/api/admin/products',          perm: 'products.create',    desc: 'Owner only — create a product' },
    { method: 'PUT',  path: '/api/admin/products/:id',      perm: 'products.view',      desc: 'Update product fields (pricing needs products.pricing)' },
    { method: 'DELETE', path: '/api/admin/products/:id',    perm: 'products.delete',    desc: 'Owner only — soft-delete a product' },
    { method: 'PUT',  path: '/api/admin/products/:id/restore', perm: 'products.delete', desc: 'Owner only — restore a soft-deleted product' },
    { method: 'POST', path: '/api/admin/products/bulk-update',  perm: 'products.view',  desc: 'Bulk field update across selected products' },
    { method: 'POST', path: '/api/admin/products/bulk-delete',  perm: 'products.delete',desc: 'Owner only — bulk soft-delete' },
    { method: 'POST', path: '/api/admin/products/sync',     perm: 'system.maintenance', desc: 'Owner only — re-sync from the storefront PRODUCTS array' },
    // Customers
    { method: 'GET',  path: '/api/admin/customers',         perm: 'customers.view',     desc: 'Customer list with order counts' },
    { method: 'DELETE', path: '/api/admin/customers/:id',   perm: 'customers.delete',   desc: 'Owner only — soft-delete a customer account' },
    { method: 'PUT',  path: '/api/admin/customers/:id/restore', perm: 'customers.delete', desc: 'Owner only — restore a deleted customer' },
    // Returns
    { method: 'GET',  path: '/api/admin/returns',                  perm: 'returns.process', desc: 'Returns with per-status counts' },
    { method: 'POST', path: '/api/admin/returns/:id/approve',       perm: 'returns.process', desc: 'Approve a return (VitaPoints clawback computed)' },
    { method: 'POST', path: '/api/admin/returns/:id/reject',        perm: 'returns.process', desc: 'Reject a return' },
    { method: 'PUT',  path: '/api/admin/returns/:id/status',        perm: 'returns.process', desc: 'Set pickup / refunded / cancelled status' },
    // Reviews
    { method: 'GET',  path: '/api/admin/reviews',           perm: 'reviews.moderate',   desc: 'Review list, optional status filter' },
    { method: 'PUT',  path: '/api/admin/reviews/:id',       perm: 'reviews.moderate',   desc: 'Approve / reject a review (moderated_by recorded)' },
    { method: 'DELETE', path: '/api/admin/reviews/:id',     perm: 'reviews.moderate',   desc: 'Remove a review' },
    // Coupons
    { method: 'GET',  path: '/api/admin/coupons',           perm: 'coupons.manage',     desc: 'All coupons' },
    { method: 'POST', path: '/api/admin/coupons',           perm: 'coupons.manage',     desc: 'Owner only — create coupon' },
    { method: 'PUT',  path: '/api/admin/coupons/:id',       perm: 'coupons.manage',     desc: 'Owner only — update coupon' },
    { method: 'DELETE', path: '/api/admin/coupons/:id',     perm: 'coupons.manage',     desc: 'Owner only — deactivate and soft-delete coupon' },
    { method: 'POST', path: '/api/admin/coupons/:id/restore', perm: 'coupons.manage', desc: 'Owner only — restore and activate a deleted coupon' },
    // VitaPoints
    { method: 'GET',  path: '/api/admin/vitapoints/config',    perm: null,             desc: 'Read point config (staff may view)' },
    { method: 'PUT',  path: '/api/admin/vitapoints/config/:key', perm: null,           desc: 'Owner only — edit what a point is worth / caps' },
    { method: 'GET',  path: '/api/admin/vitapoints/customer/:email', perm: null,       desc: 'One customer ledger and balance' },
    { method: 'GET',  path: '/api/admin/vitapoints/reconciliation', perm: null,        desc: 'Ledger-vs-balance drift check' },
    { method: 'POST', path: '/api/admin/vitapoints/release-now', perm: null,           desc: 'Owner only — release the delivery hold early' },
    // Stats & analytics
    { method: 'GET',  path: '/api/admin/stats',             perm: 'stats.operational',  desc: 'Operational stats' },
    { method: 'GET',  path: '/api/admin/stats/dashboard',   perm: 'stats.operational',  desc: 'Dashboard aggregates' },
    { method: 'GET',  path: '/api/admin/stats/revenue',     perm: 'stats.revenue',      desc: 'Owner only — revenue figures' },
    { method: 'GET',  path: '/api/admin/stats/heatmap',     perm: 'stats.operational',  desc: 'Order/time heatmap' },
    { method: 'GET',  path: '/api/analytics/realtime',      perm: 'analytics.view',     desc: 'Live visitor analytics' },
    // Media — media-routes.js mounts under /api (upload/image, upload/library,
    // upload/image/:filename, upload/library/:filename, upload/orphans)
    { method: 'POST', path: '/api/upload/image',            perm: 'media.manage',       desc: 'Upload an image to Supabase Storage' },
    { method: 'GET',  path: '/api/upload/library',          perm: 'media.manage',       desc: 'List every uploaded image' },
    { method: 'DELETE', path: '/api/upload/image/:filename', perm: 'media.manage',     desc: 'Delete an image (cascades references)' },
    { method: 'DELETE', path: '/api/upload/library/:filename', perm: 'media.manage',   desc: 'Alias — delete + clear references' },
    { method: 'GET',  path: '/api/upload/orphans',          perm: 'media.manage',       desc: 'Storage files with no in-app references' },
    { method: 'DELETE', path: '/api/upload/orphans',        perm: 'media.manage',       desc: 'Purge orphan files' },
    { method: 'POST', path: '/api/upload/video',            perm: 'media.manage',       desc: 'Upload video (admin)' },
    // Site media — site-media-routes.js mounts under /api
    { method: 'GET',  path: '/api/site-media',              perm: null,                  desc: 'Public — site images (logo, hero slides, about, B2B)' },
    { method: 'GET',  path: '/api/admin/site-media',        perm: 'media.manage',       desc: 'Admin view of site images' },
    { method: 'PUT',  path: '/api/admin/site-media/:key',   perm: 'media.manage',       desc: 'Update a site image by key' },
    { method: 'DELETE', path: '/api/admin/site-media/:key', perm: 'media.manage',       desc: 'Remove a site image by key' },
    { method: 'GET',  path: '/api/promo-media',             perm: null,                  desc: 'Public — promo carousel media' },
    { method: 'GET',  path: '/api/admin/promo-media',       perm: 'media.manage',       desc: 'Admin view of promo media' },
    { method: 'POST', path: '/api/admin/promo-media',       perm: 'media.manage',       desc: 'Add a promo carousel card' },
    { method: 'PUT',  path: '/api/admin/promo-media/:id',   perm: 'media.manage',       desc: 'Edit a promo card' },
    { method: 'DELETE', path: '/api/admin/promo-media/:id', perm: 'media.manage',       desc: 'Remove a promo card' },
    // Settings
    { method: 'GET',  path: '/api/settings',                perm: null,                  desc: 'Public store settings (cached)' },
    { method: 'PUT',  path: '/api/settings',                perm: 'settings.manage',     desc: 'Update settings (admin)' },
    { method: 'GET',  path: '/api/admin/settings',          perm: 'settings.manage',     desc: 'Admin settings view' },
    { method: 'PUT',  path: '/api/admin/settings',          perm: 'settings.manage',     desc: 'Owner only — full settings edit' },
    // Admin account & security
    { method: 'POST', path: '/api/admin/login',             perm: null,                  desc: 'Admin sign-in (origin-gated, rate limited)' },
    { method: 'GET',  path: '/api/admin/me',                perm: null,                  desc: 'Current admin identity, role and permissions' },
    // Staff identities (Aug 2026 — per-person accounts, granular permissions).
    // 2FA endpoints were removed Aug 16, 2026 per owner request.
    { method: 'GET',  path: '/api/admin/staff',               perm: null,                  desc: 'Owner only — staff list' },
    { method: 'POST', path: '/api/admin/staff/invite',        perm: null,                  desc: 'Owner only — create a staff account' },
    { method: 'POST', path: '/api/admin/staff/revoke',        perm: null,                  desc: 'Owner only — revoke (kill session) / suspend staff' },
    { method: 'POST', path: '/api/admin/staff/enable',        perm: null,                  desc: 'Owner only — reactivate suspended staff' },
    { method: 'PUT',  path: '/api/admin/staff/:username',     perm: null,                  desc: 'Owner only — edit custom permission set' },
    // Password re-confirmation gate
    { method: 'POST', path: '/api/admin/confirm-password',    perm: null,                  desc: 'Re-enter password — issues one-use proof' },
    // Customer 360° (live data, no mocks)
    { method: 'GET',  path: '/api/admin/customers/:id/360',   perm: 'customers.view',     desc: 'Live 360° profile — orders, returns, refunds, VitaPoints, promos' },
    { method: 'PUT',  path: '/api/admin/customers/:id/360',   perm: 'customers.view',     desc: 'Edit profile / manual points (password re-auth, audit-logged)' },
    { method: 'GET',  path: '/api/admin/audit',             perm: 'audit.view',         desc: 'Owner only — admin action audit log' },
    { method: 'GET',  path: '/api/admin/alerts',            perm: 'alerts.view',        desc: 'System alerts' },
    { method: 'PUT',  path: '/api/admin/alerts/:id/resolve', perm: 'alerts.resolve',    desc: 'Resolve an alert' },
    { method: 'GET',  path: '/api/admin/fraud/customer/:email', perm: 'fraud.view',     desc: 'Owner only — velocity picture for one customer' },
    // Activity feed (new in this pass)
    { method: 'GET',  path: '/api/admin/events',            perm: null,                  desc: 'Live server event feed (last 200, in-memory)' },
    { method: 'GET',  path: '/api/admin/moderation',        perm: null,                  desc: 'Pending reviews + returns + open alerts counts' },
    // Carriers
    { method: 'GET',  path: '/api/delhivery/waybill',       perm: null,                  desc: 'Waybill lookup (admin)' },
    { method: 'POST', path: '/api/delhivery/edit',          perm: 'orders.fulfil',      desc: 'Edit a Delhivery shipment' },
    { method: 'POST', path: '/api/delhivery/cancel',        perm: 'orders.fulfil',      desc: 'Cancel a Delhivery shipment' },
    { method: 'POST', path: '/api/delhivery/pickup',        perm: 'orders.fulfil',      desc: 'Schedule Delhivery pickup' },
    { method: 'POST', path: '/api/delhivery/warehouse',     perm: 'orders.fulfil',      desc: 'Delhivery warehouse operations' },
    { method: 'PUT',  path: '/api/delhivery/warehouse',     perm: 'orders.fulfil',      desc: 'Delhivery warehouse update' },
    { method: 'POST', path: '/api/delhivery/warehouse/status', perm: 'orders.fulfil',   desc: 'Delhivery warehouse status' },
    { method: 'POST', path: '/api/delhivery/ndr',           perm: 'orders.fulfil',      desc: 'Delhivery NDR action' },
    { method: 'GET',  path: '/api/delhivery/ndr/status/:uplId', perm: 'orders.fulfil',  desc: 'Delhivery NDR status' },
    { method: 'GET',  path: '/api/delhivery/packing-slip/:waybill', perm: 'orders.fulfil', desc: 'Fetch the packing slip PDF for a waybill' },
    // Notifications
    { method: 'POST', path: '/api/admin/whatsapp/send-report', perm: 'whatsapp.send',   desc: 'Owner only — push daily report to WhatsApp' },
    { method: 'GET',  path: '/api/admin/whatsapp/preview',  perm: 'whatsapp.send',      desc: 'Owner only — preview the report payload' },
    { method: 'GET',  path: '/api/admin/test-email',        perm: 'system.maintenance', desc: 'Owner only — send a test email' },
    // Docs — machine-readable version of this file, self-checked at boot
    { method: 'GET',  path: '/api/docs',                  perm: null,                  desc: 'This registry, served as JSON' },
    // Health
    { method: 'GET',  path: '/api/health/db',               perm: null,                  desc: 'Public — DB table self-check' },
    { method: 'GET',  path: '/api/health/gokwik',           perm: null,                  desc: 'Admin — GoKwik env check' },
    { method: 'GET',  path: '/api/health/shiprocket',       perm: null,                  desc: 'Admin — Shiprocket env check' },
    { method: 'GET',  path: '/api/health/delhivery',        perm: null,                  desc: 'Admin — Delhivery env check' },
  ],
};

/* Boot-time self-test: every path registered here must exist on the
 * app, otherwise someone extended the API and forgot the docs. */
function checkDocs(app) {
  const routes = new Set();
  // Recurse into sub-routers (media-routes, site-media-routes mount via
  // app.use('/api', router)) with path prefixes concatenated — a flat
  // walk misses those entirely, which is how the registry could claim
  // they were "missing" while they actually served fine.
  //
  // Express does not keep the literal mount path on the layer (layer.key
  // is undefined), so the prefix is rebuilt from layer.regexp — the
  // compiled regex for "use('/api')" layers reads \/api\/? etc. We strip
  // the regex metacharacters back to a plain prefix. This is safe here
  // because only literal mount prefixes like /api are used in this app;
  // if a future mount uses regex syntax this degrades to a warning-only
  // gap, never a false pass, because the registry then under-reports.
  function prefixOf(layer) {
    // Rebuild a literal path prefix from the layer's compiled regexp.
    // Examples seen in Express 4/5:
    //   ^\/api\/? (?=\/|$)        — app.use('/api')
    //   ^\/?(?=\/|$)              — app.use('/')
    //   ^\/api\/delhivery\/waybill\/?$ — app.get('/api/delhivery/waybill')
    // Strategy: strip the ^ anchor, then take leading plain/escaped-slash
    // characters (with optional ? quantifiers) until the first regex
    // metacharacter (group, charclass, ?, +, *, |, (, [, .).
    // Regex source looks like: ^\/api\/?(?=\/|$)  or  ^\/?(?=\/|$)
    // Take everything between ^ and the first (, then strip ?, $ and |
    // so the leading path segment survives — /api stays, the optional-
    // slash noise goes.
    const src = layer.regexp && layer.regexp.source || '';
    const body = src.startsWith('^') ? src.slice(1) : src;
    const head = body.split('(')[0] || '';
    return head.replace(/[?$|]/g, '').replace(/\\\//g, '/').replace(/\/+$/, '').trim();
  }
  function walk(stack, prefix) {
    stack.forEach(layer => {
      if (layer.route) {
        const path = `${prefix}${layer.route.path}`.replace(/\/\//g, '/');
        layer.route.methods && Object.keys(layer.route.methods).forEach(m => routes.add(`${m.toUpperCase()} ${path}`));
      } else if (layer.handle && layer.handle.stack) {
        walk(layer.handle.stack, prefix + prefixOf(layer));
      }
    });
  }
  app._router && walk(app._router.stack, '');
  const missing = DOCS.admin.filter(r => !routes.has(`${r.method} ${r.path}`)).map(r => `${r.method} ${r.path}`);
  if (missing.length) {
    console.warn('⚠️  [route-docs] registry out of sync with app — update route-docs.js:');
    missing.forEach(m => console.warn('     missing:', m));
  } else {
    console.log('✅ [route-docs] all', DOCS.admin.length, 'registered admin routes present on the app');
  }
}

module.exports = { DOCS, checkDocs };
