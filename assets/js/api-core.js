/* ═══ ASCOFIZZ · BACKEND CONNECTION ═══
   Preserved verbatim from the previous build — Render API + Supabase sync,
   rate-limited fetch, coupon validation, product/tier sync, Shiprocket config.
   The redesign changes how this data is PRESENTED, never how it is fetched.
   ═══════════════════════════════════════ */
// ══════════════════════════════════════════════════════════════

// fetchWithTimeout — with per-endpoint rate limiting to prevent spam
// Uses Promise.race() for timeout handling
const _rateCounters = {};
const _RATE_LIMITS = {
  '/api/confirm-cod-order':    3,
  '/api/create-gokwik-order': 3,
  '/api/confirm-order':        3,
  '/api/coupons/validate':     5,
  '/api/auth/email-login':     5,
  '/api/auth/register':        3,
};
function fetchWithTimeout(url, options, ms) {
  // Rate limit check
  const limitKey = Object.keys(_RATE_LIMITS).find(k => url && url.includes(k));
  if (limitKey) {
    _rateCounters[limitKey] = (_rateCounters[limitKey] || 0) + 1;
    if (_rateCounters[limitKey] > _RATE_LIMITS[limitKey]) {
      return Promise.reject(new Error('Too many requests — please wait a moment before trying again.'));
    }
    // Auto-reset counter after 30 seconds
    if (_rateCounters[limitKey] === 1) {
      setTimeout(function() { delete _rateCounters[limitKey]; }, 30000);
    }
  }
  var timeoutPromise = new Promise(function(_, reject) {
    setTimeout(function() {
      reject(new DOMException('Timeout after ' + ms + 'ms', 'TimeoutError'));
    }, ms);
  });
  return Promise.race([fetch(url, options), timeoutPromise]);
}
// BACKEND CONNECTION — Supabase via Render API
// Admin changes (products, stock, coupons) reflect here live
// ══════════════════════════════════════════════════════════════
const API_BASE = (window.ASCOFIZZ_CONFIG && window.ASCOFIZZ_CONFIG.API_BASE) || 'https://YOUR_BACKEND.onrender.com';

