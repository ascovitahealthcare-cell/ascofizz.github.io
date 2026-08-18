/* paginate.js
 * ═══════════════════════════════════════════════════════════════
 * Small pagination helper for Supabase list endpoints.
 *
 * WHY
 * /api/admin/orders, /reviews, /returns, /audit and /customers
 * all returned their entire table on every call. At order volume
 * that is fine for weeks — and then one day the admin panel loads
 * 40,000 rows over a phone connection on a Render cold start.
 * Pagination caps the payload AND lets the caller page to history
 * the admin previously could not reach at all (the old calls
 * either returned everything or a hard limit(200) with no
 * "older" access).
 *
 * USAGE (server.js)
 *   const { paginate } = require('./paginate');
 *   app.get('/api/admin/orders', ..., async (req, res) => {
 *     await paginate(req, res, supabase.from('orders').select('*'),
 *       { defaultLimit: 50 });
 *   });
 *
 * RESPONSE
 *   { data: [...], page, limit, total, pages }
 *
 * TRADE-OFF
 * count('exact') costs a second query per page. For tables in the
 * tens of thousands of rows that is <1ms on Supabase; for millions
 * it is where you would switch to keyset pagination (cursor on
 * created_at). Keyset pagination drops the total/pages numbers —
 * which the admin panel's "page X of Y" affordance needs — so we
 * stay offset-based until orders actually get large enough to hurt.
 * ═══════════════════════════════════════════════════════════════ */

function clamp(n, lo, hi) {
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), lo), hi) : lo;
}

async function paginate(req, res, query, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = clamp(parseInt(req.query.page, 10) || 1, 1, 1000);
  const limit = clamp(parseInt(req.query.limit, 10) || defaultLimit, 1, maxLimit);
  const from = (page - 1) * limit;

  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({
    data: data || [],
    page,
    limit,
    total: count ?? 0,
    pages: count ? Math.ceil(count / limit) : 0,
  });
}

module.exports = { paginate };
