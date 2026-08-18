// ═══════════════════════════════════════════════════════════════════
// SHARED-RESPONSE CACHE
//
// WHAT THIS IS FOR
//   There are no server-rendered pages here — the storefront is a
//   static file on GitHub Pages and this server is a pure JSON API. The
//   equivalent is responses that are IDENTICAL for every visitor and
//   change rarely, yet are recomputed from Supabase on every request:
//
//     GET /api/products          every page load, every visitor
//     GET /api/products/:id      every product page
//     GET /api/settings          every page load
//     GET /api/delhivery/serviceability/:pincode
//     GET /api/admin/stats/dashboard   every admin dashboard load
//
// /api/products already sends Cache-Control, but that only instructs the
// BROWSER. Every cold visitor, every CDN miss, and every request with a
// cache-busting query string still reaches Supabase — and the storefront
// deliberately cache-busts with ?_t=<timestamp>, so in practice that
// header buys nothing at all. The server-side cache is what stops that.
//
// THE RULE THAT MATTERS MOST
//   A cache that ever returns one customer's data to another is worse
//   than no cache. So by default this refuses, structurally, to touch
//   any request carrying credentials — an Authorization header or a
//   Cookie means compute it fresh and store nothing, whatever the route
//   config says. A personalised endpoint cannot be cached here even by
//   mistake.
//
//   OPTING IN SAFELY
//   Some authenticated endpoints are *not* personalised — the answer is
//   the same for every admin (store-wide stats, not "my" orders). Those
//   may pass `shared: true`. Under that flag the cache drops the
//   Authorization header from the key entirely, stores ONE shared copy,
//   and serves it to every authenticated caller regardless of role.
//   ONLY use `shared: true` on routes whose body is provably identical
//   for all callers, and never on /me-style endpoints.
//
// WHY A PRODUCER AND NOT MIDDLEWARE
//   Serving a stale copy while refreshing behind it means running the
//   handler with nothing to send to. Doing that as middleware requires
//   swapping methods on a response that has already been sent, or
//   re-dispatching a cloned request through the router — both depend on
//   Express internals and fail in ways that are hard to see. A producer
//   is a plain async function returning the body: the refresh just
//   calls it again, with no response object involved.
// ═══════════════════════════════════════════════════════════════════

const store = new Map();
const inflight = new Map();
const stats = { hit: 0, stale: 0, miss: 0, bypass: 0, stored: 0, evicted: 0, invalidated: 0, refreshFailed: 0 };

const MAX_ENTRIES = 500;   // a hard ceiling; this is a cache, not a leak

function evictOldest() {
  if (store.size <= MAX_ENTRIES) return;
  const excess = store.size - MAX_ENTRIES;
  let i = 0;
  for (const k of store.keys()) {      // Map iterates in insertion order
    if (i++ >= excess) break;
    store.delete(k);
    stats.evicted++;
  }
}

// The full path AND query string, so /api/products?category=Vitamins is
// never served from /api/products. Anything else that changes the body
// — a locale or currency header, if this ever gets one — belongs in
// `vary`, or visitors would be served each other's variant.
//
// When `shared` is true the Authorization header is deliberately stripped
// from the key (that is the whole point — one answer for every admin),
// so it must not sit in `vary` either.
function buildKey(req, vary, shared) {
  let key = req.originalUrl || req.url;
  if (shared) key = 'shared:' + key;   // tag the namespace clearly
  for (const h of (vary || [])) {
    if (shared && h.toLowerCase() === 'authorization') continue;
    const v = req.headers[h.toLowerCase()];
    key += `|${h}=${v || ''}`;
  }
  return key;
}

/**
 * Wraps a producer into an Express handler that serves from cache.
 *
 *   produce(req)  async, returns the response body
 *   ttlMs         how long an entry is fresh
 *   staleMs       how long past that it may still be served while a
 *                 single refresh runs behind it
 *   vary          request headers that change the body
 *   tag           invalidation group, so a content change drops a set
 *   shared        opt-in: one shared copy for all authenticated callers
 *                 (see OPTING IN SAFELY at the top of this file)
 */