// Merge backend product data over static product array — ALL fields synced
function mergeBackendProducts(backendProducts) {
  if (!backendProducts || !backendProducts.length) return;

  const parseArr = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch(e) { return val.split(',').map(s=>s.trim()).filter(Boolean); } }
    return [];
  };

  backendProducts.forEach(bp => {
    bp.id = parseInt(bp.id);

    const idx = PRODUCTS.findIndex(p => p.id === bp.id);

    if (idx >= 0) {
      const p = PRODUCTS[idx];
      // Price & sale
      if (bp.price      != null) p.price     = parseFloat(bp.price);
      p.salePrice = bp.sale_price ? parseFloat(bp.sale_price) : null;
      // Stock & visibility
      if (bp.stock      != null) p.stock     = parseInt(bp.stock);
      if (bp.active     != null) p.active    = bp.active;
      // Only hide if backend explicitly sets active=false (boolean), never hide on null/undefined
      if (bp.active === false)   p._hidden = true;
      else if (bp.active === true) p._hidden = false;
      // If active is null/undefined, preserve existing _hidden state (default false)
      // Text fields
      if (bp.name)        p.name        = bp.name;
      if (bp.brand)       p.brand       = bp.brand;
      if (bp.description) p.description = bp.description;
      if (bp.badge)       p.badge       = bp.badge;
      if (bp.offer_text !== undefined) p.offer = bp.offer_text || null;  // ✅ FIX 4: allow clearing offer
      else if (bp.offer !== undefined)  p.offer = bp.offer || null;
      if (bp.category)    p.category    = bp.category;
      if (bp.how_to_use)  p.howToUse    = bp.how_to_use;
      // Rating
      if (bp.rating != null) p.rating   = parseFloat(bp.rating);
      if (bp.reviews != null) p.reviews = parseInt(bp.reviews);
      // Display position (admin-controlled homepage/shop ordering)
      if (bp.sort_order != null) p.position = parseInt(bp.sort_order);
      else if (bp.position != null) p.position = parseInt(bp.position);
      // Tags
      if (bp.tags) p.tags = parseArr(bp.tags);
      // Media — support media[] JSON array (up to 10 images/videos) OR individual fields
      // ✅ Only apply backend images if products-images.js has NOT already set them
      const alreadyHasImage = p.image && p.image.startsWith('http');
      const mediaArr = parseArr(bp.media || bp.images);
      if (mediaArr.length && !alreadyHasImage) {
        p.media = mediaArr.slice(0, 10); // [{url, type:"image"|"video", thumb}]
        // Back-compat flat fields
        p.image  = (mediaArr[0] && mediaArr[0].url) || mediaArr[0] || p.image;
        p.image2 = (mediaArr[1] && mediaArr[1].url) || mediaArr[1] || '';
        p.allImages = mediaArr.map(m => m.url || m).filter(Boolean);
      } else {
        if (bp.image  && !alreadyHasImage) p.image  = bp.image;
        if (bp.image2 && !alreadyHasImage) p.image2 = bp.image2;
        // Build media array from individual fields for back-compat
        const legacyUrls = [bp.image,bp.image2,bp.image3,bp.image4,bp.image5].filter(Boolean);
        if (legacyUrls.length) p.media = legacyUrls.map(u=>({url:u,type:'image',thumb:u}));
      }
      // Key Ingredients
      const ki = parseArr(bp.key_ingredients);
      if (ki.length) p.keyIngredients = ki;
      // SEO
      if (bp.seo_keywords) p.seoKeywords = parseArr(bp.seo_keywords);
      if (bp.meta_description) p.metaDescription = bp.meta_description;
      // Tiers flag
      if (bp.has_tiers != null) p.hasTiers = bp.has_tiers;
      if (bp.tiers) {
        try {
          // Handle both: already-parsed array OR JSON string from Supabase
          const parsed = Array.isArray(bp.tiers) ? bp.tiers : JSON.parse(bp.tiers);
          // Validate it's a proper tiers array with expected fields
          if (Array.isArray(parsed) && parsed.length && parsed[0].rate != null) {
            p._backendTiers = parsed;
          }
        } catch(e) { console.warn('Tiers parse error for product', bp.id, e); }
      }
    } else if (bp.active !== false) {
      // New product from admin — add to store
      const imgs = parseArr(bp.images);
      const ki   = parseArr(bp.key_ingredients);
      PRODUCTS.push({
        id:          parseInt(bp.id),
        name:        bp.name,
        brand:       bp.brand || 'Ascofizz',
        category:    bp.category || 'effervescent',
        position:    bp.sort_order != null ? parseInt(bp.sort_order) : (bp.position != null ? parseInt(bp.position) : null),
        // ✅ FIX 3: Use actual tags from backend, NOT auto-tagged featured/new
        tags:        parseArr(bp.tags).length ? parseArr(bp.tags) : [],
        price:       bp.price != null ? parseFloat(bp.price) : null,
        salePrice:   bp.sale_price ? parseFloat(bp.sale_price) : null,
        offer:       bp.offer_text || bp.offer || null,
        media:       (()=>{ const m=parseArr(bp.media||bp.images); return m.length?m.slice(0,10).map(x=>typeof x==='string'?{url:x,type:'image',thumb:x}:x):[]; })(),
        image:       imgs[0] || bp.image || '',
        image2:      imgs[1] || bp.image2 || '',
        allImages:   imgs,
        rating:      parseFloat(bp.rating) || 4.5,
        reviews:     parseInt(bp.reviews) || 0,
        stock:       parseInt(bp.stock) || 0,
        badge:       bp.badge || '',
        description: bp.description || '',
        keyIngredients: ki,
        howToUse:    bp.how_to_use || '',
        hasTiers:    bp.has_tiers || false,
        _backendTiers: (() => { try { const t = Array.isArray(bp.tiers) ? bp.tiers : JSON.parse(bp.tiers||'null'); return (Array.isArray(t) && t.length && t[0].rate != null) ? t : null; } catch(e) { return null; } })(),
        seoKeywords: parseArr(bp.seo_keywords),
        active:      true,
        _hidden:     false,
      });
    }
  });
}

