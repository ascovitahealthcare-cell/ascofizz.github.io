// ═══════════════════════════════════════════════════════════════════
// ASCOFIZZ BACKEND — server.js  v7.1
// Node.js + Express + Supabase (acts as ORM layer)
//
// ✅ v8.0 — Fixed: visitors/active response shape, mrp/media fields,
//           video upload, owner login role, pageView tracking
// ✅ Google OAuth + Email Auth with sessions
// ✅ Stored Procedures (atomic order placement)
// ✅ Triggers simulation (stock decrement, coupon usage, audit)
// ✅ Soft Delete everywhere (products, orders, customers, coupons)
// ✅ Full Audit Log
// ✅ Order Status History
// ✅ Image Upload to Supabase Storage (products bucket)
// ✅ Media Library (site_media + promo_media buckets; old image_library table dropped — migration 012)
// ✅ WhatsApp Reports via Twilio (every 12hrs + manual send) — multiple recipients
// ✅ Email Order Confirmation (Nodemailer)
// ✅ GoKwik Payment Links
// ✅ Shiprocket Integration
// ✅ Delhivery Integration (B2C)
// ✅ Instagram Feed
//
// ENV VARS REQUIRED (Render → Environment):
//   SUPABASE_URL              supabase project URL
//   SUPABASE_SERVICE_KEY      supabase service role key
//   GOOGLE_CLIENT_ID          google oauth client id
//   GOOGLE_CLIENT_SECRET      google oauth client secret (for mobile redirect flow)
//   JWT_SECRET                long random string
//   ADMIN_PASSWORD            admin panel password
//   OWNER_PASSWORD            owner panel password (full access incl. AI Agent Team)
//   ANTHROPIC_API_KEY         Claude API key — powers the owner-only AI Agent Team
//   GEMINI_API_KEY            also used as an automatic fallback for the AI Agent Team
//                             if Anthropic hits a rate limit / quota / low balance
//   AI_PRIMARY_PROVIDER       optional — "anthropic" (default) or "gemini". Whichever
//                             is NOT primary is used automatically as the fallback.
//   MANUS_LLM_PROXY_URL       optional — the OpenAI-compatible chat completions
//                             base URL (e.g. https://api.manus.im/api/llm-proxy/v1).
//                             /chat/completions is appended automatically, so pass
//                             the base exactly as documented — never with a
//                             trailing /chat/completions.
//   MANUS_LLM_PROXY_KEY       API key matching the proxy URL above.
//                             Set both on Render: Service → Environment →
//                             Add Environment Variable. While unset, the AI
//                             Agent Team and admin assistant degrade to a
//                             friendly "Manus proxy not configured" hint.
//   SHIPROCKET_EMAIL          shiprocket email
//   SHIPROCKET_PASSWORD       shiprocket password
//   DELHIVERY_API_TOKEN       delhivery b2c static API token (from account header on one.delhivery.com)
//   DELHIVERY_ENV             "production" (default) or "staging" — picks the API host
//   DELHIVERY_PICKUP_LOCATION exact, case-sensitive name of the warehouse registered with Delhivery
//   DELHIVERY_PICKUP_PIN      pickup address pincode
//   DELHIVERY_PICKUP_ADDRESS  pickup address line
//   DELHIVERY_PICKUP_CITY     pickup address city
//   DELHIVERY_PICKUP_STATE    pickup address state
//   DELHIVERY_PICKUP_PHONE    pickup address contact phone
//   DELHIVERY_SELLER_GST_TIN  seller GST TIN — mandatory per Delhivery for order creation
//   DELHIVERY_HSN_CODE        HSN code for products — mandatory per Delhivery (default 30049099)
//   DELHIVERY_CLIENT_NAME     registered client name — required by the waybill + rate APIs
//                             (falls back to DELHIVERY_PICKUP_LOCATION if unset)
//   INSTAGRAM_TOKEN           instagram long-lived token
//   RECAPTCHA_SECRET          recaptcha v3 secret
//   FRONTEND_URL              the public storefront origin (see brand.config.js for the full allow-list)
//   MAIL_USER                 gmail address
//   MAIL_PASSWORD                gmail app password
//   MAIL_FROM                 Ascofizz <mail@gmail.com>
//   WHATSAPP_REPORT_TO        +919898582650,+917265884137  (multiple, comma separated)
//   WHATSAPP_CALLMEBOT_KEYS   optional FREE sender — per-number API keys from
//                             callmebot.com: +919898582650:KEY,+917265884137:KEY
//                             When set, WhatsApp reports use CallMeBot (₹0).
//                             When unset, Twilio is used (TWILIO_* required).
// ═══════════════════════════════════════════════════════════════════

'use strict';

const express      = require('express');
const compression  = require('compression');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
// fetch is available natively in Node 18+ — no require needed
const jwt          = require('jsonwebtoken');
const crypto       = require('crypto');
const bcrypt       = require('bcrypt');
const nodemailer   = require('nodemailer');
const multer       = require('multer');
const { createClient } = require('@supabase/supabase-js');
// Central brand + public-URL configuration. Everything brand-facing and
// every public origin is resolved from the environment here, so no domain
// or infrastructure hostname is hard-coded anywhere in the route files.
const BRAND        = require('./brand.config');

// Identity stamped on the JWT when the legacy env-password login path is
// used (i.e. before any staff row exists in auth_identities). These are
// account identifiers, not contact addresses — they end up in audit logs
// and on the `changed_by` of every admin action, so they are configurable
// rather than carrying a previous operator's domain.
const OWNER_IDENTITY_EMAIL = process.env.OWNER_IDENTITY_EMAIL || 'owner@' + (process.env.BRAND_NAME || 'ascofizz').toLowerCase() + '.local';
const ADMIN_IDENTITY_EMAIL = process.env.ADMIN_IDENTITY_EMAIL || 'admin@' + (process.env.BRAND_NAME || 'ascofizz').toLowerCase() + '.local';

// One-line company descriptor used to ground the AI assistant prompts.
// Kept in the environment so a white-label deployment describes itself
// accurately instead of inheriting the previous operator's credentials.
const BRAND_DESCRIPTOR = process.env.BRAND_DESCRIPTOR ||
  `an ${process.env.COUNTRY || 'Indian'} nutraceutical brand`;
const { guardedFetch, mountBreakerHealth, snapshotAll: breakerSnapshots } = require('./breaker');
const { cached, invalidate: cacheInvalidate, mountCacheHealth } = require('./respcache');

// ═══════════════════════════════════════════════════════════════
// THIRD-PARTY BUDGETS
//
// One tuple per external dependency: how long we will wait, how many
// calls may be in flight at once, how deep the queue behind that may
// get, and how many failures in a minute mean "stop trying for a while".
//
// The numbers differ because the dependencies differ. Instagram is
// decoration on the home page and gets a short leash and a stale-cache
// fallback. GoKwik is taking money and gets a long one, because
// abandoning a payment call is worse than waiting for it. Google OAuth
// sits between the two: sign-in must not hang, but it must also not
// give up on a merely slow day.
//
// maxConcurrent is the part that actually stops a cascade. Even with a
// timeout, a dependency that degrades from 200ms to 9s lets requests
// stack 45x deeper; the semaphore caps that, and maxQueue means the
// callers beyond it are turned away in microseconds instead of joining
// the pile-up.
// ═══════════════════════════════════════════════════════════════
const GOOGLE_BREAKER     = { timeoutMs:  8000, maxConcurrent: 8, maxQueue: 16, failureThreshold: 5, openMs: 20000 };
const RECAPTCHA_BREAKER  = { timeoutMs:  5000, maxConcurrent: 6, maxQueue: 12, failureThreshold: 5, openMs: 20000 };
const INSTAGRAM_BREAKER  = { timeoutMs:  6000, maxConcurrent: 2, maxQueue:  2, failureThreshold: 3, openMs: 60000 };
const GOKWIK_BREAKER     = { timeoutMs: 20000, maxConcurrent: 8, maxQueue: 16, failureThreshold: 6, openMs: 15000 };
const SHIPROCKET_BREAKER = { timeoutMs: 15000, maxConcurrent: 4, maxQueue:  8, failureThreshold: 5, openMs: 30000 };
const ANTHROPIC_BREAKER  = { timeoutMs: 45000, maxConcurrent: 2, maxQueue:  4, failureThreshold: 3, openMs: 60000 };
const TWILIO_BREAKER     = { timeoutMs: 10000, maxConcurrent: 2, maxQueue:  4, failureThreshold: 3, openMs: 60000 };
const CALLMEBOT_BREAKER  = { timeoutMs: 10000, maxConcurrent: 2, maxQueue:  4, failureThreshold: 3, openMs: 60000 };
const GA4_BREAKER        = { timeoutMs:  8000, maxConcurrent: 2, maxQueue:  4, failureThreshold: 3, openMs: 60000 };
const GEMINI_BREAKER     = { timeoutMs: 30000, maxConcurrent: 2, maxQueue:  4, failureThreshold: 3, openMs: 60000 };
const MANUS_BREAKER      = { timeoutMs: 30000, maxConcurrent: 2, maxQueue:  4, failureThreshold: 3, openMs: 60000 };

// ── Manus LLM proxy configuration (built-in default chain) ─────────
// Centralised here so every AI route — AI Agent Team (`callClaude` chain)
// and the admin assistant (`/api/gemini`) — reads the same values, and so
// a missing env var fails loudly and consistently instead of producing a
// half-working endpoint. Values intentionally come from the environment
// only: keys belong in Render's secret store, never in the repo.
const MANUS_LLM_PROXY_URL = (process.env.MANUS_LLM_PROXY_URL || '').trim().replace(/\/$/, '');
const MANUS_LLM_PROXY_KEY = (process.env.MANUS_LLM_PROXY_KEY || '').trim();

// Registered here, once, at startup. breaker() only applies its options
// the FIRST time a name is seen, so leaving registration to whichever
// call site happens to run first would make the timeout depend on
// whether a customer paid before an admin opened the AI panel. Declared
// up front, the budgets are the same on every boot.
{
  const { breaker } = require('./breaker');
  for (const [name, opts] of Object.entries({
    'google-oauth': GOOGLE_BREAKER, 'recaptcha': RECAPTCHA_BREAKER,
    'instagram': INSTAGRAM_BREAKER, 'gokwik': GOKWIK_BREAKER,
    'shiprocket': SHIPROCKET_BREAKER, 'anthropic': ANTHROPIC_BREAKER,
    'twilio': TWILIO_BREAKER, 'callmebot': CALLMEBOT_BREAKER, 'ga4': GA4_BREAKER, 'gemini': GEMINI_BREAKER,
    'manus': MANUS_BREAKER,
    'delhivery': { timeoutMs: 10000, maxConcurrent: 6, maxQueue: 12, failureThreshold: 5, openMs: 30000 },
  })) breaker(name, opts);
}

const BCRYPT_ROUNDS = 12;

// ══════════════════════════════════════════════════════════════════════
// AUTH INPUT VALIDATION
//
// Written out rather than pulled from Zod/Joi on purpose: these are four
// small rules on two endpoints, and adding a dependency to this service
// costs a supply-chain surface and a deploy that cannot be verified from
// here. If validation grows past this, move it to a schema library.
//
// The rules below run on the SERVER. The signup form checks the same
// things in the browser, and that check is worth nothing — anyone can
// post straight to the API with curl.
// ══════════════════════════════════════════════════════════════════════

// bcrypt silently truncates at 72 BYTES. Without a cap, "correct-horse…"
// padded past 72 bytes and the same string with a different 73rd
// character hash identically and both unlock the account — and a
// multi-megabyte password is free CPU for an attacker to burn. 72 is the
// algorithm's limit, not a policy choice.
const PASSWORD_MAX = 72;
const PASSWORD_MIN = 8;
const EMAIL_MAX    = 254;   // RFC 5321 maximum path length
const NAME_MAX     = 80;

// Characters that are meaningless in a real email address but meaningful to
// PostgREST. The address ends up inside filter expressions and LIKE patterns,
// so allowing them let a customer register an address that reads as query
// syntax rather than as a name:
//
//   a,id.neq.z@gmail.com  →  or=(customer_email.eq.a, id.neq.z@gmail.com, …)
//                            i.e. "every order", from one signup.
//
// `_` is deliberately NOT here — john_smith@gmail.com is a real address and
// refusing it would lock out genuine customers. It is an ILIKE single-char
// wildcard, so the defence for that one is to never put an email in an ILIKE
// pattern; every such call site now uses .eq(). Verified against live data
// before tightening: 0 of 53 customers hold any of these characters, so no
// existing account is affected.
const EMAIL_FORBIDDEN = /[,()*%]/;

function validEmail(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s.length > EMAIL_MAX) return null;
  if (EMAIL_FORBIDDEN.test(s)) return null;
  // Deliberately not an RFC-complete grammar. It rejects the malformed
  // and the dangerous; the address is proven real by mail delivery, which
  // no regex can do.
  if (!/^[^\s@<>"'`;\\]+@[^\s@<>"'`;\\.]+(\.[^\s@<>"'`;\\.]+)+$/.test(s)) return null;
  return s.toLowerCase();
}

// Returns a problem string, or null when the password is acceptable.
// Applied on REGISTER only. Login must never enforce complexity: existing
// customers have passwords predating any rule, and refusing to check them
// would lock out real people while telling an attacker the rule set.
function passwordProblem(v) {
  const s = String(v == null ? '' : v);
  if (Buffer.byteLength(s, 'utf8') > PASSWORD_MAX) return 'Password must be 72 characters or fewer.';
  if (s.length < PASSWORD_MIN) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/[0-9]/.test(s)) {
    return 'Password must include an uppercase letter, a lowercase letter and a number.';
  }
  return null;
}

// Free text going into the database and later onto an invoice and the
// order screen. Strip anything that could execute if a downstream view
// ever interpolates it without escaping.
function cleanName(v) {
  return String(v == null ? '' : v)
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, NAME_MAX);
}

// ── Per-account lockout ───────────────────────────────────────────────
// loginLimiter caps attempts per IP. That alone does not protect one
// account: a bot rotating through a proxy pool gets a fresh 5-per-minute
// budget from every address, so a single target can be ground down
// indefinitely. This counts failures against the ACCOUNT, which no amount
// of IP rotation escapes.
//
// In memory, deliberately. Render runs one instance of this service, so a
// Map is accurate today and costs no round trip on the hot path. Two
// honest limitations: it empties on restart or redeploy, and it would go
// per-instance the moment this scales out. If either becomes real, move
// the counter to Redis/Upstash — the call sites below will not change.
const LOCKOUT_MAX_FAILS = 5;
const LOCKOUT_MS        = 15 * 60 * 1000;
const _loginFails       = new Map();   // key -> { n, until, at }

function _lockKey(email) { return String(email || '').toLowerCase().trim(); }

function lockoutRemainingMs(email) {
  const r = _loginFails.get(_lockKey(email));
  if (!r || !r.until) return 0;
  const left = r.until - Date.now();
  if (left <= 0) { _loginFails.delete(_lockKey(email)); return 0; }
  return left;
}

function noteLoginFailure(email) {
  const k = _lockKey(email);
  if (!k) return;
  const r = _loginFails.get(k) || { n: 0, until: 0 };
  r.n += 1;
  r.at = Date.now();
  if (r.n >= LOCKOUT_MAX_FAILS) { r.until = Date.now() + LOCKOUT_MS; r.n = 0; }
  _loginFails.set(k, r);
}

function clearLoginFailures(email) { _loginFails.delete(_lockKey(email)); }

// Bounded so a spray across millions of addresses cannot grow this Map
// into a memory exhaustion bug — the countermeasure becoming the outage.
setInterval(() => {
  const cutoff = Date.now() - LOCKOUT_MS;
  for (const [k, r] of _loginFails) {
    if ((r.until || r.at || 0) < cutoff) _loginFails.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

// ── Timing equalisation ───────────────────────────────────────────────
// The login route returned "Invalid email or password" for both branches,
// which reads as safe, but the two branches took very different times: an
// unknown address returned the moment the SELECT missed, while a known one
// paid for a full bcrypt compare at cost 12 — a few hundred milliseconds.
// That gap is trivially measurable over the network, so the endpoint was
// still a working account-enumeration oracle despite the identical text.
// Comparing against a real hash on the miss path spends the same time.
const _DUMMY_HASH = bcrypt.hashSync('a-password-that-matches-nothing', BCRYPT_ROUNDS);
async function burnPasswordTime(password) {
  try { await bcrypt.compare(String(password || ''), _DUMMY_HASH); } catch (e) {}
}

const app    = express();
const PORT   = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },  // 10MB
  fileFilter: (req, file, cb) => {
    // SECURITY: image/svg+xml removed. An SVG is an XML document that can
    // carry <script>; served from the public bucket it is stored XSS.
    const allowed = ['image/jpeg','image/png','image/webp','image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WebP and GIF images are allowed'));
  }
});

const BUCKET_NAME = 'product-images'; // must match your Supabase bucket name

// Auto-create bucket if it doesn't exist (fixes "bucket not found" error)
async function ensureBucket(sb) {
  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) throw new Error('Cannot list buckets: ' + error.message);
  if (buckets.some(b => b.name === BUCKET_NAME)) return;
  const { error: createErr } = await sb.storage.createBucket(BUCKET_NAME, {
    public: true,
    allowedMimeTypes: ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','video/webm','video/quicktime','video/x-msvideo','video/ogg'],
    fileSizeLimit: 100 * 1024 * 1024,
  });
  if (createErr) throw new Error('Cannot create bucket "' + BUCKET_NAME + '": ' + createErr.message);
  console.log('✅ Created Supabase storage bucket:', BUCKET_NAME);
}

// ── Supabase ──────────────────────────────────────────────────────
// Crash loudly on missing env vars so the platform's build log shows the
// real error rather than a confusing runtime failure later.
// Hard requirements: without these the server cannot serve a single
// request. GOOGLE_CLIENT_SECRET is deliberately NOT here — it is only
// needed for Google sign-in, and a deployment that does not offer that
// should still boot. It is warned about below instead of being fatal.
const _REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET', 'ADMIN_PASSWORD'];
const _MISSING = _REQUIRED_ENV.filter(k => !process.env[k]);
if (_MISSING.length) {
  console.error('\n❌  FATAL — Missing required environment variables:\n  ' + _MISSING.join('\n  '));
  console.error('\nFix: set them in your host\'s environment settings (or .env locally) and redeploy.');
  console.error('See backend/.env.example for the full list and what each one is for.\n');
  process.exit(1);
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('[boot] GOOGLE_CLIENT_SECRET is not set — Google sign-in is disabled. ' +
               'Email/password login and checkout are unaffected.');
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── TRUST THE RENDER PROXY ────────────────────────────────────────
// Render terminates TLS at its own edge and forwards to us, so every
// request arrives from the proxy with the real client address in
// X-Forwarded-For. Express defaults `trust proxy` to false, which means
// req.ip was the PROXY's address — the same value for every customer in
// the country.
//
// express-rate-limit keys its buckets on req.ip, so every limiter in
// this file has been counting the entire site as one person:
//
//   loginLimiter     5 per minute      — site-wide, not per customer
//   orderLimiter     20 per 10 min     — site-wide
//   paymentLimiter   15 per 10 min     — site-wide
//   reviewLimiter    20 per hour       — site-wide
//
// Five sign-ins a minute across all of India, then everyone else gets
// "Too many attempts". That is the shape of the reports: things failing
// for lots of people at once, for no reason they could see, and working
// again later. It also announced itself on every boot —
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR in the Render log — as a warning
// nobody had connected to the symptom.
//
// The value is 1, not `true`: trust exactly one hop, the Render edge.
// `true` trusts the whole chain, which lets a client send its own
// X-Forwarded-For and pick its own rate-limit bucket — turning a broken
// limiter into a bypassable one.
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────────────
// Any localhost/127.0.0.1 origin is allowed regardless of port — dev
// servers (Live Server, Live Preview, browser-sync, etc.) pick a
// random/changing port, so pinning a single port number here just
// causes "CORS: not allowed" errors every time that port changes.
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    // Exact-match only — substring checks (startsWith/includes/endsWith) let an
    // attacker register e.g. "ascofizz.com.evil.com" or "anything.github.io"
    // and pass CORS while credentials:true is set, which would leak auth cookies/tokens.
    // The allow-list is resolved from the environment in brand.config.js
    // (storefront + admin origins, plus CORS_EXTRA_ORIGINS). Nothing is
    // hard-coded here, so re-pointing the deployment at a new domain is
    // an env change rather than a code change.
    const allowed = BRAND.corsOrigins;
    if (isLocalDev || allowed.has(origin)) return cb(null, true);
    // Security audit fix (pre-launch 2026-08): cors() used to call
    // cb(new Error(...)) for disallowed origins, which Express turned into
    // a generic 500 — a probe response that leaks nothing but also gives
    // the attacker a 500 instead of an explicit 403. A rejected origin is
    // a request that reached the right API with the wrong caller, so
    // answer it with an explicit 403 from this handler instead.
    // (The actual cb(null, false) + log happen at the bottom of this block.)
    // The log line stays for humans reading the server output:
    // note the http. That is NOT a hole in this list — it is the
    // storefront having been served over plain http, which GitHub Pages
    // will do unless "Enforce HTTPS" is on. Do not add the http:// origins
    // here to make it go away: this API takes passwords and hands back a
    // JWT, and allowing them would bless doing that in clear text. Both
    // index.html and admin.html now redirect http → https as their first
    // script, and Settings → Pages → Enforce HTTPS fixes it properly.
    console.log('[cors] not allowed → ' + origin);
    cb(null, false);
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Cache-Control','Pragma','X-Requested-With'],
  credentials: true,
}));
// NOTE: there used to be `app.options('*', cors())` here — a SECOND cors()
// with default options, which answers every preflight with
// `Access-Control-Allow-Origin: *`. It silently undid the allow-list above:
// a disallowed origin was refused by the configured middleware (no headers),
// fell through to this line, and got a wildcard approval for its preflight.
// The browser would then send the real cross-origin POST — to /api/orders,
// /api/returns, anything — and although the response could not be READ
// (no ACAO on the response, and credentials:true is incompatible with `*`),
// the request had already been executed. The side effect is the damage.
//
// The configured cors() above already answers preflight itself, so this
// line was redundant as well as harmful. Verified after removal: a
// disallowed origin's OPTIONS now comes back with no CORS headers at all.

// ── Security headers ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // your frontend is a separate static site (GitHub Pages) — CSP belongs there, not here
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // needed so product images/API responses load cross-origin
}));

// ── Rate limiting ───────────────────────────────────────────────────
// RAISED FOR REAL TRAFFIC. These numbers are per IP ADDRESS, and on
// Indian mobile networks an IP address is not a person: Jio, Airtel and
// Vi put very large numbers of subscribers behind carrier-grade NAT, so
// hundreds of unrelated customers can arrive from one address. Offices,
// colleges and cafés do the same on a smaller scale.
//
// At the old numbers, ~100 customers a minute through one carrier NAT
// would have meant the first few getting served and everyone behind them
// seeing "Too many requests" — a limiter written for abuse quietly
// turning into an outage for paying customers at exactly the moment
// traffic grows. The ceilings below are sized for a shared address, not
// for one shopper.
//
// The security this used to carry has not been dropped, it has moved
// somewhere that actually works: password guessing is now stopped by the
// per-ACCOUNT lockout (5 failures, 15 minutes), which no amount of IP
// rotation escapes and no amount of IP SHARING trips. The IP limiter is
// left as a coarse flood guard.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,                        // was 5 — see the CGNAT note above
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a minute and try again.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,                       // was 10 per hour for an entire carrier
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this IP. Please try again later.' },
});

// AUDIT FIX: these three route classes had no rate limit at all before —
// order creation, coupon validation, and payment-session creation could
// be hit as fast as a script could send requests.
const orderLimiter = rateLimit({
  // 20 orders per 10 min across a whole carrier NAT was a checkout outage
  // waiting for a busy afternoon.
  windowMs: 10 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many orders placed too quickly. Please wait a few minutes.' },
});
const couponLimiter = rateLimit({
  windowMs: 60 * 1000, max: 150, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many coupon checks. Please wait a moment.' },
});
const paymentLimiter = rateLimit({
  // Payment-session creation. Blocking this blocks revenue directly.
  windowMs: 10 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please wait a few minutes.' },
});

// ── Order size limits ────────────────────────────────────────────
// COD ships goods before any money changes hands, so an unbounded COD order
// is free inventory for anyone willing to refuse the parcel. Live data had a
// ₹127,609 COD order (97 units of one product) already marked Delivered.
// Prepaid orders are not capped — the money is already collected.
const MAX_QTY_PER_LINE   = Number(process.env.MAX_QTY_PER_LINE)   || 10;
const MAX_COD_ORDER_VALUE = Number(process.env.MAX_COD_ORDER_VALUE) || 20000;
const LARGE_ORDER_ALERT   = Number(process.env.LARGE_ORDER_ALERT)   || 15000;

// ── Compression ──────────────────────────────────────────────────
// Gzip/Brotli-compresses every JSON/HTML response (products payload,
// order history, Instagram feed, etc.) before it hits the wire.
// Zero-risk, ~60-80% smaller responses on mobile networks.
app.use(compression());

// `verify` stores the exact raw bytes on req.rawBody before parsing. Needed
// by the Cashfree webhook handler: its signature is HMAC-SHA256 over the
// literal bytes sent, and JSON.stringify(req.body) is not guaranteed to
// reproduce them byte-for-byte (key order, spacing). Every other route
// ignores req.rawBody — this has no effect on anything already working.
app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

// ── Baseline security headers (full audit 2026-08) ───────────────
// The API was returning responses with no security headers at all:
// no X-Content-Type-Options, no frame protection, no referrer policy.
// CSP is deliberately NOT set — the SPA serves pages with heavy inline
// scripts and styles, so a policy would break the storefront until it is
// rebuilt as a module-based app. These four headers are safe for every route.

// ── Response double-send guard — runs before every route ──────────
// Node throws ERR_HTTP_HEADERS_SENT when a route calls res.json/res.send
// twice (e.g. an upload forward whose error flow already answered while a
// later branch also responds). That uncaught throw crashes the whole Render
// process — the cause of the admin-panel blackout during the last outage.
// This middleware converts any second send into a harmless logged no-op,
// so one sloppy handler can never again take down the API. The warnings
// tell us exactly which route to fix; the first response still wins.
app.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = function guardedJson(body) {
    if (res.headersSent) {
      console.warn('[headers-sent guard] res.json dropped — response already sent for', req.originalUrl);
      return res;
    }
    return origJson(body);
  };
  const origSend = res.send.bind(res);
  res.send = function guardedSend(body) {
    if (res.headersSent) {
      console.warn('[headers-sent guard] res.send dropped — response already sent for', req.originalUrl);
      return res;
    }
    return origSend(body);
  };
  next();
});
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ── Email ─────────────────────────────────────────────────────────
// Explicit SMTP config — more reliable than service:'gmail' shorthand on Render
function createMailer() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAIL_USER  || '',
      pass: process.env.MAIL_PASSWORD || '',
    },
    tls: { rejectUnauthorized: false },
    // Hard timeouts — without these, a blocked/slow port can hang the
    // connection for minutes, which blocks any request that awaits
    // sendOrderEmail() and leaves the customer staring at nothing.
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:      10000,
  });
}
const mailer = createMailer();

// Verify SMTP on startup — readable output in Render logs
async function verifyMailer() {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
    console.warn('⚠️  [EMAIL] MAIL_USER or MAIL_PASSWORD not set — emails disabled');
    return;
  }
  try {
    await mailer.verify();
    console.log('✅ [EMAIL] SMTP connected — sending as ' + process.env.MAIL_USER);
  } catch(e) {
    console.error('❌ [EMAIL] SMTP failed: ' + e.message);
    console.error('   Fix: use Gmail App Password (myaccount.google.com/apppasswords), NOT your login password');
  }
}

// ── JWT helpers ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// FRAUD VELOCITY + ALERTING  (audit fixes #13, #14)
//
// Before this, nothing recorded WHO placed an order from WHERE, so
// multi-account abuse, COD refusal patterns and rapid-fire ordering
// were invisible. And payment failures left no durable trace at all —
// only Render's transient logs, which rotate.
//
// Deliberately conservative: these RECORD and FLAG, they do not block
// automatically. A false positive that silently blocks a real customer
// is worse than one that raises an alert for a human to look at.
// ═══════════════════════════════════════════════════════════════
function clientIpOf(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
}

async function recordVelocity(scope, value, event) {
  if (!value) return;
  try {
    await supabase.from('fraud_velocity').insert({
      scope, scope_value: String(value).toLowerCase().trim(), event,
    });
  } catch (e) { /* never let telemetry break an order */ }
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK IDEMPOTENCY
//
// Every handler here already guards its own effect — the payment path
// checks `payment_status !== 'Paid'`, the refund path updates a row keyed
// by the gateway's refund id. That covers a redelivered PAYMENT webhook,
// but it does not cover a redelivered SHIPPING or REFUND event, and it
// leaves no record that a delivery was ever seen. A provider that retries
// on a timeout (all three do) could re-run a status transition, and
// nothing would say so afterwards.
//
// This records each delivery against a unique (provider, event_id) index
// and reports whether it is the first sighting. The database decides, not
// a read-then-write: a duplicate loses the race on INSERT with 23505 and
// is acknowledged without re-running the effect.
//
// FAILS OPEN, deliberately. If the webhook_events table is absent (a
// database that predates 000_base_schema.sql) this returns true and the
// handler proceeds exactly as it did before. Refusing to process real
// payment notifications because a logging table is missing would be a
// far worse failure than processing one twice.
//
// Returns { first, duplicate }.
async function recordWebhookEvent({ provider, eventId, eventType, orderId, payload, signatureOk = true }) {
  // No usable event id from the provider means there is nothing stable to
  // deduplicate on. Say so rather than inventing a key (a hash of the body
  // would treat two genuinely distinct events with identical payloads as
  // duplicates and silently drop the second).
  if (!provider || !eventId) return { first: true, duplicate: false, unlogged: true };

  try {
    const { error } = await supabase.from('webhook_events').insert({
      provider,
      event_id:     String(eventId),
      event_type:   eventType || null,
      order_id:     orderId || null,
      signature_ok: !!signatureOk,
      payload:      payload || null,
      processed_at: new Date().toISOString(),
    });

    if (!error) return { first: true, duplicate: false };

    // 23505 = unique_violation on (provider, event_id): seen before.
    if (error.code === '23505') {
      console.log(`[webhook] duplicate ${provider} event ${eventId} — already processed, skipping`);
      return { first: false, duplicate: true };
    }

    // 42P01 = table absent. Anything else is unexpected but still must not
    // stop a real payment notification.
    if (error.code !== '42P01') {
      console.warn(`[webhook] could not log ${provider} event ${eventId}:`, error.message);
    }
    return { first: true, duplicate: false, unlogged: true };
  } catch (e) {
    console.warn('[webhook] event log failed:', e.message);
    return { first: true, duplicate: false, unlogged: true };
  }
}

async function raiseAlert({ severity = 'warn', category, title, detail, orderId }) {
  try {
    await supabase.from('system_alerts').insert({
      severity, category, title, detail: detail || null, order_id: orderId || null,
    });
  } catch (e) { console.warn('[alert] could not record:', e.message); }
}

// Returns { flagged, reasons[] } — checked at order time. Thresholds are
// intentionally loose so normal buying (a family sharing an IP, someone
// reordering) doesn't trip them.
async function checkVelocity({ email, ip }) {
  const reasons = [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    if (ip) {
      const { count: ipOrders } = await supabase.from('fraud_velocity')
        .select('id', { count: 'exact', head: true })
        .eq('scope', 'ip').eq('scope_value', String(ip).toLowerCase())
        .eq('event', 'order').gte('occurred_at', since);
      if ((ipOrders || 0) >= 10) reasons.push(`${ipOrders} orders from this IP in 24h`);

      // Distinct accounts ordering from one IP — the clearest multi-account signal.
      const { data: ipEmails } = await supabase.from('orders')
        .select('customer_email').eq('client_ip', ip)
        .gte('created_at', since).is('deleted_at', null);
      const distinct = new Set((ipEmails || []).map(o => (o.customer_email || '').toLowerCase()));
      if (distinct.size >= 4) reasons.push(`${distinct.size} different accounts from this IP in 24h`);
    }
    if (email) {
      const { count: emailOrders } = await supabase.from('fraud_velocity')
        .select('id', { count: 'exact', head: true })
        .eq('scope', 'email').eq('scope_value', String(email).toLowerCase())
        .eq('event', 'order').gte('occurred_at', since);
      if ((emailOrders || 0) >= 8) reasons.push(`${emailOrders} orders on this account in 24h`);

      // COD refusal history — the main COD-abuse signal.
      const { count: refused } = await supabase.from('fraud_velocity')
        .select('id', { count: 'exact', head: true })
        .eq('scope', 'email').eq('scope_value', String(email).toLowerCase())
        .eq('event', 'cod_refused');
      if ((refused || 0) >= 2) reasons.push(`${refused} previous COD refusals`);
    }
  } catch (e) { /* checking must never break checkout */ }
  return { flagged: reasons.length > 0, reasons };
}
// FIX (audit #8): a JWT was valid for its full 30 days with no way to
// invalidate it. If an admin token leaked, rotating ADMIN_PASSWORD did
// NOT revoke it — the attacker kept access for up to a month. Tokens
// now carry a `tv` (token version) claim checked against
// auth_token_versions on each request; bumping that row instantly
// invalidates every outstanding token for that identity.
// Cached briefly so this is ~1 query/minute, not 1 per request.
const _tvCache = new Map(); // identity -> { version, at }
const TV_TTL_MS = 60 * 1000;

async function getTokenVersion(identity) {
  const key = String(identity || '').toLowerCase();
  const hit = _tvCache.get(key);
  if (hit && (Date.now() - hit.at) < TV_TTL_MS) return hit.version;
  try {
    const { data } = await supabase.from('auth_token_versions')
      .select('version').eq('identity', key).maybeSingle();
    const v = data ? data.version : 1;
    _tvCache.set(key, { version: v, at: Date.now() });
    return v;
  } catch (e) {
    // Fail OPEN on a database blip rather than logging every user out —
    // revocation is a containment tool, not the primary auth gate.
    console.warn('[auth] token version lookup failed:', e.message);
    return hit ? hit.version : 1;
  }
}

async function bumpTokenVersion(identity, actor) {
  const key = String(identity || '').toLowerCase();
  const current = await getTokenVersion(key);
  await supabase.from('auth_token_versions').upsert({
    identity: key, version: current + 1,
    updated_at: new Date().toISOString(), updated_by: actor || null,
  }, { onConflict: 'identity' });
  _tvCache.delete(key);
  return current + 1;
}

// Admin and owner sessions are short-lived. A staff token used to last 30
// days, so a laptop left open in the office — or a token copied out of
// localStorage — stayed valid for a month. Customers keep the long session:
// the worst case there is someone seeing their own order history.
const ADMIN_SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS) || 1;

function signToken(payload) {
  const privileged = payload.role === 'admin' || payload.role === 'owner';
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: privileged ? `${ADMIN_SESSION_HOURS}h` : '30d',
  });
}
// Clock tolerance: the admin is in Georgia (UTC+4), the server runs in
// Render's region (UTC), and device clocks wobble. JWT exp/iat are UTC
// epoch seconds, so timezones alone can't invalidate a token — but a
// real clock skew CAN, and with zero tolerance a token minted seconds
// ago can be read as "already expired" (nbf) or a session end can be
// clipped by a 30-second device drift. Ten seconds of tolerance is
// ample for clock issues and tiny compared to the 1-hour session.
// Fresh-token grace: a token minted within this window whose version does
// not (yet) match the database is accepted rather than rejected — see the
// fail-open block in authMiddleware for why.
const FRESH_TOKEN_GRACE_MS = 5 * 60 * 1000;
const CLOCK_TOLERANCE_SEC = 10;
function verifyToken(token) {
  // ── Dual-secret verification (login-bounce fix) ────────────────────
  // The production bounce traced to Render's free-tier deploy overlap:
  // for a few minutes after every deploy, the OLD container still serves
  // while the NEW one starts — and if JWT_SECRET was ever edited in the
  // Render dashboard, the two containers hold DIFFERENT secrets. Any
  // request routed to the container whose secret doesn't match the token
  // is rejected as "invalid-signature", which is exactly the bounce the
  // owner reported ('✅ Logged in!' → 'Session expired'). The same shape
  // also appears for accidental secret edits and Render region rebalance.
  // Accepting a SECOND known-good secret makes every request survivable
  // across exactly one rotation. signToken() always uses JWT_SECRET, so
  // the fallback can only DECREASE rejection rate, never raise it. When a
  // fallback-secret token verifies, log it — it is a live signal that a
  // client (or a lingering container) still holds the previous secret and
  // should be re-logged-in; it also tells the owner when the fallback can
  // safely be cleared.
  const fb = process.env.JWT_SECRET_FALLBACK || '';
  try {
    // clockTolerance covers real clock skew between the device, the server
    // and the signing/verifying machine — ten seconds is enough for drift
    // and negligible against a 1-hour session.
    return jwt.verify(token, process.env.JWT_SECRET, {
      clockTolerance: CLOCK_TOLERANCE_SEC,
    });
  } catch (primary) {
    if (fb && fb.length > 20) {
      try {
        const p = jwt.verify(token, fb, { clockTolerance: CLOCK_TOLERANCE_SEC });
        console.warn('[auth] token verified with JWT_SECRET_FALLBACK (primary secret rejected) — token role=' + (p && p.role) + ' iat=' + (p && p.iat) + ' — re-login to pick up the current secret');
        return p;
      } catch { /* real invalid signature */ }
    }
    return null;
  }
}
async function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) {
    // A request with no token at all used to return a bare 'Unauthorised'
    // with no reason and no audit entry — and the panel's 401 handler
    // therefore showed the generic 'Session expired' that started the
    // whole chase. Record it (with reason 'no-token') so the audit trail
    // and the logout banner show what really happened: the panel held no
    // token to send, which on mobile is the empty-authToken edge case the
    // apiFetch retry chain already tries to heal.
    if (typeof _recordAuthFailure === 'function') _recordAuthFailure('no-token', req, null);
    return res.status(401).json({ error: 'Unauthorised', reason: 'no-token' });
  }
  const p = verifyToken(t);
  if (!p) {
    // Record the failure so the panel can tell a bad signature apart from a
    // token-version rejection — the two need completely different fixes
    // (Render JWT_SECRET vs a real revocation). Keep it non-blocking: the
    // alert fire-and-forgets and the client sees only a reason code.
    if (typeof _recordAuthFailure === 'function') _recordAuthFailure('invalid-signature', req, null);
    return res.status(401).json({ error: 'Invalid token', reason: 'invalid-signature' });
  }

  // FIX (audit #8): enforce token revocation. Only privileged roles are
  // checked — customer tokens are far lower value and this keeps the hot
  // path cheap. A token issued BEFORE versioning existed has no `tv`
  // claim; those are accepted once and simply age out, so deploying this
  // doesn't force every admin to re-login mid-session.
  if (p.role === 'admin' || p.role === 'owner') {
    if (p.tv !== undefined) {
      // FIX (audit OZ-03): this read getTokenVersion(p.role) — the version of
      // the row named 'admin' or 'owner'. But /api/admin/login stamps the token
      // with getTokenVersion(username), and /api/admin/staff/revoke bumps the
      // USERNAME's row. Three different rows, so:
      //
      //   • revoking a terminated staff member changed a row nobody read, and
      //     their token kept working — the containment tool did nothing;
      //   • conversely a named staff account (live: manustest1314 tv=2 vs the
      //     'admin' row tv=1) mismatched permanently, so it worked for the
      //     5-minute fresh-token grace and then 401'd on every request forever.
      //     Changing a staff password did the same, since that bumps the
      //     person's row too.
      //
      // It went unnoticed because the two built-in accounts are NAMED 'admin'
      // and 'owner', so for them the wrong lookup happened to hit the right row.
      // Keyed on the person now, exactly as login and revoke already are, with
      // the role kept as a fallback for legacy tokens minted before `username`
      // was a claim.
      const tvIdentity = String(p.username || p.email || p.role).toLowerCase();
      const current = await getTokenVersion(tvIdentity);
      if (p.tv !== current) {
        // ── self-heal a token-version race, not a revocation ─────────────
        // The bounce reported on mobile happens exactly here: a token minted
        // seconds ago is rejected as "revoked". The usual culprit is a stale
        // per-instance cache — this server keeps its own in-memory version
        // copy (60s TTL), so a second instance (a Render rebalance, a recent
        // deploy, or simply cold-start churn) can read a different number
        // than the instance that minted the token. Even a single instance
        // can drift: a transient DB blip during getTokenVersion's lookup
        // falls back to an old cached value and rejects whatever was freshly
        // minted against the real one. A real revocation is rare, deliberate
        // admin action — treat it as the last resort, not the first guess.
        //
        // So on a mismatch, re-read the database DIRECTLY (skip the cache),
        // resync the cache, and check once more. Only a second mismatch —
        // confirmed against the actual table — is a genuine revocation.
        let dbCurrent = null;
        try {
          const key = tvIdentity;
          const { data } = await supabase.from('auth_token_versions')
            .select('version').eq('identity', key).maybeSingle();
          dbCurrent = data ? data.version : 1;
        } catch (e) {
          // Cannot reach the truth right now — fail OPEN. A database blip
          // must not be the reason a freshly signed-in admin gets kicked
          // out. Revocation is containment, not the primary auth gate.
          console.warn('[auth] token version re-check failed:', e.message);
          dbCurrent = null;
        }
        // ── fail-open for a freshly minted token ───────────────────────
        // A token signed within the last FRESH_TOKEN_GRACE seconds whose
        // version doesn't match the database is almost never a deliberate
        // revocation — no owner action could have revoked a session that
        // is only seconds old. The realistic causes are a version bump
        // that landed in the DB between sign() and this very first
        // request, or a Render rebalance across two instances where one
        // minted and the other reads. The bounce reported at login
        // ('✅ Logged in!' followed straight away by 'server rejected
        // your session') is exactly this shape. Accept the token and
        // record it so the owner can still see it in the audit trail — a
        // real revocation stays fatal (it would be >5 min old by then).
        const tokenAgeMs = (p.iat ? p.iat * 1000 : 0) > 0 ? Date.now() - p.iat * 1000 : 0;
        const tokenFresh = tokenAgeMs > 0 && tokenAgeMs < FRESH_TOKEN_GRACE_MS;
        if (tokenFresh) {
          _tvCache.set(tvIdentity, { version: dbCurrent !== null ? dbCurrent : p.tv, at: Date.now() });
          console.warn('[auth] tv mismatch on FRESH token — accepting (age ' + Math.round(tokenAgeMs / 1000) + 's, tv=' + p.tv + ' vs cached ' + current + (dbCurrent !== null ? ', DB ' + dbCurrent : '') + '). Was this a real revocation? Check Settings → Audit Log.');
          try {
            supabase.from('system_alerts').insert({
              severity: 'info', category: 'security',
              title: 'Fresh-token version mismatch — accepted',
              detail: { role: p.role, tv: p.tv, cached: current, db: dbCurrent, age_sec: Math.round(tokenAgeMs / 1000), ts: new Date().toISOString() },
            }).then(() => {}).catch(() => {});
          } catch (e) { /* alerts must never block the auth path */ }
          req.user = p;
          return next();
        }
        if (dbCurrent !== null) {
          _tvCache.set(tvIdentity, { version: dbCurrent, at: Date.now() });
          if (p.tv === dbCurrent) {
            console.log('[auth] tv race self-healed: token tv=' + p.tv + ' DB=' + dbCurrent + ' (cached was ' + current + ')');
            req.user = p;                                    // must run before next(): a route's guard
            return next();                                   // reads req.user.role — skipping this sent every self-healed
          }                                                  // request to 'Admin only' 403 (bug found Aug 13)
        } else {
          console.log('[auth] tv re-check failed open: accepting token tv=' + p.tv + ' against cached ' + current);
          req.user = p;
          return next();   // DB blip — never kick out a signed-in admin
        }
        console.log('[auth] tv genuine mismatch, rejecting: token tv=' + p.tv + ' DB=' + dbCurrent);
        if (typeof _recordAuthFailure === 'function') _recordAuthFailure('token-version-mismatch', req, p);
        return res.status(401).json({ error: 'Session revoked — please sign in again.', reason: 'token-version-mismatch' });
      }
    }
  }

  // Normalise the identity ONCE, here, so no route has to remember to.
  //
  // Email is the join key for orders, returns, reviews and VitaPoints,
  // and it was arriving in whatever case the customer typed. signToken
  // puts `customer.email` in the claim — the stored row, not a
  // normalised value — and /api/auth/email-login finds that row with
  // .ilike(), so signing in as "Sister@Gmail.com" against a row stored
  // as "sister@gmail.com" succeeds and mints a mixed-case token.
  //
  // Downstream, some lookups used .eq() (exact, case-SENSITIVE) and
  // others .ilike(), so whether a customer could see their own orders
  // came down to which route they hit and how they typed their address
  // the day they registered. Two of the reported bugs are this:
  //   • reviews-routes.js gates on "have you bought this?" with
  //     .eq('customer_email', email) — no case match, no orders found,
  //     no purchase, 403 "You can only review products you have
  //     purchased" for someone who did.
  //   • POST /api/returns looks the order up with .eq() on id AND
  //     email — no case match, "Order not found", and the return cannot
  //     be submitted no matter how many times it is tried.
  //
  // Fixes it for every token from here on. Rows already written in
  // mixed case need 007_normalise_emails.sql as well.
  if (p && typeof p.email === 'string') p.email = p.email.toLowerCase().trim();

  req.user = p;
  next();
}
// Fire-and-forget recorder for every rejected privileged request. The panel
// reads the `reason` code back out of localStorage, and the audit trail
// (Settings → Audit Log / system alerts) shows which failure mode is
// actually happening — without this, '401' tells us nothing at all.
function _recordAuthFailure(reason, req, payload) {
  try {
    const role = (payload && payload.role) || (req.user && req.user.role) || null;
    const who  = (payload && (payload.username || payload.email)) || (req.user && (req.user.username || req.user.email)) || null;
    supabase.from('system_alerts').insert({
      severity: 'warn', category: 'security',
      title: 'Admin request rejected — ' + reason,
      detail: { reason, role, who: who ? String(who).slice(0, 60) : null,
                path: req.path || req.originalUrl || null, ip: req.headers['x-forwarded-for'] || req.ip || null,
                ts: new Date().toISOString() },
    }).then(() => {}).catch(() => {});
  } catch (e) { /* alerts must never block the auth path */ }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'owner') return res.status(403).json({ error: 'Admin only' });
  next();
}

// The admin panel is only ever meant to be opened from the storefront /
// admin domain configured in brand.config.js. CORS alone doesn't achieve this — it only stops a BROWSER page on
// another origin from reading the response, it does nothing to a direct
// curl/Postman/script request, and it does nothing to someone opening the
// admin panel from an old bookmark (a github.io URL, a retired domain)
// which still loads fine locally even after CORS blocks its API calls.
// This checks the actual Origin (falling back to Referer, since some
// same-site navigations omit Origin on GET) so the login endpoint itself
// refuses to hand out a token to anything not opened from a known origin.
// ADMIN_URL may be a dedicated hostname serving the same admin.html under a
// name that is not the storefront; it is included in both this set and the
// CORS list, or the login endpoint would refuse the token and the panel
// would fail with "can only be used from ...".
const ADMIN_ALLOWED_ORIGINS = BRAND.adminOrigins;
function adminOriginOnly(req, res, next) {
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || req.headers.referrer || '';
  const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(origin || referer);
  if (isLocalDev) return next();
  const refOrigin = (() => { try { return new URL(referer).origin; } catch { return ''; } })();
  if (ADMIN_ALLOWED_ORIGINS.has(origin) || ADMIN_ALLOWED_ORIGINS.has(refOrigin)) return next();
  return res.status(403).json({ error: `The admin panel can only be used from ${BRAND.adminUrl}.` });
}

// ═══════════════════════════════════════════════════════════════
// ROLE PERMISSIONS  (v9.3)
// ═══════════════════════════════════════════════════════════════
// `admin` used to mean "everything except the AI Agent Team" — an employee
// could delete orders, issue refunds, rewrite prices, create coupons and
// change store settings. The split below treats admin as a staff account
// that runs day-to-day operations, and owner as the only role that can move
// money, destroy records, or change how the business is configured.
//
// One list, used by both the API guards and the admin UI, so the buttons a
// person can see always match what the server will actually allow.
const PERMISSIONS = {
  // ── operations: both roles ──
  'orders.view':        ['admin', 'owner'],
  'orders.fulfil':      ['admin', 'owner'],   // status, tracking, dispatch
  'products.view':      ['admin', 'owner'],
  'products.stock':     ['admin', 'owner'],   // stock level only
  'customers.view':     ['admin', 'owner'],
  'alerts.view':        ['admin', 'owner'],
  'alerts.resolve':     ['admin', 'owner'],
  'stats.operational':  ['admin', 'owner'],   // order counts, fulfilment
  'analytics.view':     ['admin', 'owner'],
  'media.manage':       ['admin', 'owner'],
  'returns.process':    ['admin', 'owner'],
  'reviews.moderate':   ['admin', 'owner'],

  // ── money and destruction: owner only ──
  'orders.edit_money':  ['owner'],   // total, payment_status
  'orders.delete':      ['owner'],
  'orders.refund':      ['owner'],
  'products.create':    ['owner'],
  'products.pricing':   ['owner'],   // price, sale_price, tiers
  'products.delete':    ['owner'],
  'customers.delete':   ['owner'],
  'coupons.manage':     ['owner'],   // a coupon is a discount, i.e. money
  'settings.manage':    ['owner'],
  'stats.revenue':      ['owner'],
  'fraud.view':         ['owner'],   // sensitive customer data
  'audit.view':         ['owner'],
  'marketing.manage':   ['owner'],   // ad spend
  'whatsapp.send':      ['owner'],
  'system.maintenance': ['owner'],   // product sync, test email
  'ai.agents':          ['owner'],
  'tokens.revoke':      ['owner'],
};

function can(role, perm) {
  const allowed = PERMISSIONS[perm];
  return Array.isArray(allowed) && allowed.includes(role);
}

// Aug 2026: a staff person can carry a custom permission set chosen by the
// owner, stored on their `auth_identities` row (null = the role's full
// list). The check reads the LIVE row — an owner tightening a permission
// lands on the very next request, never on re-login.
// The owner role keeps an untouchable ceiling: even a custom set that
// grants 'orders.refund' to an admin cannot pass unless owner-only perms
// are involved — those always check the ROLE too.
async function resolveIdentity(username) {
  if (!username) return null;
  try {
    const { data } = await supabase.from('auth_identities')
      .select('*').ilike('username', String(username)).maybeSingle();
    return data || null;
  } catch (e) { return null; }
}
async function canPerson(identity, perm) {
  if (!identity) return false;
  if (identity.role === 'owner' && PERMISSIONS[perm]?.includes('owner')) return true;
  const custom = normalizePerms(identity.permissions);
  if (custom) {
    // FIX (audit OZ-07): this was `return custom.includes(perm)`, which made the
    // custom list the WHOLE decision and skipped the role entirely. The comment
    // on resolveIdentity states the intended rule — "even a custom set that
    // grants orders.refund to an admin cannot pass … those always check the ROLE
    // too" — but the code did not implement it, so an admin-role staff row
    // listing orders.refund / settings.manage / coupons.manage would have been
    // granted them.
    //
    // A custom set can only ever NARROW what the role already allows. It is an
    // allow-list applied on top of the role's ceiling, never a way through it.
    return custom.includes(perm) && can(identity.role, perm);
  }
  return can(identity.role, perm);
}
// Permission sets live in a jsonb column. New rows are written as a native
// array (parsed by supabase-js on read); older rows may carry a
// JSON-encoded string literal instead. Both shapes normalize to an array
// of permission names here so no reader has to know the stored shape.
function normalizePerms(v) {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : null;
    } catch (e) { return null; }
  }
  return null;
}

// Route guard. Use instead of a bare adminOnly wherever the action is not
// something a staff member should be able to do on their own.
function requirePerm(perm) {
  return function (req, res, next) {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'owner') {
      return res.status(403).json({ error: 'Admin only' });
    }
    // Fast path for the two built-in accounts whose permissions never vary.
    if ((req.user.username || req.user.email || '') === 'owner') return next();
    if ((req.user.username || req.user.email || '') === 'admin') {
      if (!can('admin', perm)) {
        return res.status(403).json({
          error: 'Your account does not have permission for this action.',
          required: perm, role, hint: 'Ask the owner to perform this, or sign in as owner.',
        });
      }
      return next();
    }
    // Anyone else: live row, live decision.
    resolveIdentity(req.user.username || req.user.email).then(async id => {
      if (!id) return res.status(403).json({ error: 'Admin only' });
      if (id.role === 'owner' && PERMISSIONS[perm]?.includes('owner')) return next();
      const ok = await canPerson(id, perm);
      if (!ok) {
        return res.status(403).json({
          error: 'Your account does not have permission for this action.',
          required: perm, role: id.role,
          hint: 'Ask the owner to grant you this permission.',
        });
      }
      next();
    }).catch(() => res.status(500).json({ error: 'Permission check failed' }));
  };
}

// ═══════════════════════════════════════════════════════════════
// PASSWORD-GATED CRITICAL ACTIONS  (dual security, Aug 2026)
//
// Owner requested: critical changes must require a SEPARATE transaction
// ("save") password, never the login password. Render env var SAVE_PASSWORD
// carries it; when set, /api/admin/confirm-password only accepts that value.
// Every destructive or money-moving endpoint below inserts this middleware
// between the permission guard and the handler.
// ═══════════════════════════════════════════════════════════════
function passwordGated(req, res, next) {
  const proof = String(req.headers['x-password-proof'] || '').trim();
  if (!proof) return res.status(401).json({ error: 'Password re-confirmation required — enter the save password, then try again' });
  if (typeof global.__verifyPasswordProof === 'function') {
    return global.__verifyPasswordProof(proof, req, res, next);
  }
  return res.status(500).json({ error: 'Password gate unavailable — restart the panel' });
}

// Strips fields the role isn't allowed to change, rather than rejecting the
// whole request — an admin saving a product form that happens to include a
// price field should still get their stock update saved, with the price left
// exactly as it was.
function stripForbiddenFields(role, body, fieldPerms) {
  const removed = [];
  for (const [field, perm] of Object.entries(fieldPerms)) {
    if (body[field] !== undefined && !can(role, perm)) {
      delete body[field];
      removed.push(field);
    }
  }
  return removed;
}

const PRODUCT_FIELD_PERMS = {
  price: 'products.pricing', sale_price: 'products.pricing', mrp: 'products.pricing',
  tiers: 'products.pricing', tier_prices: 'products.pricing', cost_price: 'products.pricing',
};
const ORDER_FIELD_PERMS = {
  total: 'orders.edit_money', subtotal: 'orders.edit_money', discount: 'orders.edit_money',
  shipping: 'orders.edit_money', payment_status: 'orders.edit_money',
  vita_points_redeemed: 'orders.edit_money', vita_points_earned: 'orders.edit_money',
};
// Strict owner gate — admins are explicitly rejected, not just "not included".
// Every /api/owner/ai/* route below uses this, so the AI Agent Team is
// unreachable for the admin role even if someone calls the API directly.
function ownerOnly(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Owner access only' });
  next();
}

// ═══════════════════════════════════════════════════════════════
// STORED PROCEDURES (atomic operations on Supabase)
// ═══════════════════════════════════════════════════════════════

// Recalculates an order's total straight from the products table — never
// trust price/qty/discount numbers sent by the client. Used by every order
// path (COD, GoKwik create, GoKwik confirm) so a tampered request body can't
// change what a customer actually pays.
// Returns { total, subtotal, discount, shippingFee, vitaDiscount } — throws
// if an item id isn't a real, active product (blocks a client from
// inventing fake items).
//
// vitaRupees (added): the rupee value of VitaPoints being redeemed on this
// order, resolved server-side by resolveVitaDiscount() below — NOT the
// client's number. Before this, the checkout UI showed a VitaPoints
// discount (vitaOff) that this function never knew existed, so the order
// total it computed (and the amount actually charged/recorded) was always
// the PRE-discount figure — the exact "amount paid vs amount in my order
// list" mismatch that was reported.
// ⚠️ SHIPPING POLICY — MUST MATCH THE STOREFRONT EXACTLY.
// index.html has SHIP_FEE / SHIP_THRESHOLD driving calcShipping(); these
// two defaults are the server-side mirror of that. If they ever disagree,
// the customer sees one total at checkout and is charged another — the
// "amount before order vs after confirmation" mismatch.
// Current policy: ₹79 below ₹599 and free at/above ₹599. Keep these
// defaults in lock-step with the storefront and policy page.
// ═══════════════════════════════════════════════════════════════
// MIX & MATCH — buy 3, get the fourth lowest-priced eligible item free
// ═══════════════════════════════════════════════════════════════
// Every 4 eligible UNITS form a group and the cheapest unit in that group
// is free. Units, not lines: 4x of one product qualifies exactly as 4
// different products do, otherwise the rule is trivially gamed either way.
//
// MIX_MATCH_ELIGIBLE_IDS (comma-separated) restricts the promotion; empty
// means every active product qualifies. MIX_MATCH_MAX_GROUPS caps how many
// times it can repeat in one cart — 0 means unlimited.
const MIX_MATCH_ENABLED = String(process.env.MIX_MATCH_ENABLED ?? 'true') !== 'false';
const MIX_MATCH_GROUP_SIZE = 4;
const MIX_MATCH_ELIGIBLE_IDS = String(process.env.MIX_MATCH_ELIGIBLE_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
const MIX_MATCH_MAX_GROUPS = Number(process.env.MIX_MATCH_MAX_GROUPS || 0);

// Discount guardrails are stored in the owner-controlled settings table so the
// business can change (for example) Glutathione/ACV from 50% to 40% without a
// code deployment. The safe defaults remain enforced if settings are missing.
const DEFAULT_DISCOUNT_CEILINGS = Object.freeze({ glutathione_acv: 50, standard: 45 });
let _discountCeilingCache = { expiresAt: 0, values: DEFAULT_DISCOUNT_CEILINGS };
function _safeCeiling(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(50, Math.max(0, Math.round(n * 100) / 100)) : fallback;
}
async function getDiscountCeilings() {
  if (_discountCeilingCache.expiresAt > Date.now()) return _discountCeilingCache.values;
  try {
    const { data, error } = await supabase.from('settings').select('key,value')
      .in('key', ['discount_ceiling_glutathione_acv', 'discount_ceiling_standard']);
    if (error) throw error;
    const found = {};
    for (const row of (data || [])) found[row.key] = row.value;
    const values = {
      glutathione_acv: _safeCeiling(found.discount_ceiling_glutathione_acv, DEFAULT_DISCOUNT_CEILINGS.glutathione_acv),
      standard: _safeCeiling(found.discount_ceiling_standard, DEFAULT_DISCOUNT_CEILINGS.standard),
    };
    _discountCeilingCache = { expiresAt: Date.now() + 30_000, values };
    return values;
  } catch (e) {
    console.warn('[pricing] discount ceiling settings unavailable; using safe defaults:', e.message);
    return DEFAULT_DISCOUNT_CEILINGS;
  }
}
function _ceilingForProduct(prod, ceilings) {
  const text = `${prod?.name || ''} ${prod?.slug || ''} ${prod?.seo_slug || ''}`.toLowerCase();
  return /glutathione|apple cider|acv/.test(text) ? ceilings.glutathione_acv : ceilings.standard;
}
function _pricingCeilingError(lines) {
  const err = new Error(`The selected discount exceeds the maximum allowed for ${lines.map(x => `${x.name} (${x.ceiling}%)`).join(', ')}. Remove a discount or change the pack before trying again.`);
  err.statusCode = 422;
  err.code = 'DISCOUNT_CEILING_EXCEEDED';
  err.details = lines;
  return err;
}

function mixMatchEligible(prod) {
  if (!prod || prod.active === false) return false;
  return MIX_MATCH_ELIGIBLE_IDS.length ? MIX_MATCH_ELIGIBLE_IDS.includes(prod.id) : true;
}

/**
 * @returns {{discount:number, freeItems:Array, progress:{have:number,need:number}}}
 * Prices come from `prodById` (product rows), never from the cart line, so a
 * client cannot name the price of the item it wants free.
 */

// ── CUSTOM PACK PRICING ─────────────────────────────────────────
// Customers can create their own month pack (N x 15 tablets). The
// per-month discount is interpolated linearly between the two defined
// tiers that bracket the requested month count (floored to the lower
// tier's rate when below the first tier is impossible — 1 month is
// always the first tier). Never trusts a client-supplied rate: only
// the product row's curve decides the price.
function _customPackRate(tiers, months) {
  if (!Array.isArray(tiers) || !tiers.length) return null;
  const rows = Array.isArray(tiers) ? tiers.map((y) => ({ tabs: Number(y.tabs), rate: Number(y.rate), mrp: Number(y.mrp), disc: Number(y.discountPct) || 0 })).filter((y) => Number.isFinite(y.tabs) && y.tabs > 0 && Number.isFinite(y.rate) && y.rate > 0) : null;
  if (!rows || !rows.length) return null;
  rows.sort((a, b) => a.tabs - b.tabs);
  const m = Number(months);
  if (!Number.isFinite(m) || m < 1 || m > 12) return null;
  const wantTabs = m * 15;
  const base = rows[0];
  if (wantTabs <= base.tabs) return null;          // covered by a real tier — caller must use it
  if (wantTabs > rows[rows.length - 1].tabs) return null; // above catalog range
  let lo = rows[0], hi = rows[rows.length - 1];
  for (let k = 0; k < rows.length - 1; k++) {
    if (rows[k].tabs <= wantTabs && wantTabs <= rows[k + 1].tabs) { lo = rows[k]; hi = rows[k + 1]; break; }
  }
  if (lo.tabs === hi.tabs) return null;
  const f = (wantTabs - lo.tabs) / (hi.tabs - lo.tabs);
  const disc = lo.disc + (hi.disc - lo.disc) * f;       // linear discount blend, floored later
  // MRP for the custom pack: scale the per-15-tabs MRP from the first tier
  const unitMrp = rows[0].mrp / rows[0].tabs;
  const packMrp = Math.round(unitMrp * wantTabs * 100) / 100;
  const packRate = Math.round(packMrp * (1 - Math.floor(disc) / 100) * 100) / 100;
  return { tabs: wantTabs, rate: packRate, mrp: packMrp, discountPct: Math.floor(disc) };
}
function mixAndMatchDiscount(items, prodById) {
  const none = { discount: 0, freeItems: [], progress: { have: 0, need: MIX_MATCH_GROUP_SIZE } };
  if (!MIX_MATCH_ENABLED) return none;

  // Expand every line into individual units carrying their effective unit
  // price — a tier line of 4 packs at ₹1,300 is 4 units of ₹325, so pack
  // pricing and this promotion cannot be stacked into a double discount.
  const units = [];
  for (const item of (items || [])) {
    const prod = prodById.get(item && item.id);
    if (!mixMatchEligible(prod)) continue;

    const qtyRaw = Number(item.qty != null ? item.qty : item.units);
    const qty = Number.isFinite(qtyRaw) ? Math.trunc(qtyRaw) : 1;
    if (qty < 1) continue;

    // MIX & MATCH ALWAYS prices at the REAL (full) unit price —
    // pack-tier discounts are a separate promotion and stack with
    // this one, so the free unit must be valued at what it truly
    // costs the customer before any pack discount. For a pack of N
    // months, the real unit price is prod.price x months.
    let unitPrice = null;
    if (item.tierTabs != null || item.tierIdx != null) {
      let months = null;
      let tiers = prod.tiers;
      if (typeof tiers === 'string') { try { tiers = JSON.parse(tiers); } catch (e) { tiers = null; } }
      if (Array.isArray(tiers) && tiers.length) {
        let t = null;
        if (item.tierTabs != null) { t = tiers.find(x => Number(x.tabs) === Number(item.tierTabs)); months = t ? Number(item.tierTabs) / 15 : null; }
        if (!t && item.tierIdx != null) { t = tiers[Number(item.tierIdx)]; months = t ? t.tabs / 15 : null; }
        if (!t) {
          // Custom month pack: price from the real price x pack months
          // (M&M values the free unit at what the customer pays with no
          // pack discount) — identical rule to the standard tiers.
          const _mTabs = Number(item.tierTabs);
          const _mMonths = _mTabs / 15;
          if (Number.isFinite(_mMonths) && _mMonths > 0 && _mTabs % 15 === 0) months = _mMonths;
          else continue;
        }
      }
      if (months && months > 0) unitPrice = parseFloat(prod.price || 0) * months;
      if (!(unitPrice > 0) || !Number.isFinite(unitPrice)) continue;
    }
    if (unitPrice === null) unitPrice = parseFloat(prod.price || 0);
    if (!(unitPrice > 0) || !Number.isFinite(unitPrice)) continue;

    for (let n = 0; n < qty; n++) units.push({ id: prod.id, price: unitPrice });
  }

  const have = units.length;
  let groups = Math.floor(have / MIX_MATCH_GROUP_SIZE);
  if (MIX_MATCH_MAX_GROUPS > 0) groups = Math.min(groups, MIX_MATCH_MAX_GROUPS);
  if (groups < 1) {
    return { discount: 0, freeItems: [],
             progress: { have, need: MIX_MATCH_GROUP_SIZE - (have % MIX_MATCH_GROUP_SIZE) } };
  }

  // Ascending, then free index 0, 4, 8… — the cheapest unit of each
  // consecutive group. With exactly 4 in the cart that is simply the
  // cheapest of the four, which is what the customer is promised.
  units.sort((a, b) => a.price - b.price);
  const freeItems = [];
  let discount = 0;
  for (let g = 0; g < groups; g++) {
    const u = units[g * MIX_MATCH_GROUP_SIZE];
    if (!u) break;
    freeItems.push({ id: u.id, price: u.price });
    discount += u.price;
  }

  return {
    discount: Math.round(discount * 100) / 100,
    freeItems,
    progress: { have, need: 0 },
  };
}

async function computeServerSideTotal(items, couponCode, { shippingThreshold = 599, shippingFee = 79, vitaRupees = 0, customerEmail = null } = {}) {
  items = typeof items === 'string' ? JSON.parse(items || '[]') : (items || []);

  // Every cart line used to cost a separate SELECT, awaited one after
  // the other. The prices all come out of the same table with the same
  // filter, so it is one query — and this runs on the critical path of
  // every checkout, twice over (once to price the cart, again inside
  // sp_place_order), on a Render instance a network hop from Supabase.
  // Fetched up front, then the loop below is pure arithmetic.
  const cartIds = [...new Set(items.map(i => i && i.id).filter(id => id != null))];
  const prodById = new Map();
  if (cartIds.length) {
    const { data: rows } = await supabase.from('products')
      .select('id,name,mrp,sale_price,price,active,has_tiers,tiers')
      .in('id', cartIds).is('deleted_at', null);
    for (const r of (rows || [])) prodById.set(r.id, r);
  }

  let subtotal = 0;
  const pricedLines = [];
  for (const item of items) {
    if (!item.id) throw new Error('Cart item missing product id');
    // A missing row means deleted or soft-deleted — the same "not
    // available" the single-row lookup produced when .single() found
    // nothing, and refused the same way.
    const prod = prodById.get(item.id);
    if (!prod || prod.active === false) throw new Error(`Product ${item.id} is not available`);

    // SECURITY: qty was passed through unvalidated. A line with a NEGATIVE
    // qty produced a negative subtotal that cancelled out the rest of the
    // cart — [{id:3,qty:1,tierTabs:60},{id:8,qty:-1000}] came to ₹60 for a
    // ₹1,219 bundle. Quantities must be positive whole numbers.
    const qtyRaw = Number(item.qty != null ? item.qty : item.units);
    const qty = Number.isFinite(qtyRaw) ? Math.trunc(qtyRaw) : 1;
    if (qty < 1) throw new Error('Invalid quantity for product ' + item.id);
    // The cap was 100 per line, which is far too generous for a retail
    // supplement store and let a real order through at 97 units:
    // AVC-79174591 — 97 x Glutathione @ ₹1,300 = ₹127,609, placed on COD,
    // which also minted 127,609 VitaPoints (₹851 of redeemable value, 95%
    // of the entire outstanding points balance). Configurable so a genuine
    // bulk buyer can still be served by raising the env var.
    if (qty > MAX_QTY_PER_LINE) {
      throw new Error(`Quantity too large for product ${item.id} (max ${MAX_QTY_PER_LINE} per line). Contact us for bulk orders.`);
    }

    // ── TIER / MULTI-PACK PRICING ────────────────────────────────
    // The storefront sells packs (15/30/45/60 tabs) at a bundle rate and
    // puts that rate on the cart line as `tierRate`. This function used to
    // ignore it completely and price every line at sale_price x qty, so a
    // 60-tab bundle sold at ₹1,219 was recomputed as one unit of the
    // 15-tab price. The tier rate is now resolved from the PRODUCT ROW,
    // never from the cart line, so the client still cannot name its price.
    let lineTotal = null;
    if (item.tierTabs != null || item.tierIdx != null) {
      let tiers = prod.tiers;
      if (typeof tiers === 'string') { try { tiers = JSON.parse(tiers); } catch (e) { tiers = null; } }
      if (Array.isArray(tiers) && tiers.length) {
        let t = null;
        if (item.tierTabs != null) t = tiers.find(x => Number(x.tabs) === Number(item.tierTabs));
        if (!t && item.tierIdx != null) t = tiers[Number(item.tierIdx)];
        if (t && t.rate != null) lineTotal = parseFloat(t.rate) * qty;
        // Custom month pack: tabs is a multiple of 15 inside the catalog
        // range but not an exact defined tier — price it from the
        // product's own discount curve (linear between brackets).
        if (lineTotal === null && item.tierTabs != null) {
          const _tTabs = Number(item.tierTabs);
          const _tMonths = _tTabs / 15;
          if (_tTabs % 15 === 0 && Number.isFinite(_tMonths) && _tMonths >= 2 && _tMonths <= 12) {
            const _cp = _customPackRate(tiers, _tMonths);
            if (_cp) lineTotal = parseFloat(_cp.rate) * qty;
          }
        }
      }
      if (lineTotal === null) {
        // A tier was claimed that the product does not define — refuse
        // rather than silently falling back to a cheaper unit price.
        throw new Error(`Invalid pack option for product ${item.id}`);
      }
    }
    if (lineTotal === null) {
      lineTotal = parseFloat(prod.sale_price || prod.price || 0) * qty;
    }
    // The customer-facing discount ceiling is measured from the product's
    // authoritative MRP/real price to the final charged line value. This
    // includes tier pricing; coupon, Mix & Match and VitaPoints are checked
    // after their rupee values are known below.
    let baseLineTotal = parseFloat(prod.price || prod.mrp || prod.sale_price || 0) * qty;
    if ((item.tierTabs != null || item.tierIdx != null) && baseLineTotal > 0) {
      let tiersForBase = prod.tiers;
      if (typeof tiersForBase === 'string') { try { tiersForBase = JSON.parse(tiersForBase); } catch (e) { tiersForBase = null; } }
      let monthsForBase = null;
      if (Array.isArray(tiersForBase)) {
        let tb = item.tierTabs != null ? tiersForBase.find(x => Number(x.tabs) === Number(item.tierTabs)) : null;
        if (!tb && item.tierIdx != null) tb = tiersForBase[Number(item.tierIdx)];
        if (tb) monthsForBase = Number(tb.tabs) / 15;
        if (!tb && item.tierTabs != null) monthsForBase = Number(item.tierTabs) / 15;
      }
      if (Number.isFinite(monthsForBase) && monthsForBase > 0) baseLineTotal = parseFloat(prod.price || prod.mrp || prod.sale_price || 0) * monthsForBase * qty;
    }
    pricedLines.push({ id: prod.id, name: prod.name || `Product ${prod.id}`, base: baseLineTotal, charged: lineTotal, ceiling: 0 });
    subtotal += lineTotal;
  }

  // ── MIX & MATCH: buy 3, get the lowest-priced one free ─────────
  // The storefront's bundle builder has been SHOWING a discount and not
  // charging it — updateBundleSummary() printed "You're saving ₹297" and
  // addBundleToCart() added every product at full price. This is where the
  // discount becomes real, because this function is what actually sets the
  // price. Computed from product rows, never from anything the cart claims.
  const mixMatch = mixAndMatchDiscount(items, prodById);
  const mmDiscount = mixMatch.discount;

  // ── COUPON: enforce EVERY rule, not just `active` ──────────────
  // /api/coupons/validate checked expiry, min_order and max_uses, but this
  // function (the one that actually sets the price) checked neither — so an
  // expired or exhausted code was rejected in the UI and honoured at
  // checkout. Both paths now apply identical rules.
  let discount = 0, couponApplied = null;
  // Mix & Match is a standalone offer: when a free item applies, every
  // coupon/additional percentage code is ignored rather than stacked.
  if (couponCode && mmDiscount <= 0) {
    const { data: coupon } = await supabase.from('coupons')
      .select('*').eq('code', String(couponCode).trim().toUpperCase()).maybeSingle();
    let valid = coupon
      && coupon.active
      && !coupon.deleted_at
      && (!coupon.expires_at || new Date(coupon.expires_at) >= new Date())
      && (!coupon.min_order  || subtotal >= coupon.min_order)
      && (!coupon.max_uses   || (coupon.used_count || 0) < coupon.max_uses)
      && (coupon.type !== 'percent' || (Number(coupon.value) > 0 && Number(coupon.value) <= 100));

    // AUDIT FIX: max_uses_per_customer was schema-less and unenforced —
    // any customer could reuse a "first order only" / limited coupon as
    // many times as they liked, bounded only by the store-wide cap.
    // Checked against real order history, never a client-supplied count.
    if (valid && coupon.max_uses_per_customer && customerEmail) {
      const { count } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_email', String(customerEmail).toLowerCase().trim())
        .eq('coupon_code', String(couponCode).trim().toUpperCase())
        .is('deleted_at', null);
      if ((count || 0) >= coupon.max_uses_per_customer) valid = false;
    }

    if (valid) {
      discount = coupon.type === 'percent'
        ? Math.round(subtotal * coupon.value / 100)
        : Math.min(coupon.value, subtotal);
      // AUDIT FIX: percent coupons had no absolute ceiling — a 50%+
      // coupon on a large cart could discount without limit.
      if (coupon.max_discount != null) discount = Math.min(discount, Number(coupon.max_discount));
      couponApplied = coupon.code;
    }
  }
  if (!(subtotal > 0) || !Number.isFinite(subtotal)) throw new Error('Invalid cart total');
  // Mix & Match cannot take the cart below zero. Its free item is applied
  // before the shipping threshold and before VitaPoints.
  const mmApplied = Math.max(0, Math.min(mmDiscount, subtotal));
  const afterDiscount = Math.max(0, subtotal - mmApplied - discount);
  const fee = afterDiscount >= shippingThreshold ? 0 : shippingFee;
  const payable = afterDiscount + fee;
  const vitaOff = Math.max(0, Math.min(Number(vitaRupees) || 0, payable));

  // Reject a checkout that exceeds the configured ceiling. Do not silently
  // clamp: the customer must see the same price that the server will accept.
  const ceilings = await getDiscountCeilings();
  const ceilingViolations = [];
  for (const line of pricedLines) {
    const ceiling = _ceilingForProduct(prodById.get(line.id), ceilings);
    line.ceiling = ceiling;
    const totalReduction = Math.max(0, line.base - line.charged);
    const proportionalMix = subtotal > 0 ? (mmApplied * Math.min(line.charged, subtotal) / subtotal) : 0;
    const proportionalCoupon = subtotal > 0 ? (discount * Math.min(line.charged, subtotal) / subtotal) : 0;
    const proportionalVita = payable > 0 ? (vitaOff * Math.min(line.charged, payable) / payable) : 0;
    const effectiveCharged = Math.max(0, line.charged - proportionalMix - proportionalCoupon - proportionalVita);
    const effectiveReduction = Math.max(0, line.base - effectiveCharged);
    const pct = line.base > 0 ? (effectiveReduction / line.base) * 100 : 0;
    if (pct > ceiling + 0.0001) ceilingViolations.push({ name: line.name, ceiling, actual: Math.round(pct * 100) / 100 });
  }
  if (ceilingViolations.length) throw _pricingCeilingError(ceilingViolations);

  return {
    subtotal, discount, couponApplied,
    mixMatchDiscount: mmApplied,
    mixMatchFreeItems: mixMatch.freeItems,
    mixMatchProgress: mixMatch.progress,
    pricingLines: pricedLines,
    shippingFee: fee, vitaDiscount: vitaOff,
    total: Math.max(0, payable - vitaOff),
  };
}

// Every promotion that reduces `total` must also appear in `discount`, or
// the row does not foot and the invoice computes GST on an overstated
// taxable value. All three order paths assemble that breakdown by hand and
// have drifted separately before — VitaPoints went missing from `discount`
// in all three, then Mix & Match did the same, and order AVC-28291460
// reached the database with a ₹399 gap. Only /api/confirm-cod-order
// checked its own arithmetic, which is exactly why the gap got through the
// other two. One assertion, called by all three.
function assertOrderFoots(o, label) {
  const foot = Number(((o.subtotal || 0) - (o.discount || 0) + (o.shipping || 0)).toFixed(2));
  if (Math.abs(foot - Number(o.total)) > 0.05) {
    throw new Error(
      `Order breakdown does not reconcile (${label}): ` +
      `${o.subtotal} - ${o.discount} + ${o.shipping} = ${foot}, but total is ${o.total}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// VITAPOINTS v2 — checkout redemption
//
// Resolves how many rupees to take off for points requested at checkout,
// verified against the customer's REAL server-side balance — never the
// client's word for it.
//   commit=false — preview only (opening a payment link). Payment isn't
//     final, so nothing is debited; the figure is clamped and priced.
//   commit=true  — reserve then commit inside the engine. vita_reserve
//     LOCKS the account row before reading the balance, which is what
//     stops two checkout tabs both spending the same points; the commit
//     is idempotent per order id, so a retried confirm can't double-debit.
//
// Signature unchanged from v1 so every existing call site still works.
// ═══════════════════════════════════════════════════════════════
async function resolveVitaDiscount({ email, pointsRequested, orderId, commit }) {
  const pts = Math.trunc(Number(pointsRequested) || 0);
  const user = String(email || '').toLowerCase().trim();
  if (!user || pts <= 0) return { points: 0, rupees: 0 };

  const RATE = 150; // 150 points = ₹1 (vita_config.points_per_rupee_redeem)

  if (!commit) {
    // Preview: read the authoritative balance and clamp. No mutation.
    try {
      const { data } = await supabase.from('vita_accounts')
        .select('available').eq('user_id', user).maybeSingle();
      const available = (data && data.available) || 0;
      const clamped = Math.max(0, Math.min(pts, 5000, available));
      return { points: clamped, rupees: clamped / RATE };
    } catch (e) {
      console.warn('[vita] preview lookup failed:', e.message);
      return { points: 0, rupees: 0 };
    }
  }

  try {
    const { data: rData, error: rErr } = await supabase.rpc('vita_reserve', {
      p_user: user, p_order: orderId, p_points: pts,
    });
    if (rErr) throw rErr;
    const r = (Array.isArray(rData) ? rData[0] : rData) || {};
    if (!r.ok || !(r.reserved > 0)) return { points: 0, rupees: 0 };

    const { data: cData, error: cErr } = await supabase.rpc('vita_commit_redemption', {
      p_order: orderId,
    });
    if (cErr) {
      // Couldn't finalise — hand the points straight back rather than
      // leaving them stuck in `locked`.
      try {
        await supabase.rpc('vita_release_redemption', {
          p_order: orderId, p_reason: 'commit failed',
        });
      } catch (e) { console.warn('[vita] redemption release failed:', e.message); }
      throw cErr;
    }
    const c = (Array.isArray(cData) ? cData[0] : cData) || {};
    // A duplicate confirm returns 0 committed but the reservation was
    // already spent on the first call — bill the reserved amount either way.
    const redeemed = (c.points && c.points > 0) ? c.points : r.reserved;
    return { points: redeemed, rupees: redeemed / RATE };
  } catch (e) {
    console.warn('[vita] redeem failed, proceeding with 0 discount:', e.message);
    return { points: 0, rupees: 0 };
  }
}

// Reverses earned points in proportion to money handed back.
//
// Every other exit from an order already did this — a return reverses on
// approval, an RTO and a cancellation reverse from the status hook — but
// the two refund routes recorded the money and left the points alone. A
// customer refunded ₹1,289 kept the ~1,289 points that order earned, and
// could spend them. REFUND_REVERSAL has been a label in the ledger's
// LABEL map since v2 with nothing on the server ever producing it.
//
// `returnId` is the guard against double-reversing: a refund raised
// against an approved return is settling a return that already reversed
// its own points under the key 'return:<id>'. Only a standalone refund
// reverses here.
async function reverseVitaForRefund({ orderId, refundAmount, orderTotal, returnId, refundRef, actor }) {
  if (returnId) return { skipped: 'attached to a return that already reversed' };
  const amount = Number(refundAmount) || 0;
  if (!(amount > 0)) return { skipped: 'no amount' };
  try {
    // Full refund reverses everything; a partial one reverses pro rata.
    // null is the "reverse in full" signal, same as the returns route uses.
    const total = Number(orderTotal) || 0;
    const partial = total > 0 && amount + 1 < total ? amount : null;
    const { data, error } = await supabase.rpc('vita_reverse_order', {
      p_order: orderId,
      p_returned_value: partial,
      p_reason: `refund ₹${amount}` + (actor ? ` (by ${actor})` : ''),
      p_type: 'REFUND_REVERSAL',
      p_key: 'refund:' + (refundRef || `${orderId}:${Math.round(amount * 100)}`),
    });
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) || {};
    console.log(`[vita] refund reversal ${orderId}: ₹${amount} -> ${r.reversed || 0} pts` +
                (r.debt_created ? ` (debt ${r.debt_created})` : ''));
    return r;
  } catch (e) {
    // A loyalty adjustment must never fail the refund itself — the money
    // has already moved by the time this runs.
    console.warn(`[vita] refund reversal failed for ${orderId}:`, e.message);
    return { error: e.message };
  }
}

// Releases a checkout reservation when payment fails or the order is
// abandoned — points must never be stranded in `locked`.
async function releaseVitaReservation(orderId, reason = 'payment failed') {
  try {
    await supabase.rpc('vita_release_redemption', { p_order: orderId, p_reason: reason });
  } catch (e) { console.warn('[vita] release failed:', e.message); }
}

// Hands back points the customer SPENT on an order that has now gone
// away, which is a different thing from reversing what it earned.
//
// reverseVitaForRefund above deals with the earning side. Nothing dealt
// with the spending side at all: points put towards an order are
// committed at checkout — gone from `available`, counted in
// lifetime_redeemed — and cancelling gave the customer their money back
// while keeping the points. They had paid twice for an order that no
// longer existed.
//
// releaseVitaReservation is not this. That only unwinds a reservation
// that never committed, i.e. a checkout that failed before the order
// was real; by the time an order can be cancelled the reservation is
// long since committed and that call is a no-op.
//
// Full exits only — a cancellation or a return of the whole order. A
// partial refund leaves the order standing and the points genuinely
// spent on the part that was kept.
async function refundVitaRedemption(orderId, reason) {
  try {
    const { data, error } = await supabase.rpc('vita_refund_redemption', {
      p_order: orderId, p_reason: reason,
    });
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) || {};
    if (r.refunded > 0) console.log(`[vita] returned ${r.refunded} redeemed pts on ${orderId} (${reason})`);
    return r;
  } catch (e) {
    // Same rule as every other loyalty hook: never break the order
    // operation that triggered it.
    console.warn(`[vita] redemption refund failed for ${orderId}:`, e.message);
    return { error: e.message };
  }
}

// Earn on a confirmed order. Points are created PENDING and only become
// spendable after delivery + the return window (vita_release_due).
// eligibleValue excludes shipping and the VitaPoints-paid portion, so a
// customer can't farm points off points.
async function awardVitaPoints(order, { eligibleValue } = {}) {
  try {
    const user = String(order?.customer_email || '').toLowerCase().trim();
    if (!user) return 0;
    const base = eligibleValue !== undefined
      ? eligibleValue
      : Math.max(0, Number(order.total) || 0);
    const { data, error } = await supabase.rpc('vita_earn_on_order', {
      p_user: user, p_order: order.id, p_eligible_value: base, p_key: 'earn:' + order.id,
    });
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) || {};
    const pts = r.points || 0;
    if (pts > 0) {
      try {
        await supabase.from('orders')
          .update({ vita_points_earned: pts }).eq('id', order.id);
      } catch (ue) { console.warn('[vita] could not stamp points on order:', ue.message); }
    }
    return pts;
  } catch (e) {
    console.warn('[vita] award failed:', e.message);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// PACK ACCOUNTING — one definition, used by every stock movement
//
// A cart line is a BUNDLE, not a pack. "60 tabs x 1" is one line with
// qty=1 but four physical 15-tab packs off the shelf. Stock is counted
// in packs, so every movement has to convert.
//
// This existed inline in exactly one place — the decrement — and nowhere
// else, which is how the two bugs below survived:
//
//   • Validation counted bundles. An order for a 60-tab bundle passed
//     the "is there stock?" check with ONE pack on the shelf, then the
//     decrement asked for four and greatest(0, 1-4) clamped to zero. The
//     sale went through, the stock column said 0, and three packs that
//     were never there had been sold.
//
//   • Restore counted bundles too. Cancelling that same order gave back
//     one pack after four had been taken, so inventory bled three packs
//     per cancelled bundle and drifted further from reality with every
//     cancellation.
//
// Both directions now go through here.
function stockUnitsForItem(item) {
  const bundles = Math.max(0, Math.trunc(Number(item.qty ?? item.units ?? 1)) || 0);
  const packsPerBundle = item.tierTabs
    ? Math.max(1, Math.round(Number(item.tierTabs) / 15))
    : 1;
  return bundles * packsPerBundle;
}

// Collapses a cart to { productId: packs }, so two lines of the same
// product become one stock movement instead of two racing ones.
function stockUnitsByProduct(items) {
  const totals = new Map();
  for (const item of (items || [])) {
    if (!item || item.id == null) continue;
    const units = stockUnitsForItem(item);
    if (units <= 0) continue;
    totals.set(item.id, (totals.get(item.id) || 0) + units);
  }
  return totals;
}

// SP: Place order atomically — validates stock, decrements, creates order
async function sp_place_order(orderData) {
  const items = typeof orderData.items === 'string' ? JSON.parse(orderData.items) : (orderData.items || []);


  // 1. Validate stock for all items.
  //
  // Was one SELECT per cart line, awaited in sequence. On Render talking
  // to Supabase that is a full round trip each — a five-line cart spent
  // five of them here, five more in computeServerSideTotal, and five
  // again on the decrement below, all before the order row was written.
  // One query for the whole cart instead.
  const wanted = stockUnitsByProduct(items);
  if (wanted.size) {
    const { data: products } = await supabase
      .from('products').select('id,name,stock').in('id', [...wanted.keys()]);
    const byId = new Map((products || []).map(p => [p.id, p]));
    for (const [id, units] of wanted) {
      const product = byId.get(id);
      // Unknown ids stay permitted here exactly as before — this check
      // has never been the gate on whether a product exists.
      if (product && product.stock < units) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
      }
    }
    // SECURITY AUDIT FIX (pre-launch 2026-08): stock USED to be only
    // checked here, with the decrement happening AFTER the order insert
    // below. Two concurrent orders for the same last pack both read
    // stock=1, both passed this check, and both inserted — overselling
    // by one pack per race. Decrementing FIRST makes each decrement an
    // atomic read-modify-write that genuinely fails (falls back below)
    // when two requests collide on the last pack, so at most one order
    // can claim it. The order itself is written afterwards, and the
    // insert failing releases nothing (no points have been committed
    // yet on this path — points are only earned after payment).
    // FIX (audit OZ-08): the comment above claimed each decrement "genuinely
    // fails when two requests collide on the last pack". decrement_stock cannot
    // fail — it is `set stock = greatest(0, stock - qty)`, which clamps at zero
    // and always succeeds. decErr was only ever set when the RPC was MISSING, so
    // the oversell race was never actually closed: both racers decremented to 0
    // and both inserted. decrement_stock_strict — which refuses with
    // `where stock >= qty` and raises otherwise — has existed in the same
    // migration since day one and was never called from anywhere.
    //
    // Switching to it introduces one new failure mode that clamping hid: a
    // multi-line cart can now fail on line 3 after lines 1-2 already took their
    // stock. Those have to go back, or a rejected order silently eats inventory.
    // Successful decrements are tracked and rolled back on failure.
    const taken = [];
    try {
      await Promise.all([...wanted].map(async ([id, units]) => {
        const { error: decErr } = await supabase.rpc('decrement_stock_strict', { p_id: id, p_qty: units });
        if (!decErr) { taken.push([id, units]); return; }

        // The strict function raises this exact message when the row cannot
        // cover the quantity. That is a real out-of-stock, not a missing RPC —
        // it must surface, never fall through to a permissive path.
        if (/insufficient stock/i.test(decErr.message || '')) {
          const p = byId.get(id);
          throw new Error(`Insufficient stock for "${(p && p.name) || ('product ' + id)}". Available: ${p ? p.stock : 0}`);
        }

        // Anything else means the RPC is genuinely unavailable. Keep the old
        // read-then-write as a last resort so a missing migration cannot stop
        // the store taking orders — it races, but it is strictly better than
        // refusing every checkout.
        console.warn('[sp_place_order] decrement_stock_strict unavailable, falling back:', decErr.message);
        const { data: product } = await supabase.from('products').select('stock').eq('id', id).single();
        if (!product || product.stock < units) {
          throw new Error(`Insufficient stock for product ${id}. Available: ${product ? product.stock : 0}`);
        }
        await supabase.from('products').update({
          stock: Math.max(0, product.stock - units),
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        taken.push([id, units]);
      }));
    } catch (stockErr) {
      await Promise.all(taken.map(([id, units]) =>
        supabase.rpc('decrement_stock', { p_id: id, p_qty: -units }).then(() => {}, () => {})
      ));
      throw stockErr;
    }
  }

  // 2. Normalise address: frontend sends address_line1/address_line2, schema has 'address'
  const normalisedOrderData = { ...orderData };

  // And the email, which matters more. Every order-creation path funnels
  // through here, so this is the one place that decides what case an
  // order is filed under. Some callers bind it to the token, others take
  // it from the checkout form exactly as the customer typed it — so the
  // same person ordering twice could end up with orders under two
  // different spellings of one address, and any lookup that matched
  // exactly would find one and miss the other.
  if (typeof normalisedOrderData.customer_email === 'string') {
    normalisedOrderData.customer_email = normalisedOrderData.customer_email.toLowerCase().trim();
  }

  if (!normalisedOrderData.address && normalisedOrderData.address_line1) {
    normalisedOrderData.address = [normalisedOrderData.address_line1, normalisedOrderData.address_line2].filter(Boolean).join(', ');
  }
  delete normalisedOrderData.address_line1;
  delete normalisedOrderData.address_line2;
  // ✅ FIX: remove frontend-only fields that don't exist as columns in orders table
  delete normalisedOrderData.cf_order_id;     // remove legacy field
  delete normalisedOrderData.gk_order_id;     // gokwik id stored separately
  // ✅ FIX Bug#6: do NOT delete payment_method — save it so admin can see upi/card/cod/etc.

  // SCHEMA GUARD: Postgres rejects an INSERT containing any column that
  // doesn't exist, and the whole order is lost. The checkout payload
  // carries display/transport-only fields (vita_points, gk_order_id,
  // address_line1/2, etc.) that aren't columns, so anything not in the
  // real table is dropped here rather than being allowed to fail the
  // write. Money fields are already recomputed server-side upstream, so
  // dropping unknown keys cannot change what the customer is charged.
  const ORDER_COLUMNS = new Set([
    'id','customer_name','customer_email','customer_phone','city','state','pincode',
    'country','items','subtotal','discount','shipping','total','coupon_code',
    'payment_method','payment_status','payment_gateway','cf_order_id','cf_payment_id',
    'fulfillment','shiprocket_id','tracking_url','notes','created_at','updated_at','user_id',
    'deleted_at','address','cashfree_order_id','status',
    'vita_points_redeemed','vita_points_earned','client_ip','device_fp',
    // 2026-08 — per-component discount columns written by the three
    // confirm paths (persistBreakdown in order-breakdown.js) so the invoice
    // and My Account can list each discount by name and amount.
    'tier_discount','mix_match_discount','coupon_discount','vita_points_discount','vita_points_used',
  ]);
  for (const k of Object.keys(normalisedOrderData)) {
    if (!ORDER_COLUMNS.has(k)) delete normalisedOrderData[k];
  }

  // 1.9 CLAIM THE COUPON — before the order exists, not after.
  //
  // FIX (audit OZ-06). This used to run AFTER the insert, and it discarded the
  // result: `const { error: cErr } = await supabase.rpc(...)`. claim_coupon_use
  // signals a refusal by returning ok=false with NO error, so the branch never
  // fired. Two consequences, both exploitable:
  //   • N concurrent checkouts on a single-use code all priced the discount
  //     (the cap is read during pricing, before any write), all inserted, and
  //     the counter simply stopped at max_uses — everyone got the discount.
  //   • Even a detected refusal could not have helped, because the order row
  //     was already written with the discount applied.
  // Claiming first makes the atomic guard authoritative: the database decides,
  // and a refusal stops the order instead of being logged after the fact.
  //
  // BUT a refusal must never destroy an order the customer has ALREADY PAID for.
  // sp_place_order serves four paths: /api/orders and confirm-cod-order arrive
  // with payment_status 'COD - Pending' (no money collected — safe to reject and
  // let the customer retry), while confirm-gokwik-order and the Cashfree verify
  // path arrive as 'Paid', after the money is taken. Throwing there would mean
  // the customer is charged and no order exists — strictly worse than honouring
  // one extra discount. So a paid order is always written, and the over-claim is
  // raised as a critical alert for a human instead.
  if (orderData.coupon_code) {
    const alreadyPaid = /paid|collected/i.test(String(orderData.payment_status || ''));

    const refuseCoupon = async (detail) => {
      if (alreadyPaid) {
        console.error(`[sp_place_order] coupon ${orderData.coupon_code} over limit on a PAID order ${orderData.id} — saving anyway, flagged for review`);
        await raiseAlert({
          severity: 'critical', category: 'finance', orderId: orderData.id,
          title: 'Coupon claimed past its usage limit on a paid order',
          detail: { coupon: orderData.coupon_code, order: orderData.id, reason: detail,
                    note: 'Payment was already taken, so the order was saved. Verify the discount.' },
        }).catch(() => {});
        return; // keep going — write the order
      }
      await restoreStockForOrder(normalisedOrderData, wanted).catch(() => {});
      throw new Error('This coupon has reached its usage limit.');
    };

    const { data: claim, error: cErr } = await supabase.rpc('claim_coupon_use', { p_code: orderData.coupon_code });
    if (cErr) {
      // RPC genuinely missing — fall back, but keep the limit check in the
      // statement rather than reading then writing.
      console.warn('[sp_place_order] claim_coupon_use RPC unavailable, falling back:', cErr.message);
      const { data: coupon } = await supabase.from('coupons')
        .select('id,used_count,max_uses').eq('code', String(orderData.coupon_code).toUpperCase()).maybeSingle();
      if (coupon) {
        if (coupon.max_uses != null && (coupon.used_count || 0) >= coupon.max_uses) {
          await refuseCoupon('fallback path saw used_count >= max_uses');
        } else {
          await supabase.from('coupons').update({ used_count: (coupon.used_count || 0) + 1 }).eq('id', coupon.id);
        }
      }
    } else {
      // The function returns a single row: (ok boolean, used_count integer).
      const claimRow = Array.isArray(claim) ? claim[0] : claim;
      if (claimRow && claimRow.ok === false) {
        await refuseCoupon('claim_coupon_use returned ok=false');
      }
    }
  }

  // 2. Create order
  let order;
  try {
    const { data, error } = await supabase.from('orders').insert([{
      ...normalisedOrderData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }]).select().single();
    if (error) throw error;
    order = data;
  } catch (insertErr) {
    // SECURITY AUDIT FIX (pre-launch 2026-08): since stock is now taken
    // BEFORE the insert (to stop the oversell race), an insert failure
    // would otherwise leave stock permanently short. Put the packs back.
    console.error('[sp_place_order] Supabase INSERT error:', insertErr.message || JSON.stringify(insertErr));
    await restoreStockForOrder(normalisedOrderData, wanted).catch(() => {});
    throw insertErr;
  }

  // 3. TRIGGER: coupon claim (stock was already decremented atomically in
  //    step 1 — see the audit fix note there)
  // TWO BUGS FIXED:
  //  (a) lost update — "select stock" then "update stock - qty" is two
  //      statements; two orders in the same instant both read the same
  //      value and stock only drops once. Now one atomic SQL decrement.
  //  (b) pack accounting — a 60-tab bundle is ONE cart line with qty=1
  //      but FOUR physical packs (tabs/15). Stock was dropping by 1, so
  //      inventory drifted up on every multi-pack sale.
  //  (c) the loop was per CART LINE and sequential, so two lines of the
  //      same product fired two racing decrements and a five-line cart
  //      paid five round trips. Aggregated by product id and issued
  //      together — each decrement is a single atomic statement, so
  //      running them concurrently is safe.

  // 4. Coupon usage is claimed in step 1.9, BEFORE the insert — see the note
  //    there. Claiming after the order was written meant a refusal arrived too
  //    late to matter.

  // 5. TRIGGER: Upsert customer stats
  if (orderData.customer_email) {
    const { data: existing } = await supabase.from('customers').select('id,total_orders,total_spent').eq('email', orderData.customer_email).single();
    const orderTotal = parseFloat(orderData.total || 0);
    if (existing) {
      await supabase.from('customers').update({
        total_orders: (existing.total_orders || 0) + 1,
        total_spent:  parseFloat(existing.total_spent || 0) + orderTotal,
        updated_at:   new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('customers').insert([{
        name: orderData.customer_name || '', email: orderData.customer_email,
        phone: orderData.customer_phone || '', city: orderData.city || '',
        state: orderData.state || '', pincode: orderData.pincode || '',
        total_orders: 1, total_spent: orderTotal,
        created_at: new Date().toISOString(),
      }]);
    }
  }

  // 6. TRIGGER: Log initial status
  await supabase.from('order_status_logs').insert([{
    order_id: order.id, old_status: null,
    new_status: orderData.fulfillment || 'Pending',
    note: 'Order placed', created_at: new Date().toISOString(),
  }]);

  // 7. TRIGGER: Audit log
  await writeAudit({ tableName: 'orders', recordId: order.id, action: 'INSERT', newValues: { total: orderData.total, customer_email: orderData.customer_email } });

  return order;
}

// States in which an order's packs are back on the shelf. Used to make
// the restore a one-way door: you can only put stock back on the way IN
// to one of these from a state that still held it, so Cancelled ->
// Returned (a real transition, and one a courier webhook can drive)
// does not hand out the same packs a second time.
const STOCK_RESTORED_STATES = ['Cancelled', 'Returned'];
const isStockRestoredState = (s) => STOCK_RESTORED_STATES.includes(String(s || ''));

// Puts an order's stock back on the shelf.
//
// Split out of sp_cancel_order because sp_cancel_order was not the only
// way an order gets cancelled — see the admin status route, which
// reversed the points and left the stock written off.
//
// Counts packs, not bundles (stockUnitsForItem), and moves them with the
// same atomic statement the decrement uses. The old version read `stock`
// and wrote `stock + qty` as two round trips: two cancellations landing
// together both read the same number and one restore was simply lost.
// decrement_stock is greatest(0, stock - n), so a negative n adds.
async function restoreStockForOrder(order, context = 'cancelled') {
  const items = typeof order.items === 'string'
    ? JSON.parse(order.items || '[]')
    : (order.items || []);
  const totals = stockUnitsByProduct(items);
  if (!totals.size) return;

  await Promise.all([...totals].map(async ([id, units]) => {
    const { error } = await supabase.rpc('decrement_stock', { p_id: id, p_qty: -units });
    if (!error) return;
    console.warn(`[stock] restore RPC unavailable for ${id}, falling back:`, error.message);
    const { data: product } = await supabase.from('products').select('stock').eq('id', id).single();
    if (product) {
      await supabase.from('products').update({
        stock: (product.stock || 0) + units,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }
  }));
  console.log(`[stock] ${context} ${order.id}: restored ${[...totals.values()].reduce((a, b) => a + b, 0)} packs`);
}

// SP: Cancel order — restores stock, reverses points, logs status
async function sp_cancel_order(orderId, reason, cancelledBy) {
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).single();
  if (!order) throw new Error('Order not found');
  // Also the idempotency guard for everything below: an already-cancelled
  // order cannot reach the restore or the reversal a second time.
  if (['Delivered','Cancelled'].includes(order.fulfillment)) throw new Error(`Cannot cancel: ${order.fulfillment}`);

  await restoreStockForOrder(order, 'cancelled');

  await supabase.from('orders').update({ fulfillment: 'Cancelled', updated_at: new Date().toISOString() }).eq('id', orderId);
  await supabase.from('order_status_logs').insert([{
    order_id: orderId, old_status: order.fulfillment, new_status: 'Cancelled',
    changed_by: cancelledBy, note: reason || 'Cancelled', created_at: new Date().toISOString(),
  }]);

  // ── VITAPOINTS ─────────────────────────────────────────────
  // This was missing entirely, and it is the reported bug: a customer
  // cancelling their own order from My Account got the money back and
  // kept every point the order had earned, with no entry in their
  // history to show for it. The reversal lived only on the admin status
  // route, so whether cancelling deducted anything came down to who
  // pressed the button.
  //
  // Same handler the admin panel and the courier webhook use, so all
  // three now behave identically. Idempotent per order id at the
  // database level as well, so a customer cancel followed by an admin
  // marking it Cancelled cannot reverse twice.
  await applyVitaOrderStatusChange(order, 'Cancelled', cancelledBy);

  await writeAudit({ tableName: 'orders', recordId: orderId, action: 'UPDATE', oldValues: { fulfillment: order.fulfillment }, newValues: { fulfillment: 'Cancelled' } });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// AUDIT LOG TRIGGER
// ═══════════════════════════════════════════════════════════════
function auditRow({ userId, tableName, recordId, action, oldValues, newValues, ipAddress }) {
  return {
    user_id: userId || null, table_name: tableName,
    record_id: String(recordId || ''), action,
    old_values: oldValues || null, new_values: newValues || null,
    ip_address: ipAddress || null, created_at: new Date().toISOString(),
  };
}

async function writeAudit(entry) {
  try {
    await supabase.from('audit_logs').insert([auditRow(entry)]);
  } catch(e) { console.warn('[AUDIT]', e.message); }
}

// Many audit rows, one INSERT. Calling writeAudit() inside a loop costs a
// round trip per row, and the audit log is the thing most likely to be
// written in bulk — a sync touching sixteen products wrote sixteen
// separate log rows, one at a time, after already having spent a round
// trip on each product.
//
// Chunked: PostgREST sends the batch as a single statement, and an
// unbounded array becomes an oversized request and one long lock on
// audit_logs. 500 rows is comfortably under both.
async function writeAuditMany(entries) {
  const rows = (entries || []).filter(Boolean).map(auditRow);
  if (!rows.length) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    try {
      await supabase.from('audit_logs').insert(rows.slice(i, i + CHUNK));
    } catch (e) { console.warn('[AUDIT] batch failed:', e.message); }
  }
}

// ═══════════════════════════════════════════════════════════════
// EMAIL HELPER
// ═══════════════════════════════════════════════════════════════
async function sendOrderEmail(order) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD || !order.customer_email) return;
  let items = [];
  try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch {}

  const itemRows = items.map(i => `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0">${i.name||'Product'}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:center">${i.qty||i.units||1}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right">₹${(i.price||i.selling_price||0).toLocaleString('en-IN')}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:30px auto;background:white;border-radius:16px;overflow:hidden">
    <div style="background:#2B1114;padding:26px 36px;text-align:center">
      <img src="${BRAND.logoLight}" alt="${BRAND.nameUpper}" width="180"
           style="width:180px;max-width:60%;height:auto;border:0;display:inline-block;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:2px">
    </div>
    <div style="padding:28px 36px 0;text-align:center">
      <div style="font-size:36px">🎉</div>
      <h1 style="font-size:20px;color:#1a1a1a;margin:10px 0 4px">Order Confirmed!</h1>
      <p style="color:#666;font-size:13px">Thank you ${order.customer_name||''}! Your order is placed.</p>
    </div>
    <div style="margin:20px 36px;background:#f8fdf4;border:2px solid #4a7c2f;border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px">Order ID</div>
      <div style="font-size:16px;font-weight:700;color:#2d5016">${order.id||''}</div>
      <div style="margin-top:6px">${order.payment_status==='Paid'?'<span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:20px;font-size:11px">✅ PAID</span>':'<span style="background:#fef9c3;color:#854d0e;padding:3px 10px;border-radius:20px;font-size:11px">💵 COD</span>'}</div>
    </div>
    <div style="padding:0 36px">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f0f0f0"><th style="padding:8px 10px;text-align:left;font-size:11px">Product</th><th style="padding:8px 10px;text-align:center;font-size:11px">Qty</th><th style="padding:8px 10px;text-align:right;font-size:11px">Price</th></tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr style="background:#f8fdf4"><td colspan="2" style="padding:10px;font-weight:700;color:#2d5016">Total</td><td style="padding:10px;font-weight:700;color:#2d5016;text-align:right">₹${parseFloat(order.total||0).toLocaleString('en-IN')}</td></tr></tfoot>
      </table>
    </div>
    <div style="margin:16px 36px;background:#f9f9f9;border-radius:10px;padding:16px;font-size:12px;color:#555;line-height:1.7">
      <strong>Delivery to:</strong> ${order.customer_name||''}<br>
      ${order.address || [order.address_line1, order.address_line2].filter(Boolean).join(', ') || ''}, ${order.city||''}, ${order.state||''} - ${order.pincode||''}<br>
      📞 ${order.customer_phone||''}
    </div>
    <div style="padding:0 36px 28px;text-align:center">
      ${BRAND.supportPhone ? `<a href="https://wa.me/${String(BRAND.supportPhone).replace(/[^0-9]/g,"")}" style="display:inline-block;background:#25d366;color:white;padding:9px 20px;border-radius:8px;font-weight:600;font-size:12px;text-decoration:none;margin-right:6px">💬 WhatsApp Support</a>` : ""}
    </div>
    <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#999">© ${new Date().getFullYear()} ${BRAND.legalName}${BRAND.companyAddress ? " | " + BRAND.companyAddress : ""}</div>
  </div></body></html>`;

  try {
    const fromAddr = process.env.MAIL_FROM || `${BRAND.name} <${process.env.MAIL_USER}>`;
    // Send to customer
    await mailer.sendMail({
      from: fromAddr,
      to: order.customer_email,
      subject: `✅ Order Confirmed — ${order.id} | ${BRAND.name}`,
      html,
    });
    console.log(`✅ [EMAIL] Order confirmation sent to ${order.customer_email}`);
    // Send admin copy
    await mailer.sendMail({
      from: fromAddr,
      to: process.env.MAIL_USER,
      subject: `🛒 New Order: ${order.id} — ₹${order.total} — ${order.customer_name}`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px">
        <h3 style="color:#2d5016">New Order Received</h3>
        <p><b>Order ID:</b> ${order.id}</p>
        <p><b>Customer:</b> ${order.customer_name} (${order.customer_email})</p>
        <p><b>Phone:</b> ${order.customer_phone}</p>
        <p><b>Total:</b> ₹${order.total}</p>
        <p><b>Payment:</b> ${order.payment_status}</p>
        <p><b>City:</b> ${order.city || '-'}</p>
      </div>`,
    });
    console.log(`✅ [EMAIL] Admin copy sent to ${process.env.MAIL_USER}`);
  } catch(e) {
    console.error(`❌ [EMAIL] Failed for order ${order.id}: ${e.message}`);
    if (e.message.includes('535') || e.message.includes('Username and Password')) {
      console.error('   → MAIL_PASSWORD is wrong. Use Gmail App Password from myaccount.google.com/apppasswords');
    } else if (e.message.includes('ECONNREFUSED') || e.message.includes('ETIMEDOUT')) {
      console.error('   → Render is blocking SMTP port 465. Switch to port 587 in mailer config.');
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// WHATSAPP REPORT HELPER (Twilio)
// ═══════════════════════════════════════════════════════════════
async function sendWhatsAppReport(reportText) {
  // One or more recipients — comma, pipe or semicolon separated. Plain
  // E.164 numbers (e.g. +919898582650,+917265884137) are normalised to
  // whatsapp:+91... automatically, so the env var stays readable.
  const toRaw = process.env.WHATSAPP_REPORT_TO || '+919898582650,+917265884137';
  const normalize = (t) => String(t).trim().startsWith('whatsapp:') ? String(t).trim() : 'whatsapp:' + String(t).trim();
  const tos = toRaw.split(/[,;|]/).map(normalize).filter((t) => /^whatsapp:\+\d{5,15}$/.test(t));
  if (!tos.length) {
    console.error('[WHATSAPP] No valid recipients in WHATSAPP_REPORT_TO:', toRaw);
    return false;
  }

  // CallMeBot keys are per-number: WHATSAPP_CALLMEBOT_KEYS=+919898582650:KEY1,+917265884137:KEY2
  const keysRaw = process.env.WHATSAPP_CALLMEBOT_KEYS || '';
  const cbKeys = Object.fromEntries(
    keysRaw.split(/[,;|]/).map((p) => p.split(':')).filter(([num, key]) => num && key)
  );
  const useCallMeBot = keysRaw.trim().length > 0;
  const sid   = useCallMeBot ? null : process.env.TWILIO_ACCOUNT_SID;
  const token = useCallMeBot ? null : process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (!useCallMeBot && (!sid || !token)) {
    console.error('[WHATSAPP] No sender configured — set WHATSAPP_CALLMEBOT_KEYS (free) or TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN on Render');
    return false;
  }

  let anySent = false;
  for (const to of tos) {
    const toNumber = to.replace('whatsapp:', '');

    // ── CallMeBot path (free; one API key per recipient number) ──────
    if (useCallMeBot && cbKeys[toNumber]) {
      try {
        const url = 'https://api.callmebot.com/whatsapp.php?' + new URLSearchParams({
          phone: toNumber, text: reportText, apikey: cbKeys[toNumber],
        }).toString();
        const r = await guardedFetch('callmebot', url, { signal: AbortSignal.timeout(10000) });
        const txt = await r.text();
        if (/message was sent/i.test(txt) || /success/i.test(txt) || /sent successfully/i.test(txt)) {
          console.log('✅ [WHATSAPP-CALLMEBOT] Sent to', to);
          anySent = true;
        } else {
          // CallMeBot answers with a short status string; log it for debugging.
          console.error('[WHATSAPP-CALLMEBOT] Reply for', to, ':', txt.slice(0, 200));
        }
      } catch(e) { console.error('[WHATSAPP-CALLMEBOT] Error for', to, ':', e.message); }
      continue;
    }

    // ── Twilio path ──────────────────────────────────────────────────
    try {
      const r = await guardedFetch('twilio', `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        },
        body: new URLSearchParams({ From: from, To: to, Body: reportText }).toString(),
      }, TWILIO_BREAKER);
      const data = await r.json();
      if (data.sid) {
        console.log('✅ [WHATSAPP-TWILIO] Sent to', to, ':', data.sid);
        anySent = true;
      } else {
        console.error('[WHATSAPP-TWILIO] Failed for', to, ':', JSON.stringify({ status: data.status, code: data.code, message: data.message }));
      }
    } catch(e) { console.error('[WHATSAPP-TWILIO] Error for', to, ':', e.message); }
  }
  return anySent;
}

async function buildDailyReport() {
  const today = new Date().toISOString().split('T')[0];

  // ── Pull every section in one parallel pass. Each query is small and
  //    indexed, so the report costs one cheap burst instead of a long scan.
  const [
    ordersRes, lowStockRes, alertRes, auditRes,
  ] = await Promise.all([
    supabase.from('orders').select('id,customer_name,total,payment_status,fulfillment,created_at').gte('created_at', today).order('created_at', { ascending: false }),
    supabase.from('products').select('name,stock').eq('active', true).lt('stock', 20).is('deleted_at', null),
    supabase.from('system_alerts').select('id,title,severity,category,created_at').gte('created_at', today).order('created_at', { ascending: false }),
    supabase.from('audit_logs').select('id,action,user_id,ip_address,created_at').gte('created_at', today).order('created_at', { ascending: false }).limit(30),
  ]);

  const orders   = ordersRes.data  || [];
  const lowStock = lowStockRes.data || [];
  const alerts   = alertRes.data   || [];
  const audit    = auditRes.data   || [];

  const paid     = orders.filter(o => { const s = (o.payment_status||'').toLowerCase(); return s.includes('paid') || s.includes('collected'); });
  const codPend  = orders.filter(o => o.payment_status === 'COD - Pending');
  const codColl  = orders.filter(o => o.payment_status === 'COD - Collected');
  const shipped  = orders.filter(o => ['Shipped','Delivered','Processing'].includes(o.fulfillment));
  const cancelled= orders.filter(o => (o.fulfillment||'') === 'Cancelled');
  const revenue  = orders.reduce((s, o) => s + parseFloat(o.total || 0), 0);
  const paidSum  = paid.reduce((s, o) => s + parseFloat(o.total || 0), 0);
  const codSum   = codPend.reduce((s, o) => s + parseFloat(o.total || 0), 0);
  const highSec  = alerts.filter(a => a.severity === 'high');

  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

  let msg = `🌿 *${BRAND.nameUpper} DAILY REPORT*\n📊 ${date} · ${time} IST\n━━━━━━━━━━━━━━━━━━━━\n`;

  // ── Orders & money ────────────────────────────────────────────────
  msg += `📦 *ORDERS*\n`;
  msg += `  Today: *${orders.length}* · Shipped/In-flight: ${shipped.length} · Cancelled: ${cancelled.length}\n`;
  msg += `  Revenue placed: *₹${revenue.toLocaleString('en-IN')}*\n\n`;

  msg += `💳 *PAYMENTS*\n`;
  msg += `  ✅ Paid + COD collected: *${paid.length}* (₹${paidSum.toLocaleString('en-IN')})\n`;
  msg += `  🟡 COD collected: *${codColl.length}* · 💵 COD pending: *${codPend.length}* (₹${codSum.toLocaleString('en-IN')} to collect)\n\n`;

  // ── Security ──────────────────────────────────────────────────────
  msg += `🛡 *SECURITY*\n`;
  if (highSec.length) {
    msg += `  ⚠️ ${highSec.length} high-severity alert(s) today\n`;
    alerts.filter(a => a.severity === 'high').slice(0, 3).forEach(a => {
      msg += `    • ${a.title} (${new Date(a.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })})\n`;
    });
  } else {
    msg += `  ✅ No security alerts today\n`;
  }

  // ── Actions (admin audit) ─────────────────────────────────────────
  msg += `\n⚙️ *ACTIONS* (${audit.length} admin action(s) today)\n`;
  audit.slice(0, 4).forEach(a => {
    msg += `  • ${a.action || 'action'} — ${a.user_id ? 'user#' + a.user_id : (a.ip_address || '?').slice(0, 15)} (${new Date(a.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })})\n`;
  });

  // ── Database health ───────────────────────────────────────────────
  msg += `\n🗄 *DATABASE*\n`;
  if (ordersRes.error || lowStockRes.error || alertRes.error) {
    msg += `  ❌ Supabase query errors: ` + [ordersRes.error, lowStockRes.error, alertRes.error].filter(Boolean).map(e => e.message.slice(0, 60)).join(' · ') + `\n`;
  } else {
    msg += `  ✅ Supabase connected — orders, alerts & stock queries OK\n`;
  }

  // ── Server health (via own /api/health/deps — loopback is cheap here)
  msg += `\n🖥 *SERVER*\n`;
  try {
    const depsUrl = BRAND.apiUrl + '/api/health/deps';
    const dr = await fetch(depsUrl, { signal: AbortSignal.timeout(8000) });
    const deps = dr.ok ? await dr.json() : { degraded: ['health endpoint unreachable'] };
    if (deps.degraded && deps.degraded.length) {
      msg += `  ⚠️ Degraded: ${deps.degraded.join(', ')}\n`;
    } else {
      msg += `  ✅ All external services healthy (Google, courier, WhatsApp, AI, payments)\n`;
    }
    msg += `  Uptime: process running — deploy ${process.env.SERVICE_VERSION || 'live'}\n`;
  } catch (e) {
    msg += `  ⚠️ Health check could not run: ${e.message}\n`;
  }

  // ── Errors today (console-level problems surfaced by the platform)
  const errs = alerts.filter(a => (a.category || '').toLowerCase().includes('error'));
  msg += `\n🚨 *ERRORS*\n`;
  if (errs.length) {
    errs.slice(0, 3).forEach(a => { msg += `  • ${a.title} (${a.severity})\n`; });
  } else {
    msg += `  ✅ No platform errors raised today\n`;
  }

  // ── Stock nudge ───────────────────────────────────────────────────
  if (lowStock.length > 0) {
    msg += `\n⚠️ *LOW STOCK:* ${lowStock.slice(0, 3).map(p => `${p.name} (${p.stock})`).join(' · ')}\n`;
  }

  msg += `\n🔗 Admin: ${BRAND.adminUrl}\n`;
  return msg;
}

// Schedule report twice daily — 10 AM and 6 PM IST
function scheduleReports() {
  const checkAndSend = async () => {
    const now  = new Date();
    const ist  = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hour = ist.getHours();
    const min  = ist.getMinutes();
    if ((hour === 10 || hour === 18) && min < 5) {
      console.log(`[WHATSAPP] Sending scheduled ${hour === 10 ? 'morning' : 'evening'} report...`);
      const report = await buildDailyReport();
      await sendWhatsAppReport(report);
    }
  };
  setInterval(checkAndSend, 5 * 60 * 1000); // Check every 5 minutes
  console.log('✅ WhatsApp report scheduler started (10AM & 6PM IST)');
}

// ═══════════════════════════════════════════════════════════════
// PRODUCT SYNC — reconciles the frontend's hardcoded PRODUCTS array
// (index.html) against the Supabase products table every 2 days,
// so edits made directly in the frontend file don't silently drift
// out of sync with what the admin panel / database has.
// ═══════════════════════════════════════════════════════════════
const vm = require('vm');

// Fields that live in the frontend PRODUCTS array and should win when they
// differ from the DB — content/catalog fields, not operational ones.
// Deliberately excludes `stock`, `active`, `deleted_at` — those are managed
// live in the admin panel and must never be overwritten by a frontend sync.
//
// ALSO excludes `image`/`image2` (removed here) — these used to be
// frontend-owned too, but the admin panel's Photo Library / Site Images
// system now uploads directly to Supabase Storage and writes the result
// straight into products.image / image2. Since index.html still carries
// the OLD hardcoded image URL for a product until someone edits that file
// by hand, every restart-triggered sync was overwriting a freshly-uploaded
// admin image back to the stale frontend one within 60 seconds — the
// "images keep disappearing after I redeploy" bug. Images are now treated
// as operational, like stock/active: managed live in the admin panel only.
const FRONTEND_OWNED_FIELDS = {
  name: 'name', brand: 'brand', category: 'category', badge: 'badge',
  price: 'price', salePrice: 'sale_price', offer: 'offer_text',
  rating: 'rating', reviews: 'reviews', description: 'description',
  hasTiers: 'has_tiers', howToUse: 'how_to_use',
  tags: 'tags', keyIngredients: 'key_ingredients', seoKeywords: 'seo_keywords',
};

async function fetchFrontendProducts() {
  const url = process.env.FRONTEND_INDEX_URL || `${BRAND.siteUrl}/index.html`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Could not fetch frontend (${res.status})`);
  const html = await res.text();

  const marker = 'const PRODUCTS = ';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('PRODUCTS array not found in frontend HTML');
  let i = start + marker.length;
  let depth = 0, inStr = null, esc = false, end = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === null) throw new Error('Could not find end of PRODUCTS array');
  const arrText = html.slice(start + marker.length, end);

  // Evaluate in an isolated VM context (no require/process/fs access) rather
  // than a raw eval — this still trusts your own domain's content, but limits
  // blast radius if that content were ever unexpectedly tampered with.
  const sandbox = {};
  vm.createContext(sandbox);
  const products = vm.runInContext(`(${arrText})`, sandbox, { timeout: 5000 });
  if (!Array.isArray(products)) throw new Error('Parsed PRODUCTS is not an array');
  return products;
}

async function syncProductsFromFrontend() {
  const summary = { checked: 0, updated: 0, missing: [], errors: [] };
  try {
    const frontendProducts = await fetchFrontendProducts();
    summary.checked = frontendProducts.length;

    // This used to be three round trips PER PRODUCT, all sequential: a
    // SELECT to read the current row, an UPDATE to write the diff, and an
    // INSERT into audit_logs. Sixteen products meant up to forty-eight
    // sequential calls to Supabase for a job whose entire input is
    // sixteen small rows.
    //
    // Now: one SELECT for every product, the diffing entirely in memory,
    // one UPDATE per distinct set of changed columns, and one INSERT for
    // all the audit rows together.
    const wanted = frontendProducts.filter(fp => fp.id);
    const byId = new Map();
    if (wanted.length) {
      const { data: rows } = await supabase
        .from('products').select('*').in('id', wanted.map(fp => fp.id));
      for (const r of (rows || [])) byId.set(r.id, r);
    }

    // Group by the exact set of columns that changed. Rows sharing a
    // signature can go in one statement; rows with different signatures
    // cannot, because a multi-row upsert writes the UNION of the keys and
    // would null out a column that simply was not part of that product's
    // diff. In practice a sync produces one or two signatures, so this is
    // one or two writes instead of sixteen.
    const groups = new Map();
    const auditRows = [];
    const stamp = new Date().toISOString();

    for (const fp of wanted) {
      const dbProduct = byId.get(fp.id);
      if (!dbProduct) {
        summary.missing.push({ id: fp.id, name: fp.name });
        continue; // don't auto-create — a missing DB row needs a human decision, not a silent insert
      }

      const changes = {};
      for (const [feKey, dbKey] of Object.entries(FRONTEND_OWNED_FIELDS)) {
        let feVal = fp[feKey];
        if (feVal === undefined) continue;
        if (Array.isArray(feVal)) feVal = feVal.length ? feVal : null;
        const dbVal = dbProduct[dbKey];
        const same = Array.isArray(feVal)
          ? JSON.stringify(feVal) === JSON.stringify(dbVal || [])
          : (feVal ?? null) === (dbVal ?? null);
        if (!same) changes[dbKey] = feVal ?? null;
      }
      if (!Object.keys(changes).length) continue;

      const signature = Object.keys(changes).sort().join('|');
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push({ id: fp.id, name: fp.name, changes });

      auditRows.push({
        userId: 'system:product-sync', tableName: 'products', recordId: fp.id,
        action: 'SYNC_FROM_FRONTEND', newValues: changes,
      });
      console.log(`[product-sync] Updating product ${fp.id} (${fp.name}):`, Object.keys(changes).join(', '));
    }

    // upsert() rather than update(): update() cannot set different values
    // per row in one statement, upsert-on-conflict can. Every row in a
    // group carries the same columns plus its own id, so `on conflict
    // (id) do update` writes each product its own values in one shot.
    // Chunked so a large catalogue cannot build an oversized statement.
    const CHUNK = 200;
    for (const rows of groups.values()) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const payload = slice.map(r => ({ id: r.id, ...r.changes, updated_at: stamp }));
        const { error: updErr } = await supabase
          .from('products').upsert(payload, { onConflict: 'id' });
        if (updErr) {
          // Attribute the failure to every product in the failed batch —
          // saying "one of these failed" without saying which is worse
          // than the per-row version this replaced.
          for (const r of slice) summary.errors.push({ id: r.id, error: updErr.message });
        } else {
          summary.updated += slice.length;
        }
      }
    }

    await writeAuditMany(auditRows);

    if (summary.missing.length) {
      console.warn('[product-sync] ⚠️ Frontend products not found in DB (needs manual review):',
        summary.missing.map(m => `${m.id}:${m.name}`).join(', '));
    }
    console.log(`[product-sync] Done — checked ${summary.checked}, updated ${summary.updated}, ` +
      `missing ${summary.missing.length}, errors ${summary.errors.length}`);
  } catch (err) {
    console.error('[product-sync] Failed:', err.message);
    summary.errors.push({ error: err.message });
  }
  return summary;
}

function scheduleProductSync() {
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  // Run once shortly after startup (so a fresh deploy is in sync immediately),
  // then every 2 days after that. Note: Render's free tier can spin the
  // service down when idle, which resets this timer — the manual endpoint
  // below (`POST /api/admin/products/sync`) is the reliable fallback if the
  // service sleeps between cycles.
  setTimeout(() => syncProductsFromFrontend(), 60 * 1000);
  setInterval(() => syncProductsFromFrontend(), TWO_DAYS_MS);
  console.log('✅ Product frontend↔backend sync scheduler started (every 2 days)');
}

// Manual trigger — lets you run the sync on demand instead of waiting,
// and shows you exactly what would change / did change.
// ═══════════════════════════════════════════════════════════════
// MOUNTED ROUTE MODULES
// These files existed in the repo but server.js contained no
// require('./...') at all, so none of them were ever loaded — which is
// why POST /api/reviews returned 404 and the review form could never
// submit.
// ═══════════════════════════════════════════════════════════════

// JWT boot self-test: a fresh token signed by this process must verify
// against the same JWT_SECRET. If it doesn't, the Render environment
// secret has been rotated (or reset) relative to what signed existing
// sessions — every admin login will then look "rejected" seconds after
// it succeeds. Without this check there is no visible signal at all.
const _jwtSelfTest = (() => {
  try {
    const probe = jwt.sign({ role: 'owner', email: OWNER_IDENTITY_EMAIL, tv: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    try {
      jwt.verify(probe, process.env.JWT_SECRET, { clockTolerance: 10 });
    } catch (e) {
      // The fallback secret is a verification-only path, so the self-test
      // must succeed if EITHER secret can verify — a JWT_SECRET rotation in
      // flight must not make /api/health/jwt red.
      const fb = process.env.JWT_SECRET_FALLBACK || '';
      if (!(fb && fb.length > 20)) throw e;
      jwt.verify(probe, fb, { clockTolerance: 10 });
    }
    console.log('[auth] JWT self-test PASS ✅ (sign+verify round-trip OK)');
    return true;
  } catch (e) {
    console.error('[auth] JWT self-test FAILED ❌ — JWT_SECRET on this instance cannot verify its own tokens: ' + e.message + ' — check the Render environment variable.');
    return false;
  }
})();
// Report it from the same place as every other boot health check so an
// uptime monitor (or the owner) can watch it without logs.
// The dual_secret_supported flag lets the owner or an uptime monitor confirm
// from the outside that the deployed build contains the dual-secret fix
// (dual-secret verification shipped in commit 7f56486) — without it there
// was no visible difference between the fixed and the unfixed server.
app.get('/api/health/jwt', (_, res) => res.json({
  jwt_ok: _jwtSelfTest,
  dual_secret_supported: true,
  dual_secret_active: Boolean(process.env.JWT_SECRET_FALLBACK && String(process.env.JWT_SECRET_FALLBACK).length > 20),
  note: _jwtSelfTest ? 'tokens signed and verified by this instance' : 'JWT_SECRET cannot verify locally-signed tokens — re-set the secret in Render and restart',
}));

// Checks at boot that the tables, columns and functions this code calls
// actually exist, and says which migration to run for anything missing.
// Three features were dead in production — returns, VitaPoints earning and
// VitaPoints reversal — because their database objects were never created
// and every call site fails soft with a console warning nobody reads.
try {
  require('./db-selfcheck')(app, { supabase });
  console.log('[mount] db-selfcheck ✅  (report at GET /api/health/db)');
} catch (e) { console.error('[mount] db-selfcheck FAILED:', e.message); }

// Same idea as db-selfcheck, for the third parties rather than the
// database: which dependency is currently degraded, how long until the
// breaker retries it, and how many calls it has shed. 503 when anything
// is open, so an uptime monitor can watch it.
try {
  mountBreakerHealth(app);
  console.log('[mount] breaker health ✅  (report at GET /api/health/deps)');
} catch (e) { console.error('[mount] breaker health FAILED:', e.message); }

// Hit rate, entry count and which keys are held — so it is possible to
// tell whether the cache is actually doing anything.
try {
  mountCacheHealth(app);
  console.log('[mount] cache health ✅  (report at GET /api/health/cache)');
} catch (e) { console.error('[mount] cache health FAILED:', e.message); }

// ═══════════════════════════════════════════════════════════════
// ADMIN ACTIVITY FEED + ROUTE REGISTRY (Aug 2026 pass)
//
// admin-events.js gives the admin panel a single live feed
// (GET /api/admin/events, last 200 events) and a one-call moderation
// summary (GET /api/admin/moderation) instead of polling several
// endpoints. route-docs.js is the machine-readable registry of the
// whole admin API, served at GET /api/docs and self-checked here.
// ═══════════════════════════════════════════════════════════════
try {
  require('./admin-events').attachEventBus(app, { authMiddleware, adminOnly, supabase });
  console.log('[mount] admin-events ✅  (GET /api/admin/events + /api/admin/moderation)');
} catch (e) { console.error('[mount] admin-events FAILED:', e.message); }

// NOTE: the /api/docs endpoint and the registry self-check are mounted at
// the END of this file, after every route below — checkDocs() must see the
// complete route table or it falsely reports half the API as "missing".
// The require() happens here so a broken module fails fast at boot.
let _routeDocs; try { _routeDocs = require('./route-docs'); } catch (e) { console.error('[mount] route-docs FAILED:', e.message); }

try {
  require('./returns-routes')(app, { supabase, authMiddleware, adminOnly, writeAudit, passwordGated });
  console.log('[mount] returns-routes ✅');
} catch (e) { console.error('[mount] returns-routes FAILED:', e.message); }

// Aug 2026: per-person staff identities + TOTP 2FA + owner master toggle +
// password re-confirmation gate. Mounted BEFORE the login route below so
// identityBootstrap() runs at boot and the proof helpers exist for every
// gated route that follows.
let _identitiesReady = null;
try {
  _identitiesReady = require('./auth-identities')({
    app, supabase, authMiddleware, adminOnly, ownerOnly, requirePerm,
    writeAudit, signToken, getTokenVersion, bumpTokenVersion, rateLimit,
  });
  console.log('[mount] auth-identities ✅  (2FA + staff + password gate)');
} catch (e) { console.error('[mount] auth-identities FAILED:', e.message); }

// Customer 360° — live aggregation + password-gated edits (customers.view).
try {
  require('./customers-360-routes')(app, { supabase, authMiddleware, adminOnly, requirePerm, writeAudit });
  console.log('[mount] customers-360-routes ✅  (GET/PUT /api/admin/customers/:id/360)');
} catch (e) { console.error('[mount] customers-360-routes FAILED:', e.message); }

try {
  require('./reviews-routes')(app, { supabase, authMiddleware, adminOnly, writeAudit, rateLimit });
  console.log('[mount] reviews-routes ✅');
} catch (e) { console.error('[mount] reviews-routes FAILED:', e.message); }

// ═══════════════════════════════════════════════════════════════
// AUTO-ENGINE (Aug 2026) — everything automatic, manual = override
//
// auto-engine.js runs three background jobs:
//   1. auto returns cycle      — approve → pickup → refund end to end
//   2. finance reconciliation  — gateway vs books + COD wallet alerts
//   3. auto ship               — waybill creation for paid orders
// Manual buttons (Approve / Reject / Mark picked up / Mark refunded /
// Create shipping order / manual refund) all stay on, and
// PUT /api/admin/auto-status lets the owner tune delays or run cycles
// on demand — the safe override path.
// ═══════════════════════════════════════════════════════════════
try {
  require('./auto-engine')(app, { supabase, authMiddleware, adminOnly, writeAudit, raiseAlert, clientIpOf, refundVitaRedemption });
  console.log('[mount] auto-engine ✅  (returns cycle 30m · reconciliation 6h · auto-ship 15m)');
} catch (e) { console.error('[mount] auto-engine FAILED:', e.message); }

// ═══════════════════════════════════════════════════════════════
// VITAPOINTS v2 — customer + admin API (vitapoints-routes.js)
//
// Replaces the old /api/vitapoints/balance + /history handlers, which
// read the v1 vita_balance view. v2 serves everything from
// vita_accounts / vita_ledger_v2 and adds pending, debt, rewards and
// the admin surface. /balance is kept below as a thin back-compat
// shim so an older cached frontend doesn't hard-fail mid-deploy.
// ═══════════════════════════════════════════════════════════════
try {
  require('./vitapoints-routes')(app, { supabase, authMiddleware, adminOnly, requirePerm });
} catch (e) { console.error('[mount] vitapoints-routes FAILED:', e.message); }

try {
  require('./cashfree-routes')(app, {
    supabase, verifyToken, resolveVitaDiscount, releaseVitaReservation, reverseVitaForRefund, computeServerSideTotal,
    sp_place_order, awardVitaPoints, sendOrderEmail, authMiddleware, adminOnly, rateLimit,
    recordWebhookEvent,
  });
} catch (e) { console.error('[mount] cashfree-routes FAILED:', e.message); }

// Back-compat shim: old frontends called /balance and expected
// {balance, pending, lifetime}. Serve it from v2 so a stale cached
// page still shows correct numbers until it refreshes.
app.get('/api/vitapoints/balance', authMiddleware, async (req, res) => {
  try {
    const email = String(req.user.email || '').toLowerCase().trim();
    if (!email) return res.status(401).json({ error: 'Unauthorised' });
    await supabase.rpc('vita_account_ensure', { p_user: email });
    const { data } = await supabase.from('vita_accounts')
      .select('available,pending,lifetime_earned').eq('user_id', email).maybeSingle();
    res.json({
      balance:  (data && data.available) || 0,
      pending:  (data && data.pending) || 0,
      lifetime: (data && data.lifetime_earned) || 0,
    });
  } catch (e) {
    console.error('[vitapoints/balance]', e.message);
    res.status(500).json({ error: 'Could not load VitaPoints balance' });
  }
});

try {
  // FIX: this used to call the module but DISCARD its return value —
  // site-media-routes.js builds and returns an express.Router(), so
  // without app.use() nothing was ever registered and every
  // /api/site-media + /api/promo-media request 404'd, even though both
  // index.html and admin.html call them. Mounted the same way
  // media-routes.js is.
  app.use('/api', require('./site-media-routes')(supabase, [authMiddleware, adminOnly]));
  console.log('[mount] site-media-routes ✅');
} catch (e) { console.warn('[mount] site-media-routes skipped:', e.message); }

app.post('/api/admin/products/sync', authMiddleware, requirePerm('system.maintenance'), async (req, res) => {
  const summary = await syncProductsFromFrontend();
  res.json(summary);
});

// ═══════════════════════════════════════════════════════════════
// Lets the admin panel render only what this role can actually do, from the
// same PERMISSIONS table the API guards use — so a button never appears for
// an action the server will refuse. Also returns when the session expires,
// which drives the idle-logout countdown in the UI.
// Aug 2026: /me now reflects the LIVE per-person permission set. An owner
// tightening a staffer's matrix lands the next time the panel asks /me —
// the sidebar and every guarded button resync without a re-login.
app.get('/api/admin/me', authMiddleware, adminOnly, async (req, res) => {
  try {
    const role = req.user.role;
    const who = String(req.user.username || req.user.email || '');
    // The two built-in accounts never carry custom sets — serve their known
    // list straight from the PERMISSIONS table (unchanged behaviour).
    const isBuiltIn = who === 'owner' || who === 'admin';
    const granted = isBuiltIn
      ? Object.keys(PERMISSIONS).filter(p => can(role, p))
      : await (async () => {
          const id = await resolveIdentity(who);
          if (!id) return Object.keys(PERMISSIONS).filter(p => can(role, p));
          return Object.keys(PERMISSIONS).filter(p => {
            if (id.role === 'owner' && PERMISSIONS[p]?.includes('owner')) return true;
            const custom = normalizePerms(id.permissions);
            if (custom) return custom.includes(p);
            return can(id.role, p);
          });
        })();
    let totp = { enrolled: false, master_on: true, enforced: false };
    try {
      const id = await resolveIdentity(who);
      const { data: master } = await supabase.from('settings')
        .select('value').eq('key', '2fa_master_enabled').maybeSingle();
      totp = { enrolled: !!id?.totp_secret, master_on: String(master?.value ?? 'true').toLowerCase() === 'true', enforced: !!id?.enforced };
    } catch (e) { /* table may not exist yet — panel degrades to password-only */ }
    res.json({
      role,
      email: req.user.email,
      username: who,
      is_owner: role === 'owner',
      permissions: granted,
      denied: Object.keys(PERMISSIONS).filter(p => !granted.includes(p)),
      totp,
      // Dual security (SAVE_PASSWORD env var): when set, every critical
      // action asks for the separate save/transaction password instead of
      // the login password. The panel reads this flag to label its prompt.
      security: { save_pw_required: Boolean(process.env.SAVE_PASSWORD) },
      session: {
        expires_at: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null,
        max_hours: ADMIN_SESSION_HOURS,
      },
    });
  } catch (e) {
    console.error('[admin/me]', e.message);
    res.status(500).json({ error: 'Could not load session info' });
  }
});

// ADMIN LOGIN
// ═══════════════════════════════════════════════════════════════
// Aug 2026 (staff system): login now resolves a row in `auth_identities`
// when one exists for the username — that row carries the bcrypt password
// hash, the person's 2FA enrollment and their enabled/enforced flags.
// The two built-in rows (owner/admin) are kept in sync with the
// ADMIN_PASSWORD / OWNER_PASSWORD env values at boot, so the panel logs in
// exactly as before for anyone who has not been invited as separate staff.
//
// 2FA flow:
//   • master toggle OFF  → password alone, always.
//   • master toggle ON, person enrolled (totp_secret) or enforced → the
//     first successful login returns { pending_2fa: true, nonce } instead
//     of a token; the panel posts { nonce, code } back and gets the token.
//     Backup codes unlock a locked-out phone the same way.
app.post('/api/admin/login', loginLimiter, adminOriginOnly, async (req, res) => {
  const { username, password, code, nonce } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  // Constant-time compare so response timing can't be used to probe the
  // password character by character.
  const safeEq = (a, b) => {
    const A = Buffer.from(String(a || '')), B = Buffer.from(String(b || ''));
    return A.length === B.length && crypto.timingSafeEqual(A, B);
  };

  const u = String(username).toLowerCase().trim();
  const ip = req.headers['x-forwarded-for'] || req.ip;

  // ── identity resolution: staff table first, env fallback ─────────
  let identity = null;
  try {
    const { data } = await supabase.from('auth_identities')
      .select('*').ilike('username', u).maybeSingle();
    identity = data || null;
  } catch (e) { /* table not yet created (migration pending) — env path below */ }

  let pwMatch = false, role = null, email = null, idRow = identity;

  if (identity) {
    // Suspended accounts cannot sign in at all.
    if (!identity.enabled) {
      supabase.from('system_alerts').insert({
        severity: 'warn', category: 'security',
        title: 'Login blocked — suspended staff account',
        detail: { username: identity.username, ip },
      }).then(() => {}).catch(() => {});
      return res.status(403).json({ error: 'This account is suspended — contact the owner' });
    }
    // Timing-equalise the miss path (bcrypt costs ~250ms; an unknown
    // username must not answer faster).
    if (!identity.password_hash || !await bcrypt.compare(password, identity.password_hash).catch(() => false)) {
      if (!identity.password_hash) { try { await bcrypt.compare(password, '$2b$12$LJ2m4MY.QiLXRM6829EUge0fZjVx775FhY3fTs9gT6v1W69FgC3Ri'); } catch (e) {} }
      noteLoginFailure(identity.username);
      supabase.from('system_alerts').insert({
        severity: 'warn', category: 'security',
        title: 'Failed admin login attempt',
        detail: { username: identity.username, ip },
      }).then(() => {}).catch(() => {});
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    clearLoginFailures(identity.username);
    pwMatch = true; role = identity.role; email = identity.username;
  } else {
    // ── legacy env path (pre-migration or if the row vanished) ────────
    if (u === 'owner' && process.env.OWNER_PASSWORD && safeEq(password, process.env.OWNER_PASSWORD)) { role = 'owner'; email = OWNER_IDENTITY_EMAIL; pwMatch = true; }
    else if (u === 'admin' && safeEq(password, process.env.ADMIN_PASSWORD)) { role = 'admin'; email = ADMIN_IDENTITY_EMAIL; pwMatch = true; }
    if (!pwMatch) {
      noteLoginFailure(username);
      supabase.from('system_alerts').insert({
        severity: 'warn', category: 'security',
        title: 'Failed admin login attempt',
        detail: { username: u.slice(0, 40), ip },
      }).then(() => {}).catch(() => {});
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Invite redemption: a staff account created by the owner arrives with
    // an invite_code; first sign-in with the initial credentials consumes
    // it and the person is pushed into the 2FA enrollment step.
    try {
      const { data: inv } = await supabase.from('auth_identities')
        .select('username').eq('username', u).neq('invite_code', null).maybeSingle();
      if (inv) {
        await supabase.from('auth_identities')
          .update({ invite_code: null, updated_at: new Date().toISOString() }).eq('username', u);
        idRow = (await supabase.from('auth_identities').select('*').eq('username', u).maybeSingle()).data || null;
      }
    } catch (e) { /* identity table may not exist yet */ }
  }

  if (!pwMatch || !role) return res.status(401).json({ error: 'Invalid credentials' });

  // ── master 2FA gate (OWNER REQUEST 17 Aug 2026: 2FA REMOVED) ─────
  // The owner asked to strip 2FA from login entirely — sign-in now
  // completes with username + password only. The enrollment/verification
  // machinery stays in auth-identities.js (harmless, unmounted from the
  // login path) in case 2FA is ever wanted again; the master toggle now
  // defaults to OFF and the panel reads that same default.
  const masterOn = await is2faMasterOn().catch(() => false);
  const enrolled2fa = idRow?.totp_secret;
  const forced2fa = masterOn && !!idRow?.enforced;
  const needsTotp = false; // 2FA no longer required at login — password only

  // Step 2 of login: the panel posts { nonce, code } to prove the person
  // holds the authenticator app (or an unused backup code).
  if (needsTotp && code && nonce) {
    const pending = _pending2fa.get(String(nonce || ''));
    if (!pending || pending.username !== u || Date.now() - pending.at > 10 * 60 * 1000) {
      _pending2fa.delete(String(nonce || ''));
      return res.status(400).json({ error: '2FA session expired — sign in again' });
    }
    let codeOk = false;
    if (idRow?.totp_secret && verifyTotpCode(idRow.totp_secret, String(code).trim())) codeOk = true;
    if (!codeOk && idRow?.totp_secret) {
      const hashes = JSON.parse(idRow.backup_codes || '[]');
      for (const h of hashes) {
        if (await bcrypt.compare(String(code).trim(), h).catch(() => false)) {
          await supabase.from('auth_identities')
            .update({ backup_codes: JSON.stringify(hashes.filter(x => x !== h)), updated_at: new Date().toISOString() })
            .eq('username', u);
          codeOk = true; break;
        }
      }
    }
    _pending2fa.delete(String(nonce));
    if (!codeOk) return res.status(401).json({ error: 'That code did not match — try your authenticator or an unused backup code' });
  } else if (needsTotp && !code) {
    // First step done — hand the panel a short-lived nonce for step 2.
    const nonce = crypto.randomBytes(12).toString('base64url');
    _pending2fa.set(nonce, { username: u, at: Date.now() });
    return res.json({ pending_2fa: true, nonce, username: u, enforced: !!forced2fa });
  }

  _pending2fa.delete(String(nonce || ''));
  const tv = await getTokenVersion(u);
  const token = signToken({ role, email, username: u, tv });
  try {
    await supabase.from('auth_identities')
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('username', u);
  } catch (e) { /* non-fatal */ }
  res.json({ token, role, requires_2fa: !!needsTotp });
});

// Pending 2FA nonces — one use, 10-minute life, bounded cleanup.
const _pending2fa = new Map();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [k, v] of _pending2fa) if (v.at < cutoff) _pending2fa.delete(k);
}, 5 * 60 * 1000).unref?.();

// TOTP verify with a ±1 window.
function verifyTotpCode(secret, code) {
  try {
    const { auth, totp } = require('otplib');
    auth.options = { window: 1 };
    return totp.verify(code, secret);
  } catch (e) { console.error('[login] totp verify failed:', e.message); return false; }
}

// Owner master toggle — read from the same public settings table every
// other store flag uses. Checked on every login so a flip takes effect
// without a deploy or a page refresh.
// Owner removed 2FA (17 Aug 2026) — the master toggle now defaults to
// OFF in code. Any leftover 'true' row in the settings table is ignored.
async function is2faMasterOn() {
  return false;
}

// OWNER-ONLY: revoke every outstanding token for an identity.
// This is the containment tool that did not exist before — if an admin
// token leaks, bump the version and every copy of it stops working
// immediately, rather than staying valid for up to 30 days.


// ═══════════════════════════════════════════════════════════════
// AUTH — Google + Email
// ═══════════════════════════════════════════════════════════════
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential' });
    // Timed, concurrency-capped and breaker-guarded. This had no timeout
    // at all, and it is on the sign-in path: if Google's token endpoint
    // stops answering rather than refusing, every sign-in parks here
    // forever holding its socket and request objects, they accumulate,
    // and the instance is eventually killed — taking checkout and the
    // admin panel with it, neither of which involves Google.
    const googleRes  = await guardedFetch('google-oauth',
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`, {}, GOOGLE_BREAKER);
    const googleData = await googleRes.json();
    if (googleData.error || googleData.aud !== process.env.GOOGLE_CLIENT_ID) return res.status(401).json({ error: 'Invalid Google token' });
    // SECURITY: `aud` was checked but `email_verified` was not. An
    // unverified address would have been trusted as proof of identity.
    if (googleData.email_verified !== true && googleData.email_verified !== 'true') {
      return res.status(401).json({ error: 'Google account email is not verified' });
    }

    const email = String(googleData.email || '').toLowerCase().trim();
    const { name, picture } = googleData;
    const { data: existing } = await supabase.from('customers').select('*').eq('email', email).single();
    let customer;
    if (existing) {
      const { data: u } = await supabase.from('customers').update({ name, updated_at: new Date().toISOString() }).eq('email', email).select().single();
      customer = u || existing;
    } else {
      const { data: c, error } = await supabase.from('customers').insert([{ email, name, created_at: new Date().toISOString() }]).select().single();
      if (error) throw error;
      customer = c;
      await writeAudit({ tableName: 'customers', recordId: customer.id, action: 'INSERT', newValues: { email, name } });
    }
    res.json({ token: signToken({ id: customer.id, email: customer.email, name: customer.name }), user: { id: customer.id, name: customer.name, email: customer.email, picture: picture||'' } });
  } catch(err) { res.status(500).json({ error: 'Authentication failed' }); }
});

// ── Google OAuth2 authorization CODE exchange (mobile/Safari redirect flow) ──
// Called by frontend after Google redirects back with ?code=xxx
// Exchanges the code for tokens server-side (keeps client_secret safe)
app.post('/api/auth/google-code', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;
    if (!code)         return res.status(400).json({ error: 'Missing code' });
    if (!redirect_uri) return res.status(400).json({ error: 'Missing redirect_uri' });

    const clientId     = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientSecret) return res.status(500).json({ error: 'GOOGLE_CLIENT_SECRET not configured on server' });

    // Step 1: Exchange auth code → access_token + id_token
    const tokenRes = await guardedFetch('google-oauth', 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error('[google-code] Token exchange error:', tokenData);
      return res.status(401).json({ error: tokenData.error_description || 'Code exchange failed' });
    }

    // Step 2: Verify the id_token to get user profile
    const verifyRes  = await guardedFetch('google-oauth',
      `https://oauth2.googleapis.com/tokeninfo?id_token=${tokenData.id_token}`, {}, GOOGLE_BREAKER);
    const googleData = await verifyRes.json();
    if (googleData.error || googleData.aud !== clientId) {
      return res.status(401).json({ error: 'Invalid Google token after code exchange' });
    }

    const { email, name, picture } = googleData;

    // Step 3: Upsert customer in Supabase (same logic as /api/auth/google)
    const { data: existing } = await supabase.from('customers').select('*').eq('email', email).single();
    let customer;
    if (existing) {
      const { data: u } = await supabase.from('customers')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('email', email).select().single();
      customer = u || existing;
    } else {
      const { data: c, error } = await supabase.from('customers')
        .insert([{ email, name, created_at: new Date().toISOString() }])
        .select().single();
      if (error) throw error;
      customer = c;
      await writeAudit({ tableName: 'customers', recordId: customer.id, action: 'INSERT', newValues: { email, name } });
    }

    res.json({
      token: signToken({ id: customer.id, email: customer.email, name: customer.name }),
      user:  { id: customer.id, name: customer.name, email: customer.email, picture: picture || '' },
    });

  } catch(err) {
    console.error('[google-code] Error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/api/auth/email-login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    // One message, one status, for every rejection below. A different
    // string, a different code, or a different response time on any branch
    // hands back whether the address is registered.
    const BAD = { status: 401, body: { error: 'Invalid email or password' } };
    const reject = () => res.status(BAD.status).json(BAD.body);

    const emailNorm = validEmail(email);
    if (!emailNorm || !password) { await burnPasswordTime(password); return reject(); }
    // A password over the bcrypt limit cannot be anyone's real password and
    // is the shape of a resource-exhaustion probe. Refuse before hashing.
    if (Buffer.byteLength(String(password), 'utf8') > PASSWORD_MAX) {
      await burnPasswordTime('x'); return reject();
    }

    // Account locked after repeated failures. Same message as a wrong
    // password on purpose: telling the requester the account is locked
    // confirms it exists, and confirming existence is what the lockout is
    // partly there to prevent. The owner learns from the email below.
    if (lockoutRemainingMs(emailNorm) > 0) { await burnPasswordTime(password); return reject(); }

    // Case-sensitive lookups let Victim@x.com and victim@x.com become two
    // separate accounts — and VitaPoints/orders are keyed by email.
    // Lower-case match on purpose: signup stores lowercased addresses
    // (validEmail), so a plain equality test hits the
    // idx_customers_email_lower index instead of seq-scanning the whole
    // table on every login — the largest single Disk-IO offender left.
    const { data: customer } = await supabase.from('customers').select('*').eq('email', emailNorm).single();
    // Spend the same time on the miss path as on a real compare, or the
    // response time answers "is this address registered?" on its own.
    if (!customer) { await burnPasswordTime(password); noteLoginFailure(emailNorm); return reject(); }
    // Was a 403 with a distinct message, which confirmed the address is
    // registered to anyone who asked. Deactivated accounts now look
    // exactly like wrong credentials from outside.
    if (customer.deleted_at) { await burnPasswordTime(password); return reject(); }
    // Support bcrypt hashes and legacy base64 (migrated on next login)
    let passwordMatch = false;
    if (customer.password) {
      if (customer.password.startsWith('$2b$') || customer.password.startsWith('$2a$')) {
        passwordMatch = await bcrypt.compare(password, customer.password);
      } else {
        // Legacy base64 — verify then silently upgrade to bcrypt.
        // timingSafeEqual, not ===: a plain string compare returns on the
        // first differing byte, which leaks the stored value a character
        // at a time to anyone measuring. Lengths are compared first
        // because timingSafeEqual throws on a length mismatch.
        const want = Buffer.from(String(customer.password), 'utf8');
        const got  = Buffer.from(Buffer.from(String(password)).toString('base64'), 'utf8');
        passwordMatch = want.length === got.length && crypto.timingSafeEqual(want, got);
        if (passwordMatch) {
          const upgraded = await bcrypt.hash(password, BCRYPT_ROUNDS);
          await supabase.from('customers').update({ password: upgraded, updated_at: new Date().toISOString() }).eq('id', customer.id);
        }
      }
    } else {
      // No password on the row at all — a Google-only account. Still pay
      // the hashing time so this branch is not distinguishable either.
      await burnPasswordTime(password);
    }
    if (!passwordMatch) {
      noteLoginFailure(emailNorm);
      // Tell the owner, not the requester. If this failure is the one that
      // trips the lock, the person who actually owns the account finds out
      // it is under attack; the attacker's response is unchanged.
      if (lockoutRemainingMs(emailNorm) > 0) {
        // Fire-and-forget: never awaited. Awaiting it would make the
        // locked-out response measurably slower than an ordinary wrong
        // password and undo the timing work above, and an SMTP outage
        // would start failing logins.
        mailer.sendMail({
          from: `"${BRAND.name}" <${process.env.MAIL_USER || BRAND.supportEmail}>`,
          to: customer.email,
          subject: `Your ${BRAND.name} account was temporarily locked`,
          html: '<p>We locked your account for 15 minutes after several failed sign-in attempts.</p>' +
                '<p>If this was you, wait and try again. If it was not, someone may know your ' +
                'password — please change it once you are back in.</p>',
        }).catch(e => console.warn('[LOCKOUT MAIL]', e.message));
      }
      return reject();
    }
    clearLoginFailures(emailNorm);
    res.json({ token: signToken({ id: customer.id, email: customer.email, name: customer.name }), user: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone||'' } });
  } catch(err) { res.status(500).json({ error: 'Login failed' }); }
});

app.post('/api/auth/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });

    // Server-side validation. The signup form checks the same rules, and
    // that check is worth nothing on its own — this endpoint is reachable
    // with curl. Note the password rules live HERE and not on login:
    // existing customers have passwords that predate them.
    const emailNorm = validEmail(email);
    if (!emailNorm) return res.status(400).json({ error: 'Please enter a valid email address.' });
    const pwProblem = passwordProblem(password);
    if (pwProblem) return res.status(400).json({ error: pwProblem });
    const nameClean = cleanName(name);
    if (!nameClean) return res.status(400).json({ error: 'Please enter your name.' });
    const phoneClean = String(phone == null ? '' : phone).replace(/[^\d+\-() ]/g, '').slice(0, 20);
    const { data: existing } = await supabase.from('customers')
      // Same normalization as login: signup stores lowercased addresses,
      // so plain equality uses idx_customers_email_lower (no seq scan).
      .select('id,deleted_at,password').eq('email', emailNorm).single();

    // SECURITY: registering an email that already exists as a SOFT-DELETED
    // account used to reset its password, clear deleted_at and hand back a
    // token — i.e. anyone who knew the address could seize a deactivated
    // account, including one an admin deactivated for fraud, along with its
    // order history and saved addresses. Re-activation is now an admin action.
    if (existing && existing.deleted_at) {
      return res.status(403).json({ error: 'This account is deactivated. Please contact support to restore it.' });
    }

    // SECURITY: an account created by Google sign-in has no password. Letting
    // someone "register" that email would attach a password they chose to
    // somebody else's Google-linked account and share access to it.
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hashedPw = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { data: customer, error } = await supabase.from('customers').insert([{ name: nameClean, email: emailNorm, phone: phoneClean, password: hashedPw, created_at: new Date().toISOString() }]).select().single();
    if (error) throw error;
    await writeAudit({ tableName: 'customers', recordId: customer.id, action: 'INSERT', newValues: { email, name } });
    res.json({ token: signToken({ id: customer.id, email: customer.email, name: customer.name }), user: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone||'' } });
  } catch(err) { res.status(500).json({ error: 'Registration failed' }); }
});


// ═══════════════════════════════════════════════════════════════
// GEMINI PROXY — key never leaves the server
// ═══════════════════════════════════════════════════════════════
// Admin assistant (requires JWT)
// SECURITY: was authMiddleware only, so any registered customer could use
// the admin assistant as a free LLM billed to your Gemini key.
app.post('/api/gemini', authMiddleware, adminOnly, async (req, res) => {
  try {
    // ── Primary: Gemini. ── Fallback: the Manus LLM proxy, if configured.
    //    The order matters more than it looks: when Gemini's key is missing
    //    we MUST answer here rather than falling through to the guardedFetch
    //    call below, which would 503 on the missing key and make the admin
    //    assistant unusable.
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      const r = await guardedFetch('gemini',
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(req.body),
          signal:  AbortSignal.timeout(20000),
        }
      );
      const data = await r.json();
      // Gemini occasionally returns a payload without `candidates` (quota,
      // safety). Translate anything non-candidate into a plain string error
      // so the frontend never renders a raw object.
      if (!data || typeof data !== 'object' || !(data.candidates?.length)) {
        const msg = data?.error?.message || data?.promptFeedback?.blockReason || 'AI service returned no answer';
        return res.status(r.status === 200 ? 503 : r.status).json({ error: typeof msg === 'string' ? msg : 'AI service error' });
      }
      return res.status(r.status).json(data);
    }
    if (MANUS_LLM_PROXY_URL && MANUS_LLM_PROXY_KEY) {
      try {
        const data = await geminiShapedToManus(req.body, 25000);
        console.warn('[Gemini proxy] Gemini not configured — this request was served by the Manus proxy instead.');
        return res.json(data);
      } catch (mErr) {
        console.error('[Gemini proxy → Manus fallback]', mErr && mErr.message);
        const msg = (mErr && (typeof mErr.message === 'string' ? mErr.message : 'unknown failure')) || 'fallback failed';
        return res.status(503).json({ error: 'AI assistant temporarily unavailable — ' + msg });
      }
    }
    return res.status(503).json({ error: 'Gemini not configured — add GEMINI_API_KEY (or MANUS_LLM_PROXY_URL + MANUS_LLM_PROXY_KEY) to Render env vars' });
  } catch(e) {
    console.error('[Gemini proxy]', e && e.message);
    const msg = (e && typeof e.message === 'string') ? e.message : 'unexpected server failure';
    res.status(500).json({ error: msg });
  }
});

// Gemini-shaped request → Manus (OpenAI-compatible) reply. The admin assistant
// panel sends the Gemini payload shape; when Gemini is unavailable or
// unconfigured, this keeps the floating AI assistant working instead of
// showing "not configured". Admin-only, same budget as the rest of the AI.
async function geminiShapedToManus(body, timeoutMs = 25000) {
  const sysParts = body?.system_instruction?.parts || [];
  const system = Array.isArray(sysParts) ? sysParts.map(p => String(p.text || '')).join('') : '';
  const messages = (body?.contents || []).map(c => ({ role: c.role, content: (c.parts || []).map(p => String(p.text || '')).join('') }));
  const last = messages.length && messages[messages.length - 1].content;
  if (!last) throw Object.assign(new Error('Empty message'), { status: 400, expected: true });
  const maxTokens = body?.generationConfig?.maxOutputTokens || 500;
  const text = await callManusText({ system, prompt: last, maxTokens });
  // Respond in the Gemini payload shape so the frontend needs no changes.
  return { candidates: [{ content: { parts: [{ text }], role: 'model' } }] };
}

// Vita chatbot (public storefront) — IP rate-limited: 20 req/min
const _vitaCounts = new Map();
app.post('/api/gemini/vita', async (req, res) => {
  try {
    const ip  = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();
    const e   = _vitaCounts.get(ip) || { count: 0, window: now };
    if (now - e.window > 60_000) { e.count = 0; e.window = now; }
    e.count++;
    _vitaCounts.set(ip, e);
    if (e.count > 20) return res.status(429).json({ error: 'Too many requests — please wait a minute.' });

    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(503).json({ error: 'AI advisor temporarily unavailable.' });

    // This used to forward req.body verbatim to Gemini. That made it an open
    // proxy to your API key: anyone could send any model config, any system
    // instruction, any generationConfig, and bill it to you. The 20/min per-IP
    // counter only slows one IP down — it doesn't stop the abuse.
    //
    // Now only the user's text crosses the boundary. The prompt shape, the
    // system instruction and the output ceiling are decided here, on the
    // server, and cannot be overridden by the caller.
    const raw = req.body?.contents?.[0]?.parts?.[0]?.text
             ?? req.body?.prompt
             ?? req.body?.message;
    const userText = String(raw || '').slice(0, 2000);
    if (!userText.trim()) return res.status(400).json({ error: 'Empty question.' });

    const payload = {
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      systemInstruction: {
        parts: [{ text:
          `You are the VitaPoints assistant for ${BRAND.name}, an Indian nutraceutical brand. ` +
          `Answer only questions about VitaPoints, orders, shipping and ${BRAND.name} products. ` +
          'If asked about anything else, politely say it is outside what you can help with. ' +
          'Never provide medical diagnosis or dosage advice — tell the customer to consult a doctor.'
        }],
      },
      generationConfig: { maxOutputTokens: 600, temperature: 0.5 },
    };

    const r = await guardedFetch('gemini',
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
      { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(20000) }
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch(e) {
    console.error('[Gemini/vita]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// AI AGENT TEAM — Owner-only autopilot layer (Claude-powered)
//
// Security model: every route below requires authMiddleware + ownerOnly.
// The admin role gets a 403 even with a valid token — this is NOT just
// hidden in the UI, it's rejected on the server.
//
// Safety model: agents can generate as many read-only insights as you
// like (cheap, harmless). The moment an instruction implies a real
// change — money, stock, prices, orders, messages — it is only ever
// written to the ai_actions table as status:'pending'. Nothing touches
// real data until POST /api/owner/ai/actions/:id/approve is called.
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// AI Agent Team — two providers, automatic failover.
//
// You've now got both ANTHROPIC_API_KEY and GEMINI_API_KEY set. Every
// AI Agent Team call goes through callClaude() below (kept under its
// original name so nothing else in this file needs to change), which
// now tries the primary provider first and — ONLY when the failure looks
// like a quota/rate-limit/low-balance problem, not any other kind of
// error — automatically retries the exact same request on the other
// provider instead of failing the request outright.
//
// Primary provider defaults to Anthropic (matches the original "Claude-
// powered" design of this feature). Override with AI_PRIMARY_PROVIDER=
// gemini in Render env vars if you'd rather default the other way.
// ═══════════════════════════════════════════════════════════════

async function callAnthropicText({ system, prompt, maxTokens = 500 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { const e = new Error('ANTHROPIC_API_KEY not set — add it in Render env vars'); e.status = 503; throw e; }
  const r = await guardedFetch('anthropic', 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, ANTHROPIC_BREAKER);
  const data = await r.json();
  if (!r.ok || data.error) {
    const e = new Error((data.error && data.error.message) || `Anthropic error ${r.status}`);
    e.status = r.status;
    e.errorType = data.error && data.error.type; // 'rate_limit_error' | 'overloaded_error' | ...
    throw e;
  }
  const block = (data.content || []).find(b => b.type === 'text');
  return block?.text || '';
}

async function callGeminiText({ system, prompt, maxTokens = 500 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { const e = new Error('GEMINI_API_KEY not set — add it in Render env vars'); e.status = 503; throw e; }
  const r = await guardedFetch('gemini',
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(30000),
    }
  );
  const data = await r.json();
  if (!r.ok || data.error) {
    const e = new Error((data.error && data.error.message) || `Gemini error ${r.status}`);
    e.status = r.status;
    throw e;
  }
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  return text;
}

// Recognizes ONLY quota/rate-limit/low-balance style failures as
// fallback-worthy. A bad prompt, a malformed request, or an unrelated
// server error on one provider should not get silently retried on the
// other paid API — that would just burn the second budget on the same
// broken request. This stays conservative on purpose.
function isQuotaOrRateLimitError(err) {
  const status = err.status;
  const msg = (err.message || '').toLowerCase();
  const type = (err.errorType || '').toLowerCase();
  if (status === 429 || status === 503 || status === 529) return true;
  if (type.includes('rate_limit') || type.includes('overloaded')) return true;
  if (msg.includes('rate limit') || msg.includes('rate_limit')) return true;
  if (msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('resource exhausted')) return true;
  if (msg.includes('credit balance') || msg.includes('insufficient') || msg.includes('too low')) return true;
  if (msg.includes('overloaded')) return true;
  return false;
}

const AI_PRIMARY_PROVIDER = (process.env.AI_PRIMARY_PROVIDER || 'anthropic').toLowerCase();

async function callClaude({ system, prompt, maxTokens = 500 }) {
  const providers = AI_PRIMARY_PROVIDER === 'gemini'
    ? [{ name: 'gemini', fn: callGeminiText }, { name: 'anthropic', fn: callAnthropicText }]
    : [{ name: 'anthropic', fn: callAnthropicText }, { name: 'gemini', fn: callGeminiText }];

  // Third provider: the Manus LLM proxy (OpenAI-compatible). When the two
  // paid APIs are both exhausted (or both unconfigured), this route keeps
  // the AI Agent Team alive. Opt-in via MANUS_LLM_PROXY_URL + _KEY — never
  // silently billed to anyone who did not configure it.
  if (MANUS_LLM_PROXY_URL && MANUS_LLM_PROXY_KEY) {
    providers.push({ name: 'manus', fn: callManusText });
  }

  let lastErr;
  for (let i = 0; i < providers.length; i++) {
    const { name, fn } = providers[i];
    try {
      const text = await fn({ system, prompt, maxTokens });
      if (i > 0) console.warn(`[AI Agent Team] ${providers[0].name} unavailable — this request was served by ${name} instead.`);
      return text;
    } catch (err) {
      lastErr = err;
      const isLastProvider = i === providers.length - 1;
      const shouldFallback = !isLastProvider && isQuotaOrRateLimitError(err);
      console.error(`[AI Agent Team] ${name} failed${shouldFallback ? ' (quota/rate-limit — falling back)' : ''}:`, err.message);
      if (!shouldFallback) throw err;
    }
  }
  throw lastErr;
}

// Manus LLM proxy — OpenAI-compatible chat completions. Used ONLY as the
// last resort in the AI Agent Team failover chain, and only when both env
// vars are present.
async function callManusText({ system, prompt, maxTokens = 500 }) {
  const base = MANUS_LLM_PROXY_URL;
  const key = MANUS_LLM_PROXY_KEY;
  if (!base || !key) { const e = new Error('Manus proxy not configured'); e.status = 503; throw e; }
  // /chat/completions is appended to the base; if the base already ends with
  // /chat/completions (rare), use it as-is.
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
  const r = await guardedFetch('manus', url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key,
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json();
  if (!r.ok || (data && data.error)) {
    const e = new Error((data && data.error && (data.error.message || JSON.stringify(data.error))) || `Manus proxy error ${r.status}`);
    e.status = r.status;
    e.errorType = (data && data.error && data.error.type) || '';
    throw e;
  }
  return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

// Live snapshot of the real business — agents are grounded in this,
// never in invented numbers.
async function getCompanySnapshot() {
  const today = new Date().toISOString().split('T')[0];
  const [ordersR, prodsR, custsR, couponsR] = await Promise.all([
    supabase.from('orders').select('id,customer_name,total,payment_status,fulfillment,created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(300),
    supabase.from('products').select('id,name,stock,active').is('deleted_at', null),
    supabase.from('customers').select('id,created_at').is('deleted_at', null),
    supabase.from('coupons').select('*'),
  ]);
  const orders = ordersR.data || [], products = prodsR.data || [], customers = custsR.data || [], coupons = couponsR.data || [];
  const isPaid = o => { const s = (o.payment_status || '').toLowerCase(); return s.includes('paid') || s === 'success'; };
  const paid = orders.filter(isPaid);
  const lowStock = products.filter(p => p.active && p.stock < 20);

  return {
    asOf: new Date().toISOString(),
    totalRevenue:   paid.reduce((s, o) => s + parseFloat(o.total || 0), 0),
    todayRevenue:   paid.filter(o => (o.created_at || '').startsWith(today)).reduce((s, o) => s + parseFloat(o.total || 0), 0),
    totalOrders:    orders.length,
    todayOrders:    orders.filter(o => (o.created_at || '').startsWith(today)).length,
    pendingOrders:  orders.filter(o => !o.fulfillment || o.fulfillment === 'Pending').length,
    totalCustomers: customers.length,
    totalProducts:  products.length,
    lowStock:       lowStock.map(p => ({ id: p.id, name: p.name, stock: p.stock })),
    activeCoupons:  coupons.filter(c => c.active && !c.deleted_at).map(c => ({ code: c.code, type: c.type, value: c.value, used: c.used_count, max: c.max_uses })),
    recentOrders:   orders.slice(0, 8).map(o => ({ id: o.id, customer: o.customer_name, total: o.total, status: o.fulfillment, payment: o.payment_status })),
  };
}

// Server-side agent roster — the source of truth. The frontend only ever
// sends an agentId, never a persona, so a tampered client can't change
// what the model is told to be.
const AI_AGENTS = {
  CEO:         { name:'Aryan Shah',    role:'Chief Executive Officer',       grounded:true,  personality:'Decisive, data-driven CEO of Ascofizz. Synthesize the real numbers given to you, set priorities, make calls. Confident executive tone.' },
  CFO:         { name:'Priya Mehta',   role:'Chief Financial Officer',       grounded:true,  personality:'Meticulous CFO. Only cite the real revenue/order figures provided to you — never invent numbers. Flag financial risks plainly.' },
  CMO:         { name:'Sneha Patel',   role:'Chief Marketing Officer',       grounded:false, personality:'Analytical CMO for a premium Indian health supplement brand. No live ad/social data is connected yet — give strategic suggestions and clearly label them as recommendations, not reported results.' },
  Marketing:   { name:'Rahul Gupta',   role:'Marketing Manager',             grounded:false, personality:'Performance marketing manager. No Meta/Google Ads API is connected yet — propose campaign ideas and what to track once it is, instead of reporting invented numbers.' },
  Social:      { name:'Kavya Nair',    role:'Social Media Manager',          grounded:false, personality:'Social media manager for a health supplement brand. No Instagram/analytics API is connected — produce concrete content ideas (captions, hooks, formats) rather than invented follower counts.' },
  Leads:       { name:'Vikram Singh',  role:'Leads & Sales Manager',         grounded:true,  personality:'Sales manager. Use the real order/customer figures provided. Suggest cart-recovery and upsell ideas grounded in what is actually selling.' },
  Partnership: { name:'Ankit Sharma',  role:'Partnership Manager',           grounded:false, personality:'B2B partnership manager. No CRM/deal-pipeline data is connected — give strategic suggestions for distributor/retail outreach, clearly framed as ideas, not reported deals.' },
  Research:    { name:'Dr. Aditi Roy', role:'Research & Expansion Manager',  grounded:false, personality:'Market researcher for nutraceuticals in India. Speak in terms of general market knowledge and trends, not fabricated internal stats.' },
  Customer:    { name:'Meera Joshi',   role:'Customer Engagement Manager',   grounded:true,  personality:'Customer success manager. Use the real order/customer counts provided. Suggest retention actions grounded in real order patterns.' },
  COO:         { name:'Rohan Das',     role:'Chief Operating Officer',       grounded:true,  personality:'Operations lead. Use the real stock/fulfillment figures provided — flag actual low-stock items by name, never invented ones.' },
  CTO:         { name:'Zara Khan',     role:'Chief Technology Officer',      grounded:false, personality:'Technical lead for the e-commerce stack. Speak about automation/tech opportunities for this Node+Supabase backend in general terms.' },
};

function buildSystemPrompt(agentId, snapshot) {
  const a = AI_AGENTS[agentId];
  if (!a) return null;
  const dataBlock = a.grounded
    ? `REAL LIVE DATA (as of ${snapshot.asOf}) — use only these numbers, never invent others:
Total revenue: ₹${snapshot.totalRevenue.toLocaleString('en-IN')} | Today's revenue: ₹${snapshot.todayRevenue.toLocaleString('en-IN')}
Total orders: ${snapshot.totalOrders} | Today's orders: ${snapshot.todayOrders} | Pending fulfillment: ${snapshot.pendingOrders}
Total customers: ${snapshot.totalCustomers} | Total active products: ${snapshot.totalProducts}
Low stock (<20 units): ${snapshot.lowStock.map(p=>`${p.name} (${p.stock})`).join(', ') || 'none'}
Active coupons: ${snapshot.activeCoupons.map(c=>`${c.code} (${c.used}/${c.max||'∞'} used)`).join(', ') || 'none'}
Recent orders: ${snapshot.recentOrders.map(o=>`${o.customer||'?'} ₹${o.total} (${o.status})`).join('; ') || 'none'}`
    : `No live data feed is connected for your domain yet — be explicit that your suggestions are strategic recommendations, not reported results.`;

  return `You are ${a.name}, ${a.role} at ${BRAND.name} — ${BRAND_DESCRIPTOR}.
${a.personality}

${dataBlock}

Respond concisely: 2-5 sentences or short bullet points. No preamble, no "as an AI" disclaimers.`;
}

// Whitelisted, real action handlers — these are the ONLY things an
// approved action is allowed to do, each mirroring an existing admin
// capability that already exists elsewhere in this file.
const AI_ACTION_HANDLERS = {
  send_whatsapp_report: async (payload) => {
    const message = payload.message || await buildDailyReport();
    const ok = await sendWhatsAppReport(message);
    if (!ok) throw new Error('WhatsApp send failed — check Twilio credentials');
    return { sent: true, message };
  },
  create_coupon: async (payload) => {
    const { code, type, value, min_order, max_uses, expires_at, description } = payload;
    if (!code || !type || value === undefined) throw new Error('code, type, value required');
    const row = { code, type, value, min_order: min_order||null, max_uses: max_uses||null, expires_at: expires_at||null, active: true, description: description||null, created_at: new Date().toISOString(), used_count: 0 };
    const { data, error } = await supabase.from('coupons').insert([row]).select().single();
    if (error) throw error;
    return data;
  },
  update_product_price: async (payload) => {
    const { product_id, price, mrp } = payload;
    if (!product_id || price === undefined) throw new Error('product_id and price required');
    const body = { price, updated_at: new Date().toISOString() };
    if (mrp !== undefined) body.mrp = mrp;
    const { data, error } = await supabase.from('products').update(body).eq('id', product_id).select().single();
    if (error) throw error;
    return data;
  },
  update_product_stock: async (payload) => {
    const { product_id, stock } = payload;
    if (!product_id || stock === undefined) throw new Error('product_id and stock required');
    const { data, error } = await supabase.from('products').update({ stock, updated_at: new Date().toISOString() }).eq('id', product_id).select().single();
    if (error) throw error;
    return data;
  },
  update_order_status: async (payload) => {
    const { order_id, fulfillment } = payload;
    if (!order_id || !fulfillment) throw new Error('order_id and fulfillment required');
    const { data: old } = await supabase.from('orders').select('*').eq('id', order_id).single();
    const { data, error } = await supabase.from('orders').update({ fulfillment, updated_at: new Date().toISOString() }).eq('id', order_id).select().single();
    if (error) throw error;
    if (old && old.fulfillment !== fulfillment) {
      await supabase.from('order_status_logs').insert([{ order_id, old_status: old.fulfillment, new_status: fulfillment, changed_by: 'AI Agent (owner-approved)', created_at: new Date().toISOString() }]);
    }
    return data;
  },
};

// GET live snapshot (handy for the dashboard to show real KPI cards)
app.get('/api/owner/ai/snapshot', authMiddleware, ownerOnly, async (req, res) => {
  try { res.json(await getCompanySnapshot()); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

// Ask any single agent a question — pure insight, grounded in live data, no side effects.
app.post('/api/owner/ai/ask', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { agentId, task } = req.body || {};
    if (!agentId || !AI_AGENTS[agentId]) return res.status(400).json({ error: 'Unknown agentId' });
    if (!task) return res.status(400).json({ error: 'task is required' });
    const snapshot = await getCompanySnapshot();
    const system   = buildSystemPrompt(agentId, snapshot);
    const response = await callClaude({ system, prompt: task, maxTokens: 400 });
    res.json({ agentId, response });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Ask an agent to draft a REAL action — always lands as status:'pending', never executes itself.
app.post('/api/owner/ai/propose-action', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { agentId, instruction } = req.body || {};
    if (!agentId || !AI_AGENTS[agentId]) return res.status(400).json({ error: 'Unknown agentId' });
    if (!instruction) return res.status(400).json({ error: 'instruction is required' });

    const snapshot = await getCompanySnapshot();
    const persona  = buildSystemPrompt(agentId, snapshot);
    const types    = Object.keys(AI_ACTION_HANDLERS);
    const system = `${persona}

You must decide on ONE concrete action to propose for the owner to approve. Reply with ONLY a JSON object, no other text, no markdown fences, in this exact shape:
{"action_type": one of [${types.join(', ')}], "summary": "one sentence explaining the action in plain English", "payload": { ...fields required for that action_type... }}

Field reference:
send_whatsapp_report -> payload: { message }
create_coupon -> payload: { code, type: "percent"|"flat", value, min_order, max_uses, expires_at, description }
update_product_price -> payload: { product_id, price, mrp }
update_product_stock -> payload: { product_id, stock }
update_order_status -> payload: { order_id, fulfillment }

Use real product_id / order_id values from the live data context above when relevant. If you don't have a real id to act on, propose send_whatsapp_report with a useful message instead.`;

    const raw = await callClaude({ system, prompt: instruction, maxTokens: 400 });
    let parsed;
    try { parsed = JSON.parse(raw.trim().replace(/^```json|```$/g, '')); }
    catch { return res.status(502).json({ error: 'Agent did not return valid JSON', raw }); }

    if (!types.includes(parsed.action_type)) return res.status(400).json({ error: 'Agent proposed an unknown action_type', raw: parsed });

    const { data, error } = await supabase.from('ai_actions').insert([{
      agent_id: agentId, agent_name: AI_AGENTS[agentId].name,
      action_type: parsed.action_type, summary: parsed.summary || '',
      payload: parsed.payload || {}, status: 'pending',
      created_at: new Date().toISOString(),
    }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// List drafted actions (default: everything, ?status=pending to filter)
app.get('/api/owner/ai/actions', authMiddleware, ownerOnly, async (req, res) => {
  try {
    let q = supabase.from('ai_actions').select('*').order('created_at', { ascending: false }).limit(100);
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch(err) { res.status(500).json({ error: err.message, data: [] }); }
});

// Approve = actually execute the whitelisted handler for this action_type.
app.post('/api/owner/ai/actions/:id/approve', authMiddleware, ownerOnly, async (req, res) => {
  try {
    const { data: action } = await supabase.from('ai_actions').select('*').eq('id', req.params.id).single();
    if (!action) return res.status(404).json({ error: 'Action not found' });
    if (action.status !== 'pending') return res.status(400).json({ error: `Already ${action.status}` });

    const handler = AI_ACTION_HANDLERS[action.action_type];
    if (!handler) return res.status(400).json({ error: 'Unknown action_type' });

    try {
      const result = await handler(action.payload || {});
      const { data } = await supabase.from('ai_actions').update({
        status: 'executed', decided_at: new Date().toISOString(), decided_by: req.user.email, result,
      }).eq('id', req.params.id).select().single();
      await writeAudit({ userId: req.user.email, tableName: 'ai_actions', recordId: req.params.id, action: 'EXECUTE', newValues: { action_type: action.action_type, payload: action.payload } });
      res.json(data);
    } catch(execErr) {
      const { data } = await supabase.from('ai_actions').update({
        status: 'failed', decided_at: new Date().toISOString(), decided_by: req.user.email, result: { error: execErr.message },
      }).eq('id', req.params.id).select().single();
      res.status(500).json(data);
    }
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// ═══════════════════════════════════════════════════════════════
// RECAPTCHA
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
// IMAGE UPLOAD TO SUPABASE STORAGE
// Moved into media-routes.js — it covers the same upload/library
// endpoints PLUS the DELETE /api/upload/image/:filename "delete
// everywhere" route the admin's product-image slot picker calls
// (which didn't exist here before). Keeping both would double-
// register these paths, so the old inline handlers were removed.
// ═══════════════════════════════════════════════════════════════
try {
  app.use('/api', require('./media-routes')(supabase, [authMiddleware, adminOnly]));
  console.log('[mount] media-routes ✅');
} catch (e) { console.error('[mount] media-routes FAILED:', e.message); }

// ── Video upload → single canonical path ─────────────────────────
// The old inline /api/upload/video route duplicated media-routes.js's
// uploader but bypassed ffmpeg compression AND wrote a custom
// 'products/vid-…' path with no cleanup anywhere — anything uploaded
// through it became instant storage orphans. Admin never calls it
// (the panel posts to /api/upload/image with field name 'image'),
// so keep this endpoint alive as a thin forward: re-tag the uploaded
// file as field 'image' and hand it to the exact same canonical
// uploader the rest of the admin uses, so any old client keeps working.
try {
  const _mediaRouter = require('./media-routes')(supabase, [authMiddleware, adminOnly]);
  app.post('/api/upload/video', authMiddleware, adminOnly, multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // match media-routes cap
    fileFilter: (req, file, cb) => {
      const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only MP4, WebM, MOV, or AVI videos are allowed'));
    },
  }).single('video'), (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided (field name must be "video")' });
    // Rebuild a multipart body with field name 'image' (what the canonical
    // uploader expects) and hand it to that exact handler. This keeps one
    // uploader, one filename scheme, and one cleanup path for every file.
    const boundary = '----AscofizzForward' + Date.now().toString(36);
    const CRLF = '\r\n';
    const partHead = Buffer.from(
      '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="image"; filename="' + String(req.file.originalname).replace(/"/g, '') + '"' + CRLF +
      'Content-Type: ' + String(req.file.mimetype || 'application/octet-stream') + CRLF + CRLF
    );
    const partTail = Buffer.from(CRLF + '--' + boundary + '--' + CRLF);
    const newLen = partHead.length + req.file.buffer.length + partTail.length;
    // Rebuild the readable stream multer will parse from.
    const { PassThrough } = require('stream');
    const stream = new PassThrough();
    stream.end(Buffer.concat([partHead, req.file.buffer, partTail]));
    const origUrl = req.url;
    req.url = '/api/upload/image';
    req.headers['content-type'] = 'multipart/form-data; boundary=' + boundary;
    req.headers['content-length'] = String(newLen);
    delete req.body; delete req.file;
    req.pipe = stream.pipe.bind(stream);
    stream.pipe(req);
    _mediaRouter.handle(req, res, (err) => { req.url = origUrl; if (err) next(err); });
  });
} catch (e) { console.error('[mount] upload/video forward FAILED:', e.message); }

// ═══════════════════════════════════════════════════════════════
// PRODUCTS — with soft delete, audit, normalised
// ═══════════════════════════════════════════════════════════════
// The single most-requested endpoint: every page load, every visitor,
// and the answer is identical for all of them.
//
// The Cache-Control header below was already here, but it only ever
// instructed the BROWSER — and syncProductsFromBackend() deliberately
// appends ?_t=<timestamp> to defeat exactly that, so in practice every
// single page load reached Supabase for the same sixteen rows. The
// server-side cache is what actually stops that.
//
// 60s fresh, then up to 5 minutes of stale-while-revalidate, matching
// what the header already promised. An admin edit does not wait for
// either: the write paths call invalidate({tag:'products'}).
app.get('/api/products', cached(async () => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { data: data || [] };
}, { ttlMs: 60000, staleMs: 300000, tag: 'products' }));

app.get('/api/admin/products', authMiddleware, adminOnly, async (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma':        'no-cache',
      'Expires':       '0',
    });
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch(err) { res.status(500).json({ error: err.message, data: [] }); }
});

app.post('/api/admin/products', authMiddleware, requirePerm('products.create'), async (req, res) => {
  try {
    const b = req.body;
    const body = {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      active:     b.is_active !== undefined ? Boolean(b.is_active) : (b.active !== false),
      deleted_at: null,
    };

    const safeFields = [
      'name','brand','category','badge','description',
      'price','mrp','sale_price','offer_text','stock','rating','reviews',
      'image','image2','image3','image4','image5',
      'how_to_use','has_tiers','meta_description','hsn',
    ];
    safeFields.forEach(f => { if (b[f] !== undefined) body[f] = b[f]; });

    // mrp alias: frontend may send mrp as the base price field
    if (!body.price && b.mrp) body.price = b.mrp;
    if (!body.mrp && body.price) body.mrp = body.price;
    if ('sale_price' in b) body.sale_price = b.sale_price || null;

    const arrayFields = ['tags','key_ingredients','seo_keywords','tiers','images','media'];
    arrayFields.forEach(f => {
      const val = b[f];
      if (val === undefined) return;
      if (Array.isArray(val)) body[f] = val;
      else if (typeof val === 'string') {
        try { body[f] = JSON.parse(val); } catch { body[f] = val ? val.split(',').map(s=>s.trim()).filter(Boolean) : []; }
      }
    });

    console.log('[POST /api/admin/products] inserting:', JSON.stringify(body));
    const { data, error } = await supabase.from('products').insert([body]).select().single();
    cacheInvalidate({ tag: 'products' });
    if (error) {
      console.error('[POST /api/admin/products] supabase error:', error);
      throw error;
    }
    await writeAudit({ userId: req.user?.email, tableName: 'products', recordId: data.id, action: 'INSERT', newValues: { name: body.name }, ipAddress: req.ip });
    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate' });
    res.json(data);
  } catch(err) {
    console.error('[POST /api/admin/products]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// BULK PRODUCT OPERATIONS
//
// The admin Products screen has "select many, then activate / deactivate
// / delete". It implemented those by firing one request PER PRODUCT:
//
//   await Promise.all(ids.map(id => apiFetch(`/api/admin/products/${id}`,
//     { method:'PUT', body: JSON.stringify({ active }) })));
//
// Fifty selected products meant fifty HTTP requests, and each one landed
// on the single-row handler below, which does a SELECT, an UPDATE and an
// audit INSERT — so about a hundred and fifty database round trips to
// set one boolean on fifty rows. Concurrent rather than sequential, which
// only means the database gets all fifty at once.
//
// Every row in a bulk operation takes the SAME patch, so the whole thing
// is one `update ... where id in (...)` — a single statement, which is
// also a single transaction: it applies to every row or to none. That is
// the real win over Promise.all, where a failure at request 30 left 29
// products changed and 21 not, with no way to tell which.
//
// Registered before the /:id routes, and on POST, so neither path can be
// captured by `:id`.
// ═══════════════════════════════════════════════════════════════
const BULK_MAX_IDS = 500;      // refuse absurd payloads outright
const BULK_CHUNK   = 200;      // and split what we do accept

function parseBulkIds(raw) {
  if (!Array.isArray(raw)) return { error: 'ids must be an array' };
  const ids = [...new Set(raw.map(Number).filter(Number.isFinite))];
  if (!ids.length) return { error: 'ids is empty' };
  if (ids.length > BULK_MAX_IDS) return { error: `Too many products at once (max ${BULK_MAX_IDS})` };
  return { ids };
}

app.post('/api/admin/products/bulk-update', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { ids, error: idErr } = parseBulkIds(req.body?.ids);
    if (idErr) return res.status(400).json({ error: idErr });

    // Identical permission and field rules to the single-row PUT below —
    // a bulk edit must not become a way around them.
    const patch = { ...(req.body?.patch || {}) };
    const _stripped = stripForbiddenFields(req.user.role, patch, PRODUCT_FIELD_PERMS);
    if (_stripped.length) {
      console.log(`[perm] ${req.user.role} ${req.user.email} tried to bulk-change ${_stripped.join(', ')} — ignored`);
    }
    const safeFields = [
      'name','brand','category','badge','description',
      'price','mrp','sale_price','offer_text','stock','active','rating','reviews',
      'how_to_use','has_tiers','meta_description','hsn','deleted_at',
    ];
    const body = { updated_at: new Date().toISOString() };
    safeFields.forEach(f => { if (patch[f] !== undefined) body[f] = patch[f]; });
    if (patch.is_active !== undefined) body.active = Boolean(patch.is_active);
    if (Object.keys(body).length === 1) {
      return res.status(400).json({ error: 'No permitted fields to update' });
    }

    let updated = 0;
    const auditRows = [];
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const slice = ids.slice(i, i + BULK_CHUNK);
      // One SELECT for the before-values the audit log needs, then one
      // UPDATE for the whole chunk.
      const { data: before } = await supabase.from('products').select('*').in('id', slice);
      const { data, error } = await supabase.from('products').update(body).in('id', slice).select('id');
      if (error) throw error;
      updated += (data || []).length;
      for (const old of (before || [])) {
        auditRows.push({
          userId: req.user?.email, tableName: 'products', recordId: old.id,
          action: 'BULK_UPDATE', oldValues: old, newValues: body, ipAddress: req.ip,
        });
      }
    }
    await writeAuditMany(auditRows);
    cacheInvalidate({ tag: 'products' });

    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate' });
    res.json({ success: true, updated, requested: ids.length });
  } catch (err) {
    console.error('[bulk-update]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/products/bulk-delete', authMiddleware, requirePerm('products.delete'), async (req, res) => {
  try {
    const { ids, error: idErr } = parseBulkIds(req.body?.ids);
    if (idErr) return res.status(400).json({ error: idErr });

    // Soft delete, exactly as the single-row DELETE does.
    const stamp = new Date().toISOString();
    let deleted = 0;
    const auditRows = [];
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const slice = ids.slice(i, i + BULK_CHUNK);
      const { data: before } = await supabase.from('products').select('*').in('id', slice);
      const { data, error } = await supabase.from('products')
        .update({ deleted_at: stamp, updated_at: stamp }).in('id', slice).select('id');
      if (error) throw error;
      deleted += (data || []).length;
      for (const old of (before || [])) {
        auditRows.push({
          userId: req.user?.email, tableName: 'products', recordId: old.id,
          action: 'BULK_SOFT_DELETE', oldValues: old, ipAddress: req.ip,
        });
      }
    }
    await writeAuditMany(auditRows);
    cacheInvalidate({ tag: 'products' });

    res.json({ success: true, deleted, requested: ids.length });
  } catch (err) {
    console.error('[bulk-delete]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const b = req.body;
    // Staff can correct stock and copy; only the owner sets prices. Forbidden
    // fields are dropped rather than the whole save being rejected, so an
    // admin editing stock on a form that also posts the current price still
    // gets their change saved — with the price left exactly as it was.
    const _stripped = stripForbiddenFields(req.user.role, b, PRODUCT_FIELD_PERMS);
    if (_stripped.length) {
      console.log(`[perm] ${req.user.role} ${req.user.email} tried to change ${_stripped.join(', ')} on product ${req.params.id} — ignored`);
    }
    const body = { updated_at: new Date().toISOString() };

    const safeFields = [
      'name','brand','category','badge','description',
      'price','mrp','sale_price','offer_text','stock','active','rating','reviews',
      'image','image2','image3','image4','image5',
      'how_to_use','has_tiers','meta_description','hsn','deleted_at',
    ];
    safeFields.forEach(f => { if (b[f] !== undefined) body[f] = b[f]; });

    if (b.is_active !== undefined) body.active = Boolean(b.is_active);
    if (!body.price && b.mrp) body.price = b.mrp;
    if (!body.mrp && body.price) body.mrp = body.price;
    if ('sale_price' in b) body.sale_price = b.sale_price || null;
    if ('deleted_at' in b) body.deleted_at = b.deleted_at || null;

    const arrayFields = ['tags','key_ingredients','seo_keywords','tiers','images','media'];
    arrayFields.forEach(f => {
      const val = b[f];
      if (val === undefined) return;
      if (Array.isArray(val)) body[f] = val;
      else if (typeof val === 'string') {
        try { body[f] = JSON.parse(val); } catch { body[f] = val ? val.split(',').map(s=>s.trim()).filter(Boolean) : []; }
      }
    });

    console.log('[PUT /api/admin/products/:id] updating:', req.params.id, JSON.stringify(body));
    const { data: old } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('products').update(body).eq('id', req.params.id).select().single();
    if (error) {
      console.error('[PUT /api/admin/products/:id] supabase error:', error);
      throw error;
    }
    await writeAudit({ userId: req.user?.email, tableName: 'products', recordId: req.params.id, action: 'UPDATE', oldValues: old, newValues: body, ipAddress: req.ip });
    // Drop the cached catalogue immediately. Waiting for the TTL would
    // show the admin their own edit from a minute ago and make them
    // think the save had failed.
    cacheInvalidate({ tag: 'products' });
    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
    res.json(data);
  } catch(err) {
    console.error('[PUT /api/admin/products/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, requirePerm('products.delete'), passwordGated, async (req, res) => {
  try {
    const { data: old } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    const { error } = await supabase.from('products').update({
      active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    if (error) throw error;
    await writeAudit({ userId: req.user?.email, tableName: 'products', recordId: req.params.id, action: 'SOFT_DELETE', oldValues: old, ipAddress: req.ip });
    res.json({ success: true });
  } catch(err) {
    console.error('[DELETE /api/admin/products/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id/restore', authMiddleware, requirePerm('products.delete'), async (req, res) => {
  try {
    const { error } = await supabase.from('products').update({
      active: true,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    if (error) throw error;
    await writeAudit({ userId: req.user?.email, tableName: 'products', recordId: req.params.id, action: 'RESTORE', ipAddress: req.ip });
    cacheInvalidate({ tag: 'products' });
    res.json({ success: true });
  } catch(err) {
    console.error('[PUT /api/admin/products/:id/restore]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Same answer for every visitor, keyed by id via the request URL.
// A 404 is thrown rather than returned, so it is never stored — a
// product that does not exist yet must not keep 404ing from cache
// after it is created.
app.get('/api/products/:id', cached(async (req) => {
  const { data, error } = await supabase.from('products')
    .select('*').eq('id', req.params.id).eq('active', true).is('deleted_at', null).single();
  if (error) { const e = new Error('Product not found'); e.status = 404; throw e; }
  return data;
}, { ttlMs: 60000, staleMs: 300000, tag: 'products' }));

// Legacy path — the admin panel calls /api/admin/products/:id/restore. This
// one carried authMiddleware and nothing else, so ANY signed-in customer
// could un-delete a discontinued product and put it back on sale. It now
// requires the same permission as the admin route it shadows.
app.put('/api/products/:id/restore', authMiddleware, requirePerm('products.delete'), async (req, res) => {
  try {
    await supabase.from('products').update({ active: true, deleted_at: null, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    await writeAudit({ userId: req.user?.email, tableName: 'products', recordId: req.params.id, action: 'RESTORE', ipAddress: req.ip });
    cacheInvalidate({ tag: 'products' });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// COUPONS — backend is the source of truth for CRUD and lifecycle
// ═══════════════════════════════════════════════════════════════
function couponNumber(value, { integer = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return integer ? Math.trunc(n) : n;
}

function couponValidationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function buildCouponPayload(body = {}, { creating = false } = {}) {
  const code = String(body.code || '').trim().toUpperCase();
  const type = String(body.type || '').trim().toLowerCase();
  const value = Number(body.value);
  const minOrder = couponNumber(body.min_order);
  const maxUses = couponNumber(body.max_uses, { integer: true });
  const maxDiscount = couponNumber(body.max_discount);
  const maxUsesPerCustomer = couponNumber(body.max_uses_per_customer, { integer: true });

  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) {
    throw couponValidationError('Coupon code must be 3–40 characters using letters, numbers, hyphens, or underscores');
  }
  if (!['percent', 'flat'].includes(type)) throw couponValidationError('Coupon type must be percent or flat');
  if (!Number.isFinite(value) || value <= 0) throw couponValidationError('Coupon value must be greater than 0');
  if (type === 'percent' && (value > 100 || value <= 0)) throw couponValidationError('Percent value must be between 0 and 100');
  if (type === 'flat' && maxDiscount != null && (!Number.isFinite(maxDiscount) || maxDiscount < 0)) {
    throw couponValidationError('Invalid maximum discount');
  }
  if (minOrder != null && (!Number.isFinite(minOrder) || minOrder < 0)) throw couponValidationError('Invalid minimum order value');
  if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 1)) throw couponValidationError('Max uses must be at least 1');
  if (maxUsesPerCustomer != null && (!Number.isFinite(maxUsesPerCustomer) || maxUsesPerCustomer < 1)) {
    throw couponValidationError('Max uses per customer must be at least 1');
  }

  return {
    code,
    type,
    value,
    min_order: minOrder,
    max_uses: maxUses,
    max_discount: maxDiscount,
    max_uses_per_customer: maxUsesPerCustomer,
    expires_at: body.expires_at || null,
    active: body.active !== false,
    description: String(body.description || '').trim() || null,
    ...(creating ? { created_at: new Date().toISOString(), used_count: 0, deleted_at: null } : {})
  };
}

function sendCouponError(res, err) {
  if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message });
  if (err?.code === '23505') return res.status(409).json({ error: 'A coupon with this code already exists' });
  return res.status(500).json({ error: err?.message || 'Coupon operation failed' });
}

app.get('/api/admin/coupons', authMiddleware, requirePerm('coupons.manage'), async (req, res) => {
  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});

app.post('/api/admin/coupons', authMiddleware, requirePerm('coupons.manage'), async (req, res) => {
  try {
    const payload = buildCouponPayload(req.body, { creating: true });
    const { data, error } = await supabase.from('coupons').insert([payload]).select().single();
    if (error) throw error;
    await writeAudit({ userId: req.user?.email, tableName: 'coupons', recordId: data.id, action: 'INSERT', newValues: { code: data.code, type: data.type, value: data.value } });
    res.status(201).json(data);
  } catch (err) { sendCouponError(res, err); }
});

app.put('/api/admin/coupons/:id', authMiddleware, requirePerm('coupons.manage'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw couponValidationError('Invalid coupon id');
    const { data: existing, error: lookupError } = await supabase.from('coupons').select('id, deleted_at').eq('id', id).single();
    if (lookupError || !existing) return res.status(404).json({ error: 'Coupon not found' });
    const payload = buildCouponPayload(req.body);
    if (existing.deleted_at && payload.active) throw couponValidationError('This coupon is deleted. Restore it before activating it');
    const { data, error } = await supabase.from('coupons').update(payload).eq('id', id).select().single();
    if (error) throw error;
    await writeAudit({ userId: req.user?.email, tableName: 'coupons', recordId: id, action: 'UPDATE', newValues: { code: data.code, type: data.type, value: data.value, active: data.active } });
    res.json(data);
  } catch (err) { sendCouponError(res, err); }
});

app.delete('/api/admin/coupons/:id', authMiddleware, requirePerm('coupons.manage'), passwordGated, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw couponValidationError('Invalid coupon id');
    const { data, error } = await supabase.from('coupons')
      .update({ active: false, deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, code, active, deleted_at')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Coupon not found' });
    await writeAudit({ userId: req.user?.email, tableName: 'coupons', recordId: id, action: 'DELETE', newValues: data });
    res.json({ success: true, data, message: 'Coupon deactivated and marked deleted' });
  } catch (err) { sendCouponError(res, err); }
});

app.post('/api/admin/coupons/:id/restore', authMiddleware, requirePerm('coupons.manage'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw couponValidationError('Invalid coupon id');
    const { data: existing, error: lookupError } = await supabase.from('coupons')
      .select('id, code, type, value, max_discount, active, deleted_at')
      .eq('id', id)
      .single();
    if (lookupError || !existing) return res.status(404).json({ error: 'Coupon not found' });
    if (existing.type === 'percent' && (Number(existing.value) <= 0 || Number(existing.value) > 100)) {
      return res.status(400).json({ error: 'Coupon cannot be restored until its percentage rate is valid (0–100%)' });
    }
    const { data, error } = await supabase.from('coupons')
      .update({ active: true, deleted_at: null })
      .eq('id', id)
      .select('id, code, type, value, max_discount, active, deleted_at')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Coupon not found' });
    await writeAudit({ userId: req.user?.email, tableName: 'coupons', recordId: id, action: 'RESTORE', newValues: data });
    res.json({ success: true, data, message: 'Coupon restored and activated' });
  } catch (err) { sendCouponError(res, err); }
});

app.post('/api/coupons/validate', couponLimiter, async (req, res) => {
  try {
    const { code, subtotal = 0, email } = req.body;
    if (!code) return res.status(400).json({ valid: false, message: 'No code provided' });
    const { data: coupon } = await supabase.from('coupons').select('*').eq('code', String(code).trim().toUpperCase()).maybeSingle();
    if (!coupon || !coupon.active || coupon.deleted_at) return res.json({ valid: false, message: 'Invalid or inactive coupon' });
    if (coupon.min_order && subtotal < coupon.min_order) return res.json({ valid: false, message: `Min order ₹${coupon.min_order} required` });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.json({ valid: false, message: 'Coupon expired' });
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return res.json({ valid: false, message: 'Usage limit reached' });
    if (coupon.type === 'percent' && (Number(coupon.value) <= 0 || Number(coupon.value) > 100)) return res.json({ valid: false, message: 'This percentage coupon is invalid' });
    if (coupon.max_uses_per_customer && email) {
      const { count } = await supabase.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_email', String(email).toLowerCase().trim())
        .eq('coupon_code', String(code).trim().toUpperCase()).is('deleted_at', null);
      if ((count || 0) >= coupon.max_uses_per_customer) {
        return res.json({ valid: false, message: 'You have already used this coupon' });
      }
    }
    let discount = coupon.type === 'percent' ? Math.round(subtotal * coupon.value / 100) : Math.min(coupon.value, subtotal);
    if (coupon.max_discount != null) discount = Math.min(discount, Number(coupon.max_discount));
    res.json({ valid: true, code: coupon.code, type: coupon.type, value: coupon.value, discount, max_discount: (coupon.max_discount != null ? Number(coupon.max_discount) : null), label: coupon.type === 'percent' ? `${coupon.value}% OFF` : `₹${coupon.value} OFF` });
  } catch(err) { res.status(500).json({ valid: false, message: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// ORDERS — full stored procedure based
// ═══════════════════════════════════════════════════════════════
// Aug 2026 pass: pagination — the old call returned every non-deleted
// order on every load; page/limit cap the payload and let the panel
// page into history instead of a blind limit(200).
app.get('/api/admin/orders', authMiddleware, adminOnly, async (req, res) => {
  const { paginate } = require('./paginate');
  await paginate(req, res,
        supabase.from('orders').select('*', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }),
    { defaultLimit: 50, maxLimit: 5000 }
  );
});
app.get('/api/admin/orders/:id', authMiddleware, adminOnly, async (req, res) => {
  const { data } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
  if (!data) return res.status(404).json({ error: 'Not found' });
  const { data: history } = await supabase.from('order_status_logs').select('*').eq('order_id', req.params.id).order('created_at', { ascending: true });
  res.json({ data: { ...data, status_history: history || [] } });
});

app.get('/api/orders/my', authMiddleware, async (req, res) => {
  // An order belongs to the logged-in customer when EITHER the order's
  // customer_email matches the account email OR the order's user_id matches
  // the account id (account-linked orders created after sign-in). Using
  // .or() guarantees the storefront My Account list shows every order the
  // customer owns — before this fix, account-linked orders (user_id set,
  // customer_email still matching) could be silently hidden.
  // NOTE: 'order_number' column does NOT exist on orders (removed in a past
  // migration) — including a nonexistent column made this endpoint always
  // return [] even for valid customers. Columns verified live 2026-08-16.
  // 2026-08 FIX (owner report): this select list did NOT include
  // customer_email — and loadOrdersList / refreshAccountWelcome filter
  // every returned row on o.customer_email, so ALL backend orders were
  // silently dropped and My Orders showed "No orders yet" while the
  // Returns and VitaPoints panels (which query their own endpoints) still
  // showed every order. payment_method/gateway + coupon + vita columns
  // let the order cards and invoices show the method and the discount
  // breakdown that the customer actually got.
  // SECURITY (audit OZ-01): this used to build the ownership filter by string
  // interpolation —
  //     .or(`customer_email.eq.${req.user.email},user_id.eq.${req.user.id}`)
  // — which put a customer-chosen value directly into PostgREST filter syntax.
  // An account registered as `a,id.neq.z@gmail.com` turned the comma into a
  // condition separator and the middle term matched EVERY order, so one signup
  // returned the whole table: names, emails, items and totals.
  //
  // The identity was always correct (it comes from the token, never the body);
  // the flaw was building query SYNTAX out of it. Rewritten as two parameterised
  // queries whose values can never be parsed as operators, merged here. Cost is
  // one extra round trip on a page that loads a customer's own history.
  const COLS = 'id,customer_name,customer_email,total,payment_status,payment_method,payment_gateway,fulfillment,created_at,delivered_at,shipping,items,user_id,coupon_code,vita_points_earned,vita_points_redeemed,tier_discount,mix_match_discount,coupon_discount,vita_points_discount,vita_points_used';

  const byEmail = await supabase.from('orders')
    .select(COLS).eq('customer_email', req.user.email).is('deleted_at', null);
  if (byEmail.error) console.error('[orders/my] email query failed:', byEmail.error.message, byEmail.error.details);

  // Account-linked orders: only when the token actually carries an id. The old
  // template produced the literal string "user_id.eq.undefined" for admin/owner
  // tokens and for any customer token minted without one.
  let byUser = { data: [], error: null };
  if (req.user.id !== undefined && req.user.id !== null && req.user.id !== '') {
    byUser = await supabase.from('orders')
      .select(COLS).eq('user_id', req.user.id).is('deleted_at', null);
    if (byUser.error) console.error('[orders/my] user_id query failed:', byUser.error.message, byUser.error.details);
  }

  // Union by order id — an order matching both filters must appear once.
  const merged = new Map();
  for (const row of [...(byEmail.data || []), ...(byUser.data || [])]) merged.set(row.id, row);
  const data = [...merged.values()]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json({ data });
});

// PDF TAX INVOICE — customer downloads a printable A4 PDF, never an HTML
// file. Auth: own order only (admin orders handled by the admin panel's
// own print path). Streams the document directly as application/pdf.
app.get('/api/orders/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const { data: row } = await supabase.from('orders')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (!row) return res.status(404).json({ error: 'Order not found' });
    if (String(row.customer_email || '').toLowerCase() !== String(req.user.email).toLowerCase()) {
      return res.status(403).json({ error: 'Not your order' });
    }
    const { buildInvoicePDF } = require('./invoice-pdf');
    buildInvoicePDF(row, res); // streams application/pdf into res
  } catch (err) {
    console.error('[invoice-pdf] failed for', req.params.id, err);
    if (!res.headersSent) res.status(500).json({ error: 'Invoice generation failed' });
  }
});

// SECURITY (was: no auth, no price recompute — anyone could POST an order
// at any price with any payment_status). Now: must be signed in, the total
// is recomputed server-side, and payment/fulfilment state cannot be set
// by the caller.
app.post('/api/orders', authMiddleware, orderLimiter, async (req, res) => {
  try {
    const body = { ...req.body };
    // Caller may never dictate money or fulfilment state.
    delete body.payment_status; delete body.fulfillment; delete body.payment_gateway;
    // SECURITY AUDIT FIX (pre-launch 2026-08): the insert whitelist in
    // sp_place_order includes vita_points_earned (the server stamps the
    // earned points after delivery confirmation), so a signed-in caller
    // could send body.vita_points_earned = 99999 and have it persisted
    // on their own order row — corrupting the invoice and admin display.
    // Earned points are computed by awardVitaPoints() and nothing else
    // may set them. Strip the field here so it can never reach the DB.
    delete body.vita_points_earned;
    body.customer_email = req.user.email;            // bind to the JWT, not the body
    // FIX (Aug 2026, owner report): the JWT only proves the token's signature
    // — it can carry ANY email, so an order could be placed with a token
    // that is not tied to a real account. Require a matching row in the
    // customers table (not soft-deleted), bind the order to that account,
    // and capture client IP + device fingerprint for fraud review.
    const _cust = await supabase
      .from('customers')
      .select('id, name, deleted_at')
      .eq('email', String(req.user.email).toLowerCase().trim())
      .maybeSingle();
    // A soft-deleted account may never place new orders.
    if (_cust?.data?.deleted_at) {
      return res.status(403).json({ error: 'This account is deactivated. Please contact support to restore it.' });
    }
    // No customer row yet (checkout used a token that was never tied to an
    // account): create one now so the order is bound to a real account and
    // never floats anonymous again.
    if (!_cust?.data) {
      const nameClean = String(body.customer_name || req.user.name || '').replace(/[<>]/g, '').trim().slice(0, 80) || 'Customer';
      const phoneClean = String(body.customer_phone || '').replace(/[^\d+\-() ]/g, '').slice(0, 20);
      const { data: created, error: createErr } = await supabase
        .from('customers')
        .insert([{ name: nameClean, email: String(req.user.email).toLowerCase().trim(), phone: phoneClean, password: null, created_at: new Date().toISOString() }])
        .select('id, name, phone')
        .single();
      if (createErr) {
        console.warn('[ORDER] could not create customer row for', req.user.email, createErr.message);
      } else {
        body.user_id = created.id;
        if (!body.customer_name) body.customer_name = created.name;
        if (!body.customer_phone) body.customer_phone = created.phone;
      }
    } else {
      body.user_id = _cust.data.id;
    }
    // FIX (Aug 2026, owner report): even with the account gate above, a body
    // can still arrive with customer_name missing or blank (client sends an
    // empty value that bypasses the falsy check downstream), and the orders
    // table's NOT NULL constraint would then blow up the whole checkout.
    // Fail loudly and clearly instead: the customer sees a retryable error
    // rather than a "500" that looks like payment was lost.
    if (!body.customer_name || !String(body.customer_name).trim()) {
      return res.status(400).json({ error: 'Please enter your name to complete the order.' });
    }
    body.customer_name = String(body.customer_name).trim().slice(0, 80);
    // The account rows created by the anonymous-order fix carry the placeholder
    // name "Customer". If the form's own name is blank we must not silently
    // stamp that placeholder onto the order — ask for a real name.
    if (!_cust?.data && body.customer_name === 'Customer') {
      return res.status(400).json({ error: 'Please enter your name to complete the order.' });
    }
    const items = typeof body.items === 'string' ? JSON.parse(body.items || '[]') : (body.items || []);
    if (!items.length) return res.status(400).json({ error: 'Order must contain items' });

    // ── IDEMPOTENCY ──────────────────────────────────────────────
    // The client retries this call when the network times out (Render
    // cold starts can exceed any sane timeout), and a timeout does not
    // mean the write failed. Without this guard the retry hit a duplicate
    // primary key and 500'd, so a successfully-saved order looked failed.
    // Returning the existing row keeps one order per order id — and,
    // because vita_award/vita_redeem are also idempotent per order_id,
    // one lot of points per order too.
    if (body.id) {
      const { data: existing } = await supabase.from('orders')
        .select('*').eq('id', body.id).maybeSingle();
      if (existing) {
        if ((existing.customer_email || '').toLowerCase() !== String(req.user.email).toLowerCase()) {
          return res.status(409).json({ error: 'That order reference is already in use.' });
        }
        return res.json({ data: existing, idempotent: true });
      }
    }

    const vita = await resolveVitaDiscount({
      email: req.user.email, pointsRequested: body.vita_points, orderId: body.id, commit: true,
    });
    const recalculated = await computeServerSideTotal(items, body.coupon_code, { vitaRupees: vita.rupees, customerEmail: req.user.email });

    // FIX (audit #13): record who ordered from where, and flag unusual
    // velocity for a human to review. Recorded and alerted, never
    // auto-blocked — silently refusing a real customer is worse than
    // raising an alert someone can look at.
    const _ip = clientIpOf(req);
    body.client_ip = _ip;
    body.device_fp = body.device_fp ? String(body.device_fp).slice(0, 128) : null;
    const _vel = await checkVelocity({ email: req.user.email, ip: _ip });
    if (_vel.flagged) {
      raiseAlert({
        severity: 'high', category: 'fraud',
        title: 'Unusual order velocity', orderId: body.id,
        detail: { email: req.user.email, ip: _ip, reasons: _vel.reasons },
      });
    }
    recordVelocity('email', req.user.email, 'order');
    recordVelocity('ip', _ip, 'order');

    // Persist the FULL breakdown, not just the final figure. These columns
    // were never written (all rows read 0.00), so the invoice and order
    // history had no way to show a correct subtotal/discount/shipping split
    // and had to re-derive it — which is how they came to disagree.
    body.total    = recalculated.total;
    body.subtotal = recalculated.subtotal;
    // VitaPoints reduce `total` but were left out of `discount`, so the row
    // did not foot: subtotal - discount + shipping came out higher than total
    // by exactly the rupee value of the points. Points belong in `discount`
    // alongside the coupon; the point count stays in vita_points_redeemed so
    // the two views can always be reconciled against each other.
    body.discount = Number(((recalculated.discount || 0) + (recalculated.mixMatchDiscount || 0) + (recalculated.vitaDiscount || 0)).toFixed(2));
    body.shipping = recalculated.shippingFee;
    // Per-component discount columns (tier / mix-match / coupon / VitaPoints)
    // — the same detail the three confirm paths write, so this direct path
    // never creates rows whose invoices disagree with the others.
    const { persistBreakdown: _ordersPersist } = require('./order-breakdown');
    _ordersPersist(body, recalculated);
    try {
      assertOrderFoots(body, 'api/orders');
    } catch (footErr) {
      console.error('[orders] ' + footErr.message);
      await releaseVitaReservation(body.id, 'order rejected — total did not reconcile');
      return res.status(500).json({ error: 'Order total could not be reconciled. Please try again.' });
    }
    body.vita_points_redeemed = vita.points;
    body.payment_status = 'COD - Pending';
    body.fulfillment    = 'Pending';
    let order;
    try {
      order = await sp_place_order(body);
    } catch (saveErr) {
      // The points were spent a few lines above. If the insert fails —
      // out of stock is the common one — hand them back rather than
      // charging the customer a balance for an order that does not exist.
      await releaseVitaReservation(body.id, 'order not created — ' + (saveErr.message || 'save failed'));
      throw saveErr;
    }

    // COD earns NOTHING at order time. Spec: a COD parcel that is refused
    // or returned to origin was never really a sale, so points are only
    // created once the courier confirms delivery AND cash is collected —
    // the Delhivery webhook calls awardVitaPoints() at that point.
    // Prepaid orders earn here (see confirm-gokwik-order) because the money
    // is already taken.

    res.json({ data: order });
    // FIX (Aug 2026, owner report): the email used to fire before the order
    // was confirmed to exist (the log showed "[EMAIL] Order confirmation
    // sent" and THEN a not-null INSERT failure). It is sent only after the
    // row is persisted, and never if anything downstream threw.
    sendOrderEmail(order).catch(e => console.warn('[ORDER EMAIL]', e.message));
  } catch(err) {
    console.error('[ORDER]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// VITAPOINTS — order status change handler
//
// ONE place that decides what happens to points when an order's
// fulfilment changes, called BOTH from the Delhivery webhook and from
// the admin panel's manual status update. Keeping them on separate code
// paths is what caused orders to sit Delivered with 0 points: the
// webhook had the hooks, the admin panel didn't.
//
// Everything here is idempotent per order id, so a courier webhook and
// an admin edit for the same order cannot double-award or double-reverse.
// ═══════════════════════════════════════════════════════════════
async function applyVitaOrderStatusChange(order, newStatus, actor) {
  if (!order || !newStatus) return;
  const status = String(newStatus);

  try {
    if (status === 'Delivered') {
      // COD earns for the FIRST time here — the parcel arrived and the
      // cash was collected, so the sale is finally real. Prepaid already
      // earned at payment; vita_earn_on_order is idempotent per order id,
      // so calling it again is a safe no-op.
      const eligible = Math.max(0, (Number(order.total) || 0) - (Number(order.shipping) || 0));
      await awardVitaPoints(order, { eligibleValue: eligible });
      const deliveredAt = new Date().toISOString();
      // Start the return/verification clock. Points become spendable
      // release_hold_days after this, via vita_release_due().
      await supabase.rpc('vita_mark_delivered', {
        p_order: order.id, p_delivered_at: deliveredAt,
      });
      // Stamp the order itself as well. vita_mark_delivered records the
      // date inside the VitaPoints tables only, so orders.delivered_at —
      // which is what the 7-day return window is measured from — was never
      // written by anyone, and returns fell back to counting from the
      // order date. See 004_returns_delivered_at.sql. Written only when
      // still null so a re-delivery webhook cannot extend the window, and
      // tolerant of the column being absent on an instance that has not
      // run 004 yet: a failure here must not roll back the points award.
      try {
        const { error: dErr } = await supabase
          .from('orders')
          .update({ delivered_at: deliveredAt })
          .eq('id', order.id)
          .is('delivered_at', null);
        if (dErr) throw dErr;
      } catch (e) {
        console.warn('[vita] could not stamp orders.delivered_at — run 004_returns_delivered_at.sql:', e.message);
      }
      return;
    }

    if (status === 'Returned') {
      await supabase.rpc('vita_reverse_order', {
        p_order: order.id, p_returned_value: null,
        p_reason: 'order returned' + (actor ? ` (by ${actor})` : ''),
        p_type: 'RETURN_REVERSAL', p_key: 'rto:' + order.id,
      });
      await refundVitaRedemption(order.id, 'order returned');
      return;
    }

    if (status === 'Cancelled') {
      // Cancelled before delivery — nothing was ever really earned, so
      // cancel the pending bucket outright rather than treating it as a
      // return (which would risk creating debt for points never spendable).
      await supabase.rpc('vita_reverse_order', {
        p_order: order.id, p_returned_value: null,
        p_reason: 'order cancelled' + (actor ? ` (by ${actor})` : ''),
        p_type: 'CANCELLATION_REVERSAL', p_key: 'cancel:' + order.id,
      });
      await refundVitaRedemption(order.id, 'order cancelled');
    }
  } catch (e) {
    // Never let a loyalty hook break an order status update.
    console.warn(`[vita] status hook failed for ${order.id} -> ${status}:`, e.message);
  }
}

app.put('/api/admin/orders/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const body = { ...req.body, updated_at: new Date().toISOString() };
    // Staff move orders through fulfilment; only the owner changes what an
    // order is worth or whether it counts as paid.
    const _stripped = stripForbiddenFields(req.user.role, body, ORDER_FIELD_PERMS);
    if (_stripped.length) {
      console.log(`[perm] ${req.user.role} ${req.user.email} tried to change ${_stripped.join(', ')} on order ${req.params.id} — ignored`);
      await raiseAlert({
        severity: 'warn', category: 'security', orderId: req.params.id,
        title: 'Staff attempted to edit order money fields',
        detail: `${req.user.email} tried to change: ${_stripped.join(', ')}`,
      });
    }
    const { data: old } = await supabase.from('orders').select('*').eq('id', req.params.id).single();

    // ── LEGAL STATUS TRANSITIONS (Aug 2026 1000-scenario audit) ─────
    // The panel could move ANY order to ANY state — including Delivered
    // back to Pending. That is not a fulfilment step: it is an erasure
    // of the delivery record that wipes the customer's earned points,
    // the delivery clock on returns, and the financial record of the
    // sale. Reversals of a delivered/returned order must go through
    // the Returns flow (which runs the proper reversal, refund and
    // stock hooks), never through a manual flip.
    //
    // Allowed: forward fulfilment (Pending→Shipped→Delivered), the
    // normal cancellation/return paths, and re-shipping a shipped
    // order back to Pending (courier picked it up before the order was
    // actually dispatched). The DB trigger mirrors fulfillment <->
    // status, so the rule applies to whichever field the panel sends.
    const LEGAL_TRANSITIONS = {
      Pending:    ['Shipped', 'Cancelled', 'Delivered'],
      Shipped:    ['Delivered', 'Pending', 'Returned', 'Cancelled'],
      Delivered:  ['Returned', 'Cancelled'],
      Returned:   [],
      Cancelled:  [],
    };
    const newFulfil = String(body.fulfillment || body.status || old?.fulfillment || '').trim();
    const oldFulfil = old ? String(old.fulfillment || '').trim() : '';
    if (old && newFulfil && newFulfil !== oldFulfil && body.fulfillment !== undefined) {
      const allowed = LEGAL_TRANSITIONS[oldFulfil] || [];
      if (!allowed.includes(newFulfil)) {
        await raiseAlert({
          severity: 'warn', category: 'security', orderId: req.params.id,
          title: `Illegal order status transition blocked: ${oldFulfil} → ${newFulfil}`,
          detail: `${req.user?.email} tried to move order ${req.params.id} from ${oldFulfil} to ${newFulfil} — rejected. Use the Returns flow instead.`,
        });
        return res.status(400).json({
          error: `Cannot move an order from ${oldFulfil} to ${newFulfil}. If this order must be reversed, process a Return so the payment, shipping and VitaPoints hooks all run correctly.`,
        });
      }
    }

    // ── COD AUTO-COLLECTION ─────────────────────────────────────
    // FIX (Aug 2026 audit — "COD orders show Unpaid"):
    // Delivered COD orders were only marked collected when the courier
    // auto-sync saw a waybill, or when the admin panel happened to send
    // payment_status itself. Anything delivered without a courier
    // reference (manual deliveries, trigger-bypass writes) sat forever
    // in 'COD - Pending' and made the finance dashboard understate
    // collected revenue. The admin API is the source of truth: moving
    // a COD order to Delivered means the cash was collected at the
    // door, so the backend forces the collected flag here.
    if (body.fulfillment === 'Delivered' && /cod/i.test(String(old?.payment_method || ''))) {
      const cur = (old.payment_status || '').toLowerCase();
      if (!cur.includes('paid') && !cur.includes('collected')) {
        body.payment_status = 'Paid - COD Collected';
      }
    } else if ((body.fulfillment === 'Cancelled' || body.fulfillment === 'Returned')
        && (old.payment_status || '') === 'COD - Collected') {
      // Courier/panel walked back a delivered COD order — the cash is
      // no longer counted as revenue. (Real refunds keep the panel's
      // manual-refund flow; this covers the delivery-reversal case.)
      body.payment_status = 'COD - Pending';
    }

    const { data, error } = await supabase.from('orders').update(body).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (old && body.fulfillment && body.fulfillment !== old.fulfillment) {
      await supabase.from('order_status_logs').insert([{
        order_id: req.params.id, old_status: old.fulfillment, new_status: body.fulfillment,
        // FIX (Aug 2026 audit): admin-panel flips were logging with
        // changed_by = NULL — indistinguishable from DB-trigger noise,
        // which made the ~444 trigger-flip log rows look like mystery
        // events. The panel's actor is now always recorded.
        changed_by: req.user?.email,
        note: body.shiprocket_id ? `SR: ${body.shiprocket_id}` : 'manual admin change',
        created_at: new Date().toISOString(),
      }]);

      // ── VITAPOINTS ─────────────────────────────────────────────
      // These hooks used to live ONLY in the Delhivery webhook, so an
      // order marked Delivered by hand in the admin panel awarded
      // nothing — orders sat Delivered with 0 points and customers
      // reported "points never arrive". Courier webhook and manual
      // admin change must behave identically. Every function called
      // here is idempotent per order id, so if the webhook already
      // fired for this order these are harmless no-ops.
      await applyVitaOrderStatusChange(data || old, body.fulfillment, req.user?.email);

      // ── STOCK ──────────────────────────────────────────────────
      // The exact mirror of the bug above: this route reversed the
      // points and never put the stock back, because only
      // sp_cancel_order did that and the admin panel does not go
      // through it. So cancelling from the panel wrote the inventory
      // off permanently, while cancelling from My Account restored it —
      // the two paths each did half the job.
      //
      // A Returned parcel is saleable stock again for the same reason a
      // cancelled one is; both come back to the shelf.
      //
      // Only on the way IN to one of those states from a state that
      // still had the stock committed. The enclosing
      // `body.fulfillment !== old.fulfillment` stops a straight re-save,
      // but not Cancelled -> Returned, which is a real transition
      // between two states that have both already given the packs back.
      if (isStockRestoredState(body.fulfillment) && !isStockRestoredState(old.fulfillment)) {
        try {
          await restoreStockForOrder(old, body.fulfillment.toLowerCase());
        } catch (e) {
          console.warn(`[stock] restore failed for ${req.params.id}:`, e.message);
        }
      }

      // FIX (audit #13): a refused/returned COD parcel is the core COD-abuse
      // signal — recorded so checkVelocity can see repeat offenders.
      if (body.fulfillment === 'Returned' && /cod/i.test(String(old.payment_method || ''))) {
        recordVelocity('email', old.customer_email, 'cod_refused');
        if (old.client_ip) recordVelocity('ip', old.client_ip, 'cod_refused');
      }
    }
    await writeAudit({ userId: req.user?.email, tableName: 'orders', recordId: req.params.id, action: 'UPDATE', oldValues: old, newValues: body, ipAddress: req.ip });
    cacheInvalidate({ tag: 'dashboard' });
    res.json(data);
  } catch(err) { res.status(500).json({ error: err.message }); }
});


app.delete('/api/admin/orders/:id', authMiddleware, requirePerm('orders.delete'), passwordGated, async (req, res) => {
  try {
    const { data: old } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    await supabase.from('orders').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', req.params.id);
    await writeAudit({ userId: req.user?.email, tableName: 'orders', recordId: req.params.id, action: 'SOFT_DELETE', oldValues: old });
    cacheInvalidate({ tag: 'dashboard' });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


/* ADMIN STATS — store-wide, identical for every admin → shared cache.
   The three full-table pulls below are the same on every dashboard paint,
   so one 15s-fresh copy serves all admin refreshes. */
app.get('/api/admin/stats', authMiddleware, adminOnly, cached(async (req) => {
    const [ordersR, prodsR, custsR] = await Promise.all([
      supabase.from('orders').select('id,total,payment_status,fulfillment,created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(1000),
      supabase.from('products').select('id,name,stock,active').eq('active', true).is('deleted_at', null),
      supabase.from('customers').select('id').is('deleted_at', null),
    ]);
    const orders = ordersR.data || [], products = prodsR.data || [], customers = custsR.data || [];
    const today  = new Date().toISOString().split('T')[0];
    const isPaid  = o => { const s = (o.payment_status||'').toLowerCase(); return s.includes('paid') || s === 'success'; };
    const isCollectedCOD = o => (o.payment_status||'').toLowerCase().includes('collected');
    const isPendingCOD = o => { const s = (o.payment_status||'').toLowerCase(); return s.includes('cod') && !s.includes('paid'); };
    const paid    = orders.filter(isPaid);
    const collected = orders.filter(o => isPaid(o) || isCollectedCOD(o));
    const pendingCOD = orders.filter(isPendingCOD);
    return { stats: {
      totalRevenue:   orders.reduce((s, o) => s + parseFloat(o.total || 0), 0),
      paidRevenue:    collected.reduce((s, o) => s + parseFloat(o.total || 0), 0),
      codOutstanding: pendingCOD.reduce((s, o) => s + parseFloat(o.total || 0), 0),
      totalOrders:    orders.length,
      totalCustomers: customers.length,
      totalProducts:  products.length,
      pendingOrders:  orders.filter(o => !o.fulfillment || o.fulfillment === 'Pending').length,
      todayOrders:    orders.filter(o => (o.created_at || '').startsWith(today)).length,
      todayRevenue:   orders.filter(o => (o.created_at || '').startsWith(today)).reduce((s, o) => s + parseFloat(o.total || 0), 0),
      todayPaidRevenue: collected.filter(o => (o.created_at || '').startsWith(today)).reduce((s, o) => s + parseFloat(o.total || 0), 0),
      lowStockCount:  products.filter(p => p.stock < 20).length,
    }};
}, { ttlMs: 15000, staleMs: 60000, tag: 'dashboard', shared: true }));

// ═══════════════════════════════════════════════════════════════
// CUSTOMERS — soft delete + restore
// ═══════════════════════════════════════════════════════════════
// Aug 2026 pass: pagination — full table on every load before.
app.get('/api/admin/customers', authMiddleware, adminOnly, async (req, res) => {
  const { paginate } = require('./paginate');
  await paginate(req, res,
    supabase.from('customers').select('*', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }),
    { defaultLimit: 50 }
  );
});

app.delete('/api/admin/customers/:id', authMiddleware, requirePerm('customers.delete'), passwordGated, async (req, res) => {
  try {
    const { data: old } = await supabase.from('customers').select('*').eq('id', req.params.id).single();
    await supabase.from('customers').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', req.params.id);
    await writeAudit({ userId: req.user?.email, tableName: 'customers', recordId: req.params.id, action: 'SOFT_DELETE', oldValues: old });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/customers/:id/restore', authMiddleware, requirePerm('customers.delete'), async (req, res) => {
  try {
    await supabase.from('customers').update({ deleted_at: null, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Aug 2026 pass: pagination — limit(200) with no older access before;
// page/limit now reaches the full history.
app.get('/api/admin/audit', authMiddleware, requirePerm('audit.view'), async (req, res) => {
  const { paginate } = require('./paginate');
  await paginate(req, res,
    supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
    { defaultLimit: 50 }
  );
});

// ═══════════════════════════════════════════════════════════════
// WHATSAPP REPORTS
// ═══════════════════════════════════════════════════════════════
app.post('/api/admin/whatsapp/send-report', authMiddleware, requirePerm('whatsapp.send'), async (req, res) => {
  try {
    const report = req.body.message || await buildDailyReport();
    const ok = await sendWhatsAppReport(report);
    if (ok) res.json({ success: true, message: 'WhatsApp report sent!' });
    else res.status(500).json({ error: 'Failed to send. Check Twilio credentials.' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/whatsapp/preview', authMiddleware, requirePerm('whatsapp.send'), async (req, res) => {
  try {
    const report = await buildDailyReport();
    res.json({ report });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════

const GK_BASE = (process.env.GOKWIK_ENV || '').toUpperCase() === 'PRODUCTION'
  ? 'https://gkx.gokwik.co'
  : 'https://gkx.gokwik.co'; // GoKwik uses same base; sandbox uses test creds
console.log(`[GoKwik] Endpoint: ${GK_BASE} | ENV: ${process.env.GOKWIK_ENV || 'not set'}`);

// ── Create GoKwik Payment Link ──
app.post('/api/create-gokwik-order', paymentLimiter, async (req, res) => {
  try {
    const body     = req.body || {};
    let   amount   = parseFloat(body.amount || body.order_amount || 0);
    const phone    = String(body.customer_phone || body.customer?.phone || '').replace(/\D/g,'').slice(-10);
    const name     = body.customer_name  || body.customer?.name  || 'Customer';
    const email    = body.customer_email || body.customer?.email || '';
    const refId    = body.merchant_reference_id || body.order_id || ('ASC-' + Date.now());
    const desc     = body.description || `Payment for order ${refId}`;
    const mode     = body.mode || 'standard'; // 'standard' or 'upi-deeplink'

    // ── Never trust the client-supplied amount — recompute from real product
    // prices whenever the cart is provided, so a tampered request can't open
    // a payment link for less than the cart is actually worth.
    // SECURITY: this used to be `if (body.items)`. Omitting `items` skipped the
    // recompute entirely and the client-supplied `amount` was used — so a
    // tampered request could open a ₹1 payment link for a ₹3,000 cart.
    // Items are now mandatory; there is no path that trusts the client amount.
    if (!body.items || (Array.isArray(body.items) && !body.items.length)) {
      return res.status(400).json({ error: 'Cart items are required to create a payment link' });
    }
    try {
      const jwtEmail = (() => {
        try {
          const auth = req.headers.authorization || '';
          if (!auth.startsWith('Bearer ')) return null;
          return jwt.verify(auth.slice(7), process.env.JWT_SECRET)?.email || null;
        } catch { return null; }
      })();
      const vita = await resolveVitaDiscount({
        email: jwtEmail || email, pointsRequested: body.vita_points, orderId: refId, commit: false,
      });
      const computed = await computeServerSideTotal(body.items, body.coupon_code, { vitaRupees: vita.rupees, customerEmail: jwtEmail || email });
      amount = computed.total;
    } catch (calcErr) {
      return res.status(400).json({ error: 'Could not verify cart total: ' + calcErr.message });
    }

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (!phone || phone.length !== 10) return res.status(400).json({ error: 'Invalid phone number (must be 10 digits)' });

    const GK_APP_ID     = process.env.GOKWIK_APP_ID;
    const GK_APP_SECRET = process.env.GOKWIK_APP_SECRET;
    if (!GK_APP_ID || !GK_APP_SECRET) {
      console.error('[GoKwik] Missing GOKWIK_APP_ID or GOKWIK_APP_SECRET env vars');
      return res.status(500).json({ error: 'GoKwik not configured. Set GOKWIK_APP_ID and GOKWIK_APP_SECRET in the environment.' });
    }

    const BACKEND_URL  = BRAND.apiUrl;
    const FRONTEND_URL = BRAND.siteUrl;

    // Expiry: 30 minutes from now (in UNIX timestamp)
    const expireAt = Math.floor(Date.now() / 1000) + (30 * 60);

    const payload = {
      amount,
      currency:               'INR',
      merchant_reference_id:  refId,
      mode,
      customer: {
        phone,
        name,
        ...(email ? { email } : {}),
      },
      notify: { sms: false, whatsapp: false, email: false },
      expire_at:   expireAt,
      description: desc,
      webhook_url: `${BACKEND_URL}/api/gokwik-webhook`,
    };

    console.log(`[GoKwik] Creating payment link: ${refId} ₹${amount}`);

    const r = await guardedFetch('gokwik', `${GK_BASE}/v1/payments/links`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'gk-app-id':     GK_APP_ID,
        'gk-app-secret': GK_APP_SECRET,
      },
      body: JSON.stringify(payload),
    }, GOKWIK_BREAKER);

    const data = await r.json();

    if (!r.ok || !data.success) {
      const errMsg = data?.error?.reference?.message || data?.error?.message || JSON.stringify(data);
      console.error(`[GoKwik] Create link FAILED (${r.status}):`, errMsg);
      return res.status(r.status || 500).json({ error: errMsg });
    }

    console.log(`[GoKwik] ✅ Link created: ${data.data.id} | url: ${data.data.short_url}`);
    res.json({
      success:              true,
      payment_link_id:      data.data.id,
      short_url:            data.data.short_url,
      merchant_reference_id: data.data.merchant_reference_id,
      status:               data.data.status,
      expire_at:            data.data.expire_at,
    });

  } catch(err) {
    console.error('[GoKwik] create-gokwik-order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Get/Verify GoKwik Payment Link Status ──
app.get('/api/verify-gokwik-order/:merchantRefId', async (req, res) => {
  try {
    const { merchantRefId } = req.params;
    const GK_APP_ID     = process.env.GOKWIK_APP_ID;
    const GK_APP_SECRET = process.env.GOKWIK_APP_SECRET;
    if (!GK_APP_ID || !GK_APP_SECRET) return res.status(500).json({ error: 'GoKwik not configured' });

    const r = await guardedFetch('gokwik', `${GK_BASE}/v1/payments/links?merchant_reference_id=${encodeURIComponent(merchantRefId)}`, {
      headers: { 'gk-app-id': GK_APP_ID, 'gk-app-secret': GK_APP_SECRET },
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();

    if (!r.ok || !data.success) {
      return res.status(r.status || 500).json({ error: 'Could not fetch link status', raw: data });
    }

    const link   = data.data;
    const status = link.status; // 'created' | 'paid' | 'cancelled'
    res.json({
      success:              true,
      status,
      paid:                 status === 'paid',
      payment_link_id:      link.id,
      merchant_reference_id: link.merchant_reference_id,
      short_url:            link.short_url,
      amount:               link.amount,
      expire_at:            link.expire_at,
    });

  } catch(err) {
    console.error('[GoKwik] verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GoKwik Webhook — receives payment status updates ──
app.post('/api/gokwik-webhook', express.json(), async (req, res) => {
  try {
    // SECURITY: this endpoint had no authentication of any kind. Anyone who
    // knew the URL could POST {data:{status:'paid',merchant_reference_id:'X'}}
    // and flip any order to paid. We now re-verify every event against
    // GoKwik's own API before believing it — signature headers vary by
    // account, so verification-by-callback is the portable guarantee.
    const event = req.body;
    const _refId = event?.data?.merchant_reference_id || event?.merchant_reference_id;
    const _status = event?.data?.status || event?.status;
    if (_status === 'paid' && _refId) {
      const GK_ID = process.env.GOKWIK_APP_ID, GK_SEC = process.env.GOKWIK_APP_SECRET;
      let verified = false;
      try {
        const vr = await guardedFetch('gokwik', `${GK_BASE}/v1/payments/links?merchant_reference_id=${encodeURIComponent(_refId)}`,
          { headers: { 'gk-app-id': GK_ID, 'gk-app-secret': GK_SEC }, signal: AbortSignal.timeout(15000) });
        const vd = await vr.json();
        verified = vr.ok && vd.success && vd.data && vd.data.status === 'paid';
      } catch (ve) {
        console.error('[GoKwik] webhook verification failed:', ve.message);
      }
      if (!verified) {
        console.warn(`[GoKwik] ⛔ Rejected unverified webhook for ${_refId}`);
        return res.status(202).json({ success: false, ignored: 'unverified' });
      }
      // SECURITY AUDIT FIX (pre-launch 2026-08): the verified-payment branch
      // confirmed the STATUS but never checked the AMOUNT paid against the
      // order's recalculated total — an attacker could pay a 1-paise link
      // and have the webhook flip the order to paid. The payment-links GET
      // returns the paid amount in vd.data.amount_collected/paid_amount.
      // The amount check here does NOT reject (verify-gokwik-order did the
      // authoritative check before the link was created and confirm-gokwik
      // rechecks on save), but a shortfall is flagged immediately as a
      // critical alert and the payment_status flip is held for review.
      const gkAmt = Number(vd.data.amount_collected ?? vd.data.paid_amount ?? vd.data.amount ?? 0);
      let orderTotal = null;
      try {
        const { data: _ord } = await supabase.from('orders').select('total').eq('id', _refId).maybeSingle();
        orderTotal = _ord ? Number(_ord.total) : null;
      } catch (_e) { /* alert path must never break the webhook */ }
      if (gkAmt > 0 && orderTotal != null && gkAmt + 1 < orderTotal) {
        await raiseAlert({ severity: 'critical', category: 'payment', orderId: _refId,
          title: 'GoKwik webhook: paid amount below order total',
          detail: { paid: gkAmt, expected: orderTotal, gateway: 'gokwik' } }).catch(() => {});
        console.error(`[GoKwik] ⚠ amount shortfall for ${_refId}: paid ₹${gkAmt} vs total ₹${orderTotal} — order left pending for review`);
        return res.status(202).json({ success: false, ignored: 'amount_shortfall' });
      }
    }
    console.log('[GoKwik] Webhook received:', JSON.stringify(event).slice(0, 300));

    const status  = event?.data?.status || event?.status;
    const refId   = event?.data?.merchant_reference_id || event?.merchant_reference_id;

    if (status === 'paid' && refId) {
      console.log(`[GoKwik] ✅ Payment confirmed for order: ${refId}`);
      // Update order in DB if stored before payment
      try {
        // The orders table's primary key is `id` (e.g. `ASC-...`); the old
        // `.eq('order_id', refId)` matched a column that does not exist,
        // so this recovery branch silently updated nothing — a failed
        // confirm-gokwik-order could never be rescued by the webhook.
        await supabase.from('orders')
          .update({ payment_status: 'paid', payment_gateway: 'gokwik', updated_at: new Date().toISOString() })
          .eq('id', refId);
        console.log(`[GoKwik] DB updated for ${refId}`);
      } catch(dbErr) {
        console.warn('[GoKwik] DB update failed:', dbErr.message);
      }
    }

    res.json({ success: true });
  } catch(err) {
    console.error('[GoKwik] Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GoKwik health check ──




// ── Confirm GoKwik Order — saves verified paid order to Supabase ──
app.post('/api/confirm-gokwik-order', paymentLimiter, async (req, res) => {
  try {
    const { order_id, order_data } = req.body;
    if (!order_id)   return res.status(400).json({ error: 'Missing order_id' });
    if (!order_data) return res.status(400).json({ error: 'Missing order_data' });

    // ── Verify with GoKwik that this order id was actually paid — never trust
    // the client's word for it. Anyone could otherwise POST straight to this
    // endpoint and mark an unpaid order "Paid" for free.
    const GK_APP_ID     = process.env.GOKWIK_APP_ID;
    const GK_APP_SECRET = process.env.GOKWIK_APP_SECRET;
    if (!GK_APP_ID || !GK_APP_SECRET) return res.status(500).json({ error: 'GoKwik not configured' });
    let gkStatus, gkAmount;
    try {
      const gkRes = await guardedFetch('gokwik', `${GK_BASE}/v1/payments/links?merchant_reference_id=${encodeURIComponent(order_id)}`, {
        headers: { 'gk-app-id': GK_APP_ID, 'gk-app-secret': GK_APP_SECRET },
        signal: AbortSignal.timeout(15000),
      });
      const gkData = await gkRes.json();
      if (!gkRes.ok || !gkData.success) return res.status(402).json({ error: 'Could not verify payment with GoKwik' });
      gkStatus = gkData.data.status;
      gkAmount = parseFloat(gkData.data.amount || 0);
    } catch (verifyErr) {
      console.error('[confirm-gokwik] GoKwik verify failed:', verifyErr.message);
      return res.status(502).json({ error: 'Payment verification unavailable, please retry' });
    }
    if (gkStatus !== 'paid') return res.status(402).json({ error: `Payment not completed (status: ${gkStatus})` });

    // ── Recompute the real order total from product prices — the amount
    // GoKwik confirms paid must cover it, regardless of what order_data.total says.
    //
    // SECURITY: VitaPoints redemption must key off the VERIFIED signed-in
    // user, never order_data.customer_email. That field is client-supplied,
    // so accepting it here meant anyone could name a victim's email and
    // spend that victim's VitaPoints on their own order. A guest (no token)
    // simply gets no redemption.
    const _authEmail = (() => {
      try {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) return null;
        // Lowercased here too: this route reads the token directly
        // rather than going through authMiddleware, so it does not get
        // that normalisation for free.
        const e = verifyToken(auth.slice(7))?.email;
        return e ? String(e).toLowerCase().trim() : null;
      } catch { return null; }
    })();
    if (_authEmail) {
      // Bind the order to the token holder so the row can't be filed under
      // someone else's account either.
      order_data.customer_email = _authEmail;
    } else if (order_data.vita_points) {
      return res.status(401).json({ error: 'Please sign in to redeem VitaPoints.' });
    }

    let recalculated;
    try {
      const vita = await resolveVitaDiscount({
        email: _authEmail, pointsRequested: order_data.vita_points, orderId: order_id, commit: true,
      });
      recalculated = await computeServerSideTotal(order_data.items, order_data.coupon_code, { vitaRupees: vita.rupees, customerEmail: order_data.customer_email });
      order_data.vita_points_redeemed = vita.points;
      // Persist the full breakdown (see /api/orders for why), with the
      // VitaPoints rupee value folded into `discount` so the row foots.
      order_data.subtotal = recalculated.subtotal;
      order_data.discount = Number(((recalculated.discount || 0) + (recalculated.mixMatchDiscount || 0) + (recalculated.vitaDiscount || 0)).toFixed(2));
      order_data.shipping = recalculated.shippingFee;
      // 2026-08: write every discount to its own column — the invoice,
      // the confirmation email and My Account list each saving by name.
      // The aggregate `discount` still foots the row; this only adds the
      // per-line detail (tier / mix-match / coupon / VitaPoints).
      const { persistBreakdown: _gkPersist } = require('./order-breakdown');
      _gkPersist(order_data, recalculated);
      assertOrderFoots({ ...order_data, total: recalculated.total }, 'cashfree-confirm');
    } catch (calcErr) {
      await releaseVitaReservation(order_id, 'order rejected — total could not be verified');
      return res.status(400).json({ error: 'Could not verify order total: ' + calcErr.message });
    }
    if (gkAmount + 1 < recalculated.total) { // small epsilon for rounding
      // FIX (audit #14): an amount mismatch is the single most important
      // thing to know about immediately — it means either a pricing bug
      // or someone attempting to underpay. Previously it only hit the
      // console and vanished with Render's log rotation.
      raiseAlert({
        severity: 'critical', category: 'payment',
        title: 'Payment amount below cart total — order rejected',
        orderId: order_id,
        detail: { paid: gkAmount, expected: recalculated.total, gateway: 'gokwik' },
      });
      console.error(`[confirm-gokwik] ⚠️ Amount mismatch on ${order_id}: paid ₹${gkAmount}, cart worth ₹${recalculated.total}`);
      // Points were committed above and no order will be written. Return
      // them, or a rejected underpayment silently costs the customer their
      // balance as well.
      await releaseVitaReservation(order_id, 'order rejected — amount paid below cart total');
      return res.status(402).json({ error: 'Amount paid does not match cart total' });
    }
    order_data.total = recalculated.total;

    const { data: existing } = await supabase
      .from('orders').select('*').eq('id', order_id).maybeSingle();

    if (existing) {
      const { data: updated } = await supabase.from('orders').update({
        payment_status:  'Paid',
        payment_method:  order_data.payment_method || 'gokwik',
        payment_gateway: 'gokwik',
        fulfillment:     existing.fulfillment || 'Pending',
        updated_at:      new Date().toISOString(),
      }).eq('id', order_id).select().single();
      console.log(`[confirm-gokwik] ✅ Duplicate updated: ${order_id}`);
      // Return the row itself — a retry after a network timeout lands here,
      // and the client verifies the saved order before showing success.
      res.json({ success: true, duplicate: true, order_id, data: updated || existing });
      if (order_data.customer_email) {
        sendOrderEmail({ ...order_data, id: order_id, payment_status: 'Paid' }).catch(e =>
          console.warn('[confirm-gokwik] Email failed:', e.message));
      }
      return;
    }

    const orderPayload = {
      ...order_data,
      id:              order_id,
      payment_status:  'Paid',
      payment_method:  order_data.payment_method || 'gokwik',
      payment_gateway: 'gokwik',
      fulfillment:     'Pending',  // courier status only ever arrives via the Delhivery webhook
    };
    // SECURITY AUDIT FIX (pre-launch 2026-08): same whitelist injection
    // surface as /api/orders — a client could stamp vita_points_earned on
    // the row it created here.
    delete orderPayload.vita_points_earned;

    let savedOrder;
    try {
      savedOrder = await sp_place_order(orderPayload);
    } catch(saveErr) {
      if (saveErr.code === '23505' || saveErr.message?.includes('duplicate') || saveErr.message?.includes('already exists')) {
        const { data: dupRow } = await supabase.from('orders').select('*').eq('id', order_id).maybeSingle();
        res.json({ success: true, duplicate: true, order_id, data: dupRow });
        sendOrderEmail({ ...order_data, id: order_id, payment_status: 'Paid' }).catch(() => {});
        return;
      }
      throw saveErr;
    }
    // ── Award VitaPoints server-side — 1 point per ₹1, capped at 5,000,
    // immediately spendable (no hold). This is the authoritative ledger a
    // return-approval clawback (vita_reverse) reads from. Awarded BEFORE
    // responding so the balance the client reads back is already correct.
    // Prepaid: money is taken, so points are created now — but PENDING.
    // They only become spendable after delivery + the return window
    // (vita_mark_delivered -> vita_release_due). Eligible value excludes
    // shipping and the VitaPoints-paid portion so points can't be farmed.
    const _gkEligible = Math.max(0, (recalculated.total || 0) - (recalculated.shippingFee || 0));
    if (savedOrder && savedOrder.customer_email) {
      const _pts = await awardVitaPoints(savedOrder, { eligibleValue: _gkEligible });
      if (_pts > 0) savedOrder.vita_points_earned = _pts;
    }

    res.json({ success: true, order_id, data: savedOrder });
    sendOrderEmail(savedOrder).catch(e => console.warn('[confirm-gokwik] Email failed:', e.message));
    console.log(`[confirm-gokwik] ✅ New order saved: ${order_id} ₹${recalculated.total}`);

    // (Duplicate-path guard.) Points for this order are created by
    // awardVitaPoints() on the main save path above — PENDING until
    // delivery + return window. vita_earn_on_order is idempotent per
    // order id, so re-running it here would be a no-op anyway.

  } catch(err) {
    console.error('[confirm-gokwik-order]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// orderLimiter added: this was the only order-creation route with no rate
// limit at all, while /api/orders had authMiddleware + orderLimiter and the
// GoKwik/Cashfree confirms had paymentLimiter. COD was the way in.
//
// AUTH FIX (full audit 2026-08): COD used to have NO authentication at all —
// the frontend login gate was the only wall, and anyone calling this endpoint
// directly could place COD orders as a guest and break VitaPoints attribution.
// It now requires a signed-in customer, and the order is bound to the token
// holder's email exactly like the GoKwik/Cashfree confirm paths.
app.post('/api/confirm-cod-order', authMiddleware, orderLimiter, async (req, res) => {
  try {
    const { order_id, order_data } = req.body;
    if (!order_id)   return res.status(400).json({ error: 'Missing order_id' });
    if (!order_data) return res.status(400).json({ error: 'Missing order_data' });

    // Bind the order to the signed-in user — client-supplied emails are no
    // longer trusted for who the points belong to.
    const tokenEmail = req.user && req.user.email;
    if (tokenEmail) {
      order_data.customer_email = String(tokenEmail).toLowerCase().trim();
    }
    if (order_data.vita_points && !tokenEmail) {
      return res.status(401).json({ error: 'Please sign in to redeem VitaPoints.' });
    }
    // FIX (Aug 2026, owner report): a JWT is required by authMiddleware but
    // was never checked against the customers table, so a token carrying an
    // arbitrary email could place a COD order without a real account. Now
    // the order is bound to a real (non-deleted) customer row — its id is
    // written as user_id and its name/phone fill in what the form omitted.
    // Track whether the checkout form itself supplied a (non-empty) name.
    // If the form left the name blank, the account row's placeholder "Customer"
    // would otherwise be silently written onto the order — the customer must
    // type their real name instead.
    const _wasNameProvided = !!(order_data.customer_name && String(order_data.customer_name).trim());
    let _cust = null;
    if (tokenEmail) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, name, phone, deleted_at')
        .eq('email', tokenEmail)
        .maybeSingle();
      if (cust && !cust.deleted_at) {
        _cust = cust;
        order_data.user_id = cust.id;
        if (!order_data.customer_name) order_data.customer_name = cust.name;
        if (!order_data.customer_phone) order_data.customer_phone = cust.phone;
      }
    }
    // A soft-deleted account may never place new orders.
    if (_cust?.deleted_at) {
      return res.status(403).json({ error: 'This account is deactivated. Please contact support to restore it.' });
    }
    // No customer row yet (checkout used a token that was never tied to an
    // account): create one now so the order is bound to a real account and
    // never floats anonymous again.
    if (!_cust) {
      const nameClean = String(order_data.customer_name || '').replace(/[<>]/g, '').trim().slice(0, 80) || 'Customer';
      const phoneClean = String(order_data.customer_phone || '').replace(/[^\d+\-() ]/g, '').slice(0, 20);
      const { data: created, error: createErr } = await supabase
        .from('customers')
        .insert([{ name: nameClean, email: tokenEmail, phone: phoneClean, password: null, created_at: new Date().toISOString() }])
        .select('id, name, phone')
        .single();
      if (createErr) {
        console.warn('[confirm-cod] could not create customer row for', tokenEmail, createErr.message);
      } else {
        order_data.user_id = created.id;
        if (!order_data.customer_name) order_data.customer_name = created.name;
        if (!order_data.customer_phone) order_data.customer_phone = created.phone;
      }
    }

    // FIX (Aug 2026, owner report): same NOT NULL guard as /api/orders — a
    // blank name must become a clear client error, never a DB constraint
    // failure after the confirmation email has already fired. A token whose
    // account row has the placeholder name "Customer" (or nothing) must not
    // mask a missing form name — the customer has to type it.
    if (!order_data.customer_name || !String(order_data.customer_name).trim()) {
      return res.status(400).json({ error: 'Please enter your name to complete the order.' });
    }
    order_data.customer_name = String(order_data.customer_name).trim().slice(0, 80);
    if (_cust && order_data.customer_name === 'Customer' && !_wasNameProvided) {
      return res.status(400).json({ error: 'Please enter your name to complete the order.' });
    }

    const required = ['customer_name','customer_email','customer_phone','city','state','pincode','total'];
    if (!order_data.address && !order_data.address_line1) {
      return res.status(400).json({ error: 'Missing required field: address' });
    }
    if (!order_data.address && order_data.address_line1) {
      order_data.address = [order_data.address_line1, order_data.address_line2].filter(Boolean).join(', ');
    }
    delete order_data.address_line1;
    delete order_data.address_line2;
    const missing = required.filter(f => !order_data[f]);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // ── Recalculate total server-side — never trust the client total ──
    const items = typeof order_data.items === 'string'
      ? JSON.parse(order_data.items || '[]') : (order_data.items || []);
    // SECURITY: was `if (items.length > 0)` — an empty/absent items array
    // skipped the recompute and the client's `total` was written straight
    // to the orders table.
    if (!items.length) return res.status(400).json({ error: 'Order must contain items' });
    // ── Order of operations matters here ─────────────────────────────────
    // resolveVitaDiscount({commit:true}) SPENDS the customer's points. It
    // used to run first, before the COD ceiling check, the reconciliation
    // check, the duplicate check and the stock check — so every one of
    // those rejections took the points and left no order behind. The
    // customer paid nothing and lost their balance, with nothing in the
    // ledger to explain it.
    //
    // Everything that can reject the order is now settled on a preview
    // (which reads the balance but does not touch it). Points are committed
    // only once the order is certain to be written, and released again if
    // the write itself fails.
    let vita;
    {
      try {
        const preview = await resolveVitaDiscount({
          email: order_data.customer_email, pointsRequested: order_data.vita_points, orderId: order_id, commit: false,
        });
        const projected = await computeServerSideTotal(items, order_data.coupon_code, { vitaRupees: preview.rupees, customerEmail: order_data.customer_email });

        // COD value ceiling. Nothing stopped a ₹127,609 cash-on-delivery
        // order from being accepted and shipped.
        if (Number(projected.total) > MAX_COD_ORDER_VALUE) {
          await raiseAlert({
            severity: 'high', category: 'fraud', orderId: order_id,
            title: 'COD order above ceiling rejected',
            detail: `₹${projected.total} exceeds MAX_COD_ORDER_VALUE ₹${MAX_COD_ORDER_VALUE}`,
          });
          return res.status(400).json({
            error: `Cash on delivery is available up to ₹${MAX_COD_ORDER_VALUE.toLocaleString('en-IN')}. Please pay online for this order, or contact us for bulk orders.`,
          });
        }
        if (Number(projected.total) >= LARGE_ORDER_ALERT) {
          await raiseAlert({
            severity: 'warn', category: 'order', orderId: order_id,
            title: 'Large COD order accepted',
            detail: `₹${projected.total} — review before dispatch`,
          });
        }
      } catch (calcErr) {
        // The customer sees a friendly version of this; the owner sees the
        // exact reason — before this, 'could not verify order total' errors
        // vanished into rotated Render logs with no way to diagnose.
        await raiseAlert({ severity: 'high', category: 'order', orderId: order_id,
          title: 'COD order rejected at verification',
          detail: `Cart ${JSON.stringify(items).slice(0, 200)} | coupon=${order_data.coupon_code} | vita=${order_data.vita_points} | error: ${calcErr.message}` });
        return res.status(400).json({ error: 'Could not verify order total: ' + calcErr.message });
      }
    }

    // Duplicate check before the points are spent, not after.
    const { data: existing } = await supabase
      .from('orders').select('id, fulfillment').eq('id', order_id).maybeSingle();

    if (existing) {
      console.log(`[confirm-cod] Duplicate order ${order_id} — returning existing`);
      return res.json({ success: true, duplicate: true, order_id });
    }

    {
      try {
        vita = await resolveVitaDiscount({
          email: order_data.customer_email, pointsRequested: order_data.vita_points, orderId: order_id, commit: true,
        });
        const recalculated = await computeServerSideTotal(items, order_data.coupon_code, { vitaRupees: vita.rupees, customerEmail: order_data.customer_email });

        // Only `total` used to be written back. subtotal/discount/shipping were
        // left as whatever the client sent, and the VitaPoints rupee value was
        // baked into `total` and recorded nowhere at all. Live data showed the
        // damage: 5 orders where total was short by exactly the points value —
        // e.g. AVC-77409132, subtotal 1357.00, discount 0.00, total 1352.67,
        // and 650 redeemed points is 650/150 = ₹4.33. The money was right; the
        // breakdown simply did not add up, so the admin list, the tax invoice
        // and any reconciliation all disagreed with each other.
        //
        // The values were already computed and even printed to the log on the
        // next line. Now they are persisted.
        order_data.subtotal = recalculated.subtotal;
        order_data.shipping = recalculated.shippingFee;
        // Points are a discount on the order, so they belong in `discount`
        // alongside the coupon — that is what makes subtotal - discount +
        // shipping equal total. The point count itself stays in
        // vita_points_redeemed so the two views can always be reconciled.
        order_data.discount = Number(((recalculated.discount || 0) + (recalculated.mixMatchDiscount || 0) + (recalculated.vitaDiscount || 0)).toFixed(2));
        order_data.total = recalculated.total;
        order_data.vita_points_redeemed = vita.points || 0;
        if (!order_data.payment_gateway) order_data.payment_gateway = 'cod';

        // 2026-08: per-component discount columns — the invoice, the
        // confirmation email and My Account list each saving by name
        // (Pack/Tier, Mix & Match, Promo code, VitaPoints). The aggregate
        // `discount` still foots the row; this only adds the detail lines.
        const { persistBreakdown: _codPersist } = require('./order-breakdown');
        _codPersist(order_data, recalculated);

        // Refuse to persist a row that does not foot. Better a failed checkout
        // we can see than a silently wrong order we find months later.
        const _foot = Number(((order_data.subtotal || 0) - (order_data.discount || 0) + (order_data.shipping || 0)).toFixed(2));
        if (Math.abs(_foot - Number(order_data.total)) > 0.05) {
          console.error(`[confirm-cod] breakdown does not reconcile for ${order_id}: ${_foot} != ${order_data.total}`);
          await releaseVitaReservation(order_id, 'order rejected — total did not reconcile');
          return res.status(500).json({ error: 'Order total could not be reconciled. Please try again.' });
        }

        console.log(`[confirm-cod] Recalculated total: ₹${recalculated.total} (subtotal ₹${recalculated.subtotal} - disc ₹${recalculated.discount} + fee ₹${recalculated.shippingFee} - vita ₹${recalculated.vitaDiscount})`);
      } catch (calcErr) {
        await releaseVitaReservation(order_id, 'order rejected — total could not be verified');
        await raiseAlert({ severity: 'high', category: 'order', orderId: order_id,
          title: 'COD order rejected at final verification',
          detail: `Cart ${JSON.stringify(items).slice(0, 200)} | coupon=${order_data.coupon_code} | error: ${calcErr.message}` });
        return res.status(400).json({ error: 'Could not verify order total: ' + calcErr.message });
      }
    }

    const orderPayload = {
      ...order_data,
      id:             order_id,
      payment_status: 'COD - Pending',
      payment_method: 'cod',
      fulfillment:    'Pending',
      client_ip:      clientIpOf(req),
      device_fp:      order_data.device_fp ? String(order_data.device_fp).slice(0, 128) : null,
    };
    // SECURITY AUDIT FIX (pre-launch 2026-08): same injection surface as
    // /api/orders — order_data carries the client's own body keys, and the
    // sp_place_order whitelist includes vita_points_earned. COD is a guest
    // flow, so a guest could stamp any points value on the row.
    delete orderPayload.vita_points_earned;
    // NOTE: payment_status must NOT be deleted here — this was a bug: the
    // comment above claimed it was "forced to 'COD - Pending' below anyway",
    // but nothing restored it, so COD rows were inserted with NULL
    // payment_status (live rows show 'Unpaid' from other paths). The
    // orderPayload spread below sets it explicitly.
    if (!orderPayload.payment_status) orderPayload.payment_status = 'COD - Pending';
    if (!orderPayload.payment_method) orderPayload.payment_method = 'cod';
    if (!orderPayload.fulfillment) orderPayload.fulfillment = 'Pending';

    let savedOrder;
    try {
      savedOrder = await sp_place_order(orderPayload);
    } catch(saveErr) {
      if (saveErr.code === '23505' || saveErr.message?.includes('duplicate') || saveErr.message?.includes('already exists')) {
        console.log(`[confirm-cod] Race-condition duplicate ${order_id}`);
        // Profile auto-save still runs on the duplicate path — the money checks
        // already passed, and the customer's details deserve saving either way.
        const { saveCustomerProfile } = require('./order-breakdown');
        await saveCustomerProfile(supabase, order_data, 'confirm-cod');
        return res.json({ success: true, duplicate: true, order_id });
      }
      // The points were committed a moment ago against an order that now
      // does not exist. Hand them back before answering, or the customer
      // pays for a sold-out item with a balance they never got to use.
      // The duplicate branch above deliberately does NOT release: there the
      // order is real, it was just created by the first of two calls, and
      // vita_commit_redemption is idempotent per order id.
      await releaseVitaReservation(order_id, 'order not created — ' + (saveErr.message || 'save failed'));
      if (saveErr.message?.includes('stock') || saveErr.message?.includes('Insufficient')) {
        return res.status(409).json({ error: saveErr.message });
      }
      throw saveErr;
    }
    // 2026-08: auto-save the checkout contact details to the customer's
    // profile so the NEXT order pre-fills name, phone, address, city/state/pin.
    const { saveCustomerProfile: saveCodProfile } = require('./order-breakdown');
    await saveCodProfile(supabase, order_data, 'confirm-cod');

    res.json({ success: true, order_id, data: savedOrder }); // respond immediately — don't wait on email
    sendOrderEmail(savedOrder).catch(e =>
      console.warn('[confirm-cod] Email failed:', e.message)
    );

    console.log(`[confirm-cod] ✅ COD order ${order_id} placed — ₹${order_data.total} — ${order_data.customer_name}`);

    // COD earns NOTHING here — see /api/orders. Points are created only
    // once the courier confirms delivery and cash is collected, via the
    // Delhivery webhook. A refused or RTO'd COD parcel therefore never
    // generates points that would have to be clawed back.

  } catch(err) {
    console.error('[confirm-cod]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SHIPROCKET
// ═══════════════════════════════════════════════════════════════
let srToken = null, srExpiry = 0;

// Both of these had no timeout. Shiprocket is called straight after
// checkout, so a stall here holds the request that just took a
// customer's money.
async function getShiprocketToken(force = false) {
  if (!force && srToken && Date.now() < srExpiry) return srToken;
  const r = await guardedFetch('shiprocket', 'https://apiv2.shiprocket.in/v1/external/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL||'', password: process.env.SHIPROCKET_PASSWORD||'' }),
  }, SHIPROCKET_BREAKER);
  const data = await r.json();
  if (!data.token) throw new Error('Shiprocket login failed');
  srToken = data.token; srExpiry = Date.now() + 9*3600*1000;
  return srToken;
}

async function srRequest(url, options = {}) {
  const token = await getShiprocketToken();
  const doReq = (t) => guardedFetch('shiprocket', url, {
    ...options,
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${t}`, ...(options.headers||{}) },
  }, SHIPROCKET_BREAKER);
  // guardedFetch resolves with the Response for any status, so this is
  // the same status check it always was. A 401 means our cached token
  // aged out, not that Shiprocket is down — it does not count against
  // the breaker, and one refresh-and-retry fixes it.
  let r = await doReq(token);
  if (r.status === 401) { const ft = await getShiprocketToken(true); r = await doReq(ft); }
  return r.json();
}

// ═══════════════════════════════════════════════════════════════
// SHIPPING GUARD  (v9.2)
// ═══════════════════════════════════════════════════════════════
// /api/create-shiprocket-order and /api/create-delhivery-order had no auth
// and no rate limit. The storefront calls Shiprocket straight after
// checkout, so they can't require a customer login — but they took the whole
// shipment from the request body without checking that the order existed.
// Anyone could POST arbitrary addresses and generate real labels on your
// courier accounts, which costs real money (COD especially).
//
// Fix: the order_id must match a real, non-deleted row in `orders`, and the
// consignee must match what that order actually says. You can now only
// create a label for an order that genuinely went through checkout.
const shipLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many shipping requests. Please wait a few minutes.' },
});

async function assertRealOrder(req, res) {
  const id = String(req.body?.order_id || '').trim();
  if (!id) { res.status(400).json({ error: 'Missing order_id' }); return null; }

  const { data: order } = await supabase.from('orders')
    .select('id, customer_email, customer_phone, pincode, total, fulfillment')
    .eq('id', id).is('deleted_at', null).maybeSingle();

  if (!order) {
    console.warn('[ship] rejected label for unknown order', id, 'ip', req.ip);
    res.status(403).json({ error: 'No such order' });
    return null;
  }

  // Pincode is the cheapest thing to bind on: it has to match the order the
  // customer actually placed, so a stranger can't redirect a real order id
  // to their own address.
  const sent = String(req.body?.billing_pincode || '').replace(/\D/g, '').slice(0, 6);
  const have = String(order.pincode || '').replace(/\D/g, '').slice(0, 6);
  if (have && sent && have !== sent) {
    console.warn('[ship] pincode mismatch for order', id, have, '!=', sent);
    res.status(403).json({ error: 'Shipping details do not match this order' });
    return null;
  }
  return order;
}

app.post('/api/create-shiprocket-order', shipLimiter, async (req, res) => {
  // FIX (Aug 2026 dispatch-audit): assertRealOrder() demanded the order row
  // to already exist — but the storefront checkout calls this endpoint
  // BEFORE it saves the order to the database. The result was a perfect
  // circle: every single order was rejected with 403 "No such order",
  // so no order EVER got a Shiprocket AWB, everything sat in
  // fulfillment=Pending forever, and the courier sync had nothing to do.
  // This endpoint creates the shipment FOR a new order, so the row may
  // legitimately not exist yet. Validate the payload itself instead, and
  // when the row DOES already exist (e.g. admin re-dispatch), keep the
  // pincode-consistency check.
  const b = req.body || {};
  if (!String(b.order_id||'').trim()) return res.status(400).json({ error: 'Missing order_id' });
  const sentPin = String(b.billing_pincode||'').replace(/\D/g,'').slice(0,6);
  if (!/^\d{6}$/.test(sentPin)) return res.status(400).json({ error: 'Invalid pincode' });
  const items = Array.isArray(b.order_items) ? b.order_items : [];
  if (!items.length) return res.status(400).json({ error: 'No order items' });
  if (!String(b.billing_customer_name||'').trim()) return res.status(400).json({ error: 'Missing customer name' });
  try {
    const { data: existing } = await supabase.from('orders')
      .select('id, pincode, total').eq('id', String(b.order_id).trim()).is('deleted_at', null).maybeSingle();
    if (existing) {
      const have = String(existing.pincode||'').replace(/\D/g,'').slice(0,6);
      if (have && have !== sentPin) {
        console.warn('[ship] pincode mismatch for order', existing.id, have, '!=', sentPin);
        return res.status(403).json({ error: 'Shipping details do not match this order' });
      }
    }
  } catch (e) { /* existence check must never block dispatch */ }
  try {
    const phone    = String(b.billing_phone||'').replace(/\D/g,'').slice(-10);
    const pincode  = sentPin;
    const lastName = (b.billing_last_name?.trim()) ? b.billing_last_name.trim() : '.';
    const orderItems = (b.order_items||[]).map(i => ({
      name: String(i.name||'Product').slice(0,100), sku: String(i.sku||'SKU-001').slice(0,50),
      units: parseInt(i.units)||1, selling_price: parseFloat(i.selling_price)||0,
      mrp: parseFloat(i.mrp||i.selling_price)||0, discount: parseFloat(i.discount)||0, tax:'', hsn:'30049099',
    }));
    const payload = {
      order_id: String(b.order_id||'').slice(0,50), order_date: b.order_date||new Date().toISOString().slice(0,19).replace('T',' '),
      pickup_location: 'Primary',
      billing_customer_name: String(b.billing_customer_name||'').trim(), billing_last_name: lastName,
      billing_address: String(b.billing_address||'').trim(), billing_address_2: String(b.billing_address_2||'').trim(),
      billing_city: String(b.billing_city||'').trim(), billing_pincode: pincode,
      billing_state: String(b.billing_state||'').trim(), billing_country: 'India',
      billing_email: String(b.billing_email||'').trim().toLowerCase(), billing_phone: phone,
      shipping_is_billing: true, order_items: orderItems,
      payment_method: b.payment_method==='COD'?'COD':'Prepaid',
      sub_total: parseFloat(b.sub_total)||orderItems.reduce((s,i)=>s+i.selling_price*i.units,0),
      length: parseFloat(b.length)||15, breadth: parseFloat(b.breadth)||10,
      height: parseFloat(b.height)||10, weight: parseFloat(b.weight)||0.3,
    };
    const data = await srRequest('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', { method:'POST', body:JSON.stringify(payload) });
    if (!data.order_id) return res.status(422).json({ error: data.message||'Rejected', details: data.errors||data });
    if (payload.order_id) {
      const { error: srUpdateErr } = await supabase.from('orders').update({ shiprocket_id:String(data.order_id), fulfillment:'Processing', updated_at:new Date().toISOString() }).eq('id', payload.order_id);
      if (srUpdateErr) console.error('⚠️ Supabase order update failed after Shiprocket push:', srUpdateErr.message);
    }
    res.json(data);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// FIX (Aug 2026 pass): GET /api/track/:awb used to be unauthenticated —
// anyone enumerating AWBs could read shipment status through the
// Shiprocket credentials (flagged in AUDIT-2026-08 as an open item).
// Now admin-only. Customer tracking keeps its own public, scoped
// path: GET /api/track-order/:orderId (tracking columns only).
app.get('/api/track/:awb', authMiddleware, adminOnly, async (req, res) => {
  try { res.json(await srRequest(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${req.params.awb}`)); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

// Public guest order tracking. SECURITY: this route is intentionally
// unauthenticated (customers track from an email link without signing in),
// so it must never return personal data. It used to `select('*')` and
// return the whole row — name, email, phone, full home address, items and
// totals — to anyone who guessed an order id, which is a straightforward
// IDOR / data-leak. It now reads only the columns tracking actually needs.
// SECURITY (audit OZ-05): this route had no authentication and no ownership
// check. It took an order id and returned fulfilment status, the waybill, and
// the courier's full tracking response proxied straight from Delhivery or
// Shiprocket — which carries consignee name, address and phone. Order ids are
// an 8-digit numeric space (AVC-05719216), so that was an enumerable customer
// address disclosure.
//
// Verified before changing: no page in the storefront or admin panel calls
// /api/track-order — the tracking UI uses the order's own tracking_url from
// /api/orders/my. Adding the guard therefore breaks no existing workflow. If
// guest tracking is wanted later, add it as order-id PLUS a matching email,
// not order-id alone.
app.get('/api/track-order/:orderId', authMiddleware, async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('id,fulfillment,shiprocket_id,delhivery_waybill,tracking_url,created_at,customer_email')
      .eq('id', req.params.orderId).is('deleted_at', null).single();
    if (!order) return res.status(404).json({ error: 'Not found' });
    // Staff may track any order; a customer only their own.
    const isStaff = req.user.role === 'admin' || req.user.role === 'owner';
    if (!isStaff && String(order.customer_email || '').toLowerCase() !== String(req.user.email || '').toLowerCase()) {
      return res.status(403).json({ error: 'Not your order' });
    }
    if (order.delhivery_waybill) {
      const tracking = await dlRequest(`${dlBase()}/api/v1/packages/json/?waybill=${encodeURIComponent(order.delhivery_waybill)}`);
      return res.json({ status: order.fulfillment, delhivery_waybill: order.delhivery_waybill, tracking });
    }
    if (!order.shiprocket_id) return res.json({ status: order.fulfillment||'Pending', tracking_url:null });
    const tracking = await srRequest(`https://apiv2.shiprocket.in/v1/external/orders/show/${order.shiprocket_id}`);
    res.json({ status: order.fulfillment, shiprocket_id: order.shiprocket_id, tracking });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// DELHIVERY (B2C)
// Docs: https://one.delhivery.com/developer-portal/documents/b2c
// Auth: static account token, sent as `Authorization: Token <token>`
// (no login/session step needed, unlike Shiprocket's email+password login)
// ═══════════════════════════════════════════════════════════════
function dlBase() {
  return (process.env.DELHIVERY_ENV || '').toLowerCase() === 'staging'
    ? 'https://staging-express.delhivery.com'
    : 'https://track.delhivery.com';
}

async function dlRequest(url, options = {}) {
  // Already had a 10s timeout, which is why Delhivery was never the
  // dependency that took the instance down. It goes through the breaker
  // anyway so it gets the concurrency cap and shows up in
  // /api/health/deps alongside the others — a timeout alone still lets
  // a slow courier stack requests as deep as traffic allows.
  const r = await guardedFetch('delhivery', url, {
    ...options,
    headers: {
      Authorization: `Token ${process.env.DELHIVERY_API_TOKEN || ''}`,
      ...(options.headers || {}),
    },
  }).catch(e => {
    // guardedFetch resolves with the Response for every HTTP status, so
    // the only things that land here are "no answer at all": a timeout,
    // an open circuit, a saturated one. Give those a 503 so a tripped
    // breaker reads to the admin as "temporarily unavailable" rather
    // than as a bug in this code. Delhivery's own 4xx/5xx bodies still
    // flow to the parsing below exactly as they always did.
    if (e.code === 'CIRCUIT_OPEN' || e.code === 'CIRCUIT_SATURATED' || e.code === 'CIRCUIT_TIMEOUT') {
      e.status = 503;
      e.data = { error: e.message };
    }
    throw e;
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) { const e = new Error(data.error || data.rmk || `Delhivery HTTP ${r.status}`); e.status = r.status; e.data = data; throw e; }
  return data;
}

app.post('/api/create-delhivery-order', shipLimiter, async (req, res) => {
  if (!(await assertRealOrder(req, res))) return;
  try {
    if (!process.env.DELHIVERY_API_TOKEN) return res.status(500).json({ error: 'DELHIVERY_API_TOKEN not set in Render env vars' });

    const b = req.body;
    const phone    = String(b.billing_phone||'').replace(/\D/g,'').slice(-10);
    const pincode  = String(b.billing_pincode||'').replace(/\D/g,'').slice(0,6);
    const lastName = (b.billing_last_name?.trim()) ? b.billing_last_name.trim() : '';
    const orderItems = (b.order_items||[]).map(i => ({
      name: String(i.name||'Product').slice(0,100), units: parseInt(i.units)||1,
      selling_price: parseFloat(i.selling_price)||0,
    }));
    const subTotal = parseFloat(b.sub_total)||orderItems.reduce((s,i)=>s+i.selling_price*i.units,0);
    const isCOD = b.payment_method === 'COD';

    const shipment = {
      order: String(b.order_id||'').slice(0,50),
      order_date: b.order_date || new Date().toISOString(),
      name: [String(b.billing_customer_name||'').trim(), lastName].filter(Boolean).join(' '),
      add: [String(b.billing_address||'').trim(), String(b.billing_address_2||'').trim()].filter(Boolean).join(', '),
      city: String(b.billing_city||'').trim(),
      state: String(b.billing_state||'').trim(),
      country: 'India',
      pin: pincode,
      phone: phone,
      payment_mode: isCOD ? 'COD' : 'Prepaid',
      cod_amount: isCOD ? subTotal : 0,
      total_amount: subTotal,
      products_desc: orderItems.map(i=>i.name).join(', ').slice(0,500),
      quantity: String(orderItems.reduce((s,i)=>s+i.units,0)),
      seller_gst_tin: process.env.DELHIVERY_SELLER_GST_TIN || '',
      hsn_code: process.env.DELHIVERY_HSN_CODE || '30049099',
      shipment_width: parseFloat(b.breadth)||10,
      shipment_height: parseFloat(b.height)||10,
      weight: Math.round((parseFloat(b.weight)||0.3) * 1000), // grams
      shipping_mode: 'Surface',
    };

    const pickup_location = {
      name: process.env.DELHIVERY_PICKUP_LOCATION || '',
      pin: process.env.DELHIVERY_PICKUP_PIN || '',
      add: process.env.DELHIVERY_PICKUP_ADDRESS || '',
      city: process.env.DELHIVERY_PICKUP_CITY || '',
      state: process.env.DELHIVERY_PICKUP_STATE || '',
      country: 'India',
      phone: process.env.DELHIVERY_PICKUP_PHONE || '',
    };
    if (!pickup_location.name) return res.status(500).json({ error: 'DELHIVERY_PICKUP_LOCATION not set — must exactly match the warehouse name registered with Delhivery' });

    const payload = { pickup_location, shipments: [shipment] };
    const body = 'format=json&data=' + encodeURIComponent(JSON.stringify(payload));

    const data = await dlRequest(`${dlBase()}/api/cmu/create.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const pkg = data.packages?.[0];
    if (!pkg || pkg.status !== 'Success') {
      return res.status(422).json({ error: pkg?.remarks?.[0] || data.rmk || 'Delhivery rejected the shipment', details: data });
    }

    // The shipment now exists at Delhivery and is billable, so never fail the
    // request from here on. But do not swallow a save failure either: until
    // migration 008 added orders.delhivery_waybill this update was rejected
    // over the unknown column, losing the waybill while the caller saw a clean
    // success. Report it back so the admin can write the number down.
    let saveWarning = null;
    if (shipment.order) {
      const { error: dlUpdateErr } = await supabase.from('orders')
        .update({ delhivery_waybill: pkg.waybill, fulfillment: 'Processing', updated_at: new Date().toISOString() })
        .eq('id', shipment.order);
      if (dlUpdateErr) {
        saveWarning = `Shipment ${pkg.waybill} was created at Delhivery but could not be saved to order ${shipment.order}: ${dlUpdateErr.message}. Record this waybill manually.`;
        console.error('⚠️', saveWarning);
      }
    }
    res.json({ waybill: pkg.waybill, saved: !saveWarning, warning: saveWarning, ...data });
  } catch(err) { res.status(err.status || 500).json({ error: err.message, details: err.data }); }
});

app.get('/api/delhivery/serviceability/:pincode', async (req, res) => {
  try {
    const data = await dlRequest(`${dlBase()}/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(req.params.pincode)}`);
    const entry = data?.delivery_codes?.[0]?.postal_code;
    if (!entry) return res.json({ serviceable: false });
    res.json({
      serviceable: true,
      cod: entry.cod === 'Y',
      prepaid: entry.pre_paid === 'Y',
      city: entry.city, district: entry.district, state_code: entry.state_code,
    });
  } catch(err) { res.status(err.status || 500).json({ error: err.message }); }
});


// ═══════════════════════════════════════════════════════════════
// DELHIVERY B2C — full API surface
// Docs: https://one.delhivery.com/developer-portal/documents/b2c
//       https://delhivery-express-api-doc.readme.io/
//
// Already present above: pincode serviceability, order creation
// (/api/cmu/create.json) and tracking. Added below, per the
// "7 Steps of Integration" doc: waybill allocation, rate calculator,
// edit, cancel, packing slip, pickup request, warehouse create/edit
// and NDR actions.
//
// Auth policy follows the audit: anything that spends money, moves a
// shipment or exposes another customer's data is adminOnly. The rate
// calculator is public because checkout needs it, but it is rate
// limited — Delhivery throttles at 40 req/min per IP and will block
// the whole backend if we exceed it.
// ═══════════════════════════════════════════════════════════════

const DL_CLIENT = () => process.env.DELHIVERY_CLIENT_NAME || process.env.DELHIVERY_PICKUP_LOCATION || '';

// Delhivery's non-JSON endpoints want form-encoded bodies of the shape
// `format=json&data=<json>`. Order creation already does this inline;
// this helper makes the rest consistent.
async function dlFormPost(path, payload) {
  return dlRequest(`${dlBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'format=json&data=' + encodeURIComponent(JSON.stringify(payload)),
  });
}

// ── Waybill allocation ─────────────────────────────────────────
// Pre-fetching waybills is optional for single-piece B2C orders (the
// create call assigns one dynamically), but required for multi-piece
// shipments and useful for printing labels ahead of manifesting.
app.get('/api/delhivery/waybill', authMiddleware, adminOnly, async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.query.count || '1', 10) || 1, 1), 500);
    const url = `${dlBase()}/waybill/api/bulk/json/?cl=${encodeURIComponent(DL_CLIENT())}`
              + `&token=${encodeURIComponent(process.env.DELHIVERY_API_TOKEN || '')}&count=${count}`;
    const data = await dlRequest(url);
    // Bulk endpoint returns a bare comma-separated string, not JSON.
    const waybills = Array.isArray(data) ? data
      : String(data.raw || data).replace(/["\[\]\s]/g, '').split(',').filter(Boolean);
    res.json({ success: true, count: waybills.length, waybills });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

// ── Rate calculator ────────────────────────────────────────────
// Returns Delhivery's estimate for a shipment. Use this to show a real
// shipping figure at checkout instead of the hard-coded ₹60/free rule.
// NOTE: Delhivery describe this as approximate — the invoiced amount
// can differ, so do not treat it as the exact cost you will be billed.
const _dlRateHits = new Map();
app.get('/api/delhivery/rate', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();
    const e = _dlRateHits.get(ip) || { n: 0, w: now };
    if (now - e.w > 60000) { e.n = 0; e.w = now; }
    e.n++; _dlRateHits.set(ip, e);
    // Delhivery throttles at 40/min per IP and blocks on breach — stay under.
    if (e.n > 20) return res.status(429).json({ error: 'Too many rate lookups, try again shortly' });

    const d_pin = String(req.query.d_pin || '').replace(/\D/g, '');
    const o_pin = String(req.query.o_pin || process.env.DELHIVERY_PICKUP_PIN || '').replace(/\D/g, '');
    const cgm   = parseInt(req.query.cgm || '500', 10) || 500;      // chargeable weight, GRAMS
    const md    = (req.query.md || 'S').toUpperCase();              // E = express, S = surface
    const pt    = (req.query.pt || 'Pre-paid');                     // Pre-paid | COD
    const ss    = (req.query.ss || 'Delivered');                    // Delivered | RTO | DTO
    if (d_pin.length !== 6) return res.status(400).json({ error: 'Valid 6-digit destination pincode required' });
    if (o_pin.length !== 6) return res.status(400).json({ error: 'Origin pincode not configured (DELHIVERY_PICKUP_PIN)' });

    const url = `${dlBase()}/api/kinko/v1/invoice/charges/.json`
      + `?md=${encodeURIComponent(md)}&cgm=${cgm}&o_pin=${o_pin}&d_pin=${d_pin}`
      + `&ss=${encodeURIComponent(ss)}&pt=${encodeURIComponent(pt)}&cl=${encodeURIComponent(DL_CLIENT())}`;
    const data = await dlRequest(url);
    const row = Array.isArray(data) ? data[0] : data;
    res.json({
      success: true,
      total_amount: row?.total_amount ?? null,
      gross_amount: row?.gross_amount ?? null,
      tax_data: row?.tax_data ?? null,
      charge_COD: row?.charge_COD ?? null,
      note: 'Approximate — Delhivery may invoice a different amount',
      raw: row,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

// ── Edit a manifested shipment ─────────────────────────────────
app.post('/api/delhivery/edit', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { waybill, name, phone, address, pin, gm, product_details } = req.body || {};
    if (!waybill) return res.status(400).json({ error: 'waybill required' });
    const payload = { waybill: String(waybill) };
    if (name)    payload.name = name;
    if (phone)   payload.phone = String(phone);
    if (address) payload.add = address;
    if (pin)     payload.pin = String(pin);
    if (gm)      payload.gm = Number(gm);          // weight in grams
    if (product_details) payload.product_details = product_details;
    const data = await dlFormPost('/api/p/edit', payload);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

// ── Cancel a shipment ──────────────────────────────────────────
// Cancellation is the same /api/p/edit endpoint with cancellation:"true".
// Allowed while the package is Manifested / In Transit / Pending / Open /
// Scheduled. Prepaid & COD become "Returned"; pickups become "Cancelled".
app.post('/api/delhivery/cancel', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { waybill } = req.body || {};
    if (!waybill) return res.status(400).json({ error: 'waybill required' });
    const data = await dlFormPost('/api/p/edit', { waybill: String(waybill), cancellation: 'true' });

    // Keep our own order row in step with the carrier — and everything
    // that hangs off a cancellation with it. This wrote `fulfillment`
    // and stopped: no points reversed, no stock returned, no status log.
    // Cancelling a shipment here left the order in a different state
    // from cancelling the identical order anywhere else in the app.
    const { data: order } = await supabase.from('orders')
      .select('id,fulfillment,customer_email,total,shipping,items')
      .eq('delhivery_waybill', String(waybill)).maybeSingle();

    if (order && order.fulfillment !== 'Cancelled') {
      await supabase.from('orders')
        .update({ fulfillment: 'Cancelled', updated_at: new Date().toISOString() })
        .eq('id', order.id);
      await supabase.from('order_status_logs').insert([{
        order_id: order.id, old_status: order.fulfillment, new_status: 'Cancelled',
        changed_by: req.user?.email, note: `Delhivery shipment cancelled (${waybill})`,
        created_at: new Date().toISOString(),
      }]);
      await applyVitaOrderStatusChange(order, 'Cancelled', req.user?.email);
      if (!isStockRestoredState(order.fulfillment)) {
        await restoreStockForOrder(order, 'delhivery cancelled');
      }
    } else if (!order) {
      // The carrier accepted the cancellation for a waybill we have no
      // order for. Worth saying out loud rather than reporting success.
      console.warn(`[Delhivery] cancelled waybill ${waybill} matches no order row`);
    }

    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

// ── Packing slip / shipping label ──────────────────────────────
// Returns JSON, NOT a PDF — Delhivery are explicit about this. Render it
// yourself, or print the label from the Delhivery panel.
app.get('/api/delhivery/packing-slip/:waybill', authMiddleware, adminOnly, async (req, res) => {
  try {
    const wbns = String(req.params.waybill).replace(/[^0-9,]/g, '');
    if (!wbns) return res.status(400).json({ error: 'valid waybill required' });
    const data = await dlRequest(`${dlBase()}/api/p/packing_slip?wbns=${encodeURIComponent(wbns)}&pdf=false`);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

// ── Pickup request ─────────────────────────────────────────────
// Tell Delhivery to collect from the warehouse. Only one open request per
// warehouse at a time — the next can be raised once the first is completed.
app.post('/api/delhivery/pickup', authMiddleware, adminOnly, async (req, res) => {
  try {
    const pickup_location = req.body.pickup_location || process.env.DELHIVERY_PICKUP_LOCATION;
    if (!pickup_location) return res.status(500).json({ error: 'DELHIVERY_PICKUP_LOCATION not set' });
    const pickup_date = req.body.pickup_date || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const pickup_time = req.body.pickup_time || '14:00:00';
    const expected_package_count = Math.max(1, parseInt(req.body.expected_package_count || '1', 10) || 1);
    const data = await dlRequest(`${dlBase()}/fm/request/new/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup_location, pickup_date, pickup_time, expected_package_count }),
    });
    res.json({ success: true, pickup_id: data?.pickup_id ?? null, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

// ── Warehouse (pickup location) create / edit ──────────────────
// Only fields Delhivery documents are accepted — they reject unknown keys.
app.post('/api/delhivery/warehouse', authMiddleware, adminOnly, async (req, res) => {
  try {
    const b = req.body || {};
    const required = ['name', 'pin', 'address', 'city', 'country', 'phone'];
    const missing = required.filter(f => !b[f]);
    if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
    const payload = {
      name: b.name, email: b.email || process.env.MAIL_USER || '',
      phone: String(b.phone), address: b.address, city: b.city,
      country: b.country || 'India', pin: String(b.pin),
      return_address: b.return_address || b.address,
      return_pin: String(b.return_pin || b.pin),
      return_city: b.return_city || b.city,
      return_state: b.return_state || b.state || '',
      return_country: b.return_country || 'India',
      registered_name: b.registered_name || b.name,
    };
    const data = await dlRequest(`${dlBase()}/api/backend/clientwarehouse/create/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

app.put('/api/delhivery/warehouse', authMiddleware, adminOnly, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'name (existing warehouse) required' });
    const data = await dlRequest(`${dlBase()}/api/backend/clientwarehouse/edit/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

app.post('/api/delhivery/warehouse/status', authMiddleware, adminOnly, async (req, res) => {
  try {
    const data = await dlRequest(`${dlBase()}/api/backend/clientwarehouse/status/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: req.body.name || process.env.DELHIVERY_PICKUP_LOCATION }),
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

// ── NDR (failed delivery) actions ──────────────────────────────
// act: DEFER_DLV (needs deferred_date YYYY-MM-DD, max +6 days from first
// pending date) | EDIT_DETAILS (pending status only) | RE-ATTEMPT.
// Asynchronous — always returns a UPL id; poll the status route below.
app.post('/api/delhivery/ndr', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { waybill, act, deferred_date, name, phone, add } = req.body || {};
    const ALLOWED = ['DEFER_DLV', 'EDIT_DETAILS', 'RE-ATTEMPT'];
    if (!waybill) return res.status(400).json({ error: 'waybill required' });
    if (!ALLOWED.includes(act)) return res.status(400).json({ error: `act must be one of ${ALLOWED.join(', ')}` });
    if (act === 'DEFER_DLV' && !/^\d{4}-\d{2}-\d{2}$/.test(String(deferred_date || ''))) {
      return res.status(400).json({ error: 'deferred_date (YYYY-MM-DD) required for DEFER_DLV' });
    }
    const entry = { waybill: String(waybill), act };
    if (act === 'DEFER_DLV')   entry.deferred_date = deferred_date;
    if (act === 'EDIT_DETAILS') {
      if (name)  entry.name  = name;
      if (phone) entry.phone = String(phone);
      if (add)   entry.add   = add;
    }
    const data = await dlRequest(`${dlBase()}/api/p/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [entry] }),
    });
    res.json({ success: true, upl_id: data?.request_id || data?.upl_id || null, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

app.get('/api/delhivery/ndr/status/:uplId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const data = await dlRequest(`${dlBase()}/api/cmu/get_bulk_upl/${encodeURIComponent(req.params.uplId)}`);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, details: e.data });
  }
});

// ── Scan-push webhook ──────────────────────────────────────────
// Delhivery can PUSH every scan instead of you polling. Give them this
// URL. Treated as untrusted input: we only ever match on a waybill we
// already issued, and never take a status we did not map.
// Old unauthenticated URL — kept only to fail loudly with guidance if
// Delhivery's dashboard still points here, instead of silently accepting
// unauthenticated status updates forever.
app.post('/api/delhivery/webhook', (req, res) => {
  console.warn('[Delhivery] ⛔ Webhook hit the OLD unauthenticated URL — update the Delhivery dashboard to /api/delhivery/webhook/' + '<DELHIVERY_WEBHOOK_SECRET>');
  res.status(410).json({ error: 'This webhook URL requires a secret token. Update the webhook URL in your Delhivery dashboard to include it — see DELHIVERY_WEBHOOK_SECRET in your Render env vars.' });
});

app.post('/api/delhivery/webhook/:secret', express.json(), async (req, res) => {
  try {
    // AUDIT FIX (Critical): this route had no authentication at all —
    // anyone who found the URL could POST a fake Delivered/Returned
    // status for ANY order. Delhivery has no published HMAC scheme like
    // GoKwik/Cashfree, so the portable fix is a shared secret: either in
    // the URL itself (works with any webhook config) or an
    // x-webhook-secret header (if their dashboard supports custom
    // headers). Reject anything that matches neither.
    const expected = process.env.DELHIVERY_WEBHOOK_SECRET;
    const provided = req.params.secret || req.headers['x-webhook-secret'];
    if (!expected) {
      console.error('[Delhivery] DELHIVERY_WEBHOOK_SECRET is not set — rejecting all webhook calls until it is configured.');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(String(expected));
    const validSecret = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!validSecret) {
      console.warn('[Delhivery] ⛔ Webhook rejected — invalid secret');
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const shipment = req.body?.Shipment || req.body?.shipment || req.body || {};
    const waybill = shipment.AWB || shipment.awb || shipment.Waybill || shipment.waybill;
        const status  = shipment.Status?.Status || shipment.status || '';
    const instructions = (shipment.Status?.Instructions || shipment.instructions || '').toString();
    if (!waybill) return res.status(400).json({ error: 'No waybill in payload' });

    // Idempotency. This handler is the one that most needs it: a repeated
    // 'Delivered' scan re-runs the VitaPoints and stock hooks below, and
    // Delhivery retries on any non-2xx. The dedupe key is the waybill plus
    // the scan itself (status + timestamp), which is stable across retries
    // of one scan but different for each genuine new scan on the same
    // parcel — so a normal Manifested -> In Transit -> Delivered sequence
    // is three distinct events, and a redelivery of any of them is not.
    const _scanStamp =
      shipment.Status?.StatusDateTime || shipment.Status?.StatusDate ||
      shipment.status_date || shipment.StatusDateTime || '';
    const _dlEventId = `${waybill}:${status}:${_scanStamp}`;
    const _dlSeen = await recordWebhookEvent({
      provider:  'delhivery',
      eventId:   _dlEventId,
      eventType: status || 'scan',
      payload:   req.body,
    });
    if (_dlSeen.duplicate) return res.json({ success: true, duplicate: true });

    const MAP = {
      'Manifested': 'Processing',
      'In Transit': 'Shipped', 'Pending': 'Shipped', 'Dispatched': 'Out for Delivery',
      'Delivered': 'Delivered', 'RTO': 'Returned', 'DTO': 'Returned',
      'Canceled': 'Cancelled', 'Cancelled': 'Cancelled', 'Lost': 'Cancelled',
    };
    // Pickup-failure scans are terminal: the parcel never left the origin.
    // Delhivery sends 'Not Picked' with instructions like "Shipment not
    // received from client" or "Pickup request Cancelled by Customer" —
    // both mean the shipment is dead, so treat them as Cancelled regardless
    // of whether the top status arrived first.
    const notPicked = status === 'Not Picked';
    const cancelEvidence = /not received from client|cancelled by customer|seller cancelled|pickup request cancelled|not picked/i.test(status + ' ' + instructions);
    let mapped = MAP[status];
    if (cancelEvidence) mapped = 'Cancelled';
    else if (notPicked) mapped = 'Processing';
    if (!mapped) { console.log(`[Delhivery] webhook: unmapped status "${status}" for ${waybill}`); return res.json({ success: true, ignored: true }); }
    const { data: order } = await supabase.from('orders')
      .select('id,fulfillment,customer_email').eq('delhivery_waybill', String(waybill)).single();
    if (!order) return res.json({ success: true, ignored: 'unknown waybill' });

    if (order.fulfillment !== mapped) {
      await supabase.from('orders')
        .update({ fulfillment: mapped, updated_at: new Date().toISOString() }).eq('id', order.id);
      await supabase.from('order_status_logs').insert([{
        order_id: order.id, old_status: order.fulfillment, new_status: mapped,
        changed_by: 'delhivery-webhook', note: `Delhivery scan: ${status}`,
        created_at: new Date().toISOString(),
      }]);
      // ── VITAPOINTS + STOCK ───────────────────────────────────
      // Same handlers the admin panel uses, so a courier-driven status
      // change and a manual one behave identically. Re-reads the order
      // so `total`/`shipping` are the stored values, not webhook input.
      try {
        const { data: fullOrder } = await supabase.from('orders')
          .select('id,customer_email,total,shipping,payment_method,payment_status,items')
          .eq('id', order.id).maybeSingle();
        await applyVitaOrderStatusChange(fullOrder || order, mapped, 'delhivery-webhook');
        // The courier confirmed the parcel died — if our records still say
        // COD was collected, that money never changed hands and the flag
        // must be reverted before the finance dashboard counts it.
        if ((mapped === 'Cancelled' || mapped === 'Returned')
            && fullOrder && fullOrder.payment_status === 'COD - Collected') {
          await supabase.from('orders').update({ payment_status: 'COD - Pending', updated_at: new Date().toISOString() }).eq('id', order.id);
          console.warn(`[Delhivery] webhook ${order.id}: courier says ${mapped} — reverted false COD - Collected`);
        }

        // A parcel the courier cancelled or sent back is stock again.
        // Delhivery maps 'Canceled'/'Lost' to Cancelled and RTO to
        // Returned, and none of that was putting anything back on the
        // shelf. Same one-way guard as the admin route: `order` still
        // holds the status from BEFORE this scan.
        if (isStockRestoredState(mapped) && !isStockRestoredState(order.fulfillment) && fullOrder) {
          await restoreStockForOrder(fullOrder, `delhivery ${mapped.toLowerCase()}`);
        }
      } catch (ve) { console.warn('[Delhivery] vita/stock hook failed:', ve.message); }
    }
    res.json({ success: true, waybill, status: mapped });
  } catch (e) {
    console.error('[Delhivery] webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// INSTAGRAM
// ═══════════════════════════════════════════════════════════════
// Simple in-memory cache — avoids hitting the Instagram Graph API (and
// paying its latency) on every single storefront page load. Feed content
// doesn't need to be more real-time than ~20 minutes.
let _igCache = { data: null, ts: 0 };
const IG_CACHE_MS = 20 * 60 * 1000; // 20 minutes

app.get('/api/instagram', async (req, res) => {
  try {
    if (_igCache.data && (Date.now() - _igCache.ts) < IG_CACHE_MS) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(_igCache.data);
    }
    const token = process.env.INSTAGRAM_TOKEN;
    if (!token) return res.json({ data: [] });
    // This runs on every home page load, so a slow Instagram is the
    // single easiest way to tie up the whole instance. Timed and
    // breaker-guarded, and the cache below is a real fallback: the feed
    // is decoration, and nobody's checkout should wait on it.
    const r    = await guardedFetch('instagram',
      `https://graph.instagram.com/me/media?fields=id,caption,media_url,thumbnail_url,permalink,media_type&limit=6&access_token=${token}`,
      {}, INSTAGRAM_BREAKER);
    const data = await r.json();
    if (data.error) throw new Error(data.error.message);
    _igCache = { data, ts: Date.now() };
    res.set('Cache-Control', 'public, max-age=300');
    res.json(data);
  } catch(err) {
    // Stale beats broken, and an empty feed beats a 500 that the
    // storefront has to handle. Never surface an Instagram outage to a
    // shopper.
    if (_igCache.data) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(_igCache.data);
    }
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: [], degraded: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════
// Read on every page load, identical for everyone, and changed by an
// admin perhaps once a week. Longer TTL than products because it moves
// even less — and the settings write paths invalidate it, so a genuine
// change is visible immediately rather than in five minutes.
app.get('/api/settings', cached(async () => {
  const { data } = await supabase.from('settings').select('*');
  const obj = {};
  (data||[]).forEach(s => { obj[s.key] = s.value; });
  return obj;
}, { ttlMs: 300000, staleMs: 600000, tag: 'settings' }));

// SECURITY: was missing adminOnly — any logged-in customer could take the
// store offline or change the GST rate / shipping threshold.
// FIX (Aug 2026 1000-scenario audit): the endpoint accepted unbounded
// payloads — a hostile admin could write 100KB+ strings into site_name and
// similar fields, bloating every cached copy of /api/settings that every
// storefront visitor fetches on each page load. Both the total payload and
// per-value length are now validated before anything is written.
app.put('/api/settings', authMiddleware, adminOnly, async (req, res) => {
  try {
    const MAX_SETTINGS_TOTAL = 64 * 1024;  // 64KB across the whole form
    const MAX_VALUE_LENGTH   = 2048;       // 2KB per individual value
    const body = req.body || {};
    let totalLen = 0;
    for (const [key, value] of Object.entries(body)) {
      const s = (typeof value === 'string') ? value : JSON.stringify(value ?? '');
      if (s.length > MAX_VALUE_LENGTH) {
        return res.status(400).json({ error: `Setting "${key}" is too long (max ${MAX_VALUE_LENGTH} characters).` });
      }
      totalLen += s.length + (key ? key.length : 0);
      if (totalLen > MAX_SETTINGS_TOTAL) {
        return res.status(400).json({ error: `Settings payload too large (max ${MAX_SETTINGS_TOTAL} characters).` });
      }
    }
    // One upsert for the whole payload. The admin panel saves the entire
    // settings form at once, so this was a round trip per field — and
    // worse, no transaction: a failure on the ninth setting left the
    // first eight written and the rest not, with a 500 that told the
    // admin nothing about which half had landed. A single multi-row
    // upsert is one statement, so it either all applies or none does.
    const stamp = new Date().toISOString();
    const rows = Object.entries(body).map(([key, value]) => ({ key, value: (typeof value === 'string') ? value : JSON.stringify(value ?? ''), updated_at: stamp }));
    if (!rows.length) return res.json({ success: true, updated: 0 });

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('settings')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'key' });
      if (error) throw error;
    }
    cacheInvalidate({ tag: 'settings' });
    res.json({ success: true, updated: rows.length });
  } catch(err) { res.status(500).json({ error: err.message }); }
});


// ═══════════════════════════════════════════════════════════════
// MARKETING SERVICE PROXY  (v9.2)
// ═══════════════════════════════════════════════════════════════
// The marketing service (campaigns, ad sets, strategy, reports) had no auth
// on any route — including POST /api/adsets/:id/budget, which sets the Meta
// daily ad budget. admin.html called it directly with no credentials.
//
// admin.html is a static file on GitHub Pages, so it can't hold a secret:
// anything in it is public. So the admin panel now calls THIS backend with
// the admin JWT it already has, and this route attaches INTERNAL_API_KEY
// server-side where nobody can read it.
//
// Requires on this service:  MARKETING_BACKEND_URL, INTERNAL_API_KEY
// (INTERNAL_API_KEY must be the same value set on the marketing service.)
app.all('/api/marketing/*', authMiddleware, requirePerm('marketing.manage'), async (req, res) => {
  const base = process.env.MARKETING_BACKEND_URL;
  const key  = process.env.INTERNAL_API_KEY;
  if (!base || !key) {
    return res.status(503).json({
      error: 'Marketing service not configured',
      hint: 'Set MARKETING_BACKEND_URL and INTERNAL_API_KEY in this service\'s Render env vars.',
    });
  }

  // Everything after /api/marketing/ is passed through unchanged — the
  // suffix already starts with /api (routes are mounted at /api/reports,
  // /api/campaigns, etc.), so it must NOT be prefixed with another /api.
  const suffix = req.originalUrl.replace(/^\/api\/marketing/, '');
  const target = base.replace(/\/+$/, '') + suffix;

  try {
    const r = await fetch(target, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', 'x-internal-key': key },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(30000),
    });
    const text = await r.text();
    res.status(r.status);
    try { res.json(JSON.parse(text)); } catch (_) { res.send(text); }
  } catch (err) {
    console.error('[marketing proxy]', err.message);
    res.status(502).json({ error: 'Marketing service unreachable: ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// LIVE VISITORS + ANALYTICS  (v9.1)
// ═══════════════════════════════════════════════════════════════
// Was: `const visitorSessions = new Map()` right here, holding every
// visitor in this process's memory. Three real problems with that:
//   1. Every Render restart, redeploy or cold start wiped it, so there
//      was never any day / week / month history to report on.
//   2. Sessions expired after 2 minutes but the storefront only re-pinged
//      every 4 minutes, so a visitor was invisible for half their visit
//      and "Active Now" under-counted by roughly half.
//   3. `page_views_today` was not today at all — it summed the pageviews
//      of whoever happened to be online in the last 2 minutes.
// It now lives in Postgres. See analytics-routes.js + analytics-schema.sql.
try {
  require('./analytics-routes')(app, { supabase, authMiddleware, adminOnly, cached, cacheInvalidate });
} catch (e) {
  console.error('[mount] analytics-routes FAILED:', e.message);
  // Fail soft: the store must still take orders even if analytics is broken.
  app.post('/api/visitors/ping', (_, res) => res.json({ ok: false }));
  app.post('/api/visitors/convert', (_, res) => res.json({ ok: false }));
  app.get('/api/visitors/active', authMiddleware, adminOnly,
    (_, res) => res.json({ active_count: 0, page_views_today: 0, sessions: [], error: 'analytics module not loaded' }));
}

// ═══════════════════════════════════════════════════════════════
// ADMIN SETTINGS
// ═══════════════════════════════════════════════════════════════
app.get('/api/admin/settings', authMiddleware, requirePerm('settings.manage'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) throw error;
    const obj = {};
    (data || []).forEach(row => { obj[row.key] = row.value; });
    res.json({ data: obj });
  } catch(err) {
    res.json({ data: {} });
  }
});

// Cosmetic picks (the admin's own UI theme) are not money or data — the
// save-password gate blocks them by default, so a plain theme change would
// always fail with 'Password re-confirmation required' and fall back to
// 'applied locally — offline' for every admin who picks a theme. A single-
// field interface_theme body is therefore allowed through; everything else
// still needs the save-password proof.
app.put('/api/admin/settings', authMiddleware, requirePerm('settings.manage'),
  (req, res, next) => {
    const keys = Object.keys(req.body || {});
    if (keys.length === 1 && keys[0] === 'interface_theme') return next();
    return passwordGated(req, res, next);
  }, async (req, res) => {
  try {
    const MAX_SETTINGS_TOTAL = 64 * 1024;  // 64KB across the whole form
    const MAX_VALUE_LENGTH   = 2048;       // 2KB per individual value
    let totalLen = 0;
    for (const [key, value] of Object.entries(req.body || {})) {
      const s = (typeof value === 'string') ? value : JSON.stringify(value ?? '');
      if (s.length > MAX_VALUE_LENGTH) {
        return res.status(400).json({ error: `Setting "${key}" is too long (max ${MAX_VALUE_LENGTH} characters).` });
      }
      totalLen += s.length + (key ? key.length : 0);
      if (totalLen > MAX_SETTINGS_TOTAL) {
        return res.status(400).json({ error: `Settings payload too large (max ${MAX_SETTINGS_TOTAL} characters).` });
      }
    }
    const incoming = { ...(req.body || {}) };
    for (const key of ['discount_ceiling_glutathione_acv', 'discount_ceiling_standard']) {
      if (Object.prototype.hasOwnProperty.call(incoming, key)) {
        const value = Number(incoming[key]);
        if (!Number.isFinite(value) || value < 0 || value > 50) return res.status(400).json({ error: `${key} must be between 0 and 50` });
        incoming[key] = Math.round(value * 100) / 100;
      }
    }
    req.body = incoming;
    // Same batching as PUT /api/settings above — one statement for the
    // whole form instead of a round trip per field, and all-or-nothing
    // instead of a partial write on failure.
    const stamp = new Date().toISOString();
    const rows = Object.entries(req.body || {})
      .map(([key, value]) => ({ key, value: String(value), updated_at: stamp }));
    if (!rows.length) return res.json({ success: true, updated: 0 });

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('settings')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'key' });
      if (error) throw error;
    }
    cacheInvalidate({ tag: 'settings' });
    _discountCeilingCache = { expiresAt: 0, values: DEFAULT_DISCOUNT_CEILINGS };
    res.json({ success: true, updated: rows.length });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
app.get('/', (_, res) => res.json({
  status:'ok', service:`${BRAND.name} Backend`, version:'9.7.1',
  timestamp: new Date().toISOString(),
  features: ['google-oauth','email-auth','soft-delete','audit-logs','order-status-history','image-upload','image-library','whatsapp-reports','gokwik','shiprocket','delhivery','email-notifications'],
  env: { supabase:!!process.env.SUPABASE_URL, gokwik:!!process.env.GOKWIK_APP_ID, shiprocket:!!process.env.SHIPROCKET_EMAIL, delhivery:!!process.env.DELHIVERY_API_TOKEN, twilio:!!process.env.TWILIO_ACCOUNT_SID, email:!!process.env.MAIL_USER },
}));
app.get('/health', (_, res) => res.json({ status:'ok' }));
// Canary — verifies this build is actually serving production requests (Manus audit 2026-08-17)
app.get('/api/canary-7f3b', (_, res) => res.json({ ok: true, marker: 'manus-audit-2026-08-17', version: '9.6.0' }));

// Wake endpoint — called by frontend before payment to ensure server is up
// Returns immediately so frontend can start the countdown timer


// ═══════════════════════════════════════════════════════════════
// VITAPOINTS — scheduled release
//
// Moves points from PENDING to AVAILABLE once delivery + the return
// window has elapsed, repaying any outstanding debt first. This is the
// other half of the hold: vita_mark_delivered starts the clock (from the
// courier webhook), and this is what actually fires when it runs out.
// Without it points would sit pending forever.
//
// vita_release_due() is idempotent per order, so overlapping runs, a
// restart mid-run, or a manual admin trigger can't double-credit.
// Hourly is ample for a day-granularity hold; it also runs once shortly
// after boot so a Render restart doesn't delay anyone by an hour.
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// ALERTS & FRAUD — admin surface  (audit fix #14)
// Alerts were being raised into system_alerts but nothing exposed them,
// so nobody would ever see one. These make them visible in the admin
// panel and mark them resolved.
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// MANUAL / GOKWIK REFUND RECORD  (audit fix #12)
// Cashfree refunds call a real API. GoKwik has no public refund API in
// this integration, and COD refunds happen offline entirely — so those
// were previously just free text typed into a return, with no audit
// trail. This records them in the same `refunds` ledger the Cashfree
// path writes to, so every rupee refunded has a row regardless of how
// the money actually moved. It does NOT move money — it records that a
// human did.
// ═══════════════════════════════════════════════════════════════
app.post('/api/admin/orders/:id/manual-refund', authMiddleware, requirePerm('orders.refund'), passwordGated, async (req, res) => {
  try {
    const { amount, note, return_id, method } = req.body || {};
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).maybeSingle();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const refundAmount = Number(amount);
    if (!(refundAmount > 0)) return res.status(400).json({ error: 'A positive refund amount is required' });

    // Never let recorded refunds exceed what was actually paid — the one
    // real guard against refund-amount fraud on the manual path.
    const { data: prior } = await supabase.from('refunds')
      .select('amount').eq('order_id', req.params.id).neq('status', 'failed');
    const already = (prior || []).reduce((t, r) => t + Number(r.amount || 0), 0);
    // AUDIT FIX (pre-launch 2026-08): the old "+ 1" allowed a refund a
    // full rupee above the order total — refund-amount cap must never
    // exceed what was paid. Only a 5-paise rounding tolerance remains.
    if (Math.round((already + refundAmount) * 100) > Math.round(Number(order.total) * 100) + 5) {
      return res.status(400).json({
        error: `Refund would exceed the order total. Paid ₹${order.total}, already refunded ₹${already}.`,
      });
    }

    const { data: row, error } = await supabase.from('refunds').insert({
      order_id: req.params.id, return_id: return_id || null,
      gateway: order.payment_gateway === 'gokwik' ? 'gokwik' : 'manual',
      gateway_refund_id: null, amount: refundAmount, status: 'processed',
      note: [note, method ? `via ${method}` : null].filter(Boolean).join(' — ') || null,
    }).select().single();
    if (error) throw error;

    const vita = await reverseVitaForRefund({
      orderId: req.params.id, refundAmount, orderTotal: order.total,
      returnId: return_id, refundRef: 'manual:' + row.id, actor: req.user.email || req.user.role,
    });

    await writeAudit({
      userId: req.user.email || req.user.role, tableName: 'refunds', recordId: String(row.id),
      action: 'manual_refund',
      newValues: { order_id: req.params.id, amount: refundAmount, method, vita_reversed: vita.reversed || 0 },
      ipAddress: clientIpOf(req),
    });

    res.json({ ok: true, refund: row, vita_points_reversed: vita.reversed || 0 });
  } catch (e) {
    console.error('[manual-refund]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/alerts', authMiddleware, adminOnly, async (req, res) => {
  try {
    let q = supabase.from('system_alerts').select('*').order('created_at', { ascending: false }).limit(200);
    if (req.query.open === 'true') q = q.is('resolved_at', null);
    if (req.query.category) q = q.eq('category', req.query.category);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/alerts/:id/resolve', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase.from('system_alerts')
      .update({ resolved_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ok: true, alert: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fraud picture for one customer — what checkVelocity sees, made visible.
app.get('/api/admin/fraud/customer/:email', authMiddleware, requirePerm('fraud.view'), async (req, res) => {
  try {
    const email = String(req.params.email).toLowerCase().trim();
    const [vel, orders] = await Promise.all([
      supabase.from('fraud_velocity').select('*').eq('scope', 'email').eq('scope_value', email)
        .order('occurred_at', { ascending: false }).limit(100),
      supabase.from('orders').select('id,total,payment_method,fulfillment,client_ip,created_at')
        .eq('customer_email', email).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(50),
    ]);
    const check = await checkVelocity({ email, ip: null });
    res.json({ email, flagged: check.flagged, reasons: check.reasons,
               velocity: vel.data || [], orders: orders.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// VITAPOINTS EXPIRY  (audit fix #18)
// vita_config.points_expiry_months existed but nothing ever read it —
// points never expired no matter what that value was set to. This runs
// daily and no-ops while the config is null (its current state), so
// enabling expiry is now a config change rather than a code change.
// ═══════════════════════════════════════════════════════════════
function startVitaExpiryJob() {
  async function expireDue() {
    try {
      const { data, error } = await supabase.rpc('vita_expire_due');
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) || {};
      if ((r.expired_users || 0) > 0) {
        console.log(`[VitaPoints] Expired ${r.expired_points} pts across ${r.expired_users} account(s)`);
      }
    } catch (e) { console.warn('[VitaPoints] expiry job failed:', e.message); }
  }
  setTimeout(expireDue, 5 * 60 * 1000);
  setInterval(expireDue, 24 * 60 * 60 * 1000);
  console.log('[VitaPoints] expiry job scheduled (daily)');
}
startVitaExpiryJob();

// ── Retention purge (migration 013) ──────────────────────────────────
// Trims analytics/admin-event tables that grow forever (audit_logs 180d,
// visitor_pageviews / visitor_sessions 90d, fraud_velocity 30d). Unbounded
// growth was the main driver of the Supabase "Disk IO budget" warning —
// every insert writes into a larger and larger heap. Revenue tables
// (orders, refunds, reviews, returns, customers, vita_*, coupons,
// products) are deliberately never purged. First run at boot + 3h so it
// never lands on the morning traffic peak.
function startRetentionPurgeJob() {
  async function purge() {
    try {
      const { data, error } = await supabase.rpc('purge_growth_tables');
      if (error) throw error;
      if ((data ?? 0) > 0) console.log(`[retention] purged ${data} stale row(s)`);
    } catch (e) { console.warn('[retention] purge failed:', e.message); }
  }
  setTimeout(purge, 3 * 60 * 60 * 1000);
  setInterval(purge, 24 * 60 * 60 * 1000);
  console.log('[retention] daily purge job scheduled (audit 180d, pageviews/sessions 90d, fraud 30d)');
}
startRetentionPurgeJob();

function startVitaReleaseJob() {
  const RELEASE_INTERVAL = 60 * 60 * 1000; // hourly

  async function releaseDue() {
    try {
      const { data, error } = await supabase.rpc('vita_release_due');
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) || {};
      if ((r.released_orders || 0) > 0 || (r.debt_recovered || 0) > 0) {
        console.log(`[VitaPoints] Released ${r.released_points || 0} pts across ` +
                    `${r.released_orders || 0} order(s); debt recovered ${r.debt_recovered || 0}`);
      }
    } catch (e) {
      console.warn('[VitaPoints] release job failed:', e.message);
    }
  }

  setTimeout(releaseDue, 60 * 1000);        // 1 min after boot
  setInterval(releaseDue, RELEASE_INTERVAL);
  console.log('[VitaPoints] release job scheduled (hourly)');
}
startVitaReleaseJob();

// ═══════════════════════════════════════════════════════════════
// KEEP-ALIVE
// ═══════════════════════════════════════════════════════════════
function startKeepAlive() {
  const SELF_URL = BRAND.apiUrl;

  // This exists for ONE reason: Render's free tier sleeps after 15
  // minutes of inactivity, and a self-ping every 4 minutes keeps it
  // awake. The service is on Starter now, which never sleeps, so the
  // ping prevents nothing — it just fires a request at ourselves 360
  // times a day and writes "Render may be restarting" into the log
  // whenever one of them blips, which reads like the server is going
  // to sleep on a plan where it cannot.
  //
  // Off by default. Set KEEP_ALIVE=1 to bring it back if the service
  // is ever moved back to the free tier.
  if (process.env.KEEP_ALIVE !== '1') {
    console.log('[keep-alive] disabled — paid Render tiers do not sleep. Set KEEP_ALIVE=1 to re-enable.');
    return;
  }

  const INTERVAL = 4 * 60 * 1000; // 4 minutes

  let pingCount = 0;
  setInterval(async () => {
    try {
      const r   = await fetch(`${SELF_URL}/health`, { signal: AbortSignal.timeout(10000) });
      pingCount++;
      const now = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
      if (r.ok) {
        if (pingCount % 3 === 0) console.log(`✅ [KEEP-ALIVE] Active — pinged at ${now} IST (ping #${pingCount})`);
      } else {
        console.warn(`⚠️ [KEEP-ALIVE] Ping returned ${r.status} at ${now}`);
      }
    } catch(e) {
      console.warn(`⚠️ [KEEP-ALIVE] Ping failed: ${e.message} — Render may be restarting`);
    }
  }, INTERVAL);

  console.log(`✅ Keep-alive started — pinging every 4 min to prevent Render sleep`);
}

// ═══════════════════════════════════════════════════════════════
// COURIER AUTO-SYNC + COD WALLET
//
// Automatic, no manual work: every 10 minutes this service asks the
// courier platforms (Shiprocket / Delhivery) what happened to the
// orders that are still mid-journey, and writes the answer back to
// the orders table:
//   In Transit  → Shipped
//   Out For Delivery → Shipped (driver is on the way)
//   Delivered   → Delivered, and COD orders flip to "COD - Collected"
//                 (money collected from the customer, held in the
//                  courier's wallet until remittance)
//   Undelivered / RTO → Return Initiated
// The wallet endpoint below aggregates how much COD cash is sitting
// with the delivery partner and what has already been remitted, so
// the admin dashboard shows revenue vs "with courier" money live.
// ═══════════════════════════════════════════════════════════════
// Courier tracking rarely moves faster than a few scan events per hour, and the
// sync only queries orders that have a courier reference and are mid-journey
// (usually a handful). A 2.5 h cadence cuts the courier-API and DB load by
// 15x with no visible delay to customers — the storefront My Orders page
// refreshes what the DB says every 60 s either way.
const SYNC_INTERVAL_MS = 2.5 * 60 * 60 * 1000;
const srStatusMap = { // Shiprocket tracking_status → fulfillment
  'pickup_generated': 'Processing',
  'picked_up': 'Shipped',
  'in_transit': 'Shipped',
  'out_for_delivery': 'Shipped',
  'undelivered': 'Return Initiated',
  'rto_in_transit': 'Return Initiated',
  'rto_delivered': 'Returned',
  'delivered': 'Delivered',
  'cancelled': 'Cancelled',
  'lost_in_transit': 'Return Initiated',
};
// Delhivery scan statuses → fulfillment (first-match map on Shipment_Status/Scan sub-status)
// Delhivery scan statuses → fulfillment. Order matters: terminal states
// (Cancelled, Delivered) are checked BEFORE transient ones so a parcel
// the courier cancelled after pickup can never be misread as 'Shipped'.
const dlStatusMap = [
  // Terminal first — these override anything else in the scan history
  { m: /not picked|shipment not received from client|not received from client/i, v: 'Cancelled' },
  { m: /pickup request cancelled|cancelled by customer|seller cancelled/i, v: 'Cancelled' },
  { m: /cancelled/i, v: 'Cancelled' },
  { m: /rto\b|return to origin|returned to origin/i, v: 'Return Initiated' },
  { m: /rto delivered|return delivered|returned|dto/i, v: 'Returned' },
  { m: /deliver/i, v: 'Delivered' },
  { m: /pick up|pickup|not picked(?=.*manifested)/i, v: 'Shipped' },
  { m: /in transit|out for delivery|dispatched/i, v: 'Shipped' },
];
let courierSyncState = { lastRunAt: null, lastOkAt: null, lastSynced: 0, lastError: null };

async function syncCourierStatuses() {
  const startedAt = Date.now();
  let synced = 0;
  try {
    // Only orders that are still mid-journey and attached to a courier reference
    const { data: pending } = await supabase.from('orders')
      .select('id,customer_email,fulfillment,payment_status,items,shiprocket_id,delhivery_waybill,total,shipping')
      .is('deleted_at', null)
      .in('fulfillment', ['Pending','Processing','Shipped']);
    // Late-stage surprises: couriers sometimes cancel an order AFTER it
    // was marked delivered (pickup cancelled post-manifest) or flip a
    // delivery into RTO/returned days later. Re-scan recently finished
    // Delhivery orders too, but only the ones touched in the last 14 days
    // so the window stays bounded and cheap.
    const recentCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: finished } = await supabase.from('orders')
      .select('id,customer_email,fulfillment,payment_status,items,shiprocket_id,delhivery_waybill,total,shipping,updated_at')
      .is('deleted_at', null)
      .in('fulfillment', ['Delivered','Returned','Return Initiated'])
      .gte('updated_at', recentCutoff);
    const finishedList = (finished || []).filter(o => o.delhivery_waybill || o.shiprocket_id);
    const midList = (pending || []).filter(o => o.shiprocket_id || o.delhivery_waybill);
    const list = [...midList, ...finishedList.filter(f => !midList.some(m => m.id === f.id))];
    if (!list.length) { courierSyncState = { lastRunAt: new Date().toISOString(), lastOkAt: courierSyncState.lastOkAt, lastSynced: 0, lastError: null }; return; }
    for (const order of list) {
      let newFulfill = null;
      try {
        if (order.shiprocket_id) {
          const info = await srRequest(`https://apiv2.shiprocket.in/v1/external/orders/show/${order.shiprocket_id}`);
          const st = (info && (info.order_status || info.tracking_status || '')).toString().toLowerCase();
          if (st && srStatusMap[st]) newFulfill = srStatusMap[st];
          else if (st && srStatusMap[st.replace(/\s+/g,'_')]) newFulfill = srStatusMap[st.replace(/\s+/g,'_')];
        } else if (order.delhivery_waybill) {
          const info = await dlRequest(`${dlBase()}/api/v1/packages/json/?waybill=${encodeURIComponent(order.delhivery_waybill)}`);
          const pkg = (info && info.Shipment && info.Shipment[0]);
          if (pkg && (pkg.Shipment_Status || pkg.Status || '')) {
            // Include the courier's human-readable instructions (e.g.
            // "Shipment not received from client", "Pickup request Cancelled
            // by Customer") — those are where cancellation evidence lives.
            const topStatus = (pkg.Status && pkg.Status.Status) || pkg.Shipment_Status || pkg.Status || '';
            const topInstructions = (pkg.Status && pkg.Status.Instructions) || pkg.Instructions || '';
            let scan = (topStatus + ' ' + topInstructions).toLowerCase();
            // Scan history carries every event; the LAST entry is the truth
            // and often holds the cancellation instruction the top status
            // omits (e.g. 'Not Picked' with 'Pickup request Cancelled by
            // Customer').
            const scanList = Array.isArray(pkg.Scans) ? pkg.Scans : [];
            const lastScan = scanList.length ? scanList[scanList.length - 1].ScanDetail : null;
            if (lastScan) {
              scan = ((lastScan.Scan || '')+' '+(lastScan.Instructions || '')+' '+(lastScan.Status || '')).toLowerCase() + ' ' + scan;
            }
            for (const rule of dlStatusMap) { if (rule.m.test(scan)) { newFulfill = rule.v; break; } }
          }
        }
        if (newFulfill && newFulfill !== order.fulfillment) {
          const nowIso = new Date().toISOString();
          const update = { fulfillment: newFulfill, updated_at: nowIso };
          // COD orders that the courier reports delivered: money was collected → collected state
          if (newFulfill === 'Delivered' && (order.payment_status||'') === 'COD - Pending') {
            update.payment_status = 'COD - Collected';
          }
          // The courier confirmed the parcel was cancelled or returned —
          // any 'COD - Collected' flag on this order is now wrong and must
          // go back to pending so the finance dashboard stops counting it
          // as revenue. (Real refunds are handled by the admin refund path;
          // the courier cancelling a pickup means no money ever changed hands.)
          if ((newFulfill === 'Cancelled' || newFulfill === 'Returned') && (order.payment_status||'') === 'COD - Collected') {
            update.payment_status = 'COD - Pending';
            console.warn(`[COURIER-SYNC] ${order.id} courier says ${newFulfill} — reverted false COD - Collected`);
          }
          const { error: updErr } = await supabase.from('orders')
            .update(update).eq('id', order.id).is('deleted_at', null);
          if (updErr) console.warn('[COURIER-SYNC] update failed for', order.id, updErr.message);
          else {
            await supabase.from('order_status_logs').insert({
              order_id: order.id, from_status: order.fulfillment, to_status: newFulfill,
              changed_by: 'courier-auto-sync', note: 'Auto-synced from courier tracking', created_at: nowIso,
            });
            // The courier just confirmed delivery — the sale is real, so the
            // customer's VitaPoints are earned NOW (COD especially: the cash
            // was only collected at this moment). Mirrors the Delhivery webhook
            // and the admin manual update paths; both vita_earn_on_order and
            // vita_mark_delivered are idempotent per order id, so a retry or a
            // later admin edit cannot double-award.
            if (newFulfill === 'Delivered') {
              const deliveredOrder = { id: order.id, customer_email: order.customer_email, total: order.total };
              const eligible = Math.max(0, (Number(order.total) || 0) - (Number(order.shipping) || 0));
              await awardVitaPoints(deliveredOrder, { eligibleValue: eligible });
              await supabase.rpc('vita_mark_delivered', {
                p_order: order.id, p_delivered_at: nowIso,
              }).catch((mdErr) => console.warn('[COURIER-SYNC] vita_mark_delivered failed for', order.id, String(mdErr?.message || mdErr).slice(0, 120)));
            }
            // Courier-confirmed death of the order: reverse points, put the
            // stock back, and — for prepaid orders — refund the money. This
            // mirrors applyVitaOrderStatusChange from the webhook and admin
            // paths so all three status sources behave identically.
            if (newFulfill === 'Cancelled' || newFulfill === 'Returned') {
              try {
                await applyVitaOrderStatusChange(
                  { id: order.id, total: order.total, shipping: order.shipping }, newFulfill, 'courier-auto-sync');
                if (typeof restoreStockForOrder === 'function') {
                  await restoreStockForOrder(
                    { id: order.id, items: order.items, fulfillment: order.fulfillment },
                    `courier ${newFulfill.toLowerCase()}`);
                }
              } catch (chErr) {
                console.warn(`[COURIER-SYNC] vita/stock hook failed for ${order.id}:`, String(chErr?.message || chErr).slice(0, 150));
              }
              // Prepaid (Cashfree) order cancelled/returned by the courier:
              // the customer already paid, so refund them automatically.
              // COD needs no refund (cash never moved / already reverted
              // above), and GoKwik orders fall back to the manual-refund
              // ledger that admins still close by hand.
              try {
                if ((order.payment_method || '') === 'cashfree' && (order.payment_status || '') === 'Paid'
                    && !!(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY)) {
                  const refundAmt = Math.max(0, Number(order.total) || 0);
                  if (refundAmt > 0) {
                    // Deterministic id per order+amount so a retried sync run
                    // can never create a duplicate refund — the refunds row
                    // with the same gateway_refund_id short-circuits in the
                    // Cashfree route, and here we record the row directly so
                    // the same row acts as the dedup ledger for both paths.
                    const refundId = 'RF-' + order.id + '-' + Math.round(refundAmt * 100);
                    const { data: existingRefund } = await supabase.from('refunds')
                      .select('id,status').eq('order_id', order.id).eq('gateway_refund_id', refundId).maybeSingle();
                    if (existingRefund) {
                      console.log(`[COURIER-SYNC] refund ${refundId} for ${order.id} already recorded (${existingRefund.status}) — skipped`);
                    } else {
                      let refundRow = null;
                      try {
                        refundRow = (await supabase.from('refunds').insert({
                          order_id: order.id, gateway: 'cashfree', gateway_refund_id: refundId,
                          amount: refundAmt, status: 'pending',
                          note: `Courier auto-sync: shipment ${newFulfill.toLowerCase()} (${order.delhivery_waybill || order.shiprocket_id || ''})`,
                        }).select().single()).data || null;
                      } catch (e) { console.warn('[courier-sync] refund row write failed:', e.message); }
                      // Same constants the Cashfree module uses — inline here
                    // because the Cashfree helpers live inside that module's
                    // closure and are not reachable from the top-level sync.
                    const _cfEnv = (process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase();
                    const _cfBase = _cfEnv === 'PRODUCTION' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
                    const cfResp = await fetch(`${_cfBase}/orders/${encodeURIComponent(order.id)}/refunds`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'x-client-id':     process.env.CASHFREE_APP_ID,
                          'x-client-secret':  process.env.CASHFREE_SECRET_KEY,
                          'x-api-version':    process.env.CASHFREE_API_VERSION || '2023-08-01',
                        },
                        body: JSON.stringify({ refund_id: refundId, refund_amount: refundAmt, refund_note: `Courier auto-sync: shipment ${newFulfill.toLowerCase()}` }),
                        signal: AbortSignal.timeout(30000),
                      }).catch(() => null);
                      if (!cfResp || !cfResp.ok) {
                        const failData = cfResp ? await cfResp.json().catch(() => ({})) : {};
                        try {
                          if (refundRow) await supabase.from('refunds').update({ status: 'failed', raw_response: failData, updated_at: new Date().toISOString() }).eq('id', refundRow.id);
                        } catch (e) { console.warn('[courier-sync] refund status write failed:', e.message); }
                        console.warn(`[COURIER-SYNC] auto-refund FAILED for ${order.id} — admin must complete it manually:`, (failData.message || '').slice(0, 150));
                      } else {
                        const cfJson = await cfResp.json().catch(() => ({}));
                        const mapped = cfJson.refund_status === 'SUCCESS' ? 'processed' : 'pending';
                        try {
                          if (refundRow) await supabase.from('refunds').update({ status: mapped, raw_response: cfJson, updated_at: new Date().toISOString() }).eq('id', refundRow.id);
                        } catch (e) { console.warn('[courier-sync] refund status write failed:', e.message); }
                        console.log(`[COURIER-SYNC] auto-refund initiated for ${order.id}: ${refundId} (${mapped})`);
                      }
                    }
                  }
                }
              } catch (rfErr) {
                console.warn(`[COURIER-SYNC] auto-refund error for ${order.id}:`, String(rfErr?.message || rfErr).slice(0, 150));
              }
            }
            synced++;
          }
        }
      } catch (e) { /* breaker open / timeout — skip this order silently */ }
    }
    courierSyncState = { lastRunAt: new Date().toISOString(), lastOkAt: new Date().toISOString(), lastSynced: synced, lastError: null };
  } catch (e) {
    courierSyncState = { lastRunAt: new Date().toISOString(), lastOkAt: courierSyncState.lastOkAt, lastSynced: synced, lastError: String(e.message||e).slice(0,200) };
  }
}

app.get('/api/admin/courier-wallet', authMiddleware, adminOnly, async (req, res) => {
  // COD money picture: what sits with the delivery partner vs what is collected
  try {
    const midnight = new Date(); midnight.setHours(0,0,0,0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const [ordRes, custRes] = await Promise.all([
      supabase.from('orders').select('id,payment_status,fulfillment,total,created_at')
        .is('deleted_at', null).gte('created_at', monthStart.toISOString()),
      supabase.from('orders').select('total').is('deleted_at', null)
        .in('fulfillment', ['Shipped']).eq('payment_status', 'COD - Pending'),
    ]);
    const orders = ordRes.data || [];
    const codPendingMonth = orders.filter(o => (o.payment_status||'') === 'COD - Pending').reduce((s,o)=>s+parseFloat(o.total||0),0);
    const codCollectedMonth = orders.filter(o => (o.payment_status||'') === 'COD - Collected').reduce((s,o)=>s+parseFloat(o.total||0),0);
    const codPendingWithCourier = (custRes.data || []).reduce((s,o)=>s+parseFloat(o.total||0),0);
    const inTransit = (custRes.data || []).length;
    let shiprocketWallet = { pending: null, remitted: null, source: null };
    try {
      const from = new Date(Date.now()-90*86400000).toISOString().split('T')[0];
      const to = new Date().toISOString().split('T')[0];
      const sum = await srRequest(`https://apiv2.shiprocket.in/v1/external/cod/summary?from_date=${from}&to_date=${to}`);
      if (sum && typeof sum === 'object') shiprocketWallet = { pending: sum.pending_cod || sum.pending || null, remitted: sum.remitted_cod || sum.remitted || null, source: 'shiprocket' };
    } catch (_) { /* courier API momentarily unavailable */ }
    res.json({
      wallet: {
        codPendingWithCourier,   // COD orders delivered-and-collected still sitting in the courier's wallet
        codPendingMonth,         // COD placed this month, money not yet collected
        codCollectedMonth,       // COD collected (or paid online) this month
        inTransitOrders: inTransit,
        shiprocketWallet,
      },
      sync: courierSyncState,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// FINANCE DASHBOARD — owner/admin (adminOnly)
//
// One call gives the whole money picture:
//   • Shiprocket   — COD collected vs pending from the courier's own
//                    cod/summary + the account statement (charges deducted
//                    by the platform from remittance are separated out
//                    because COD money you see collected ≠ cash you get;
//                    the platform first subtracts its own shipping fees)
//   • Delhivery    — COD collected vs pending from our orders table
//                    (partner-coded orders, payment_status flips to
//                    COD - Collected when the sync job confirms
//                    delivery + collection; charges estimated per order
//                    from the shipping amount we paid)
//   • Gateway      — Cashfree settlements: processed (banked), pending,
//                    and the per-settlement fee so collection is shown
//                    GROSS vs NET of gateway charges
//   • Timeline     — monthly series for the last 12 months per source
//   • Totals       — grand totals collected / pending / charges / net
// The admin panel draws everything from this single endpoint, so the
// dashboard never does courier math itself.
// ═══════════════════════════════════════════════════════════════
async function fetchSrToken() {
  if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) return null;
  const r = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d.token || null;
}

// Shiprocket statement fields vary by plan/region, so we map every known
// alias. `credit` entries are COD money collected (what the platform owes
// you); `debit` entries are the platform's own charges (forward shipping,
// RTO charges) deducted from remittance.
const SR_MAP = {
  credit: ['credit', 'credit_amount', 'cod_remittance', 'cod_remit', 'remitted_cod', 'amount_received', 'cod_amount'],
  debit:  ['debit', 'debit_amount', 'charge', 'charges', 'charge_amount', 'fee', 'shipping_charge', 'forward_charge'],
  type:   ['type', 'txn_type', 'transaction_type', 'status'],
  label:  ['label', 'title', 'description', 'note'],
  date:   ['date', 'created_at', 'txn_date', 'transaction_date'],
};
const pick = (obj, keys) => keys.find(k => obj && typeof obj === 'object' && k in obj && obj[k] != null) ? obj[keys.find(k => obj && typeof obj === 'object' && k in obj && obj[k] != null)] : undefined;
const SR_CREDIT_RE = /cod|remitt|credit|collect/i;
const SR_DEBIT_RE  = /charge|fee|ship|forward|rto|debit|adjust/i;

// Finance is the heaviest dashboard endpoint (3 courier API calls + DB
// window scans). Cache the full response for 5 minutes keyed by days — an
// admin refreshing the page repeatedly no longer re-hits courier APIs and
// DB for each refresh, which directly trims Disk IO consumption.
const _financeCache = new Map();
const FINANCE_CACHE_MS = 5 * 60 * 1000;
app.get('/api/admin/finance', authMiddleware, adminOnly, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 7), 365);
  const ck = String(days);
  const hit = _financeCache.get(ck);
  if (hit && Date.now() - hit.ts < FINANCE_CACHE_MS) {
    return res.json(Object.assign({}, hit.body, { cached: true, fetchedAt: hit.fetchedAt }));
  }
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const isodate = d => d.toISOString().split('T')[0];

    // ── 1. OUR SOURCE OF TRUTH: orders table, split by courier ──────
    // COD collected = payment_status flipped by the courier sync job when
    // the delivery partner confirmed delivery AND cash collected. COD
    // pending = delivered, money collected by driver, still with courier.
    const [allRes, shippedPendingRes] = await Promise.all([
      supabase.from('orders').select('id,payment_status,fulfillment,total,created_at,delivered_at,shipping,shiprocket_id,delhivery_waybill,courier')
        .is('deleted_at', null).gte('created_at', cutoff.toISOString()),
      supabase.from('orders').select('id,total').is('deleted_at', null)
        .in('fulfillment', ['Shipped']).eq('payment_status', 'COD - Pending'),
    ]);
    const orders = (allRes.data || []).filter(o => !(o.courier === 'COD' && !o.shiprocket_id && !o.delhivery_waybill));
    const codCollected = orders.filter(o => (o.payment_status || '') === 'COD - Collected');
    const codPending = orders.filter(o => (o.payment_status || '') === 'COD - Pending');
    const paidOnline = orders.filter(o => (o.payment_status || '') === 'Paid');
    const srcOf = o => (o.shiprocket_id ? 'shiprocket' : o.delhivery_waybill ? 'delhivery' : 'other');
    const sum = (list, fn) => list.reduce((s, o) => s + (fn(o) || 0), 0);

    const srCollected = codCollected.filter(o => srcOf(o) === 'shiprocket');
    const dlCollected = codCollected.filter(o => srcOf(o) === 'delhivery');
    const dlPending   = codPending.filter(o => srcOf(o) === 'delhivery');

    // Per-courier monthly timeline (our delivery data — always available)
    // 12 months back — but only months that fall inside the chosen window,
    // so a 90-day view does not show empty older buckets.
    const months = {};
    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = isodate(m).slice(0, 7);
      if (m.getTime() + 31 * 86400000 < cutoff.getTime()) continue;
      months[key] = { shiprocket: 0, delhivery: 0, gateway: 0 };
    }
    const monthKey = iso => iso && iso.slice(0, 7);
    for (const o of [...codCollected, ...paidOnline]) {
      const k = monthKey(o.delivered_at || o.created_at);
      const amt = parseFloat(o.total || 0);
      if (months[k] && k in months) {
        if (o.payment_status === 'COD - Collected') months[k][srcOf(o)] = (months[k][srcOf(o)] || 0) + amt;
        else if (o.payment_status === 'Paid') months[k].gateway = (months[k].gateway || 0) + amt;
      }
    }

    const walletTotals = {
      codCollectedAll: sum(codCollected, o => parseFloat(o.total || 0)) + sum(paidOnline, o => parseFloat(o.total || 0)),
      codPendingWithCourierAll: sum(shippedPendingRes.data || [], o => parseFloat(o.total || 0)),
    };

    // ── 2. SHIPROCKET — courier's own numbers ──────────────────────
    let shiprocket = { status: 'not_configured', collected: null, pending: null, remitted: null,
      charges: null, collectedWhen: [], raw: null };
    try {
      const from = isodate(cutoff); const to = isodate(now);
      let tok = await fetchSrToken();
      const srGet = async (path) => {
        const r = await fetch('https://apiv2.shiprocket.in/v1/external/' + path, {
          headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(10000),
        });
        if (r.status === 401) { tok = await fetchSrToken(); if (!tok) throw new Error('Shiprocket auth failed');
          const r2 = await fetch('https://apiv2.shiprocket.in/v1/external/' + path, {
            headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(10000),
          });
          return r2.status === 200 ? await r2.json() : null;
        }
        return r.status === 200 ? await r.json() : null;
      };
      // a. COD summary (what the platform reports as collected vs remitted)
      const summary = await srGet(`cod/summary?from_date=${from}&to_date=${to}`);
      const s = summary || {};
      shiprocket.pending = s.pending_cod ?? s.pending ?? null;
      shiprocket.remitted = s.remitted_cod ?? s.remitted ?? null;
      // b. Statement — per-transaction COD money: credits are COD collected
      // by the platform (what it owes you), debits are its own charges
      // deducted before remittance. This is the "collected ≠ banked"
      // distinction the user asked for.
      const stmt = await srGet(`account/statement?from_date=${from}&to_date=${to}&page=1&per_page=100`);
      const rows = Array.isArray(stmt) ? stmt : (stmt && Array.isArray(stmt.statements)) ? stmt.statements : (stmt && Array.isArray(stmt.data)) ? stmt.data : [];
      let srCredits = 0, srDebits = 0;
      const collectedWhen = [];
      for (const row of rows) {
        const label = pick(row, SR_MAP.label) || '';
        const amt = parseFloat(pick(row, SR_MAP.credit) ?? pick(row, SR_MAP.debit) ?? 0) || 0;
        const kind = (pick(row, SR_MAP.type) || label).toString();
        const dte = pick(row, SR_MAP.date) || row.created_at || row.date;
        if (SR_CREDIT_RE.test(kind) || SR_CREDIT_RE.test(label)) { srCredits += amt; collectedWhen.push({ date: dte, amount: amt, label: String(label) }); }
        else if (SR_DEBIT_RE.test(kind) || SR_DEBIT_RE.test(label)) { srDebits += amt; }
      }
      shiprocket.collected = srCredits || (summary ? (parseFloat(summary.cod_collected || 0) || null) : null);
      shiprocket.charges = srDebits || null;
      shiprocket.collectedWhen = collectedWhen.slice(-50).reverse();
      shiprocket.raw = { summary: s, statementRows: rows.length };
      shiprocket.status = 'connected';
    } catch (e) { shiprocket.status = shiprocket.status === 'not_configured' ? 'not_configured' : 'error'; shiprocket.error = e.message; }

    // ── 3. DELHIVERY — COD from our orders + remittance portal estimate ──
    let delhivery = {
      status: process.env.DELHIVERY_API_TOKEN ? 'connected' : 'not_configured',
      collected: sum(dlCollected, o => parseFloat(o.total || 0)),
      pending: sum(dlPending, o => parseFloat(o.total || 0)),
      collectedOrders: dlCollected.length,
      pendingOrders: dlPending.length,
      collectedWhen: dlCollected.map(o => ({ date: o.delivered_at || o.created_at, amount: parseFloat(o.total || 0) })).reverse().slice(-50),
      charges: null, // Delhivery's COD remittance portal is not API-exposed;
      // charges are tracked through the shipping column on each order.
      chargesEstimated: sum([...dlCollected, ...dlPending], o => parseFloat(o.shipping || 0)),
      note: 'Delhivery COD remittance details live in one.delhivery.com → COD Remittance; the tracking API only exposes shipment status.',
    };

    // ── 4. CASHFREE — gateway settlements (net of gateway fees) ──────
    let gateway = { status: process.env.CASHFREE_APP_ID ? 'connected' : 'not_configured',
      collected: sum(paidOnline, o => parseFloat(o.total || 0)),
      settlements: [], gross: 0, fees: 0, netSettled: 0 };
    try {
      if (process.env.CASHFREE_APP_ID) {
        const cfAuth = await fetch('https://api.cashfree.com/pg/generate-token', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-version': '2023-08-01' },
          body: JSON.stringify({ appId: process.env.CASHFREE_APP_ID, secret: process.env.CASHFREE_SECRET_KEY }),
          signal: AbortSignal.timeout(8000),
        });
        const cfTok = (await cfAuth.json()).cftoken;
        if (cfTok) {
          const sRes = await fetch('https://api.cashfree.com/pg/settlements?from_time=' + encodeURIComponent(cutoff.toISOString()) + '&to_time=' + encodeURIComponent(now.toISOString()), {
            headers: { Authorization: 'Bearer ' + cfTok, 'x-api-version': '2023-08-01' },
            signal: AbortSignal.timeout(8000),
          });
          if (sRes.ok) {
            const body = await sRes.json();
            const items = (body.settlements || body.data || []).filter(x => new Date(x.created_at) >= cutoff);
            for (const x of items) {
              const fee = parseFloat(x.fee || x.charge || x.gst || 0) || 0;
              const net = parseFloat(x.settlement_amount || x.amount || 0) || 0;
              const gross = net + fee;
              gateway.gross += gross;
              gateway.fees += fee;
              gateway.netSettled += net;
              gateway.settlements.push({
                id: x.settlement_id || x.id,
                amount: net,
                fee,
                gross,
                status: x.status || x.state,
                bank_ref: x.bank_reference_number || x.bank_reference || null,
                date: x.created_at || x.utr_date,
              });
            }
            gateway.settlements = gateway.settlements.reverse().slice(-50);
          }
        }
      }
    } catch (e) { gateway.status = 'error'; gateway.error = e.message; }

    // ── 5. GRAND TOTALS ─────────────────────────────────────────────
    // Collected = COD collected from customers (both couriers) + online-paid
    // orders from our books. Gateway settlements are shown separately so
    // nothing is counted twice — settlement gross ≈ onlinePaid, so the
    // difference between them is the fee leakage worth watching.
    const collected = walletTotals.codCollectedAll;
    const pending = walletTotals.codPendingWithCourierAll;
    const charges = (shiprocket.charges || 0) + (gateway.fees || 0) + (delhivery.chargesEstimated || 0);
    const body = {
      days,
      sources: {
        shiprocket: { ...shiprocket, collectedOrders: srCollected.length },
        delhivery,
        gateway,
      },
      totals: {
        collected,        // money already collected: COD from both couriers + online-paid
        pending,          // COD collected from customer, still with courier (both partners)
        charges,          // platform + gateway fees deducted before the money reaches your bank
        netRealizable: collected - charges, // what you actually keep after charges
        codCollected: sum(codCollected, o => parseFloat(o.total || 0)),
        onlinePaid: sum(paidOnline, o => parseFloat(o.total || 0)),
        gatewaySettlementsGross: gateway.gross,   // banked by gateway incl. fees (mirror of onlinePaid)
        gatewaySettlementsNet: gateway.netSettled,  // banked after gateway fees
        courierPending: pending,
      },
      timeline: Object.entries(months).sort(([a],[b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, shiprocket: Math.round(v.shiprocket*100)/100, delhivery: Math.round(v.delhivery*100)/100, gateway: Math.round(v.gateway*100)/100 })),
      courierSync: courierSyncState,
      fetchedAt: now.toISOString(),
    };
    // Remember this response for 5 min so repeated admin refreshes are free
    // (only one res.json call exists in this branch — the cache stores the
    // exact body we send below).
    _financeCache.set(ck, { ts: Date.now(), body, fetchedAt: now.toISOString() });
    res.json(body);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ANALYTICS ROUTES — used by admin dashboard charts + GA4 widget
// ═══════════════════════════════════════════════════════════════

// Live count for the GA4 widget's fallback path. Reads the persistent
// visitor_sessions table instead of the in-memory Map that used to live
// here (see the LIVE VISITORS note above).
async function _liveVisitorCount() {
  try {
    const cutoff   = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const [{ count: active }, { count: views }] = await Promise.all([
      supabase.from('visitor_sessions').select('session_id', { count: 'exact', head: true })
        .eq('is_bot', false).gte('last_seen', cutoff),
      supabase.from('visitor_pageviews').select('id', { count: 'exact', head: true })
        .gte('at', midnight.toISOString()),
    ]);
    return { active: active || 0, views: views || 0 };
  } catch (_) { return { active: 0, views: 0 }; }
}

// GA4 Realtime — proxies to Google Analytics Data API using service account
app.get('/api/analytics/realtime', authMiddleware, adminOnly, async (req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    // If not configured, fall back to internal visitor session count
    if (!propertyId || !serviceAccountJson) {
      const live = await _liveVisitorCount();
      return res.json({
        activeUsers: live.active,
        screenPageViews: live.views,
        source: 'internal',
        note: 'Set GA4_PROPERTY_ID and GOOGLE_SERVICE_ACCOUNT_JSON in Render env vars for real GA4 data',
      });
    }

    // Build JWT for Google OAuth2 service account
    const crypto = require('crypto');
    const sa = JSON.parse(serviceAccountJson);
    const now = Math.floor(Date.now() / 1000);
    const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })).toString('base64url');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    const sig = sign.sign(sa.private_key, 'base64url');
    const jwtToken = `${header}.${payload}.${sig}`;

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwtToken }),
      signal: AbortSignal.timeout(8000),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Could not get GA4 access token');

    // Call GA4 Realtime API
    const ga4Res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensions: [{ name: 'unifiedScreenName' }],
          metrics:    [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    const ga4Data = await ga4Res.json();
    if (ga4Data.error) throw new Error(ga4Data.error.message || 'GA4 API error');

    const rows = ga4Data.rows || [];
    const totalActive = rows.reduce((s, r) => s + parseInt(r.metricValues?.[0]?.value || 0), 0);
    const totalViews  = rows.reduce((s, r) => s + parseInt(r.metricValues?.[1]?.value || 0), 0);
    const sessions    = rows.slice(0, 10).map(r => ({
      page:   r.dimensionValues?.[0]?.value || '/',
      active: parseInt(r.metricValues?.[0]?.value || 0),
    }));

    res.json({ activeUsers: totalActive, screenPageViews: totalViews, sessions, source: 'ga4' });
  } catch(e) {
    console.error('[GA4 realtime]', e.message);
    // Graceful fallback — return internal ping count instead of error
    const live = await _liveVisitorCount();
    res.json({ activeUsers: live.active, screenPageViews: live.views, source: 'internal', error: e.message });
  }
});


/* Alias for admin dashboard — same as /api/admin/stats but includes revenue
   breakdown. The three Supabase pulls below are the single heaviest read on
   the site; the result is identical for every admin, so the shared-response
   cache serves one 15s-fresh copy to all dashboard loads and renews itself
   behind the scenes after that. Writes below invalidate the tag. */
app.get('/api/admin/stats/dashboard', authMiddleware, adminOnly, cached(async (req) => {
    const [ordersR, prodsR, custsR] = await Promise.all([
      supabase.from('orders').select('id,total,payment_status,fulfillment,created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(1000),
      supabase.from('products').select('id,name,stock,active,category').is('deleted_at', null),
      supabase.from('customers').select('id').is('deleted_at', null),
    ]);
    const orders = ordersR.data || [], products = prodsR.data || [], customers = custsR.data || [];
    const today = new Date().toISOString().split('T')[0];
    const isPaid = o => { const s = (o.payment_status||'').toLowerCase(); return s.includes('paid') || s === 'success'; };
    const isCollectedCOD = o => (o.payment_status||'').toLowerCase().includes('collected');
    const isPendingCOD = o => { const s = (o.payment_status||'').toLowerCase(); return s.includes('cod') && !s.includes('paid'); };
    const paid = orders.filter(isPaid);
    const cod  = orders.filter(o => (o.payment_status||'').toLowerCase().includes('cod'));
    const collected = orders.filter(o => isPaid(o) || isCollectedCOD(o));
    const pendingCOD = orders.filter(isPendingCOD);
    const totalRev  = orders.reduce((s,o) => s + parseFloat(o.total||0), 0);
    const todayPaid = collected.filter(o => (o.created_at||'').startsWith(today));
    const todayRev  = orders.filter(o => (o.created_at||'').startsWith(today)).reduce((s,o) => s + parseFloat(o.total||0), 0);
    const onlineRev = paid.filter(o => !(o.payment_status||'').toLowerCase().includes('cod')).reduce((s,o) => s + parseFloat(o.total||0), 0);
    const codRev    = collected.filter(o => (o.payment_status||'').toLowerCase().includes('cod')).reduce((s,o) => s + parseFloat(o.total||0), 0);
    return { stats: {
      totalRevenue:   totalRev,
      todayRevenue:   todayRev,
      onlineRevenue:  onlineRev,
      codRevenue:     codRev,
      codOutstanding: pendingCOD.reduce((s,o) => s + parseFloat(o.total||0), 0),
      totalOrders:    orders.length,
      todayOrders:    orders.filter(o => (o.created_at||'').startsWith(today)).length,
      totalCustomers: customers.length,
      totalProducts:  products.filter(p => !p.deleted_at).length,
      activeProducts: products.filter(p => p.active && !p.deleted_at).length,
      pendingOrders:  orders.filter(o => !o.fulfillment || o.fulfillment === 'Pending').length,
      lowStockCount:  products.filter(p => !p.deleted_at && (p.stock||0) < 10).length,
      outOfStock:     products.filter(p => !p.deleted_at && (p.stock||0) === 0).length,
    }};
}, { ttlMs: 15000, staleMs: 60000, tag: 'dashboard', shared: true }));

// Revenue over last 30 days — for the area chart
app.get('/api/admin/stats/revenue', authMiddleware, requirePerm('stats.revenue'), async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.from('orders')
      .select('created_at,total,payment_status')
      .is('deleted_at', null)
      .gte('created_at', since);

    const byDay = {};
    (data || []).filter(o => {
      const s = (o.payment_status || '').toLowerCase();
      // Count every placed order (online paid, COD collected, and COD pending)
      // so the revenue trend reflects real business volume, not only marked-as-paid orders.
      return s.includes('paid') || s.includes('collected') || (s.includes('cod') && !s.includes('paid'));
    }).forEach(o => {
      const d = (o.created_at || '').split('T')[0];
      byDay[d] = (byDay[d] || 0) + parseFloat(o.total || 0);
    });
    res.json({ data: byDay });
  } catch(e) { res.status(500).json({ error: e.message, data: {} }); }
});

// Weekly order heatmap (day-of-week × week)
app.get('/api/admin/stats/heatmap', authMiddleware, adminOnly, async (req, res) => {
  try {
    const since = new Date(Date.now() - 8 * 7 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.from('orders')
      .select('created_at')
      .is('deleted_at', null)
      .gte('created_at', since);

    const matrix = {};
    (data || []).forEach(o => {
      const d    = new Date(o.created_at || 0);
      const week = Math.floor((Date.now() - d.getTime()) / (7 * 86400000));
      const day  = (d.getDay() + 6) % 7; // 0=Mon
      if (week < 8) { const k = `${week}-${day}`; matrix[k] = (matrix[k] || 0) + 1; }
    });
    res.json({ data: matrix });
  } catch(e) { res.status(500).json({ error: e.message, data: {} }); }
});


// ═══════════════════════════════════════════════════════════════
// EMAIL TEST ROUTE — hit this from browser to verify email works
// GET /api/admin/test-email?to=yourmail@gmail.com
// ═══════════════════════════════════════════════════════════════
app.get('/api/admin/test-email', authMiddleware, requirePerm('system.maintenance'), async (req, res) => {
  const to = req.query.to || process.env.MAIL_USER;
  if (!to) return res.status(400).json({ error: 'No recipient — add ?to=your@email.com' });
  if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
    return res.status(503).json({ error: 'MAIL_USER or MAIL_PASSWORD not set in Render env vars' });
  }
  try {
    await mailer.verify();
    await mailer.sendMail({
      from: process.env.MAIL_FROM || `${BRAND.name} <${process.env.MAIL_USER}>`,
      to,
      subject: `✅ ${BRAND.name} Email Test — System Working!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:30px auto;background:#f8fdf4;border:2px solid #4a8a28;border-radius:12px;padding:28px;text-align:center">
          <img src="${BRAND.logoDark}" alt="${BRAND.nameUpper}" width="170" style="width:170px;max-width:70%;height:auto;border:0;margin-bottom:8px;font-size:28px;font-weight:800;color:#2d5016">
          <div style="font-size:40px;margin:16px 0">✅</div>
          <h2 style="color:#2d5016;margin:0 0 8px">Email System Working!</h2>
          <p style="color:#555;font-size:14px">Your Nodemailer + Gmail SMTP setup is configured correctly.<br>Order confirmation emails will be delivered automatically.</p>
          <div style="margin-top:20px;background:#2d5016;color:white;padding:10px 20px;border-radius:8px;font-size:12px">
            Sent from: ${process.env.MAIL_USER}<br>
            Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
          </div>
        </div>`,
    });
    console.log(`✅ [EMAIL TEST] Sent to ${to}`);
    res.json({ success: true, message: `Test email sent to ${to} — check your inbox (and spam folder)` });
  } catch(e) {
    console.error('[EMAIL TEST]', e.message);
    res.status(500).json({
      error: e.message,
      fix: e.message.includes('535') || e.message.includes('Username and Password')
        ? 'Wrong password — use Gmail App Password from myaccount.google.com/apppasswords (NOT your login password)'
        : e.message.includes('ECONNREFUSED') || e.message.includes('ETIMEDOUT')
        ? 'SMTP connection blocked — Render free tier may block port 465. Try switching to port 587.'
        : 'Check Render logs for details',
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION HEALTH CHECKS
// ═══════════════════════════════════════════════════════════════
app.get('/api/health/gokwik', authMiddleware, adminOnly, async (req, res) => {
  const appId = process.env.GOKWIK_APP_ID;
  const secret = process.env.GOKWIK_APP_SECRET;
  if (!appId || !secret) return res.json({ ok:true, status:'env_missing', detail:'Set GOKWIK_APP_ID and GOKWIK_APP_SECRET on Render' });
  try {
    const r = await fetch('https://gkx.gokwik.co/v1/payments/links?merchant_reference_id=health-check', {
      headers: { 'gk-app-id': appId, 'gk-app-secret': secret },
      signal: AbortSignal.timeout(8000),
    });
    return res.json({ ok:true, status: (r.status===400||r.status===404) ? 'connected' : r.status===401 ? 'auth_error' : 'reachable', httpStatus: r.status });
  } catch(e) { return res.json({ ok:true, status:'unreachable', detail: e.message }); }
});

app.get('/api/health/shiprocket', authMiddleware, adminOnly, async (req, res) => {
  const email    = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;

  if (!email || !password) {
    return res.json({ ok: true, status: 'env_missing', detail: 'SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD not set in Render env vars' });
  }
  try {
    const r = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    if (r.ok && data.token) return res.json({ ok: true, status: 'connected', detail: 'Authenticated successfully' });
    return res.json({ ok: true, status: 'auth_error', detail: data.message || 'Invalid email or password' });
  } catch(e) {
    return res.json({ ok: true, status: 'unreachable', detail: e.message });
  }
});

app.get('/api/health/delhivery', authMiddleware, adminOnly, async (req, res) => {
  const token = process.env.DELHIVERY_API_TOKEN;
  if (!token) return res.json({ ok: true, status: 'env_missing', detail: 'DELHIVERY_API_TOKEN not set in Render env vars' });
  if (!process.env.DELHIVERY_PICKUP_LOCATION) return res.json({ ok: true, status: 'env_missing', detail: 'DELHIVERY_PICKUP_LOCATION not set — required to create shipments' });
  try {
    const r = await fetch(`${dlBase()}/c/api/pin-codes/json/?filter_codes=110001`, {
      headers: { Authorization: `Token ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401 || r.status === 403) return res.json({ ok: true, status: 'auth_error', detail: 'Token rejected — check DELHIVERY_API_TOKEN' });
    if (!r.ok) return res.json({ ok: true, status: 'unreachable', detail: `HTTP ${r.status}` });
    return res.json({ ok: true, status: 'connected', detail: `Token accepted (${dlBase().includes('staging') ? 'staging' : 'production'})` });
  } catch(e) {
    return res.json({ ok: true, status: 'unreachable', detail: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// STARTUP DB CHECK
// ═══════════════════════════════════════════════════════════════
async function checkDbTables() {
  // Map each table to its actual primary key column (settings uses 'key', others use 'id')
  const tableChecks = [
    { table: 'products',           col: 'id'  },
    { table: 'orders',             col: 'id'  },
    { table: 'customers',          col: 'id'  },
    { table: 'coupons',            col: 'id'  },
    { table: 'order_status_logs',  col: 'id'  },
    { table: 'audit_logs',         col: 'id'  },
    { table: 'settings',           col: 'key' },  // PK is 'key', no 'id' column
    { table: 'banners',            col: 'id'  },
    { table: 'ai_actions',         col: 'id'  },
    { table: 'vita_ledger_v2',     col: 'id'  },   // live VitaPoints ledger (old vita_ledger dropped — migration 012)
    { table: 'visitor_pageviews',  col: 'id'  },
  ];
  const missing = [];
  for (const { table, col } of tableChecks) {
    const { error } = await supabase.from(table).select(col).limit(1);
    if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
      missing.push(table);
    }
  }
  if (missing.length) {
    console.error('\n❌  MISSING DB TABLES:', missing.join(', '));
    console.error('   → Run schema.sql in Supabase SQL Editor, then redeploy\n');
  } else {
    console.log('✅ All database tables verified.');
  }
}

// ═══════════════════════════════════════════════════════════════
// ROUTE REGISTRY — mounted here, AFTER every route above, so
// checkDocs() sees the complete table. Requires `_routeDocs` from
// the early require() near the admin-events mount.
// ═══════════════════════════════════════════════════════════════
try {
  if (_routeDocs) {
    app.get('/api/docs', (_, res) => res.json(_routeDocs.DOCS));
    _routeDocs.checkDocs(app);
  }
} catch (e) { console.error('[mount] route-docs endpoint FAILED:', e.message); }

// ═══════════════════════════════════════════════════════════════
// Aug 2026: Front Store Editor (v9.5) — public theme store.
//
// The static storefront (GitHub Pages) fetches its live palette at
// runtime from here:  GET  /api/public/theme?key=<store>
// The admin panel saves picks from here:  PUT  /api/public/theme
// Reading is anonymous (the store is public, no JWT needed). Writing
// requires the admin/owner JWT the panel already attaches.
//
// Shape contract (only these keys are persisted):
//   theme.palette  { paper, paper2, paper3, face, ink, ink2, ink3, ink4,
//                    brand, brandMid, brandLift, brandSoft, brandWash,
//                    accent, accentDeep, accentSoft, glow }
//   theme.fonts    { display, sans }
//   theme.radius   'soft' | 'medium' | 'sharp'
//   theme.shadows  'full' | 'soft' | 'none'
//   theme.bubbles  'on' | 'off'
//   theme.header   { bg, fg }
//   theme.name     human-readable palette name
try {
  const publicThemeRouter = require('express').Router();

  publicThemeRouter.get('/theme', async (req, res) => {
    try {
      const key = String(req.query.key || '').trim().toLowerCase() || 'ascofizz';
      const { data, error } = await supabase
        .from('store_themes')
        .select('theme, updated_by, updated_at')
        .eq('store_key', key)
        .single();
      if (error && error.code !== 'PGRST116') {
        console.warn('[theme] GET /theme db error:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
      }
      res.json({ ok: true, store: key, theme: (data && data.theme) || {}, updatedBy: data?.updated_by || null, updatedAt: data?.updated_at || null });
    } catch (e) {
      console.warn('[theme] GET /theme failed:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  publicThemeRouter.put('/theme', authMiddleware, adminOnly, async (req, res) => {
    try {
      const key = String(req.body?.key || 'ascofizz').trim().toLowerCase();
      const theme = req.body?.theme;
      if (!theme || typeof theme !== 'object') return res.status(400).json({ ok: false, error: 'Missing theme object.' });
      // Keep the shape small and safe — only whitelisted keys survive.
      const KEYS = ['palette', 'fonts', 'radius', 'shadows', 'bubbles', 'header', 'name', 'style', 'combos'];
      const clean = {};
      for (const k of KEYS) if (k in theme) clean[k] = theme[k];
      const user = (req.user && (req.user.username || req.user.email)) || 'admin';
      const { error } = await supabase.from('store_themes').upsert(
        { store_key: key, theme: clean, updated_by: user, updated_at: new Date().toISOString() },
        { onConflict: 'store_key' }
      );
      if (error) {
        console.warn('[theme] PUT /theme db error:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
      }
      res.json({ ok: true, store: key, theme: clean, updatedBy: user });
    } catch (e) {
      console.warn('[theme] PUT /theme failed:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.use('/api/public', publicThemeRouter);
  console.log('[mount] public theme store (/api/public/theme) ✅');
} catch (e) { console.warn('[mount] public theme store skipped:', e.message); }
// ═══════════════════════════════════════════════════════════════
// Aug 2026: Front Website Editor (v9.6) — public content store.
//
// Complements the theme store (store_themes) with an editable copy
// layer for storefront page content: announcement bar, hero copy,
// stats strip, trust tiles, the Vita Points micro-card line and the
// offer reminder. The admin panel saves picks from here:
//   PUT  /api/public/content   (admin JWT + adminOnly)
// and reads the current published content from here:
//   GET  /api/public/content?key=<store>   (anonymous)
//
// Table: store_contents (store_key UNIQUE, contents jsonb,
// updated_by text, updated_at timestamptz) — created via migration.
//
// Shape contract (only these keys survive a save):
//   content.announcement [ { text, icon } ]
//   content.hero         { badge, line1, line2, line3, sub, cta }
//   content.stats        [ text ]
//   content.trust        { tiles: [ { icon, label } ], items: [ text ] }
//   content.vitaMicro    { earnText, valueText }
//   content.offerReminder{ title, offerHtml, cta }
//   content.notifyCard   { icon, text, corner }
//   content.footer       { tagline, badges: [ text ] }
// ═══════════════════════════════════════════════════════════════
try {
  const publicContentRouter = require('express').Router();
  publicContentRouter.get('/content', async (req, res) => {
    try {
      const key = String(req.query.key || '').trim().toLowerCase() || 'ascofizz';
      const { data, error } = await supabase
        .from('store_contents')
        .select('contents, updated_by, updated_at')
        .eq('store_key', key)
        .single();
      if (error && error.code !== 'PGRST116') {
        console.warn('[content] GET /content db error:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
      }
      res.json({ ok: true, store: key, content: (data && data.contents) || {}, updatedBy: data?.updated_by || null, updatedAt: data?.updated_at || null });
    } catch (e) {
      console.warn('[content] GET /content failed:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  publicContentRouter.put('/content', authMiddleware, adminOnly, async (req, res) => {
    try {
      const key = String(req.body?.key || 'ascofizz').trim().toLowerCase();
      const content = req.body?.content;
      if (!content || typeof content !== 'object') return res.status(400).json({ ok: false, error: 'Missing content object.' });
      // Keep the shape small and safe — only whitelisted keys survive.
      const KEYS = ['announcement', 'hero', 'stats', 'trust', 'vitaMicro', 'offerReminder', 'notifyCard', 'footer'];
      const clean = {};
      for (const k of KEYS) if (k in content) clean[k] = content[k];
      const user = (req.user && (req.user.username || req.user.email)) || 'admin';
      const { error } = await supabase.from('store_contents').upsert(
        { store_key: key, contents: clean, updated_by: user, updated_at: new Date().toISOString() },
        { onConflict: 'store_key' }
      );
      if (error) {
        console.warn('[content] PUT /content db error:', error.message);
        return res.status(500).json({ ok: false, error: error.message });
      }
      res.json({ ok: true, store: key, content: clean, updatedBy: user });
    } catch (e) {
      console.warn('[content] PUT /content failed:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  app.use('/api/public', publicContentRouter);
  console.log('[mount] public content store (/api/public/content) ✅');
} catch (e) { console.warn('[mount] public content store skipped:', e.message); }

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
// Aug 2026: customer re-targeting insights (computed from orders — segments,
// last-order recency, products bought, payment mix) + contact-list export.
try {
  app.use('/api', require('./customers-insights-routes')(supabase, authMiddleware, adminOnly, requirePerm));
  console.log('[mount] customers-insights-routes ✅');
} catch (e) { console.warn('[mount] customers-insights-routes skipped:', e.message); }

// ═══════════════════════════════════════════════════════════════
// 404 + ERROR HANDLING  —  must be mounted LAST, after every route.
//
// WHY THIS EXISTS
//   There was no error handler at all, so Express's default one answered.
//   That returns an HTML page containing the full stack trace, including
//   absolute filesystem paths. Posting `{"bad":` to /api/orders replied
//   with:
//
//     SyntaxError: Unexpected end of JSON input
//         at JSON.parse (<anonymous>)
//         at parse (/srv/app/node_modules/body-parser/lib/types/json.js...)
//
//   That hands an attacker the runtime, the directory layout and the
//   dependency versions, from an unauthenticated request. Unknown routes
//   likewise answered "Cannot GET /api/..." as HTML, which a JSON client
//   cannot parse.
//
//   Both now answer JSON, and the body never carries a stack. The full
//   error is still logged server-side, where it belongs.
// ═══════════════════════════════════════════════════════════════

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use((err, req, res, _next) => {
  // Log everything: the operator needs the stack, the caller does not.
  console.error('[error]', req.method, req.originalUrl, '—', err && err.stack ? err.stack : err);

  const status =
    err && (err.status || err.statusCode) ? (err.status || err.statusCode) : 500;

  // Malformed JSON is the caller's mistake, so say which it is — but say
  // only that. body-parser reports it as a SyntaxError with a `body`
  // property carrying the raw payload, which must not be echoed back.
  if (err instanceof SyntaxError && status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }

  // A 4xx raised deliberately by a route carries a message meant for the
  // caller. A 5xx is an internal failure and its message may contain
  // connection strings, table names or file paths, so it is replaced.
  const message = status < 500
    ? (err && err.message) || 'Request rejected'
    : 'Internal server error';

  res.status(status).json({ error: message });
});

app.listen(PORT, async () => {
  console.log(`✅ ${BRAND.name} Backend v9.3.0 running on port ${PORT}`);
  await checkDbTables();
  await verifyMailer();
  scheduleReports();
  scheduleProductSync();
  startKeepAlive();
  // Courier auto-sync: immediate warm-up pass after 2 minutes, then every 10 min.
  // Each run asks Shiprocket/Delhivery what happened to mid-journey orders and
  // writes the answer back (fulfillment + COD collected) — fully automatic.
  setTimeout(syncCourierStatuses, 15 * 60 * 1000);
  setInterval(syncCourierStatuses, SYNC_INTERVAL_MS);
  console.log(`[COURIER-SYNC] Auto-delivery sync scheduled every 2.5 h (first run in 15 min)`);
});

// Demo/test harnesses (and future unit tests) need the app without
// starting a second listener — middleware mounted after listen still works.
module.exports = app;
// Demo-only convenience: lets the local demo harness reach the private
// token-version cache to simulate the stale-cache race that caused the
// mobile bounce — never called by the real server.
module.exports._tvCache = _tvCache;