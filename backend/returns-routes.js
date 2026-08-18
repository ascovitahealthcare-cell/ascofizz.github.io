// ═══════════════════════════════════════════════════════════════════
// RETURNS & REFUNDS API  —  ascofizz-backend
//
// WHY THIS FILE EXISTS
// server.js already has a mount block for this file:
//     require('./returns-routes')(app, { supabase, authMiddleware, adminOnly, writeAudit });
// but returns-routes.js itself was missing, so the require() threw,
// the try/catch swallowed it, and NOT ONE /api/returns or
// /api/admin/returns route was ever registered. Every request to them
// fell through to Express's static/catch-all handler, which served
// index.html — hence the storefront and admin panel both failing with
// "Unexpected token '<', <!DOCTYPE... is not valid JSON". This file is
// the missing module. Migration 003_returns.sql (returns table,
// return_eligibility(), approve_return(), reject_return()) already
// existed and is what these routes call into.
//
// HOW TO MOUNT (server.js) — already present, no server.js change needed:
//     require('./returns-routes')(app, { supabase, authMiddleware, adminOnly, writeAudit });
//
// ROUTES (contract matches index.html + admin.html exactly):
//   GET  /api/returns/eligible          (customer) orders open for return
//   GET  /api/returns/my                (customer) this customer's return requests
//   POST /api/returns                   (customer) submit a new return request
//   POST /api/returns/:id/cancel        (customer) cancel own 'requested' return
//   GET  /api/admin/returns             (admin)    list + status counts
//   POST /api/admin/returns/:id/approve (admin)    approve_return() RPC
//   POST /api/admin/returns/:id/reject  (admin)    reject_return() RPC
//   PUT  /api/admin/returns/:id/status  (admin)    picked_up / refunded / etc.
// ═══════════════════════════════════════════════════════════════════

const RETURN_REASONS = [
  'Product damaged / defective',
  'Wrong item received',
  'Item expired or near expiry',
  'No longer needed',
  'Better price found elsewhere',
  'Other',
];

const RETURN_WINDOW_DAYS = 7;

// An order nobody has stamped as delivered still has to get a window, and
// starting it the day the order was PLACED is what made this feature
// unusable (see 004_returns_delivered_at.sql for the full story). India
// delivery runs 3–5 business days, so the clock on an unstamped order
// starts this far after checkout instead, and the customer keeps the full
// 7 days after that.
const DELIVERY_GRACE_DAYS = 10;

const DAY_MS = 86400000;

