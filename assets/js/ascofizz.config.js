/* ═══════════════════════════════════════════════════════════════════════
   ASCOFIZZ — BRAND & RUNTIME CONFIGURATION

   The single place the storefront and the admin panel learn what brand
   they are and what infrastructure they talk to. Load this BEFORE any
   other script on the page.

   WHY THIS FILE EXISTS
     The platform this was forked from hard-coded its Supabase project
     URL, its anon key, its API hostname, its logo paths, its phone number
     and its social links directly into a 25,000-line index.html and again
     into admin.html. Re-pointing it at new infrastructure meant editing
     string literals in two enormous files, and a missed one kept quietly
     talking to the old production project. Everything is declared here
     once instead.

   WHITE-LABELLING
     Change the values in ASCOFIZZ_CONFIG below and the whole front end
     follows: page titles, structured data, e-mail links, social links,
     the logo, the favicon and the API/database it connects to.

   ── ON THE ANON KEY ───────────────────────────────────────────────────
   SUPABASE_ANON_KEY is meant to be public. It identifies the project; it
   does not authorise anything on its own. What actually protects the data
   is row-level security, which 005_rls_lockdown.sql turns on for every
   table. Publishing the anon key of a project WITHOUT RLS exposes that
   database to the world, so treat applying 005 as a launch requirement.

   NEVER put the service-role key here. It bypasses RLS entirely and this
   file is served to every visitor.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CONFIG = {

    // ── Identity ──────────────────────────────────────────────────────
    brand: {
      name:      'Ascofizz',
      nameUpper: 'ASCOFIZZ',
      legalName: 'Ascofizz Healthcare',
      tagline:   'Effervescent nutrition, made properly',
      // One-line description used for meta descriptions and JSON-LD.
      description: 'Effervescent vitamin and mineral supplements — ' +
                   'WHO-GMP certified, FSSAI approved, delivered across India.',
    },

    // ── Infrastructure ────────────────────────────────────────────────
    // Replace all three when deploying. `apiBase` must be the public
    // origin of YOUR backend; `supabaseUrl`/`supabaseAnonKey` must be
    // YOUR project — never reuse another deployment's.
    api: {
      base: 'https://api.ascofizz.com',
    },
    // NOTE: there is deliberately no Supabase entry here. This build has
    // no browser-to-database access at all — the page holds no database
    // URL and no anon key. Every read and write goes through `api.base`,
    // and the backend is the only component with credentials.

    // ── Public site ───────────────────────────────────────────────────
    site: {
      url:      'https://ascofizz.com',
      adminUrl: 'https://ascofizz.com/admin.html',
      locale:   'en_IN',
    },

    // ── Assets ────────────────────────────────────────────────────────
    // Every image the shell needs, in one place. Swap a path here and it
    // changes everywhere — nothing else hard-codes these. Product and
    // banner artwork is not listed: that is served from the database
    // (products.image, site_media, promo_media) so it can be replaced
    // from the admin panel without a deploy.
    assets: {
      base:      'assets',
      logo:      'assets/ascofizz-logo.svg',
      logoPng:   'assets/ascofizz-logo.png',
      logoLight: 'assets/ascofizz-logo-light.png',
      mark:      'assets/ascofizz-mark.svg',
      favicon:   'assets/favicon.svg',
      icon180:   'assets/ascofizz-icon-180.png',
      icon192:   'assets/ascofizz-icon-192.png',
      icon512:   'assets/ascofizz-icon-512.png',
      ogImage:   'assets/ascofizz-og.png',
      // Shown while a product has no image of its own.
      productPlaceholder: 'assets/ascofizz-mark.svg',
    },

    // ── Contact ───────────────────────────────────────────────────────
    // These are carried over from the source deployment and are real,
    // in-service numbers for the same operator — they are recorded here so
    // there is one place to change them, rather than 30 places in the
    // markup. CONFIRM THEM before launch.
    contact: {
      email:    'support@ascofizz.com',
      phone:    '+91 98985 82650',
      phoneAlt: '+91 72658 84137',
      whatsapp: '919898582650',   // digits only
      address:  'Anand, Gujarat, India',
    },

    // ── Social ────────────────────────────────────────────────────────
    // Empty entries are skipped by the footer renderer rather than
    // rendering a dead link.
    social: {
      instagram: '',
      facebook:  '',
      linkedin:  '',
      youtube:   '',
    },

    // ── Commerce ──────────────────────────────────────────────────────
    // ⚠️ shipping.fee / shipping.freeAbove MUST match the server's
    // SHIP_FEE / SHIP_THRESHOLD. If they disagree the customer is shown
    // one total at checkout and charged another.
    commerce: {
      currency:       'INR',
      currencySymbol: '₹',
      country:        'India',
      shipping: { fee: 79, freeAbove: 599 },
    },

    // ── Loyalty (VitaPoints) ──────────────────────────────────────────
    // Display values only. The server's ledger is authoritative; these
    // exist so the storefront can explain the scheme before an API call
    // has returned. Keep in step with the vita_config table.
    loyalty: {
      name:            'Vita Points',
      earnPerRupee:    1,
      redeemPerRupee:  150,   // points needed for ₹1 off
      maxPerOrder:     5000,
    },

    // ── Optional external services ────────────────────────────────────
    // Empty means "not configured", and the admin panels that use these
    // degrade to a disabled state rather than calling a stranger's host.
    // The forked platform had its operator's own Render hostnames baked
    // into admin.html; nothing is inherited here by default.
    integrations: {
      auditApiBase:       '',   // e.g. https://audit.example.com/api/audit
      marketingDirectUrl: '',   // e.g. https://marketing.example.com
    },

    // ── Analytics ─────────────────────────────────────────────────────
    // Google Analytics and the Meta Pixel were removed from this build at
    // the owner's request. No measurement id, no pixel id, no third-party
    // tracking script is loaded. index.html keeps the _track* helpers as
    // no-ops so the ~40 call sites stay valid; give those bodies a real
    // implementation if analytics is ever reinstated.
  };

  // ── Derived helpers ─────────────────────────────────────────────────
  CONFIG.pageTitle = function (page) {
    if (!page || page === 'home') {
      return CONFIG.brand.name + ' — ' + CONFIG.brand.tagline;
    }
    return page.charAt(0).toUpperCase() + page.slice(1) + ' · ' + CONFIG.brand.name;
  };

  /** Absolute URL for an asset key, for metadata that must not be relative. */
  CONFIG.assetUrl = function (key) {
    var rel = CONFIG.assets[key] || key;
    if (/^https?:\/\//.test(rel)) return rel;
    return CONFIG.site.url.replace(/\/+$/, '') + '/' + String(rel).replace(/^\/+/, '');
  };

  /** Social entries that are actually configured. */
  CONFIG.activeSocial = function () {
    return Object.keys(CONFIG.social)
      .filter(function (k) { return !!CONFIG.social[k]; })
      .map(function (k) { return { network: k, url: CONFIG.social[k] }; });
  };

  global.ASCOFIZZ_CONFIG = CONFIG;

  // ── Back-compat globals ─────────────────────────────────────────────
  // The storefront and admin panel reference these names in ~200 places.
  // Defining them from the config keeps this file the single source of
  // truth without needing to rewrite every call site.
  global.API_BASE   = CONFIG.api.base;
  global.BRAND_NAME = CONFIG.brand.name;

})(window);