// Live coupon validation against backend (used in applyPromoCode below)
async function validateCouponWithBackend(code, subtotal) {
  try {
    const r = await fetchWithTimeout(`${API_BASE}/api/coupons/validate`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({code, subtotal})
    }, 5000);
    if (!r.ok) return null;
    const d = await r.json();
    return d.valid ? d : null;
  } catch(e) { return null; }
}

// Fetch live products from backend on page load (non-blocking)
// Handles Render free tier cold-starts gracefully with retry logic
async function syncProductsFromBackend() {
  const MAX_ATTEMPTS = 3; // 3 attempts × escalating timeouts = up to 2min total
  const TIMEOUTS     = [20000, 40000, 60000]; // escalating timeouts for Render cold start (up to 50s)
  const RETRY_DELAY  = 3000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        // Wait before retry
        await new Promise(r => setTimeout(r, RETRY_DELAY));
      }

      // ✅ Cache-bust so browser never serves stale product data
      const r = await fetchWithTimeout(`${API_BASE}/api/products?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      }, TIMEOUTS[attempt]);

      if (!r.ok) {
        if (attempt < MAX_ATTEMPTS - 1) continue;
        return;
      }

      const data = await r.json();
      const products = data.data || data;
      if (Array.isArray(products) && products.length) {
        mergeBackendProducts(products);
        // Re-render all grids with updated data (including new backend products)
        try { renderFeatured(); } catch(e){}
        try { renderNewArrivals(); } catch(e){}
        try {
          const sg = document.getElementById('shopGrid');
          if(sg) renderShopGrid();
        } catch(e){}
        // Update prices, images, offers on all visible product cards
        try { updateAllProductCards(); } catch(e){}
        // Re-render product detail page if currently open (so price/tiers update instantly)
        try {
          const prodPage = document.getElementById('page-product');
          if (prodPage && prodPage.style.display !== 'none' && window._currentProductId) {
            const cp = PRODUCTS.find(p => p.id === window._currentProductId);
            if (cp) buildProductPage(cp);
          }
        } catch(e) {}

        // Push local QTY_TIERS to backend for any product missing tiers in DB
        // This ensures admin sees tier data even before it's been set manually
        try { pushLocalTiersToBackend(products); } catch(e) {}

        return; // success — stop retrying
      }
    } catch(e) {
      // Attempt 1 failure is expected (Render free-tier cold start) — only warn on retries
      if (attempt > 0) {
        console.warn('[Ascofizz] ⚠️ Sync attempt ' + (attempt+1) + ' failed:', e.name, e.message);
      }
      const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
      if (isTimeout && attempt < MAX_ATTEMPTS - 1) {
        continue;
      }
      return;
    }
  }
}

// Push local QTY_TIERS to backend for products that have no tiers set in DB
// Runs once after first successful sync — skips products that already have tiers
async function pushLocalTiersToBackend(backendProducts) {
  const productsWithoutTiers = backendProducts.filter(bp => {
    if (!bp.has_tiers && !bp.tiers) {
      const lt = QTY_TIERS[parseInt(bp.id)];
      return lt && lt.length > 0 && lt[0].rate != null;
    }
    return false;
  });
  if (!productsWithoutTiers.length) return;
  for (const bp of productsWithoutTiers) {
    try {
      const lt = QTY_TIERS[parseInt(bp.id)];
      await fetch(`${API_BASE}/api/products/${bp.id}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({has_tiers:true, tiers:JSON.stringify(lt)})
      });
    } catch(e) {}
  }
}

// ✅ FIX 2 & 5: Standalone render functions used after backend sync
function renderFeatured() {
  const visible = PRODUCTS.filter(p => !p._hidden && p.active !== false);
  const feat = visible.filter(p => p.tags.includes('featured')).sort(byPosition).slice(0,8);
  const fg = document.getElementById('featuredGrid');
  if (fg) fg.innerHTML = feat.map(p => renderProductCard(p)).join('');
}
function renderNewArrivals() {
  const visible = PRODUCTS.filter(p => !p._hidden && p.active !== false);
  const newP = visible.filter(p => p.tags.includes('new')).sort(byPosition).slice(0,4);
  const nag = document.getElementById('newArrivalsGrid');
  if (nag) nag.innerHTML = newP.map(p => renderProductCard(p)).join('');
}
function renderShopGrid() { applyFilters(); }

