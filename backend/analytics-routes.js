// ═══════════════════════════════════════════════════════════════════════════
//  analytics-routes.js — persistent visitor analytics
//  Repo 2 (backend) · deploy to the repo ROOT, next to server.js
//
//  Replaces the in-memory `visitorSessions = new Map()` that used to live in
//  server.js. That Map was wiped on every Render restart/redeploy/cold start,
//  so there was never any day / week / month history to show, and with more
//  than one Render instance each one counted a different set of people.
//
//  Mounted from server.js with:
//     require('./analytics-routes')(app, { supabase, authMiddleware, adminOnly });
//
//  Requires analytics-schema.sql to have been run in Supabase first.
// ═══════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');
// Hostnames that are our own pages rather than a referral source.
// Derived from FRONTEND_URL so a rebrand needs no code change;
// SELF_HOSTS adds any extra first-party domains.
const SELF_HOST_RE = (() => {
  const hosts = [process.env.FRONTEND_URL, process.env.ADMIN_URL, ...String(process.env.SELF_HOSTS || '').split(',')]
    .map(h => String(h || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
    .filter(Boolean)
    .map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return hosts.length ? new RegExp(hosts.join('|'), 'i') : /$a^/;
})();

const IP_SALT      = process.env.ANALYTICS_IP_SALT || process.env.JWT_SECRET || 'analytics-salt';
const LIVE_WINDOW  = 5 * 60 * 1000;   // a visitor counts as "online now" for 5 min
const PV_DEDUPE    = 10 * 1000;       // ignore repeat pageviews of the same page within 10s

// ─────────────────────────────────────────────────────────────
// User-agent parsing
// ─────────────────────────────────────────────────────────────

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|uptime|gtmetrix|curl|wget|python-requests|axios|okhttp|postman|monitor|preview|facebookexternalhit|whatsapp|telegram|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|perplexity/i;

/**
 * The old code tested /mobile|android|iphone|ipad/i BEFORE /tablet/i.
 * An iPad's user-agent contains "ipad", so every iPad was reported as a
 * phone and the Tablet bucket was permanently zero. Android tablets
 * (which carry "Android" but NOT "Mobile") were mislabelled the same way.
 * Order matters here — tablets are checked first.
 */
function parseDevice(ua, hint) {
  const u = String(ua || '').toLowerCase();

  // iPadOS 13+ lies and reports itself as a Mac. Only the browser knows the
  // difference (it has touch points), so the client sends a hint we trust
  // for this one case.
  if (hint === 'tablet' || hint === 'mobile' || hint === 'desktop') {
    if (hint === 'tablet' || /ipad/.test(u)) return hint;
  }
  if (/ipad/.test(u)) return 'tablet';
  if (/android/.test(u) && !/mobile/.test(u)) return 'tablet';
  if (/tablet|kindle|silk|playbook|nexus 7|nexus 10|sm-t/.test(u)) return 'tablet';
  if (/mobile|iphone|ipod|windows phone|blackberry|opera mini|iemobile/.test(u)) return 'mobile';
  if (hint === 'tablet') return 'tablet';
  return 'desktop';
}

function parseOS(ua) {
  const u = String(ua || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(u))            return 'iOS';
  if (/android/.test(u))                     return 'Android';
  if (/cros/.test(u))                        return 'ChromeOS';
  if (/windows/.test(u))                     return 'Windows';
  if (/mac os x|macintosh/.test(u))          return 'macOS';
  if (/linux|ubuntu|fedora|debian/.test(u))  return 'Linux';
  return 'Other';
}

function parseOSVersion(ua) {
  const u = String(ua || '');
  let m;
  if ((m = u.match(/(?:iPhone )?OS (\d+[_.]\d+)/)))    return m[1].replace(/_/g, '.');
  if ((m = u.match(/Android (\d+(?:\.\d+)?)/)))        return m[1];
  if ((m = u.match(/Windows NT (\d+\.\d+)/)))          return ({ '10.0': '10/11', '6.3': '8.1', '6.1': '7' })[m[1]] || m[1];
  if ((m = u.match(/Mac OS X (\d+[_.]\d+)/)))          return m[1].replace(/_/g, '.');
  return null;
}

function parseBrowser(ua) {
  const u = String(ua || '');
  // Order matters: most of these also contain "Safari" or "Chrome".
  if (/Edg\//.test(u))                      return 'Edge';
  if (/SamsungBrowser/.test(u))             return 'Samsung Internet';
  if (/OPR\/|Opera/.test(u))                return 'Opera';
  if (/FxiOS|Firefox/.test(u))              return 'Firefox';
  if (/CriOS/.test(u))                      return 'Chrome';
  if (/Chrome\//.test(u))                   return 'Chrome';
  if (/Safari\//.test(u))                   return 'Safari';
  return 'Other';
}

/**
 * The old /api/visitors/active classified traffic source from `referrer`,
 * but the storefront never sent a referrer field — so every single visitor
 * was labelled "Direct" no matter where they came from.
 */
function classifySource(referrer, utm) {
  const um = String(utm?.medium || '').toLowerCase();
  const us = String(utm?.source || '').toLowerCase();
  if (um === 'cpc' || um === 'ppc' || um === 'paid' || /paid|ads?$/.test(um)) return 'Paid';
  if (um === 'email' || us === 'email' || us === 'newsletter')                return 'Email';
  if (us) {
    if (/google/.test(us))                        return 'Google';
    if (/facebook|instagram|meta|fb|ig/.test(us)) return 'Social';
    if (/whatsapp|wa/.test(us))                   return 'WhatsApp';
  }

  const r = String(referrer || '').toLowerCase();
  if (!r) return 'Direct';
  if (/google\.|googleadservices|bing\.|duckduckgo|yahoo\.|ecosia/.test(r))                    return 'Google';
  if (/facebook\.|instagram\.|fb\.|linkedin\.|twitter\.|x\.com|pinterest\.|youtube\.|t\.co/.test(r)) return 'Social';
  if (/whatsapp|wa\.me|chat\.whatsapp/.test(r))                                                return 'WhatsApp';
  if (/mail\.google|outlook\.|mail\.yahoo/.test(r))                                            return 'Email';
  try {
    const host = new URL(r).hostname.replace(/^www\./, '');
    if (SELF_HOST_RE.test(host)) return 'Direct';   // our own pages aren't a referral
  } catch (_) { /* not a full URL — fall through */ }
  return 'Referral';
}

const hashIp = ip => crypto.createHash('sha256').update(String(ip) + IP_SALT).digest('hex').slice(0, 32);
const clip   = (v, n) => (v == null ? null : String(v).slice(0, n));

// Ranges the dashboard is allowed to ask for.
function resolveRange(range) {
  const to = new Date();
  const d  = n => new Date(Date.now() - n * 86400000);
  switch (String(range || 'today')) {
    case 'today': { const f = new Date(); f.setHours(0, 0, 0, 0); return { from: f, to, bucket: 'hour',  label: 'Today' }; }
    case '7d':    return { from: d(7),   to, bucket: 'day',   label: 'Last 7 days' };
    case '30d':   return { from: d(30),  to, bucket: 'day',   label: 'Last 30 days' };
    case '90d':   return { from: d(90),  to, bucket: 'day',   label: 'Last 90 days' };
    case '12m':   return { from: d(365), to, bucket: 'month', label: 'Last 12 months' };
    default:      { const f = new Date(); f.setHours(0, 0, 0, 0); return { from: f, to, bucket: 'hour', label: 'Today' }; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════

module.exports = function analyticsRoutes(app, deps) {
  const { supabase, authMiddleware, adminOnly, cached: _cached, cacheInvalidate: _inv } = deps;

  // Remembers the last page + time we recorded per session so a re-ping on the
  // same page doesn't inflate the pageview count. Purely an optimisation —
  // losing it on restart costs at most one duplicate pageview per visitor.
  const lastPv = new Map();

  // ─────────────────────────────────────────────────────────────
  // PUBLIC — the storefront calls this
  // ─────────────────────────────────────────────────────────────
  // Which site a ping came from. The Origin header is what a browser
  // actually sent the request from and can't be spoofed by page content,
  // so it's trusted over whatever the client claims in the body. Referer
  // covers the few request types that omit Origin. b.site (the page's own
  // location.hostname) is the last-resort fallback for direct/non-CORS
  // callers where neither header survives.
  function pingSite(req, b) {
    const fromHeader = (h) => { try { return new URL(h).hostname.replace(/^www\./, ''); } catch { return ''; } };
    return fromHeader(req.headers.origin) || fromHeader(req.headers.referer)
      || String(b.site || '').replace(/^www\./, '').slice(0, 100) || 'unknown';
  }

  app.post('/api/visitors/ping', async (req, res) => {
    // Answer immediately. Analytics must never slow down or break the store.
    res.json({ ok: true });

    try {
      const b    = req.body || {};
      const ua   = req.headers['user-agent'] || '';
      const ip   = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
      const site = pingSite(req, b);

      const sid = clip(b.session_id, 64);
      if (!sid) return;

      const isBot  = BOT_RE.test(ua) || !ua;
      const device = parseDevice(ua, b.device_hint);
      const os     = parseOS(ua);
      const utm    = b.utm || {};
      const page   = clip(b.page || '/', 200);
      const now    = new Date();

      const { data: existing } = await supabase
        .from('visitor_sessions')
        .select('session_id, first_seen, page_views, landing_page, converted')
        .eq('session_id', sid)
        .maybeSingle();

      if (!existing) {
        await supabase.from('visitor_sessions').insert({
          session_id:   sid,
          site,
          first_seen:   now, last_seen: now,
          ip_hash:      ip ? hashIp(ip) : null,
          country:      clip(req.headers['cf-ipcountry'] || b.country || 'IN', 4),
          city:         clip(req.headers['cf-ipcity'] || b.city, 80),
          device_type:  device,
          os, os_version: parseOSVersion(ua),
          browser:      parseBrowser(ua),
          screen_w:     Number(b.screen_w) || null,
          screen_h:     Number(b.screen_h) || null,
          is_pwa:       !!b.is_pwa,
          referrer:     clip(b.referrer, 400),
          source:       classifySource(b.referrer, utm),
          utm_source:   clip(utm.source, 80),
          utm_medium:   clip(utm.medium, 80),
          utm_campaign: clip(utm.campaign, 120),
          landing_page: page,
          last_page:    page,
          page_views:   1,
          duration_sec: 0,
          user_email:   clip(b.email, 160),
          is_bot:       isBot,
        });
      } else {
        const prev    = lastPv.get(sid);
        const isNewPv = !prev || prev.page !== page || (Date.now() - prev.t) > PV_DEDUPE;
        const patch   = {
          last_seen:    now,
          last_page:    page,
          duration_sec: Math.max(0, Math.round((now - new Date(existing.first_seen)) / 1000)),
        };
        if (isNewPv) patch.page_views = (existing.page_views || 1) + 1;
        if (b.email) patch.user_email = clip(b.email, 160);
        await supabase.from('visitor_sessions').update(patch).eq('session_id', sid);
      }

      const prev = lastPv.get(sid);
      if (!prev || prev.page !== page || (Date.now() - prev.t) > PV_DEDUPE) {
        lastPv.set(sid, { page, t: Date.now() });
        if (!isBot) {
          await supabase.from('visitor_pageviews').insert({
            session_id: sid, page, at: now,
            device_type: device, os, source: classifySource(b.referrer, utm),
          });
        }
      }

      // Keep the dedupe map from growing forever on a long-lived instance.
      if (lastPv.size > 5000) {
        const cut = Date.now() - 30 * 60 * 1000;
        for (const [k, v] of lastPv) if (v.t < cut) lastPv.delete(k);
      }
    } catch (_) { /* analytics failures are never surfaced to the shopper */ }
  });

  // Called from the thank-you page so "conversions" is a real number instead
  // of the old `sessions.filter(s => s.status === 'checkout')`, which counted
  // a `status` field the API never actually returned (so it was always 0).
  app.post('/api/visitors/convert', async (req, res) => {
    res.json({ ok: true });
    try {
      const b = req.body || {};
      if (!b.session_id) return;
      await supabase.from('visitor_sessions').update({
        converted:   true,
        order_id:    clip(b.order_id, 64),
        order_value: Number(b.order_value) || null,
        user_email:  clip(b.email, 160),
        last_seen:   new Date(),
      }).eq('session_id', clip(b.session_id, 64));
    } catch (_) {}
  });

  // ─────────────────────────────────────────────────────────────
  // ADMIN — live
  // ─────────────────────────────────────────────────────────────
  app.get('/api/visitors/active', authMiddleware, adminOnly, async (req, res) => {
    try {
      const cutoff = new Date(Date.now() - LIVE_WINDOW).toISOString();
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);

      // ?site=<hostname> narrows to one site; default is unfiltered (all
      // sites pooled) but every session now carries `site`, so the panel
      // can offer a dropdown instead of guessing.
      const siteFilter = clip(req.query.site, 100);

      let liveQ = supabase.from('visitor_sessions')
        .select('session_id, site, last_page, city, device_type, os, browser, source, first_seen, duration_sec, converted, user_email, is_pwa')
        .eq('is_bot', false).gte('last_seen', cutoff)
        .order('duration_sec', { ascending: false }).limit(200);
      if (siteFilter) liveQ = liveQ.eq('site', siteFilter);

      let pvQ = supabase.from('visitor_pageviews')
        .select('id', { count: 'exact', head: true })
        .gte('at', midnight.toISOString());

      const [{ data: live }, { count: pvToday }, { data: siteRows }] = await Promise.all([
        liveQ,
        pvQ,
        // Site breakdown of who's live right now, regardless of siteFilter —
        // this is what answers "is it really only the storefront or is
        // something else feeding in too".
        supabase.from('visitor_sessions')
          .select('site').eq('is_bot', false).gte('last_seen', cutoff),
      ]);

      const rows = live || [];
      const sessions = rows.map(v => ({
        // Original field names kept so nothing that already reads this breaks.
        page:     v.last_page || '/',
        city:     v.city || 'India',
        device:   v.device_type === 'mobile' ? 'Mobile' : v.device_type === 'tablet' ? 'Tablet' : 'Desktop',
        duration: v.duration_sec || 0,
        source:   v.source || 'Direct',
        // New fields.
        os:       v.os || 'Other',
        browser:  v.browser || 'Other',
        is_pwa:   !!v.is_pwa,
        site:     v.site || 'unknown',
        status:   v.converted ? 'converted' : (/checkout|cart|payment/i.test(v.last_page || '') ? 'checkout' : 'browsing'),
        signed_in: !!v.user_email,
      }));

      const site_breakdown = {};
      (siteRows || []).forEach(r => {
        const s = r.site || 'unknown';
        site_breakdown[s] = (site_breakdown[s] || 0) + 1;
      });

      res.json({
        active_count:     sessions.length,
        page_views_today: pvToday || 0,   // genuinely today, from the pageviews table
        converting:       sessions.filter(s => s.status === 'checkout' || s.status === 'converted').length,
        site_breakdown,   // { "<site>": 12, "unknown": 0 }
        sessions,
      });
    } catch (err) {
      res.status(500).json({ error: err.message, active_count: 0, page_views_today: 0, sessions: [] });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // ADMIN — history: today / 7d / 30d / 90d / 12m
  // ─────────────────────────────────────────────────────────────


  // Everything the dashboard needs for one range, in a single round trip.
  // ── Shared cache: all admins see the same numbers, one answer for the
  //    whole fleet. Under big traffic this collapses an 8-RPC load into a
  //    single store refresh every 20s (stale copies serve in the meantime)
  //    so the admin panel's 20s fetch timeout can no longer be missed.
  const cache = _cached || _fallbackCache;
  app.get('/api/analytics/dashboard', authMiddleware, adminOnly, cache(async (req) => {
    const r = resolveRange(req.query.range);
    const F = r.from.toISOString(), T = r.to.toISOString();
    const bd = dim => supabase.rpc('analytics_breakdown', { p_from: F, p_to: T, p_dim: dim, p_limit: 12 });
    const [overview, series, device, os, browser, source, page, city] = await Promise.all([
      supabase.rpc('analytics_overview',   { p_from: F, p_to: T }),
      supabase.rpc('analytics_timeseries', { p_from: F, p_to: T, p_bucket: r.bucket }),
      bd('device_type'), bd('os'), bd('browser'), bd('source'), bd('page'), bd('city'),
    ]);
    const pct = rows => {
      const t = (rows || []).reduce((s, x) => s + (x.count || 0), 0) || 1;
      return (rows || []).map(x => ({ ...x, pct: Math.round((x.count / t) * 1000) / 10 }));
    };
    return {
      range: req.query.range || 'today', label: r.label, bucket: r.bucket,
      overview: overview.data || {},
      series:   series.data   || [],
      devices:  pct(device.data), os: pct(os.data), browsers: pct(browser.data),
      sources:  pct(source.data), pages: pct(page.data), cities: pct(city.data),
    };
  }, { ttlMs: 20000, staleMs: 60000, tag: 'dashboard', shared: true }));

  // Kept for any internal callers; the admin panel now uses the cached route above.

  // A plain in-process producer-cache so this module doesn't hard-depend on
  // extra deps server.js may pass. Used only if `cached` was not provided.
  // Serves fresh while TTL holds, stale copies while refreshing, and the
  // last good body on failure — same shape as respcache, per route.
  function _fallbackCache(produce, opts) {
    const store = new Map();
    const refreshing = new Set();
    return async (req, res) => {
      const key = JSON.stringify({ range: req.query.range, bucket: req.query.bucket });
      const now = Date.now();
      const entry = store.get(key);
      if (entry && now - entry.stored < opts.ttlMs) return res.json(entry.body);
      if (entry && now - entry.stored < opts.ttlMs + opts.staleMs) {
        res.json(entry.body);
        if (!refreshing.has(key)) {
          refreshing.add(key);
          Promise.resolve()
            .then(() => produce(req))
            .then((body) => { store.set(key, { body, stored: Date.now() }); })
            .catch(() => {})   // stale copy keeps serving; never crash the loop
            .finally(() => refreshing.delete(key));
        }
        return;
      }
      store.delete(key);
      try {
        const body = await produce(req);
        store.set(key, { body, stored: Date.now() });
        return res.json(body);
      } catch (err) {
        if (entry) return res.json(entry.body);
        res.status(500).json({ error: err.message });
      }
    };
  }
  // Daily retention job — keeps the tables from growing forever.
  setInterval(() => {
    supabase.rpc('analytics_prune').then(
      ({ data }) => data && console.log('[analytics] pruned', JSON.stringify(data)),
      () => {}
    );
  }, 24 * 60 * 60 * 1000).unref?.();

  console.log('✅ Analytics routes mounted (persistent visitor tracking)');
};