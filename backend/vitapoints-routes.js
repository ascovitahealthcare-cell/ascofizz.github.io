// ═══════════════════════════════════════════════════════════════
// VITAPOINTS v2 — CUSTOMER API
// Mounted from server.js. Every route is bound to the caller's verified
// JWT — the email is never taken from the request body, which is how a
// customer could otherwise read or spend someone else's points.
//
// All balance mutation happens inside the SECURITY DEFINER functions in
// 02-engine.sql. This layer only authenticates, validates, and formats.
// ═══════════════════════════════════════════════════════════════

module.exports = function mountVitaRoutes(app, { supabase, authMiddleware, adminOnly, requirePerm }) {

  // vita_config sets what a point is worth, the per-order redemption cap and
  // the milestone threshold — those are money, and under the v9.3 role split
  // money is owner-only (the same reasoning that made coupons.manage owner:
  // "a coupon is a discount, i.e. money"). Reading the config stays open to
  // staff so they can answer a customer's question about their balance.
  // Falls back to adminOnly if the guard was not injected, so an older mount
  // still boots.
  const ownerPerm = perm => (typeof requirePerm === 'function' ? requirePerm(perm) : adminOnly);

  const emailOf = req => String(req.user?.email || '').toLowerCase().trim();

  // ── GET /api/vitapoints/summary ──────────────────────────────
  // The single call the account page and checkout widget both use.
  app.get('/api/vitapoints/summary', authMiddleware, async (req, res) => {
    try {
      const email = emailOf(req);
      if (!email) return res.status(401).json({ error: 'Not signed in' });

      await supabase.rpc('vita_account_ensure', { p_user: email });
      const { data, error } = await supabase.rpc('vita_summary', { p_user: email });
      if (error) throw error;

      const s = (Array.isArray(data) ? data[0] : data) || {};
      res.json({
        available:  s.available  || 0,
        pending:    s.pending    || 0,
        locked:     s.locked     || 0,
        debt:       s.debt       || 0,
        lifetimeEarned:   s.lifetime_earned   || 0,
        lifetimeRedeemed: s.lifetime_redeemed || 0,
        rupeeValue:       Number(s.rupee_value || 0),
        maxPerOrder:      s.max_per_order || 5000,
        milestoneThreshold: s.milestone_threshold || 15000,
        milestoneReady:     !!s.milestone_ready,
      });
    } catch (e) {
      console.error('[vita/summary]', e.message);
      res.status(500).json({ error: 'Could not load your VitaPoints' });
    }
  });

  // ── GET /api/vitapoints/history ──────────────────────────────
  app.get('/api/vitapoints/history', authMiddleware, async (req, res) => {
    try {
      const email = emailOf(req);
      if (!email) return res.status(401).json({ error: 'Not signed in' });

      const { data, error } = await supabase
        .from('vita_ledger_v2')
        .select('transaction_type,points,order_id,reason,created_at')
        .eq('user_id', email)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      // Plain-English labels — customers should never see EARN_PENDING.
      const LABEL = {
        EARN_PENDING:       'Earned — pending delivery',
        EARN_AVAILABLE:     'Points now available',
        REDEEM:             'Used at checkout',
        REDEMPTION_RELEASE: 'Returned to your balance',
        RETURN_REVERSAL:    'Reversed — order returned',
        REFUND_REVERSAL:    'Reversed — order refunded',
        CANCELLATION_REVERSAL: 'Reversed — order cancelled',
        DEBT:               'Adjustment — points already spent',
        DEBT_RECOVERY:      'Recovered from previous adjustment',
        BONUS:              'Bonus points',
        PROMOTION:          'Promotional points',
        ADMIN_ADJUSTMENT:   'Adjusted by Ascofizz',
        EXPIRY:             'Expired',
        REWARD_LOCK:        'Milestone reward claimed',
        REWARD_REDEEM:      'Milestone reward used',
        REWARD_CANCEL:      'Milestone reward cancelled',
      };

      res.json({
        history: (data || []).map(h => ({
          type:   h.transaction_type,
          label:  LABEL[h.transaction_type] || h.transaction_type,
          points: h.points,
          orderId: h.order_id,
          note:   h.reason,
          at:     h.created_at,
        })),
      });
    } catch (e) {
      console.error('[vita/history]', e.message);
      res.status(500).json({ error: 'Could not load your VitaPoints history' });
    }
  });

  // ── GET /api/vitapoints/pending ──────────────────────────────
  // "Why isn't this spendable yet?" — the single most likely support
  // question once the hold is live, so answer it in the UI directly.
  app.get('/api/vitapoints/pending', authMiddleware, async (req, res) => {
    try {
      const email = emailOf(req);
      if (!email) return res.status(401).json({ error: 'Not signed in' });

      const { data, error } = await supabase
        .from('vita_pending')
        .select('order_id,points,state,delivered_at,release_after,created_at')
        .eq('user_id', email).eq('state', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      res.json({
        pending: (data || []).map(p => ({
          orderId: p.order_id,
          points: p.points,
          delivered: !!p.delivered_at,
          availableOn: p.release_after,
          status: p.delivered_at
            ? 'Delivered — unlocks after the return window'
            : 'Unlocks after your order is delivered',
        })),
      });
    } catch (e) {
      console.error('[vita/pending]', e.message);
      res.status(500).json({ error: 'Could not load pending VitaPoints' });
    }
  });



  // ── POST /api/vitapoints/milestone/claim ─────────────────────
  // Consumes the threshold points and mints a single-use coupon in one
  // locked transaction — the customer can never hold both.
  app.post('/api/vitapoints/milestone/claim', authMiddleware, async (req, res) => {
    try {
      const email = emailOf(req);
      if (!email) return res.status(401).json({ error: 'Not signed in' });

      const { data, error } = await supabase.rpc('vita_claim_milestone', { p_user: email });
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) || {};
      if (!r.ok) return res.status(400).json({ error: r.message });
      res.json({ ok: true, code: r.code, message: r.message });
    } catch (e) {
      console.error('[vita/milestone/claim]', e.message);
      res.status(500).json({ error: 'Could not claim your reward — please try again' });
    }
  });

  // ── POST /api/vitapoints/milestone/preview ───────────────────
  // What would this reward be worth on this cart? Priced off the
  // LOWEST-priced item, capped, with a cart minimum.
  app.post('/api/vitapoints/milestone/preview', authMiddleware, async (req, res) => {
    try {
      const { lowestItemPrice, cartTotal } = req.body || {};
      const { data, error } = await supabase.rpc('vita_milestone_discount', {
        p_lowest_item_price: Number(lowestItemPrice) || 0,
        p_cart_total: Number(cartTotal) || 0,
      });
      if (error) throw error;
      res.json({ discount: Number(data) || 0 });
    } catch (e) {
      res.status(500).json({ error: 'Could not calculate the reward' });
    }
  });

  // ── ADMIN ────────────────────────────────────────────────────
  app.get('/api/admin/vitapoints/config', authMiddleware, adminOnly, async (req, res) => {
    const { data, error } = await supabase.from('vita_config').select('*').order('key');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ config: data || [] });
  });

  app.put('/api/admin/vitapoints/config/:key', authMiddleware, ownerPerm('settings.manage'), async (req, res) => {
    try {
      const { value } = req.body || {};
      if (value === undefined) return res.status(400).json({ error: 'value is required' });
      const { data, error } = await supabase.from('vita_config')
        .update({ value, updated_at: new Date().toISOString(), updated_by: req.user.email || req.user.role })
        .eq('key', req.params.key).select().single();
      if (error) throw error;
      res.json({ ok: true, config: data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Any row here is a genuine bug — accounts have drifted from the ledger.
  app.get('/api/admin/vitapoints/reconciliation', authMiddleware, adminOnly, async (req, res) => {
    const { data, error } = await supabase.from('vita_reconciliation').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ drift: data || [], healthy: (data || []).length === 0 });
  });

  app.get('/api/admin/vitapoints/customer/:email', authMiddleware, adminOnly, async (req, res) => {
    try {
      const email = String(req.params.email).toLowerCase().trim();
      const [acct, ledger, pend] = await Promise.all([
        supabase.from('vita_accounts').select('*').eq('user_id', email).maybeSingle(),
        supabase.from('vita_ledger_v2').select('*').eq('user_id', email)
          .order('created_at', { ascending: false }).limit(100),
        supabase.from('vita_pending').select('*').eq('user_id', email)
          .order('created_at', { ascending: false }),
      ]);
      res.json({ account: acct.data, ledger: ledger.data || [], pending: pend.data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Manual release trigger — useful if the scheduler was down.
  // Releasing early skips the delivery + return-window hold that stops a
  // refused COD parcel from minting spendable points, so it is owner-only.
  app.post('/api/admin/vitapoints/release-now', authMiddleware, ownerPerm('settings.manage'), async (req, res) => {
    try {
      const { data, error } = await supabase.rpc('vita_release_due');
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) || {};
      res.json({ ok: true, releasedOrders: r.released_orders || 0,
                 releasedPoints: r.released_points || 0, debtRecovered: r.debt_recovered || 0 });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('[mount] vitapoints-routes (v2) ✅');
};