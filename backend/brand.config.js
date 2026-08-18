// ═══════════════════════════════════════════════════════════════════════
// ASCOFIZZ — CENTRAL BRAND / INFRASTRUCTURE CONFIGURATION
//
// Every brand string, public URL and origin the server needs lives here
// and nowhere else. Nothing in this file is a secret — secrets stay in
// the environment and are read where they are used.
//
// WHY THIS FILE EXISTS
//   The platform this was forked from hard-coded its own domain, its
//   Render hostname and its Supabase project ref into ~30 places across
//   the route files. Re-pointing it at new infrastructure meant hunting
//   string literals, and a missed one silently kept talking to the old
//   production system. Everything is resolved from the environment here
//   instead, so a deployment is configured by env vars alone.
//
// WHITE-LABELLING
//   Change BRAND_NAME / SITE_URL / the asset URLs in the environment and
//   the whole server follows — e-mail templates, invoices, CORS, admin
//   origin gate and the WhatsApp reports included.
// ═══════════════════════════════════════════════════════════════════════

'use strict';

/** Read an env var, trimming and treating empty string as unset. */
function env(key, fallback = '') {
  const v = process.env[key];
  return (typeof v === 'string' && v.trim() !== '') ? v.trim() : fallback;
}

/** Strip a single trailing slash so `${URL}/path` never doubles up. */
function noSlash(u) { return String(u || '').replace(/\/+$/, ''); }

/** Parse a comma/space separated env list into a clean array. */
function list(key, fallback = []) {
  const raw = env(key);
  if (!raw) return fallback;
  return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

// ── Identity ───────────────────────────────────────────────────────────
const BRAND_NAME  = env('BRAND_NAME', 'Ascofizz');
const BRAND_UPPER = env('BRAND_NAME_UPPER', BRAND_NAME.toUpperCase());
const BRAND_LEGAL = env('BRAND_LEGAL_NAME', `${BRAND_NAME} Healthcare`);

// ── Public URLs ────────────────────────────────────────────────────────
// SITE_URL   — the customer-facing storefront origin.
// API_URL    — this server's own public origin (used for webhook notify
//              URLs, self-checks and the links inside admin reports).
// ADMIN_URL  — where the admin panel is served from.
const SITE_URL  = noSlash(env('FRONTEND_URL', 'http://localhost:8000'));
const API_URL   = noSlash(env('SERVICE_URL', env('PUBLIC_API_URL', `http://localhost:${env('PORT', '3000')}`)));
const ADMIN_URL = noSlash(env('ADMIN_URL', SITE_URL));

// ── Brand assets ───────────────────────────────────────────────────────
// Referenced from transactional e-mail and PDF invoices, which are read
// outside the site and therefore need absolute URLs. Override these when
// the real artwork lands; nothing else has to change.
const ASSET_BASE  = noSlash(env('BRAND_ASSET_BASE', `${SITE_URL}/assets`));
const LOGO_DARK   = env('BRAND_LOGO_URL',       `${ASSET_BASE}/ascofizz-logo.png`);
const LOGO_LIGHT  = env('BRAND_LOGO_LIGHT_URL', `${ASSET_BASE}/ascofizz-logo-light.png`);

// ── Contact ────────────────────────────────────────────────────────────
const SUPPORT_EMAIL = env('SUPPORT_EMAIL', `support@${BRAND_NAME.toLowerCase()}.com`);
const SUPPORT_PHONE = env('SUPPORT_PHONE', '');
const COMPANY_ADDR  = env('COMPANY_ADDRESS', '');
const GST_TIN       = env('SELLER_GST_TIN', env('DELHIVERY_SELLER_GST_TIN', ''));

// ── Commerce ───────────────────────────────────────────────────────────
const CURRENCY        = env('CURRENCY', 'INR');
const CURRENCY_SYMBOL = env('CURRENCY_SYMBOL', '₹');
const COUNTRY         = env('COUNTRY', 'India');

// ── Origins allowed to call this API ───────────────────────────────────
// Exact-match only. Substring checks (startsWith/includes/endsWith) would
// let someone register "ascofizz.com.evil.com" and pass while
// credentials:true is set, leaking auth tokens.
//
// The storefront and admin origins are always included so a correct
// deployment needs no extra configuration; CORS_EXTRA_ORIGINS adds any
// others (staging previews, a parent corporate site).
const CORS_ORIGINS = (() => {
  const s = new Set();
  for (const u of [SITE_URL, ADMIN_URL]) {
    if (!u || /^https?:\/\/localhost|127\.0\.0\.1/.test(u)) { if (u) s.add(u); continue; }
    s.add(u);
    // Accept the apex/www counterpart of whatever was configured, so a
    // deployment does not break purely on the presence of "www.".
    try {
      const { protocol, host } = new URL(u);
      s.add(`${protocol}//${host.startsWith('www.') ? host.slice(4) : 'www.' + host}`);
    } catch { /* not a parseable URL — the literal value still stands */ }
  }
  for (const o of list('CORS_EXTRA_ORIGINS')) s.add(noSlash(o));
  return s;
})();

// Origins the admin panel itself may be opened from. CORS alone does not
// achieve this — it only stops a browser page on another origin reading
// the response; it does nothing to curl, nor to an old bookmark that
// still loads the panel locally. The login endpoint checks this so it
// refuses to issue a token to anything not served from a known origin.
const ADMIN_ORIGINS = (() => {
  const s = new Set([ADMIN_URL]);
  try {
    const { protocol, host } = new URL(ADMIN_URL);
    s.add(`${protocol}//${host.startsWith('www.') ? host.slice(4) : 'www.' + host}`);
  } catch { /* leave as configured */ }
  for (const o of list('ADMIN_EXTRA_ORIGINS')) s.add(noSlash(o));
  s.delete('');
  return s;
})();

module.exports = {
  name: BRAND_NAME,
  nameUpper: BRAND_UPPER,
  legalName: BRAND_LEGAL,

  siteUrl: SITE_URL,
  apiUrl: API_URL,
  adminUrl: ADMIN_URL,

  assetBase: ASSET_BASE,
  logoDark: LOGO_DARK,
  logoLight: LOGO_LIGHT,

  supportEmail: SUPPORT_EMAIL,
  supportPhone: SUPPORT_PHONE,
  companyAddress: COMPANY_ADDR,
  gstTin: GST_TIN,

  currency: CURRENCY,
  currencySymbol: CURRENCY_SYMBOL,
  country: COUNTRY,

  corsOrigins: CORS_ORIGINS,
  adminOrigins: ADMIN_ORIGINS,

  // Helpers re-exported so route files do not each reinvent them.
  env, noSlash, list,
};