// Re-render all visible product cards after backend sync — full replacement
function updateAllProductCards() {
  document.querySelectorAll('[data-product-id]').forEach(card => {
    const id = parseInt(card.dataset.productId);
    const p = PRODUCTS.find(x => x.id === id);
    if (!p || !card.parentNode) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = renderProductCard(p);
    const nc = tmp.firstElementChild;
    if (nc) card.parentNode.replaceChild(nc, card);
  });
}

// Updated: New products, GoKwik payment, Shiprocket integration

const ASCOVITA_LOGO = "assets/img/ascofizz-logo.svg";

// GoKwik config is handled via backend (GOKWIK_APP_ID, GOKWIK_APP_SECRET) environment variables

const SHIPROCKET_CONFIG = {
  trackingUrl: 'https://shiprocket.co/tracking/',
  pickup_location: 'Primary',   // Must match warehouse name in Shiprocket panel
  apiBase: API_BASE,
  // NOTE: credentials are stored securely in backend environment variables only
};

// ── QTY_TIERS: fallback static tiers (overridden by backend tiers if set in admin) ──
// Keys must match product IDs in the PRODUCTS array below.
const QTY_TIERS = {
  // ── L-Glutathione Effervescent Orange (id:1) ──
  1:  [{tabs:15,mrp:899, rate:827, discountPct:8},{tabs:30,mrp:1798,rate:1618,discountPct:10},{tabs:45,mrp:2697,rate:2373,discountPct:12},{tabs:60,mrp:3596,rate:3093,discountPct:14}],
  // ── ACV + Moringa Green Apple (id:2) ──
  2:  [{tabs:15,mrp:349, rate:321, discountPct:8},{tabs:30,mrp:698, rate:628, discountPct:10},{tabs:45,mrp:1047,rate:921, discountPct:12},{tabs:60,mrp:1396,rate:1201,discountPct:14}],
  // ── L-Carnitine Orange (id:3) ──
  3:  [{tabs:15,mrp:469, rate:399, discountPct:15},{tabs:30,mrp:938, rate:750, discountPct:20},{tabs:45,mrp:1407,rate:1055,discountPct:25},{tabs:60,mrp:1876,rate:1219,discountPct:35}],
  // ── B12 + Biotin Guava (id:4) ──
  4:  [{tabs:15,mrp:599, rate:449, discountPct:25},{tabs:30,mrp:1198,rate:862, discountPct:28},{tabs:45,mrp:1797,rate:1221,discountPct:32},{tabs:60,mrp:2396,rate:1557,discountPct:35}],
  // ── Vitamin C Orange (id:5) ──
  5:  [{tabs:15,mrp:349, rate:249, discountPct:28},{tabs:30,mrp:698, rate:488, discountPct:30},{tabs:45,mrp:1047,rate:711, discountPct:32},{tabs:60,mrp:1396,rate:921, discountPct:34}],
  // ── Multidiata Box Pack (id:8) ──
  8:  [{tabs:30,mrp:150, rate:120, discountPct:20},{tabs:60,mrp:289, rate:231, discountPct:20}],
  // ── VitaPlus B12+D3 Vegan (id:10) ──
  10: [{tabs:60,mrp:499, rate:399, discountPct:20}],
  // ── MG+++ Magnesium (id:11) ──
  11: [{tabs:60,mrp:459, rate:367, discountPct:20}],
  // ── CS++ + Iron++ (id:12) ──
  12: [{tabs:60,mrp:479, rate:383, discountPct:20}],
  // ── Moringa Tablets (id:20) ──
  20: [{tabs:60,mrp:249, rate:249, discountPct:0}],
  // ── Power Pro Tablets (id:22) ──
  22: [{tabs:60,mrp:null, rate:null, discountPct:0}],
};