module.exports = function mountReturnRoutes(app, deps) {
  const { supabase, authMiddleware, adminOnly, writeAudit, passwordGated } = deps;
  if (!passwordGated) console.warn('[returns-routes] passwordGated dep missing — returned/status endpoint is not password-gated');

  // Runs `fn` over `items` up to `limit` at a time, preserving input
  // order in the result. Promise.all on its own would be simpler, but an
  // account with 100 orders would open 100 simultaneous Supabase
  // connections; this keeps the win without that.
  async function mapWithConcurrency(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    });
    await Promise.all(workers);
    return out;
  }

  // When was this order delivered? orders.delivered_at is authoritative
  // once 004 has run; before that — and for rows written by an older build
  // that never set it — the status log is the record, since every
  // transition to Delivered has been logged from the start.
  async function resolveDeliveredAt(order, logHint) {
    if (order.delivered_at) return new Date(order.delivered_at);
    if (logHint) return new Date(logHint);
    try {
      const { data } = await supabase
        .from('order_status_logs')
        .select('created_at')
        .eq('order_id', order.id)
        .eq('new_status', 'Delivered')
        .order('created_at', { ascending: true })
        .limit(1);
      if (data && data[0] && data[0].created_at) return new Date(data[0].created_at);
    } catch (e) {
      console.warn('[returns] status-log lookup failed for', order.id, e.message);
    }
    // Marked Delivered but with no stamp anywhere: updated_at is when
    // someone last touched the row, which is that mark.
    if (order.fulfillment === 'Delivered' && order.updated_at) return new Date(order.updated_at);
    return null;
  }

  // ── Shared eligibility check ────────────────────────────────────────
  // BUG THIS FIXES (1): supabase-js's .rpc() does NOT throw on failure — it
  // resolves with { data: null, error: {...} }. The old code destructured
  // only `data`, ignored `error`, and only fell back to the JS-side 7-day
  // calculation inside a try/catch. Since nothing ever threw, an RPC that
  // errored (missing function, bad param, etc.) silently produced
  // data === null, so `eligible` stayed at its default `false` and every
  // order looked "not eligible" — including one placed the day before,
  // with no error surfaced anywhere. This helper checks `error` itself and
  // always resolves eligibility one way or another.
  //
  // BUG THIS FIXES (2): and then the fallback it resolved to was wrong.
  // It read order.delivered_at — a column that did not exist — so the
  // window ran from created_at and had usually closed before the parcel
  // arrived. Every order came back ineligible, the account panel said "No
  // orders are currently eligible", and a refund request could not be
  // raised at all. The RPC hit the same fault in SQL, which is why the
  // fallback was the code path actually running. Both are fixed; this
  // function now matches return_eligibility() in 004 line for line, so it
  // stays correct whether or not that migration has been applied yet.
  async function checkReturnEligibility(order, opts) {
    const openReturn = opts && opts.hasOpenReturn;
    try {
      const { data: elig, error: rpcErr } = await supabase.rpc('return_eligibility', { p_order_id: order.id });
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(elig) ? elig[0] : elig;
      if (!row) throw new Error('return_eligibility returned no row');
      return { eligible: !!row.eligible, daysLeft: row.days_left || 0, reason: row.reason || null };
    } catch (e) {
      console.warn('[returns] return_eligibility RPC failed, using JS fallback:', e.message);

      const status = String(order.fulfillment || '');
      if (['Cancelled', 'Returned'].includes(status)) {
        return { eligible: false, daysLeft: 0, reason: 'This order was already ' + status.toLowerCase() };
      }
      if (openReturn) {
        return { eligible: false, daysLeft: 0, reason: 'A return request is already open for this order' };
      }

      const delivered = await resolveDeliveredAt(order, opts && opts.deliveredHint);
      const start = delivered
        ? delivered.getTime()
        : (order.created_at ? new Date(order.created_at).getTime() + DELIVERY_GRACE_DAYS * DAY_MS : null);
      if (start == null || Number.isNaN(start)) {
        return { eligible: false, daysLeft: 0, reason: 'We could not read this order’s dates — please contact support' };
      }

      const deadline = new Date(start + RETURN_WINDOW_DAYS * DAY_MS);
      const now = new Date();
      if (now > deadline) {
        return {
          eligible: false, daysLeft: 0,
          reason: 'The 7-day return window closed on ' +
            deadline.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        };
      }
      return {
        eligible: true,
        daysLeft: Math.max(0, Math.ceil((deadline - now) / DAY_MS)),
        reason: null,
      };
    }
  }

  // Coerced to String but escaped nothing, despite the name. Return reasons
  // and comments are customer-supplied and are rendered into the admin
  // panel, so escape here as well as on render.
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const ip = (req) =>
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;

  // Same flexible item-shape coercion the invoice template uses —
  // orders.items is stored as a JSON string.
  function coerceItems(raw) {
    if (raw == null || raw === '') return [];
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(raw)) {
      if (raw && typeof raw === 'object') raw = Object.values(raw);
      else return [];
    }
    return raw.map((i, n) => ({
      id: i.id != null ? String(i.id) : String(n),
      name: i.name || i.product_name || i.title || 'Item',
      qty: Number(i.qty || i.units || i.quantity || 1) || 1,
      // Kept because the approve handler prices a partial return from
      // these rows. It used to drop `price`, so priceById[...] was
      // undefined for every line, `returnedValue` came out as 0, and
      // returning 2 of 5 items reversed 0 points instead of those two
      // items' worth. A tier purchase carries its price as tierRate.
      price: Number(i.price != null ? i.price : (i.tierRate != null ? i.tierRate : i.selling_price)) || 0,
    }));
  }

  // ── CUSTOMER: which of my orders can still be returned ────────────
  app.get('/api/canary-returns-4c2d', (_, res) => res.json({ ok: true, marker: 'returns-module-loaded' }));
  app.get('/api/returns/eligible', authMiddleware, async (req, res) => {
    try {
      const email = req.user.email;
      if (!email) return res.status(401).json({ error: 'Unauthorised' });

      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_email', email)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const ids = (orders || []).map((o) => o.id);

      // Two bulk lookups instead of two per order. The loop below used to
      // fire a round trip per order for eligibility alone; on an account
      // with 100 orders that is 100 sequential calls before the panel can
      // paint anything.
      const deliveredById = {};
      const openReturnIds = new Set();
      if (ids.length) {
        const [logsRes, retRes] = await Promise.all([
          supabase.from('order_status_logs')
            .select('order_id,created_at')
            .in('order_id', ids)
            .eq('new_status', 'Delivered')
            .order('created_at', { ascending: true }),
          supabase.from('returns')
            .select('order_id')
            .in('order_id', ids)
            .in('status', ['requested', 'approved', 'picked_up']),
        ]);
        // Ascending order means the first row seen per order is the earliest.
        (logsRes.data || []).forEach((l) => {
          if (!deliveredById[l.order_id]) deliveredById[l.order_id] = l.created_at;
        });
        (retRes.data || []).forEach((r) => openReturnIds.add(r.order_id));
      }

      // Batching the two lookups above was only half of it. The real cost
      // is checkReturnEligibility itself: it calls the return_eligibility
      // RPC, one round trip per order, and this loop awaited them one
      // after another. With the limit of 100 above that is up to 100
      // sequential round trips before the account page can paint — which
      // is exactly what "Loading your orders…" sitting there was.
      //
      // The RPC stays, because it is where the return rule actually
      // lives and duplicating it here is how the two would drift apart.
      // The orders are independent of each other, so they are checked
      // concurrently instead: wall-clock cost is now one round trip plus
      // change rather than a hundred. Bounded so a large account cannot
      // open a hundred connections at once.
      const results = await mapWithConcurrency(orders || [], 8, async (o) => {
        const { eligible, daysLeft, reason } = await checkReturnEligibility(o, {
          deliveredHint: deliveredById[o.id],
          hasOpenReturn: openReturnIds.has(o.id),
        });
        return {
          order_id: o.id,
          total: o.total,
          created_at: o.created_at,
          delivered_at: o.delivered_at || deliveredById[o.id] || null,
          fulfillment: o.fulfillment || null,
          eligible, days_left: daysLeft, reason,
          items: coerceItems(o.items),
        };
      });

      res.json({ orders: results, reasons: RETURN_REASONS });
    } catch (e) {
      console.error('[returns/eligible]', e.message);
      res.status(500).json({ error: 'Could not load your orders' });
    }
  });

  // ── CUSTOMER: my past + open return requests ───────────────────────
  app.get('/api/returns/my', authMiddleware, async (req, res) => {
    try {
      const email = req.user.email;
      if (!email) return res.status(401).json({ error: 'Unauthorised' });
      // SECURITY (audit OZ-04): was .ilike('customer_email', email). ILIKE reads
      // its argument as a PATTERN, and an account registered as `%@gmail.com`
      // therefore matched every Gmail customer's returns — order ids, addresses
      // and customer-written reason text. The sibling routes in this file
      // (/eligible, /:id/cancel) already use exact matching; this one was the
      // odd one out.
      //
      // authMiddleware lowercases every token email, and live data was checked
      // before this change: 0 rows in returns/orders/customers hold a mixed-case
      // address, so exact matching returns the same rows for every real customer.
      const { data, error } = await supabase
        .from('returns')
        .select('*')
        .eq('customer_email', email)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ returns: data || [] });
    } catch (e) {
      console.error('[returns/my]', e.message);
      res.status(500).json({ error: 'Could not load your return requests' });
    }
  });

  // ── CUSTOMER: submit a return request ──────────────────────────────
  app.post('/api/returns', authMiddleware, async (req, res) => {
    try {
      const email = req.user.email;
      if (!email) return res.status(401).json({ error: 'Unauthorised' });

      // Not run through esc(): this is a lookup key, not display text, and
      // HTML-escaping it would turn any id containing & or a quote into an
      // id that matches no row — "Order not found" for an order that
      // exists. The query below is parameterised, so escaping buys nothing.
      const order_id = String(req.body.order_id == null ? '' : req.body.order_id).trim().slice(0, 120);
      const reason = esc(req.body.reason).trim().slice(0, 200);
      const comments = esc(req.body.comments).trim().slice(0, 1000);
      const items = Array.isArray(req.body.items) ? req.body.items : [];

      if (!order_id) return res.status(400).json({ error: 'order_id is required' });
      if (!reason) return res.status(400).json({ error: 'Please choose a reason for the return' });
      if (!items.length) return res.status(400).json({ error: 'Select at least one item to return' });

      // Ownership + eligibility check — never trust the client.
      //
      // The email half of this used to be a second .eq(), which is an
      // exact, case-SENSITIVE match. orders.customer_email has been
      // written from the checkout form in whatever case the customer
      // typed, so an order placed as "Sister@Gmail.com" was invisible to
      // a token carrying "sister@gmail.com" and this returned "Order not
      // found" — for an order the customer was looking straight at. That
      // is the "return request will not submit however many times I try"
      // report, and it would have looked random: it depended entirely on
      // how each person happened to type their address at checkout.
      //
      // Matched on id alone now — which is the row key — and the
      // ownership comparison is done here, case-insensitively, the same
      // way every other ownership check in the codebase does it.
      // Deliberately not .ilike(): `_` is a wildcard in a LIKE pattern
      // and perfectly legal in an email local part, so a customer with
      // an underscore in their address could match somebody else's row.
      const { data: order, error: oErr } = await supabase
        .from('orders').select('*').eq('id', order_id).maybeSingle();
      if (oErr || !order) return res.status(404).json({ error: 'Order not found' });
      if (String(order.customer_email || '').toLowerCase().trim() !== String(email).toLowerCase().trim()) {
        // Same 404 as a missing order — an attacker probing ids learns
        // nothing about which ones exist.
        return res.status(404).json({ error: 'Order not found' });
      }

      const { data: openRet } = await supabase
        .from('returns').select('id').eq('order_id', order_id)
        .in('status', ['requested', 'approved', 'picked_up']).limit(1);

      const eligCheck = await checkReturnEligibility(order, {
        hasOpenReturn: !!(openRet && openRet.length),
      });
      if (!eligCheck.eligible) {
        return res.status(400).json({ error: eligCheck.reason || 'This order is not eligible for return' });
      }

      const cleanItems = items
        .map((i) => ({ id: String(i.id), qty: Math.max(1, Number(i.qty) || 1) }))
        .filter((i) => i.id);
      if (!cleanItems.length) return res.status(400).json({ error: 'Select at least one item to return' });

      const { data: created, error } = await supabase
        .from('returns')
        .insert([{
          order_id, customer_email: email, items: cleanItems,
          reason, comments: comments || null, status: 'requested',
        }])
        .select().single();
      if (error) {
        // Unique index returns_one_open_per_order fires as a 23505 conflict.
        if (error.code === '23505') {
          return res.status(409).json({ error: 'A return request is already open for this order' });
        }
        throw error;
      }

      await writeAudit({
        userId: email, tableName: 'returns', recordId: created.id,
        action: 'create', newValues: created, ipAddress: ip(req),
      });

      res.status(201).json({ ok: true, return: created });
    } catch (e) {
      console.error('[returns create]', e.message);
      res.status(500).json({ error: 'Could not submit your return request' });
    }
  });

  // ── CUSTOMER: cancel my own pending request ────────────────────────
  app.post('/api/returns/:id/cancel', authMiddleware, async (req, res) => {
    try {
      const email = req.user.email;
      const { data: existing, error: eErr } = await supabase
        .from('returns').select('*').eq('id', req.params.id).single();
      if (eErr || !existing) return res.status(404).json({ error: 'Return request not found' });
      if (String(existing.customer_email).toLowerCase() !== String(email).toLowerCase()) {
        return res.status(403).json({ error: 'Not your return request' });
      }
      if (existing.status !== 'requested') {
        return res.status(400).json({ error: 'Only a pending request can be cancelled' });
      }

      const { data, error } = await supabase
        .from('returns')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', req.params.id).select().single();
      if (error) throw error;

      await writeAudit({
        userId: email, tableName: 'returns', recordId: req.params.id,
        action: 'cancel', oldValues: existing, newValues: data, ipAddress: ip(req),
      });

      res.json({ ok: true, return: data });
    } catch (e) {
      console.error('[returns cancel]', e.message);
      res.status(500).json({ error: 'Could not cancel your return request' });
    }
  });

  // ── ADMIN: list returns + status counts ────────────────────────────
  // Aug 2026 pass: pagination on the list; counts stay global.
  app.get('/api/admin/returns', authMiddleware, adminOnly, async (req, res) => {
    try {
      const status = esc(req.query.status).trim();
      const { paginate } = require('./paginate');

      const { data: countsData } = await supabase.from('returns').select('status');
      const counts = { requested: 0, approved: 0, picked_up: 0, refunded: 0, rejected: 0, cancelled: 0 };
      (countsData || []).forEach((r) => { if (counts[r.status] != null) counts[r.status]++; });

      let q = supabase.from('returns').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      // paginate sends {data, page, limit, total, pages}; keep the legacy
      // `returns` + `counts` shape too, so the panel never breaks.
      const orig = res.json.bind(res);
      res.json = (payload) => orig({ ...payload, returns: payload.data, counts });
      await paginate(req, res, q, { defaultLimit: 50 });
    } catch (e) {
      console.error('[admin/returns list]', e.message);
      res.status(500).json({ error: 'Could not load returns' });
    }
  });

  // ── ADMIN: approve — VitaPoints v2 clawback ───────────────────────
  // Reverses only the value actually being returned. Returning 2 of 5
  // items reverses those 2 items' points, not the whole order's. If the
  // customer already spent them the shortfall becomes DEBT, recovered
  // from future earnings — never a negative balance, never free product.
  app.post('/api/admin/returns/:id/approve', authMiddleware, adminOnly, async (req, res) => {
    try {
      const note  = esc(req.body.note).trim().slice(0, 500) || null;
      const actor = req.user.email || req.user.role;

      const { data: ret, error: rErr } = await supabase
        .from('returns').select('*').eq('id', req.params.id).single();
      if (rErr || !ret) return res.status(404).json({ error: 'Return request not found' });
      if (ret.status !== 'requested') {
        return res.status(400).json({ error: `This return is already ${ret.status}` });
      }

      // Value of the returned items, priced from the ORDER's own stored
      // line items — never from anything the client sent.
      const { data: order } = await supabase
        .from('orders').select('items,total,shipping').eq('id', ret.order_id).maybeSingle();
      let returnedValue = null; // null => full reversal
      try {
        const orderItems = coerceItems(order && order.items);
        const retItems   = Array.isArray(ret.items) ? ret.items : [];
        if (orderItems.length && retItems.length) {
          const priceById = {};
          orderItems.forEach(oi => {
            priceById[String(oi.id)] = Number(oi.price) || 0;
          });
          const orderQty = orderItems.reduce((n, oi) => n + (Number(oi.qty) || 0), 0);
          const retQty   = retItems.reduce((n, ri) => n + (Number(ri.qty) || 0), 0);
          // Full return (every unit coming back) stays a full reversal.
          if (retQty < orderQty) {
            returnedValue = retItems.reduce(
              (sum, ri) => sum + (priceById[String(ri.id)] || 0) * (Number(ri.qty) || 0), 0);
          }
        }
      } catch (ve) {
        console.warn('[returns approve] could not price partial return, reversing in full:', ve.message);
      }

      const { data: vData, error: vErr } = await supabase.rpc('vita_reverse_order', {
        p_order: ret.order_id,
        p_returned_value: returnedValue,
        p_reason: 'return approved' + (note ? ` — ${note}` : ''),
        p_type: 'RETURN_REVERSAL',
        p_key: 'return:' + req.params.id,
      });
      if (vErr) throw vErr;
      const v = (Array.isArray(vData) ? vData[0] : vData) || {};

      const { data: updated, error: uErr } = await supabase.from('returns').update({
        status: 'approved',
        points_reversed: v.reversed || 0,
        reviewed_by: actor, reviewed_at: new Date().toISOString(),
        admin_note: note || ret.admin_note, updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).select().single();
      if (uErr) throw uErr;

      await supabase.from('orders')
        .update({ fulfillment: 'Returned', updated_at: new Date().toISOString() })
        .eq('id', ret.order_id);

      await writeAudit({
        userId: actor, tableName: 'returns', recordId: req.params.id,
        action: 'approve',
        newValues: { note, points_reversed: v.reversed || 0, debt_created: v.debt_created || 0,
                     partial: returnedValue !== null, returned_value: returnedValue },
        ipAddress: ip(req),
      });

      res.json({
        ok: true,
        points_reversed: v.reversed || 0,
        debt_created: v.debt_created || 0,
        partial: returnedValue !== null,
        message: v.message || 'Return approved',
        data: updated,
      });
    } catch (e) {
      console.error('[admin/returns approve]', e.message);
      res.status(500).json({ error: 'Could not approve return' });
    }
  });

  // ── ADMIN: reject ────────────────────────────────────────────────
  app.post('/api/admin/returns/:id/reject', authMiddleware, adminOnly, async (req, res) => {
    try {
      const note = esc(req.body.note).trim().slice(0, 500);
      if (!note) return res.status(400).json({ error: 'A rejection reason is required' });
      const actor = req.user.email || req.user.role;
      const { data, error } = await supabase.rpc('reject_return', {
        p_return_id: req.params.id, p_actor: actor, p_note: note,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.ok) return res.status(400).json({ error: (row && row.message) || 'Could not reject return' });

      await writeAudit({
        userId: actor, tableName: 'returns', recordId: req.params.id,
        action: 'reject', newValues: { note }, ipAddress: ip(req),
      });

      res.json({ ok: true, message: row.message });
    } catch (e) {
      console.error('[admin/returns reject]', e.message);
      res.status(500).json({ error: 'Could not reject return' });
    }
  });

  // ── ADMIN: move status forward (picked_up, refunded, ...) ──────────
  app.put('/api/admin/returns/:id/status', authMiddleware, adminOnly, passwordGated, async (req, res) => {
    try {
      const status = esc(req.body.status).trim();
      const allowed = ['picked_up', 'refunded', 'cancelled'];
      if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

      const { data: existing, error: eErr } = await supabase
        .from('returns').select('*').eq('id', req.params.id).single();
      if (eErr || !existing) return res.status(404).json({ error: 'Return request not found' });

      const update = { status, updated_at: new Date().toISOString() };
      if (status === 'refunded') {
        update.refund_amount = Number(req.body.refund_amount) || null;
        update.refund_method = esc(req.body.refund_method).trim() || null;
        update.refund_ref = esc(req.body.refund_ref).trim() || null;
      }

      const { data, error } = await supabase
        .from('returns').update(update).eq('id', req.params.id).select().single();
      if (error) throw error;

      // Safety net: claw back VitaPoints at the moment a refund is actually
      // marked done, not only at approval. vita_reverse is idempotent
      // (unique on order_id + type) — if approve_return already reversed
      // this order's points, this is a harmless no-op, not a double-deduct.
      if (status === 'refunded') {
        try {
          // Safety net for a return that was refunded without passing
          // through approve (e.g. set directly by an admin). Keyed on the
          // return id, so if approve already reversed it this is a no-op
          // rather than a second deduction.
          await supabase.rpc('vita_reverse_order', {
            p_order: existing.order_id, p_returned_value: null,
            p_reason: 'return refunded', p_type: 'REFUND_REVERSAL',
            p_key: 'return:' + req.params.id,
          });
        } catch (ve) { console.warn('[returns status] vita_reverse_order failed:', ve.message); }
      }

      const actor = req.user.email || req.user.role;
      await writeAudit({
        userId: actor, tableName: 'returns', recordId: req.params.id,
        action: 'status:' + status, oldValues: existing, newValues: data, ipAddress: ip(req),
      });

      res.setHeader('X-Route', 'returns-status'); res.json({ ok: true, return: data });
    } catch (e) {
      console.error('[admin/returns status]', e.message);
      res.status(500).json({ error: 'Could not update return status' });
    }
  });
};