function cached(produce, { ttlMs = 60000, staleMs = 300000, vary = [], tag = null, shared = false } = {}) {
  return async function cachedHandler(req, res) {
    // ── the safety rail ──────────────────────────────────────────
    // Credentials mean the answer might be personalised. Never read
    // from, and never write to, the shared cache for such a request —
    // unless the route has opted in with `shared: true`, which is only
    // safe on body-identical endpoints.
    const personalised = !!(req.headers.authorization || req.headers.cookie);
    if (personalised && !shared) {
      stats.bypass++;
      try {
        res.set('X-Cache', 'BYPASS');
        return res.json(await produce(req));
      } catch (e) { return sendError(res, e); }
    }

    const key = buildKey(req, vary, shared);
    const now = Date.now();
    const entry = store.get(key);

    if (entry) {
      const age = now - entry.at;
      if (age < ttlMs) {
        stats.hit++;
        res.set('X-Cache', 'HIT'); res.set('Age', String(Math.floor(age / 1000)));
        return res.json(entry.body);
      }
      if (age < ttlMs + staleMs) {
        // Serve the stale copy NOW; refresh behind it. Nobody waits for
        // a regeneration, and a burst on one key produces exactly one
        // upstream query because refreshes are collapsed per key.
        stats.stale++;
        res.set('X-Cache', 'STALE'); res.set('Age', String(Math.floor(age / 1000)));
        res.json(entry.body);
        refresh(key, produce, req, tag);
        return;
      }
      store.delete(key);   // too old to serve even as stale
    }

    stats.miss++;
    try {
      const body = await fill(key, produce, req, tag);
      res.set('X-Cache', 'MISS');
      return res.json(body);
    } catch (e) { return sendError(res, e); }
  };
}

// A producer can throw with `.status` and `.body` to express a
// non-200 answer — a 404 for an unknown product, say. Those are never
// stored (fill() only writes on success), so a missing row cannot be
// cached and then keep 404ing after it is created.
function sendError(res, e) {
  const status = Number(e && e.status) || 500;
  if (status >= 500) console.error('[cache] producer failed:', e.message);
  res.set('X-Cache', 'MISS');
  return res.status(status).json(e.body || { error: e.message });
}

// Collapses concurrent misses on the same key into ONE upstream call —
// otherwise a cold cache under load stampedes the database with the
// identical query, which is the opposite of the point.
function fill(key, produce, req, tag) {
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    try {
      const body = await produce(req);
      store.set(key, { body, at: Date.now(), tag });
      stats.stored++;
      evictOldest();
      return body;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

function refresh(key, produce, req, tag) {
  if (inflight.has(key)) return;
  fill(key, produce, req, tag).catch(e => {
    // A failed refresh must not delete the stale copy — serving
    // slightly old data beats serving none while the database is
    // briefly unhappy.
    stats.refreshFailed++;
    console.warn('[cache] background refresh failed for', key, '—', e.message);
  });
}

/**
 * Drop cached entries. Call on content change: a cache that only
 * expires on a timer shows an admin their own edit from a minute ago
 * and makes them think the save failed.
 *   invalidate()             everything
 *   invalidate({ tag })      one group, e.g. every product response
 *   invalidate({ prefix })   by URL prefix
 */
function invalidate({ tag = null, prefix = null } = {}) {
  let n = 0;
  for (const [k, v] of store) {
    if ((tag && v.tag === tag) || (prefix && k.startsWith(prefix)) || (!tag && !prefix)) {
      store.delete(k); n++;
    }
  }
  stats.invalidated += n;
  if (n) console.log(`[cache] invalidated ${n} entr${n === 1 ? 'y' : 'ies'}` +
                     (tag ? ` (tag: ${tag})` : prefix ? ` (prefix: ${prefix})` : ''));
  return n;
}

function snapshot() {
  const served = stats.hit + stats.stale + stats.miss;
  return {
    entries: store.size, maxEntries: MAX_ENTRIES,
    ...stats,
    hitRate: served ? Number((((stats.hit + stats.stale) / served) * 100).toFixed(1)) : 0,
    keys: [...store.keys()].slice(0, 25),
  };
}

function mountCacheHealth(app) {
  app.get('/api/health/cache', (req, res) => res.json(snapshot()));
}

module.exports = {
  cached, invalidate, snapshot, mountCacheHealth,
  _store: store,
  _reset: () => { store.clear(); inflight.clear(); Object.keys(stats).forEach(k => (stats[k] = 0)); },
};
