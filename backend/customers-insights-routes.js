/* ══════════════════════════════════════════════════════════════════════════
 * CUSTOMER INSIGHTS (Aug 2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Mount in server.js:
 *   app.use('/api', require('./customers-insights-routes')(supabase, authMiddleware, adminOnly, requirePerm));
 *
 * GET /api/admin/customers/:id/insights
 *   Computed re-targeting data for one customer, derived purely from the
 *   `orders` table — no new columns on customers. Returns:
 *     last_order_at, days_since_last_order, first_order_at,
 *     total_orders, total_spent (LTV), avg_order_value,
 *     last_products (up to 6 distinct product names, most recent first),
 *     payment (cod_count, prepaid_count, preference),
 *     segment (new / repeat / loyal / vip / dormant / churned)
 *
 * GET /api/admin/customers-export?format=csv
 *   One-click export of every live customer's re-targeting list:
 *   name, email, phone, city, LTV, orders, segment, consent flags.
 *   `format=json` returns the same payload as JSON (default).
 *   Only admins/owners. Nothing is written — read-only analytics.
 * ══════════════════════════════════════════════════════════════════════════ */

module.exports = function customersInsightsRoutes(supabase, authMiddleware, adminOnly, requirePerm) {
  const express = require('express');
  const router = express.Router();

  // ── segment labels ────────────────────────────────────────────────
  // new      : 0-1 orders
  // repeat   : 2-4 orders, last order within 90 days
  // loyal    : 5+ orders
  // vip      : 5+ orders AND LTV >= 10000
  // dormant  : >= 90 days since last order (any order history)
  // churned  : >= 180 days since last order
  function classify(daysSince, orders, ltv) {
    if (orders === 0) return 'new';
    if (daysSince >= 180) return 'churned';
    if (daysSince >= 90) return 'dormant';
    if (orders >= 5 && (ltv || 0) >= 10000) return 'vip';
    if (orders >= 5) return 'loyal';
    if (orders >= 2) return 'repeat';
    return 'new';
  }

  // ── single-customer insights ──────────────────────────────────────
  router.get('/admin/customers/:id/insights', authMiddleware, adminOnly, async (req, res) => {
    try {
      const { data: cust } = await supabase
        .from('customers').select('name,email,phone,city,state,pincode,total_orders,total_spent,created_at')
        .eq('id', Number(req.params.id) || req.params.id).single();
      if (!cust) return res.status(404).json({ error: 'Customer not found' });

      // FIX (audit OZ-04, admin side): was .ilike('customer_email', cust.email).
      // ILIKE treats the address as a PATTERN, and `_` is a single-character
      // wildcard that is entirely legitimate in a real email — so a customer
      // stored as john_smith@gmail.com also matched john-smith@gmail.com and
      // any other one-character variant, silently merging a different person's
      // orders into this customer's insight totals. Admin-only, so never a
      // customer-facing leak, but it corrupted the numbers the owner reads.
      // Emails are stored lowercase (verified: 0 mixed-case rows), so exact
      // matching returns the same orders for every genuine customer.
      const { data: orders } = await supabase
        .from('orders')
        .select('items,payment_method,payment_status,total,created_at,fulfillment')
        .eq('customer_email', String(cust.email || '').toLowerCase().trim())
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const paid = (orders || []).filter(o =>
        (o.payment_status || '').toLowerCase() === 'paid' ||
        ((o.payment_method || '').toLowerCase() === 'cod' && o.fulfillment !== 'Cancelled'));

      let lastOrderAt = null, firstOrderAt = null;
      let cod = 0, prepaid = 0;
      const productCount = {};            // name -> {count, lastSeen}
      let total = 0;
      paid.forEach(o => {
        const d = new Date(o.created_at).getTime();
        if (!lastOrderAt) lastOrderAt = o.created_at;
        firstOrderAt = o.created_at;       // ascending=false → last element is oldest
        if ((o.payment_method || '').toLowerCase() === 'cod') cod += 1; else prepaid += 1;
        total += parseFloat(o.total || 0);
        try {
          const items = Array.isArray(o.items) ? o.items : (o.items ? JSON.parse(o.items) : []);
          items.forEach(it => {
            const name = (it.name || it.product_name || it.title || '').toString().trim();
            if (!name) return;
            if (!productCount[name]) productCount[name] = { c: 0, last: '' };
            productCount[name].c += 1;
            if (!productCount[name].last || o.created_at > productCount[name].last) productCount[name].last = o.created_at;
          });
        } catch (e) { /* non-parsable items row — skip */ }
      });
      if (!firstOrderAt && paid.length) firstOrderAt = paid[paid.length - 1].created_at;

      const daysSince = lastOrderAt ? Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86400000) : null;
      const segment = classify(daysSince, paid.length, total);
      const lastProducts = Object.entries(productCount)
        .sort((a, b) => (b[1].last > a[1].last ? 1 : -1))
        .slice(0, 6).map(([name, v]) => ({ name, times: v.c }));

      res.json({ data: {
        name: cust.name, email: cust.email, phone: cust.phone,
        city: cust.city, state: cust.state, pincode: cust.pincode,
        first_order_at: firstOrderAt || cust.created_at,
        last_order_at: lastOrderAt,
        days_since_last_order: daysSince,
        total_orders: paid.length,
        total_spent: total,
        avg_order_value: paid.length ? Math.round(total / paid.length * 100) / 100 : 0,
        last_products: lastProducts,
        payment: { cod_count: cod, prepaid_count: prepaid, preference: cod >= prepaid ? 'cod' : 'prepaid' },
        segment,
      }});
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── marketing consent toggle ────────────────────────────────────────
  router.post('/admin/customers/:id/consent', authMiddleware, adminOnly, async (req, res) => {
    try {
      const keys = ['marketing_email', 'marketing_whatsapp'];
      const patch = {};
      keys.forEach(k => { if (typeof req.body[k] === 'boolean') patch[k] = req.body[k]; });
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Send marketing_email and/or marketing_whatsapp as boolean' });
      const { error } = await supabase
        .from('customers')
        .update(Object.assign(patch, { updated_at: new Date().toISOString() }))
        .eq('id', Number(req.params.id) || req.params.id)
        .is('deleted_at', null);
      if (error) throw error;
      res.json({ ok: true, patch });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── bulk contact export (CSV / JSON) ──────────────────────────────
  router.get('/admin/customers-export', authMiddleware, adminOnly, async (req, res) => {
    try {
      const format = (req.query.format || 'json').toLowerCase();
      const { data: custs, error } = await supabase
        .from('customers')
        .select('name,email,phone,city,state,total_orders,total_spent,marketing_email,marketing_whatsapp,created_at')
        .is('deleted_at', null)
        .order('total_spent', { ascending: false });
      if (error) throw error;

      const rows = (custs || []).map(c => ({
        name: c.name || '',
        email: c.email || '',
        phone: c.phone || '',
        city: c.city || '',
        state: c.state || '',
        total_orders: c.total_orders || 0,
        total_spent: parseFloat(c.total_spent || 0),
        avg_order_value: (c.total_orders > 0)
          ? Math.round(parseFloat(c.total_spent || 0) / (c.total_orders || 1) * 100) / 100
          : 0,
        marketing_email: c.marketing_email !== false,
        marketing_whatsapp: c.marketing_whatsapp !== false,
        created_at: c.created_at || '',
      }));

      if (format === 'csv') {
        const head = 'name,email,phone,city,state,total_orders,total_spent,avg_order_value,marketing_email,marketing_whatsapp,created_at';
        const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const body = rows.map(r =>
          [r.name, r.email, r.phone, r.city, r.state, r.total_orders, r.total_spent, r.avg_order_value, r.marketing_email, r.marketing_whatsapp, r.created_at].map(esc).join(','));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="customers-' + new Date().toISOString().slice(0, 10) + '.csv"');
        return res.send([head, ...body].join('\n'));
      }
      res.json({ data: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
