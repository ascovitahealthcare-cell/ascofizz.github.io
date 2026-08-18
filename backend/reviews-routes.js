// ═══════════════════════════════════════════════════════════════════
// REVIEWS API — ascofizz-backend
//
// WHY THIS FILE WAS REBUILT (2026-08-01 audit)
// This file used to be a byte-for-byte copy of returns-routes.js —
// a mounting mistake that meant every /api/returns and
// /api/admin/returns route was silently intercepted by THIS file
// (mounted first) before returns-routes.js's identical copy ever ran.
// Meanwhile, the actual "reviews" feature had NO backend route at all.
// The frontend wrote reviews straight to Supabase with the public anon
// key, and the only thing stopping abuse was an RLS policy that
// checked text length and star rating — nothing else. It didn't
// require a purchase, didn't require sign-in, and didn't restrict the
// `verified` or `status` columns, so anyone could insert a review
// marked verified:true, approved, with any product/rating/text.
//
// This file is now the real implementation. The RLS policy on
// `reviews` has been tightened to deny all public writes — every
// review is created here, through the service-role key, after
// verifying the reviewer actually has an order containing the product.
// ═══════════════════════════════════════════════════════════════════

module.exports = function mountReviewsRoutes(app, { supabase, authMiddleware, adminOnly, writeAudit, rateLimit }) {

  // Named esc, but it only coerced to String — it escaped nothing. Review
  // text and display names are rendered into innerHTML on the storefront,
  // so a customer with a real order could store `<img src=x onerror=…>` and
  // run script in every visitor's browser, including an admin whose token
  // sits in localStorage on the same origin. The storefront now escapes on
  // render too; this is the second layer, so the stored value is safe
  // whatever renders it next.
  const esc = v => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const ip  = req => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

  function coerceItems(raw) {
    if (!raw) return [];
    let v = raw;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } }
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } } // double-encoded, seen elsewhere in this codebase
    return Array.isArray(v) ? v : [];
  }

  // A handful of reviews per hour is normal; a script hammering this
  // route is not. Kept separate from the login limiter so a burst of
  // legitimate review traffic never trips the auth rate limit.
  const reviewLimiter = rateLimit
    ? rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
        message: { error: 'Too many reviews submitted — please try again later.' } })
    : (req, res, next) => next();

  // ── POST /api/reviews — submit a review, gated on an actual order ──
  app.post('/api/reviews', authMiddleware, reviewLimiter, async (req, res) => {
    try {
      const email = req.user.email;
      if (!email) return res.status(401).json({ error: 'Unauthorised' });

      const productId = Number(req.body.product_id);
      const rating    = Number(req.body.rating);
      const text       = esc(req.body.review_text).trim().slice(0, 1000);
      const userName   = esc(req.body.user_name || req.user.name || 'Customer').trim().slice(0, 80);

      if (!productId) return res.status(400).json({ error: 'product_id is required' });
      if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating must be 1-5' });
      if (!text) return res.status(400).json({ error: 'Please write a few words about your experience' });

      // Real purchase check — the ONLY thing that makes "verified" mean
      // anything. Looks across every non-deleted order this customer has,
      // not just delivered ones, but "verified" is only true for orders
      // that actually reached the customer.
      //
      // This .eq() is exact and case-SENSITIVE, and it is what made
      // reviews look broken for everyone but one person. Orders were
      // filed under whatever case the customer typed at checkout while
      // the token carried whatever case they registered in, so for most
      // people this found NO orders, `purchased` stayed false, and a
      // genuine buyer was told they had not bought the product. Whoever
      // happened to type their address identically both times — one
      // person — could review, and nobody else could.
      //
      // authMiddleware lowercases every token now and orders are written
      // lowercase, so new data matches. Orders ALREADY stored in mixed
      // case need 007_normalise_emails.sql; until it is applied this
      // still misses them. Left as .eq() on purpose: .ilike() would
      // treat `_` in an address as a wildcard and could match a
      // different customer's orders, which is far worse than a 403.
      const { data: orders } = await supabase
        .from('orders').select('items,fulfillment')
        .eq('customer_email', email).is('deleted_at', null);

      let purchased = false, delivered = false;
      for (const o of (orders || [])) {
        const items = coerceItems(o.items);
        if (items.some(it => Number(it.id) === productId)) {
          purchased = true;
          if (String(o.fulfillment) === 'Delivered') delivered = true;
        }
      }
      if (!purchased) {
        return res.status(403).json({ error: 'You can only review products you have purchased.' });
      }

      // One review per product per customer — edit the existing one
      // instead of letting the same person post fifty 5-star reviews.
      const { data: existing } = await supabase
        .from('reviews').select('id').eq('customer_email', email).eq('product_id', productId).maybeSingle();

      const { data: product } = await supabase.from('products').select('name').eq('id', productId).maybeSingle();

      const row = {
        product_id: productId,
        product_name: product?.name || req.body.product_name || '',
        user_name: userName,
        customer_email: email,
        rating: Math.round(rating),
        review_text: text,
        verified: delivered,
        status: 'approved', // auto-published — gated by real purchase + 1-per-product + rate limit now,
                              // not open injection. Flip to 'pending' here for manual moderation if preferred.
        updated_at: new Date().toISOString(),
      };

      let result;
      if (existing) {
        result = await supabase.from('reviews').update(row).eq('id', existing.id).select().single();
      } else {
        result = await supabase.from('reviews').insert(row).select().single();
      }
      if (result.error) throw result.error;

      res.json({ ok: true, review: result.data });
    } catch (err) {
      console.error('[reviews] submit failed:', err.message);
      res.status(500).json({ error: 'Could not submit your review — please try again.' });
    }
  });

  // ── ADMIN: moderation — the moderated_at/moderated_by columns already
  // existed in the schema with nothing reading or writing them ──
  // Aug 2026 pass: pagination — full table on every load before.
  app.get('/api/admin/reviews', authMiddleware, adminOnly, async (req, res) => {
    const { paginate } = require('./paginate');
    const status = req.query.status;
    let q = supabase.from('reviews').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    await paginate(req, res, q, { defaultLimit: 50 });
  });

  app.put('/api/admin/reviews/:id', authMiddleware, adminOnly, async (req, res) => {
    try {
      const status = String(req.body.status || '');
      if (!['approved', 'pending', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status must be approved, pending, or rejected' });
      }
      const actor = req.user.email || req.user.role;
      const { data, error } = await supabase.from('reviews').update({
        status, moderated_at: new Date().toISOString(), moderated_by: actor,
        updated_at: new Date().toISOString(),
      }).eq('id', req.params.id).select().single();
      if (error) throw error;

      if (typeof writeAudit === 'function') {
        try {
          await writeAudit({
            userId: actor, tableName: 'reviews', recordId: String(req.params.id),
            action: 'moderate', newValues: { status }, ipAddress: ip(req),
          });
        } catch (e) { console.warn('[reviews] audit write failed:', e.message); }
      }

      res.json({ ok: true, review: data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/reviews/:id', authMiddleware, adminOnly, async (req, res) => {
    const { error } = await supabase.from('reviews').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  console.log('[mount] reviews-routes (real implementation) ✅');
};
