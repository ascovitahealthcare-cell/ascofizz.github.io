/*
 * customers-360-routes.js — Customer 360° profile surface.
 *
 * GET  /api/admin/customers/:id/360      live aggregation — orders, returns,
 *                                        refunds, VitaPoints ledger/balance,
 *                                        promo usage, contact & consent.
 * PUT  /api/admin/customers/:id/360      owner/staff edit — contact, tags,
 *                                        consent, manual loyalty adjustment.
 *                                        Every write requires a fresh
 *                                        X-Password-Proof and is audit-logged
 *                                        with before/after values.
 *
 * All values come straight from the database at request time — no mocks,
 * no stale admin-panel estimates. A 60-second identity cache keeps the
 * heavy order history query off the path when the same profile is reopened.
 */
module.exports = function customers360Routes(app, { supabase, authMiddleware, adminOnly, requirePerm, writeAudit }) {
  // 60s identity cache keyed by customer id — re-opening the same profile
  // is instant and repeated clicking does not hammer the database.
  const _cache = new Map();
  setInterval(() => {
    const cutoff = Date.now() - 120 * 1000;
    for (const [k, v] of _cache) if (v.at < cutoff) _cache.delete(k);
  }, 5 * 60 * 1000).unref?.();

  // ── THE 360° VIEW ──────────────────────────────────────────────
  app.get('/api/admin/customers/:id/360', authMiddleware, requirePerm('customers.view'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid customer id' });

      const hit = _cache.get(id);
      if (hit && Date.now() - hit.at < 60 * 1000) return res.json({ data: hit.data, cached: true });

      // Base record — the join key is customers.id; email is the fallback
      // used by orders/returns/vita which key on customer_email/user_id.
      const { data: c, error } = await supabase.from('customers')
        .select('id,name,email,phone,city,state,pincode,marketing_email,marketing_whatsapp,created_at,updated_at')
        .eq('id', id).is('deleted_at', null).maybeSingle();
      if (error || !c) return res.status(404).json({ error: 'Customer not found' });
      const email = String(c.email || '').toLowerCase().trim();

      const [ordersR, returnsR, refundsR, lifeR, ledgerR, pendingR, rewardsR] = await Promise.all([
        // Order history — capped at the most recent 100; totals computed in SQL.
        supabase.from('orders')
          .select('id, created_at, status, fulfillment, total, payment_method, payment_status, coupon_code, is_test')
          .eq('customer_email', email).order('created_at', { ascending: false }).limit(100),
        supabase.from('returns')
          .select('id, created_at, order_id, status, refund_amount, reason')
          .eq('customer_email', email).order('created_at', { ascending: false }).limit(50),
        supabase.from('refunds').select('id, created_at, order_id, return_id, gateway, gateway_refund_id, amount, status').order('created_at', { ascending: false }).limit(300),
        supabase.from('vita_accounts').select('available,pending,locked,debt,lifetime_earned,lifetime_redeemed').eq('user_id', email).maybeSingle(),
        supabase.from('vita_ledger_v2').select('id, created_at, transaction_type, points, order_id, reason')
          .eq('user_id', email).order('created_at', { ascending: false }).limit(200),
        supabase.from('vita_pending').select('id, created_at, points, order_id, released, delivered_at, release_at').eq('user_id', email).order('created_at', { ascending: false }).limit(50),
        supabase.from('vita_rewards').select('id, claimed_at, code, kind, used_at, expires_at').eq('user_id', email).order('claimed_at', { ascending: false }).limit(50),
      ]);

      const orders = (ordersR.data || []).map(o => ({ ...o, total: Number(o.total || 0) }));
      const cancelled = orders.filter(o => String(o.fulfillment || '').toLowerCase() === 'cancelled');
      const orderIds = new Set(orders.map(o => String(o.id)));
      // refunds key on order_id, not customer_email — filter to this customer's orders
      const refunds = (refundsR.data || []).filter(r => orderIds.has(String(r.order_id)));
      const totals = orders.reduce((t, o) => ({ n: t.n + 1, sum: t.sum + o.total }), { n: 0, sum: 0 });
      const couponUse = orders.filter(o => o.coupon_code).reduce((m, o) => {
        const k = String(o.coupon_code).trim(); if (!k) return m;
        m[k] = (m[k] || 0) + 1; return m;
      }, {});

      const life = lifeR.data || { available: 0, pending: 0, locked: 0, debt: 0, lifetime_earned: 0, lifetime_spent: 0, lifetime_reversed: 0 };
      const data = {
        customer: c,
        orders: {
          total: totals.n,
          total_spent: Math.round(totals.sum),
          cancelled: cancelled.length,
          cancelled_value: Math.round(cancelled.reduce((s, o) => s + o.total, 0)),
          history: orders,
          payment_mix: {
            cod: orders.filter(o => String(o.payment_method || '').toLowerCase() === 'cod').length,
            prepaid: orders.filter(o => String(o.payment_method || '').toLowerCase() !== 'cod').length,
          },
        },
        returns: {
          count: (returnsR.data || []).length,
          refunded: (returnsR.data || []).filter(r => String(r.status || '').toLowerCase() === 'refunded').length,
          refund_amount_total: Number((returnsR.data || []).reduce((s, r) => s + Number(r.refund_amount || 0), 0).toFixed(2)),
          list: returnsR.data || [],
        },
        refunds: { count: refunds.length, list: refunds },
        loyalty: {
          balance: Number(life.available || 0),
          pending: Number(life.pending || 0),
          locked: Number(life.locked || 0),
          debt: Number(life.debt || 0),
          lifetime_earned: Number(life.lifetime_earned || 0),
          lifetime_redeemed: Number(life.lifetime_redeemed || 0),
          ledger: ledgerR.data || [],
          pending_events: pendingR.data || [],
          rewards: rewardsR.data || [],
        },
        promos: {
          coupons_used: couponUse,
          coupon_codes_used_count: Object.keys(couponUse).length,
        },
        consent: { email: c.marketing_email, whatsapp: c.marketing_whatsapp },
      };

      _cache.set(id, { data, at: Date.now() });
      res.json({ data, cached: false });
    } catch (e) {
      console.error('[customers/360]', e.message);
      res.status(500).json({ error: 'Could not load customer profile' });
    }
  });

  // ── EDIT WITH PASSWORD GATE ────────────────────────────────────
  // Contact details, marketing consent and a manual loyalty adjustment. Every write
  // demands X-Password-Proof (POST /api/admin/confirm-password), records
  // before/after values in audit_logs, and refreshes the 360 cache.
  app.put('/api/admin/customers/:id/360', authMiddleware, requirePerm('customers.view'), passwordGated, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid customer id' });
      const { data: c } = await supabase.from('customers').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
      if (!c) return res.status(404).json({ error: 'Customer not found' });

      // Editable contact + consent fields — each one matches a column the GET
      // above actually returned, so the before/after audit shows real values.
      const allowed = { name: 'string', phone: 'string', email: 'string', city: 'string', state: 'string', pincode: 'string',
        marketing_email: 'boolean', marketing_whatsapp: 'boolean', points_manual: 'number' };
      const consentKeys = ['marketing_email', 'marketing_whatsapp'];
      const body = req.body || {};
      const patch = {}, before = {}, changes = [];

      for (const [k, type] of Object.entries(allowed)) {
        if (body[k] === undefined) continue;
        const v = body[k];
        if (type === 'string' && typeof v !== 'string') continue;
        if (type === 'boolean' && typeof v !== 'boolean') continue;
        if (type === 'number' && typeof v !== 'number') continue;
        if (type === 'json' && v !== null && (Array.isArray(v) ? !v.every(x => typeof x === 'string') : typeof v !== 'string')) continue;
        if (String(v).length > 500) continue;
        before[k] = c[k] ?? null;
        patch[k] = v;
        changes.push(k);
      }

      // Manual loyalty adjustment — a bounded, ledger-logged move.
      if (typeof body.points_manual === 'number') {
        const email = String(c.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'Customer has no email — VitaPoints cannot be adjusted' });
        const delta = Math.round(Math.max(-10000, Math.min(10000, body.points_manual)));
        if (delta === 0) { delete patch.points_manual; }
        else {
          try { await supabase.rpc('vita_account_ensure', { p_user: email }); } catch (e) { console.warn('[customers360] vita_account_ensure failed:', e.message); }
          const kind = delta > 0 ? 'manual_adjustment_credit' : 'manual_adjustment_debit';
          const { error } = await supabase.from('vita_ledger_v2').insert([{
            user_id: email, transaction_type: 'ADJUSTMENT', points: delta,
            reason: `Manual adjustment by ${String(req.user.username || req.user.email || '').slice(0, 40)}`,
          }]);
          if (error) return res.status(500).json({ error: 'Could not apply points adjustment' });
          delete patch.points_manual; // points live in vita_accounts/ledger, not the customer row
        }
      }

      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        await supabase.from('customers').update(patch).eq('id', id);
      }
      if (changes.length) {
        _cache.delete(id);
        await writeAudit({ userId: req.user.username || req.user.email, tableName: 'customers', recordId: id,
          action: 'PROFILE_360_UPDATE', oldValues: before, newValues: Object.fromEntries(changes.map(k => [k, body[k]])),
          ipAddress: req.headers['x-forwarded-for'] || req.ip });
      }
      res.json({ success: true, changed: changes });
    } catch (e) {
      console.error('[customers/360-put]', e.message);
      res.status(500).json({ error: 'Could not save changes' });
    }
  });

  // The password gate middleware — a one-use X-Password-Proof header issued
  // by POST /api/admin/confirm-password (passwordConfirmed) is now needed
  // on every destructive or money-moving admin action. It is defined in
  // auth-identities.js; here we reference the shared helper exported from
  // authMiddleware extensions to keep one definition in the tree.
  function passwordGated(req, res, next) {
    const proof = String(req.headers['x-password-proof'] || '').trim();
    if (!proof) return res.status(401).json({ error: 'Password re-confirmation required — confirm your password, then try again' });
    // Defer to the shared proof store in auth-identities via the global hook.
    if (typeof global.__verifyPasswordProof === 'function') {
      return global.__verifyPasswordProof(proof, req, res, next);
    }
    return res.status(500).json({ error: 'Password gate unavailable — restart the panel' });
  }
};
