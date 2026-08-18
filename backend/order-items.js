/*
 * order-items.js — one way to read an order's line items.
 *
 * WHY THIS EXISTS
 *
 * `orders.items` is a jsonb column, but every row in the live database stores a
 * JSON *string* inside it rather than a JSON array:
 *
 *     select jsonb_typeof(items), count(*) from orders where deleted_at is null;
 *       →  string │ 77        (100% of orders)
 *
 * So `order.items` arrives in JavaScript as a String, not an Array. Three
 * different readings of that grew up in the codebase:
 *
 *   1. server.js (6 sites)  typeof items === 'string' ? JSON.parse(...) : ...
 *                           — correct, which is why checkout and pricing work.
 *   2. Array.isArray(items) ? items : []
 *                           — silently yields [], no error. This is what made
 *                             priceReturn() compute orderQty = 0, so the
 *                             "full reversal" test (retQty >= orderQty) was
 *                             always true and every PARTIAL return was clawed
 *                             back in full.
 *   3. (order.items || []).map(...)
 *                           — throws. This is the Render log line repeating
 *                             every 15 minutes for 24 orders:
 *                             "(order.items || []).map is not a function",
 *                             which meant automated Delhivery shipping had
 *                             never once succeeded.
 *
 * Reading is fixed here rather than by rewriting the 77 stored rows. A data
 * migration can normalise the column later; this helper makes every reader
 * correct either way, so it is safe to deploy on its own and safe to keep
 * afterwards.
 */
'use strict';

/**
 * Returns the order's line items as an array — always. Never throws.
 *
 * Accepts every shape the column has held: a real array, a JSON string holding
 * an array (today's storage), a double-encoded string, or null/garbage.
 */
function parseOrderItems(raw) {
  let v = raw;

  // Unwrap up to two layers of JSON encoding. Two is not arbitrary: the live
  // rows are one layer, and a re-save through a path that stringifies again
  // would produce two. Bounded so a malformed value cannot spin.
  for (let depth = 0; depth < 2; depth++) {
    if (typeof v !== 'string') break;
    const s = v.trim();
    if (!s) return [];
    try { v = JSON.parse(s); } catch (e) { return []; }
  }

  if (Array.isArray(v)) return v;
  // A single item stored bare rather than in a list.
  if (v && typeof v === 'object') return [v];
  return [];
}

/** Total physical units across an order's lines. */
function totalUnits(raw) {
  return parseOrderItems(raw)
    .reduce((n, i) => n + (Number(i && (i.qty != null ? i.qty : i.units)) || 0), 0);
}

module.exports = { parseOrderItems, totalUnits };
