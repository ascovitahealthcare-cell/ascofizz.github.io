/**
 * ═══════════════════════════════════════════════════════════════════════
 * ASCOVITA — REAL REVIEW SYSTEM (backend)
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * Your index.html was showing hardcoded/fake reviews (same text on every
 * product with no review, and the same 6-9 fake cards repeated in the
 * "What Our Customers Say" and "Customer Reviews Wall" sections). New
 * reviews a shopper submitted only lived in browser memory — nothing was
 * saved to your database, so they vanished on refresh, and every time you
 * redeployed index.html the fake seed data came right back.
 *
 * index.html has already been updated to call the 3 endpoints below.
 * This file is the missing backend half — add it to your existing
 * Node/Express service (the one already running at
 * https://ascovitahealthcare-cell-github-io.onrender.com, the same host
 * your /api/products, /api/orders etc. already live on).
 *
 * HOW TO WIRE IT IN
 *   1. Copy this file into your backend repo, e.g. routes/reviews.js
 *   2. Run the SQL in reviews-schema.sql once against your database
 *      (Render Postgres, or swap the pg calls below for your driver
 *      if you're on MySQL/SQLite — the shape is the same).
 *   3. In your main server file:
 *        const reviewsRouter = require('./routes/reviews');
 *        app.use('/api/reviews', reviewsRouter(pool)); // pass your existing pg Pool
 *   4. Redeploy the backend. No changes needed to index.html — it already
 *      points at these exact paths.
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');

module.exports = function reviewsRouter(pool) {
  const router = express.Router();

  // ── GET /api/reviews/featured?limit=9 ───────────────────────────
  // Cross-product feed of the best recent approved reviews, joined
  // with the product name — powers BOTH the homepage testimonial
  // grid and the Customer Reviews Wall, so the whole site shows one
  // real, consistent set of reviews instead of two different fakes.
  //
  // IMPORTANT: this must be registered BEFORE "/:productId" below —
  // Express matches routes in registration order, and "/:productId"
  // would otherwise swallow the literal path "/featured" first.
  router.get('/featured', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 9, 30);
    try {
      const { rows } = await pool.query(
        `SELECT r.id, r.product_id AS "productId", p.name AS "productName",
                r.user_name AS user, r.rating, r.text,
                to_char(r.created_at, 'Mon YYYY') AS date
         FROM reviews r
         JOIN products p ON p.id = r.product_id
         WHERE r.status = 'approved' AND r.rating >= 4
         ORDER BY r.created_at DESC
         LIMIT $1`,
        [limit]
      );
      res.json({ data: rows });
    } catch (err) {
      console.error('[reviews] GET /featured failed:', err);
      res.status(500).json({ error: 'failed to load featured reviews' });
    }
  });

  // ── GET /api/reviews/:productId ──────────────────────────────
  // Returns every APPROVED review for one product, newest first.
  // Used by the product detail page's Reviews tab.
  router.get('/:productId', async (req, res) => {
    const productId = parseInt(req.params.productId, 10);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'invalid productId' });
    }
    try {
      const { rows } = await pool.query(
        `SELECT id, user_name AS user, rating, text,
                to_char(created_at, 'Mon YYYY') AS date, verified
         FROM reviews
         WHERE product_id = $1 AND status = 'approved'
         ORDER BY created_at DESC`,
        [productId]
      );
      res.json({ data: rows });
    } catch (err) {
      console.error('[reviews] GET /:productId failed:', err);
      res.status(500).json({ error: 'failed to load reviews' });
    }
  });

  // ── POST /api/reviews ─────────────────────────────────────────
  // Body: { productId, user, rating, text }
  // Saves a new review to SQL. Defaults to status='pending' so you can
  // moderate before it appears publicly — flip AUTO_APPROVE to true
  // below if you'd rather have reviews go live immediately.
  const AUTO_APPROVE = false;

  router.post('/', async (req, res) => {
    const { productId, user, rating, text } = req.body || {};
    const pid = parseInt(productId, 10);
    const rat = parseInt(rating, 10);

    if (!Number.isInteger(pid) || !user || !text || !Number.isInteger(rat) || rat < 1 || rat > 5) {
      return res.status(400).json({ error: 'productId, user, rating (1-5) and text are required' });
    }
    // Basic length guards against abuse/spam
    if (user.length > 80 || text.length > 2000) {
      return res.status(400).json({ error: 'user or text too long' });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO reviews (product_id, user_name, rating, text, status, verified, created_at)
         VALUES ($1, $2, $3, $4, $5, false, now())
         RETURNING id, user_name AS user, rating, text,
                   to_char(created_at, 'Mon YYYY') AS date, verified`,
        [pid, user.trim(), rat, text.trim(), AUTO_APPROVE ? 'approved' : 'pending']
      );
      res.status(201).json({ data: rows[0] });
    } catch (err) {
      console.error('[reviews] POST / failed:', err);
      res.status(500).json({ error: 'failed to save review' });
    }
  });

  return router;
};
