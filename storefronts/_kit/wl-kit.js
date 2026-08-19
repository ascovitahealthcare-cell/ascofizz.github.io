/* ═══════════════════════════════════════════════════════════════════════
   WHITE-LABEL TEMPLATE KIT
   ───────────────────────────────────────────────────────────────────────
   The Ascofizz storefront engine (index.html) is copied verbatim into each
   storefront folder. Nothing inside it is edited. This file is the seam:
   it lets a brand pack replace the TEMPLATE layer — identity, navigation,
   homepage, product cards, product page, merchandising, footer, motion —
   while every line of the CORE layer keeps running untouched:

       cart · checkout · payments · orders · accounts · auth · admin
       search · filtering · sorting · inventory · wishlist · reviews

   A brand pack (template/brand.js) calls WL.define({...}) once. This kit
   installs its catalogue before the engine's first render, then swaps the
   chrome after the engine has booted.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var WL = window.WL = {};
  var cfg = null;

  /* ── the folder this storefront is served from, e.g. /storefronts/forge/ ── */
  var BASE = location.pathname.replace(/[^/]*$/, '');
  WL.base = BASE;

  /* ─────────────────────────  01 · SMALL UTILITIES  ───────────────────────── */

  WL.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  WL.inr = function (n) {
    if (n == null) return '';
    return '₹' + Number(n).toLocaleString('en-IN');
  };

  /* Rating row. Never invents stars for a product with no reviews — the
     engine made that mistake once and it is a trust problem, not a
     cosmetic one. */
  WL.stars = function (r, count, cls) {
    var v = Math.round((Number(r) || 0) * 10) / 10;
    var full = Math.floor(v), half = v % 1 >= 0.5;
    if (!count) return '<span class="' + (cls || 'wl-rate') + ' is-empty">No reviews yet</span>';
    return '<span class="' + (cls || 'wl-rate') + '"><span class="wl-rate-stars">' +
      '★'.repeat(full) + (half ? '½' : '') + '</span>' +
      '<span class="wl-rate-n">' + v.toFixed(1) + '</span>' +
      '<span class="wl-rate-c">(' + count + ')</span></span>';
  };

  WL.discount = function (p) {
    return (p.salePrice && p.price) ? Math.round((1 - p.salePrice / p.price) * 100) : 0;
  };

  /* "1 products" is the kind of detail that makes a demo look generated. */
  WL.count = function (n, noun, plural) {
    return n + ' ' + (n === 1 ? noun : (plural || noun + 's'));
  };

  WL.slug = function (s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  /* The engine declares PRODUCTS as a top-level `const`, which makes it a
     lexical global — visible to every classic script on the page, but never
     a property of `window`. Reading it through window returns undefined, so
     it is read by name. */
  function catalogue() {
    try { return (typeof PRODUCTS !== 'undefined' && PRODUCTS) ? PRODUCTS : []; }
    catch (e) { return []; }
  }
  WL.all = catalogue;

  /* Products for a merchandising rail. `sel` is matched against tags,
     category and the brand-specific merchandising keys (goal/format/...). */
  WL.pick = function (sel, limit) {
    var list = catalogue().filter(function (p) {
      if (p._hidden || p.active === false) return false;
      if (!sel || sel === 'all') return true;
      if (p.category === sel) return true;
      if (Array.isArray(p.tags) && p.tags.indexOf(sel) > -1) return true;
      if (p.goal === sel || p.format === sel || p.stage === sel || p.audience === sel) return true;
      return false;
    });
    list.sort(function (a, b) { return (a.position || 99) - (b.position || 99); });
    return limit ? list.slice(0, limit) : list;
  };

  WL.byId = function (id) { return catalogue().find(function (p) { return p.id === id; }); };

  /* ─────────────────────────  02 · PACKSHOT ARTWORK  ─────────────────────────
     The demo catalogues are fictional, so there is no photography to ship.
     Rather than grey placeholder tiles — which make a merchandising demo
     impossible to read — each brand draws its own packaging: a tube, an
     amber bottle, a protein tub, a kraft pouch, a gummy jar. Same generator,
     different pack format and palette per brand, so a grid still reads as a
     real shelf and the six storefronts never look alike.
     Swap `image:` on any product for a real photo URL and the engine's own
     image pipeline takes over — nothing here is in its way. */

  function shadow(id) {
    return '<ellipse cx="320" cy="592" rx="150" ry="17" fill="rgba(20,28,24,.13)"/>';
  }
  function labelText(name, sub, x, y, w, colour, size, weight, family, align) {
    var words = String(name).toUpperCase().split(/\s+/), lines = [], cur = '';
    var per = Math.max(6, Math.floor(w / (size * 0.62)));
    words.forEach(function (word) {
      if ((cur + ' ' + word).trim().length > per) { if (cur) lines.push(cur); cur = word; }
      else cur = (cur + ' ' + word).trim();
    });
    if (cur) lines.push(cur);
    lines = lines.slice(0, 3);
    var out = '';
    lines.forEach(function (ln, i) {
      out += '<text x="' + x + '" y="' + (y + i * (size * 1.16)) + '" text-anchor="' + (align || 'middle') +
        '" font-family="' + family + '" font-size="' + size + '" font-weight="' + weight +
        '" letter-spacing="' + (size * 0.04).toFixed(2) + '" fill="' + colour + '">' + WL.esc(ln) + '</text>';
    });
    if (sub) {
      out += '<text x="' + x + '" y="' + (y + lines.length * (size * 1.16) + size * 0.55) + '" text-anchor="' + (align || 'middle') +
        '" font-family="' + family + '" font-size="' + (size * 0.52) + '" font-weight="400" letter-spacing="2.4" fill="' + colour + '" opacity=".72">' +
        WL.esc(String(sub).toUpperCase()) + '</text>';
    }
    return out;
  }

  var PACK = {};

  /* Effervescent tube — Ascofizz */
  PACK.tube = function (o) {
    return '' +
      shadow() +
      '<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="rgba(0,0,0,.16)"/><stop offset=".22" stop-color="rgba(255,255,255,.30)"/>' +
      '<stop offset=".62" stop-color="rgba(255,255,255,0)"/><stop offset="1" stop-color="rgba(0,0,0,.14)"/>' +
      '</linearGradient></defs>' +
      '<rect x="228" y="120" width="184" height="452" rx="26" fill="' + o.body + '"/>' +
      '<rect x="228" y="120" width="184" height="452" rx="26" fill="url(#g1)"/>' +
      '<rect x="222" y="72" width="196" height="66" rx="22" fill="' + o.cap + '"/>' +
      '<rect x="222" y="122" width="196" height="12" rx="6" fill="rgba(0,0,0,.12)"/>' +
      '<rect x="228" y="206" width="184" height="256" fill="' + o.label + '"/>' +
      '<rect x="228" y="206" width="184" height="256" fill="url(#g1)" opacity=".5"/>' +
      '<rect x="228" y="206" width="184" height="7" fill="' + o.accent + '"/>' +
      '<rect x="228" y="455" width="184" height="7" fill="' + o.accent + '"/>' +
      '<circle cx="320" cy="252" r="17" fill="none" stroke="' + o.accent + '" stroke-width="3"/>' +
      '<circle cx="313" cy="247" r="4" fill="' + o.accent + '"/><circle cx="326" cy="256" r="2.6" fill="' + o.accent + '"/>' +
      labelText(o.name, o.sub, 320, 306, 168, o.ink, 21, '800', o.font) +
      '<text x="320" y="440" text-anchor="middle" font-family="' + o.font + '" font-size="13" font-weight="700" letter-spacing="2" fill="' + o.ink + '" opacity=".62">EFFERVESCENT</text>';
  };

  /* Amber supplement bottle — Arcadia */
  PACK.bottle = function (o) {
    return '' +
      shadow() +
      '<rect x="252" y="96" width="136" height="52" rx="9" fill="' + o.cap + '"/>' +
      '<path d="M262 148h116v18l24 34v352a22 22 0 0 1-22 22H260a22 22 0 0 1-22-22V200l24-34z" fill="' + o.body + '"/>' +
      '<path d="M262 148h34v18l-24 34v374h-12a22 22 0 0 1-22-22V200l24-34z" fill="rgba(255,255,255,.22)"/>' +
      '<rect x="248" y="252" width="144" height="232" rx="5" fill="' + o.label + '"/>' +
      '<rect x="248" y="252" width="144" height="232" rx="5" fill="none" stroke="rgba(0,0,0,.09)"/>' +
      '<line x1="272" y1="290" x2="368" y2="290" stroke="' + o.accent + '" stroke-width="1.4"/>' +
      labelText(o.name, null, 320, 336, 128, o.ink, 17, '400', o.font) +
      '<line x1="272" y1="424" x2="368" y2="424" stroke="' + o.accent + '" stroke-width="1.4"/>' +
      '<text x="320" y="452" text-anchor="middle" font-family="' + o.font + '" font-size="11" letter-spacing="3.4" fill="' + o.ink + '" opacity=".7">' + WL.esc(String(o.sub || '').toUpperCase()) + '</text>';
  };

  /* Wide performance tub — Forge */
  PACK.tub = function (o) {
    return '' +
      shadow() +
      '<rect x="150" y="118" width="340" height="76" rx="12" fill="' + o.cap + '"/>' +
      '<rect x="150" y="180" width="340" height="18" fill="rgba(0,0,0,.16)"/>' +
      '<path d="M162 194h316l-18 366a20 20 0 0 1-20 18H200a20 20 0 0 1-20-18z" fill="' + o.body + '"/>' +
      '<path d="M162 194h58l-14 384h-24a20 20 0 0 1-20-18z" fill="rgba(255,255,255,.14)"/>' +
      '<path d="M170 268h300l-12 240H182z" fill="' + o.label + '"/>' +
      '<path d="M170 268h300l-4 74H174z" fill="' + o.accent + '"/>' +
      '<text x="320" y="316" text-anchor="middle" font-family="' + o.font + '" font-size="26" font-weight="900" letter-spacing="3" fill="' + o.capInk + '">' + WL.esc(String(o.brand || '').toUpperCase()) + '</text>' +
      labelText(o.name, o.sub, 320, 396, 280, o.ink, 26, '900', o.font) +
      '<rect x="228" y="470" width="184" height="26" rx="3" fill="' + o.accent + '"/>' +
      '<text x="320" y="489" text-anchor="middle" font-family="' + o.font + '" font-size="14" font-weight="800" letter-spacing="2" fill="' + o.capInk + '">' + WL.esc(String(o.meta || '').toUpperCase()) + '</text>';
  };

  /* Kraft stand-up pouch — Algaeva */
  PACK.pouch = function (o) {
    return '' +
      shadow() +
      '<path d="M186 132h268a14 14 0 0 1 14 14v396a30 30 0 0 1-30 30H202a30 30 0 0 1-30-30V146a14 14 0 0 1 14-14z" fill="' + o.body + '"/>' +
      '<path d="M186 132h70a14 14 0 0 0 0 0v440h-54a30 30 0 0 1-30-30V146a14 14 0 0 1 14-14z" fill="rgba(255,255,255,.16)"/>' +
      '<rect x="172" y="118" width="296" height="30" rx="8" fill="' + o.cap + '"/>' +
      '<g opacity=".9">' +
      '<path d="M320 200c-30 0-54 22-54 48 0 26 24 48 54 48s54-22 54-48c0-26-24-48-54-48z" fill="' + o.accent + '" opacity=".18"/>' +
      '<path d="M320 212c-22 16-32 34-32 50 0 12 14 22 32 22s32-10 32-22c0-16-10-34-32-50z" fill="' + o.accent + '"/>' +
      '</g>' +
      /* A paper label panel. Without it the name is dark type on a dark
         pouch and unreadable the moment the packshot is scaled to a card. */
      '<rect x="208" y="322" width="224" height="176" rx="10" fill="' + (o.label || '#FBF9F1') + '"/>' +
      '<rect x="208" y="322" width="224" height="8" rx="4" fill="' + o.accent + '"/>' +
      labelText(o.name, o.sub, 320, 386, 200, o.ink2 || '#243027', 23, '700', o.font) +
      '<line x1="248" y1="446" x2="392" y2="446" stroke="' + o.accent + '" stroke-width="1.6" opacity=".6"/>' +
      '<text x="320" y="474" text-anchor="middle" font-family="' + o.font + '" font-size="13" letter-spacing="2.4" fill="' + (o.ink2 || '#243027') + '" opacity=".75">' + WL.esc(String(o.meta || '').toUpperCase()) + '</text>';
  };

  /* Gummy jar — Chewly */
  PACK.jar = function (o) {
    var g = '', cols = o.gummies || [o.accent];
    var pts = [[268, 372], [318, 356], [368, 374], [292, 412], [348, 414], [320, 452], [270, 440], [372, 442]];
    pts.forEach(function (pt, i) {
      g += '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="' + (17 + (i % 3) * 2) + '" fill="' + cols[i % cols.length] + '" opacity=".92"/>';
    });
    return '' +
      shadow() +
      '<rect x="232" y="96" width="176" height="56" rx="16" fill="' + o.cap + '"/>' +
      '<rect x="240" y="140" width="160" height="14" rx="5" fill="rgba(0,0,0,.14)"/>' +
      '<rect x="206" y="152" width="228" height="424" rx="40" fill="' + o.body + '"/>' +
      '<rect x="206" y="152" width="66" height="424" rx="40" fill="rgba(255,255,255,.30)"/>' +
      g +
      '<rect x="216" y="196" width="208" height="150" rx="14" fill="' + o.label + '"/>' +
      labelText(o.name, o.sub, 320, 254, 190, o.ink, 22, '800', o.font) +
      '<rect x="262" y="486" width="116" height="30" rx="15" fill="' + o.accent + '"/>' +
      '<text x="320" y="507" text-anchor="middle" font-family="' + o.font + '" font-size="14" font-weight="800" fill="' + (o.capInk || '#fff') + '">' + WL.esc(o.meta || '') + '</text>';
  };

  /* Carton — used for combos/kits in any brand */
  PACK.box = function (o) {
    return '' +
      shadow() +
      '<path d="M164 214l156-72 156 72v300l-156 72-156-72z" fill="' + o.body + '"/>' +
      '<path d="M164 214l156 72v300l-156-72z" fill="rgba(0,0,0,.13)"/>' +
      '<path d="M476 214l-156 72v300l156-72z" fill="rgba(255,255,255,.13)"/>' +
      '<path d="M320 142l156 72-156 72-156-72z" fill="' + o.cap + '"/>' +
      '<rect x="196" y="330" width="248" height="12" fill="' + o.accent + '" opacity=".9" transform="skewY(24.7)"/>' +
      labelText(o.name, o.sub, 398, 402, 210, o.ink, 20, '800', o.font, 'middle');
  };

  /* Draws one packshot as a self-contained SVG data URI. */
  WL.pack = function (o) {
    var draw = PACK[o.shape] || PACK.tube;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="640" height="640">' +
      '<rect width="640" height="640" fill="' + (o.bg || '#F4F5F1') + '"/>' +
      draw(o) + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  /* ─────────────────────────  03 · CATALOGUE INSTALL  ─────────────────────────
     PRODUCTS is a top-level `const` in the engine, so it cannot be
     reassigned — but it can be emptied and refilled, which is all a
     white-label catalogue swap needs. Done while the document is still
     parsing, so the engine's very first render already draws this brand's
     portfolio. The product SHAPE is untouched: same fields, same ids, same
     cart/checkout/order path. */
  function installCatalog(list) {
    try {
      if (typeof PRODUCTS === 'undefined') return;
      PRODUCTS.length = 0;
      list.forEach(function (p, i) {
        var art = cfg.packshot ? cfg.packshot(p) : null;
        PRODUCTS.push(Object.assign({
          position: i + 1,
          brand: cfg.name,
          rating: 0, reviews: 0, stock: 25,
          tags: [], image: '', salePrice: null,
          _art: art
        }, p, { _art: p._art || art }));
      });
      /* Tiered pack pricing belongs to the old catalogue; these portfolios
         price per size variant instead. */
      if (typeof QTY_TIERS !== 'undefined') {
        Object.keys(QTY_TIERS).forEach(function (k) { delete QTY_TIERS[k]; });
      }
    } catch (e) { console.warn('[WL] catalogue install failed', e); }
  }

  /* ─────────────────────────  04 · ENGINE OVERRIDES  ─────────────────────────
     Three seams, all of them presentation-only. Everything they return is
     handed straight back to the same engine handlers (openProduct,
     STORE.addToCart, openSideCart), so the checkout path is identical for
     all six brands. */
  function installOverrides() {
    /* Artwork: the engine only recognises http(s) images, ours are inline. */
    var _origImg = window.getProductImg;
    window.getProductImg = function (p) {
      if (p && p._art) return p._art;
      if (p && p.image && /^https?:/.test(p.image)) return _origImg ? _origImg(p) : p.image;
      return p && p._art ? p._art : (cfg.packshot ? cfg.packshot(p || {}) : '');
    };

    if (cfg.card) {
      window.renderProductCard = function (p) {
        try { return cfg.card(p); } catch (e) { console.warn('[WL] card', e); return ''; }
      };
    }
    if (cfg.productPage) {
      window.buildProductPage = function (p) {
        try { return cfg.productPage(p); } catch (e) { console.warn('[WL] product page', e); return ''; }
      };
    }
    /* The backend sync would merge the live Ascofizz catalogue back over a
       demo portfolio. Kept off for the demo storefronts; the function is
       still there, so a real white-label tenant just points it at its own
       products table. */
    if (typeof window.mergeBackendProducts === 'function') {
      window.mergeBackendProducts = function () { return; };
    }
  }

  /* The engine's price filter is scaled to the Ascofizz catalogue: its
     slider stops at ₹2,000 and applyFilters() drops anything dearer. A
     premium range priced above that would silently lose products from its
     own shop grid, so the slider is rescaled to whatever the brand's
     portfolio actually costs — and kept rescaled when the customer clears
     their filters. */
  function rescalePriceFilter() {
    var top = 0;
    catalogue().forEach(function (p) {
      var px = p.salePrice || p.price;
      if (typeof px === 'number' && px > top) top = px;
    });
    if (!top) return;
    var ceiling = Math.ceil(top / 500) * 500;
    var range = document.getElementById('priceRange');
    if (range) {
      range.max = String(ceiling);
      range.step = '100';
      range.value = String(ceiling);
    }
    var disp = document.getElementById('priceDisp');
    if (disp) disp.textContent = 'Any price';
    try { priceMax = ceiling; } catch (e) {}
    WL.priceCeiling = ceiling;
  }

  function installPriceFilter() {
    rescalePriceFilter();
    /* clearFilters() resets the slider to the engine's own ₹2,000 default. */
    if (typeof window.clearFilters === 'function' && !window.clearFilters._wl) {
      var orig = window.clearFilters;
      var wrapped = function () { orig(); rescalePriceFilter(); if (typeof window.applyFilters === 'function') window.applyFilters(); };
      wrapped._wl = true;
      window.clearFilters = wrapped;
    }
  }

  /* ─────────────────────────  05 · ROUTING INSIDE A SUBFOLDER  ─────────────────
     The engine pushes clean root paths ("/shop"). Served from
     /storefronts/<brand>/ those would 404 on refresh, so they are rewritten
     to a hash route on the storefront's own base. Same navigation, same
     history, no server rewrite rules needed. */
  function installRouting() {
    if (BASE === '/') return;
    ['pushState', 'replaceState'].forEach(function (fn) {
      var orig = history[fn];
      history[fn] = function (state, title, url) {
        if (typeof url === 'string' && url.charAt(0) === '/') {
          var clean = url.replace(/^\/+/, '');
          url = clean ? BASE + '#/' + clean : BASE;
        }
        try { return orig.call(history, state, title, url); }
        catch (e) { return; }
      };
    });
  }

  function restoreHashRoute() {
    var m = /^#\/([a-z0-9-]+)/i.exec(location.hash || '');
    if (!m) return;
    var page = m[1];
    if (typeof window.showPage === 'function' && document.getElementById('page-' + page)) {
      window.showPage(page);
      if (typeof window.setAppNav === 'function') window.setAppNav(page);
    }
  }

  /* ─────────────────────────  06 · CHROME REPLACEMENT  ───────────────────────── */

  function swap(el, html) { if (el) el.innerHTML = html; }

  function mountChrome() {
    var body = document.body;

    /* Header — the engine's navbar and mobile menu are removed outright so
       each brand owns its own header structure, not a recoloured one. The
       baseline storefront ships no header of its own and keeps the
       engine's, which is the whole point of template 06. */
    if (cfg.header) {
      var oldNav = document.querySelector('nav.navbar');
      if (oldNav) oldNav.remove();
      var oldMobile = document.getElementById('mobileMenu');
      if (oldMobile) oldMobile.remove();
    }

    if (cfg.header && !document.getElementById('wlHeader')) {
      var holder = document.createElement('div');
      holder.id = 'wlHeader';
      holder.innerHTML = cfg.header();
      body.insertBefore(holder, body.firstChild);
    }

    /* Homepage — replaced wholesale. No shared hero, no shared rails. */
    if (cfg.home) swap(document.getElementById('page-home'), cfg.home());

    /* Shop chrome — merchandising taxonomy is per brand; the grid,
       filters, sort and search underneath are the engine's own. */
    if (cfg.shopIntro) {
      var shop = document.getElementById('page-shop');
      var container = shop && shop.querySelector('.container');
      if (container && !document.getElementById('wlShopIntro')) {
        var intro = document.createElement('div');
        intro.id = 'wlShopIntro';
        intro.innerHTML = cfg.shopIntro();
        container.insertBefore(intro, container.firstChild);
      }
    }
    if (cfg.categories) {
      var pills = document.getElementById('shopPills');
      if (pills) {
        pills.className = 'wl-cats';
        pills.innerHTML = cfg.categories.map(function (c, i) {
          return '<button class="wl-cat cpill' + (i === 0 ? ' active' : '') + '" data-cat="' + WL.esc(c.key) +
            '" onclick="filterCat(\'' + WL.esc(c.key) + '\',this)">' + WL.esc(c.label) + '</button>';
        }).join('');
      }
    }

    /* Footer */
    if (cfg.footer) {
      var f = document.getElementById('siteFooter');
      if (f) { f.className = 'wl-footer'; f.innerHTML = cfg.footer(); }
    }

    /* Mobile bottom bar — different destinations per brand, same engine
       handlers behind them. */
    if (cfg.bottomNav) {
      var bn = document.getElementById('appBottomNav');
      if (bn) {
        bn.innerHTML = cfg.bottomNav.map(function (it) {
          var action = it.action || ("showPage('" + it.page + "');setAppNav('" + it.page + "')");
          return '<button class="app-nav-item' + (it.page === 'home' ? ' active' : '') + '" id="appNav-' + WL.esc(it.page) +
            '" onclick="' + action + '"><span class="app-nav-icon">' + it.icon + '</span>' +
            '<span class="app-nav-label">' + WL.esc(it.label) + '</span>' +
            (it.page === 'cart' ? '<span class="app-nav-dot" id="appNavCartDot" style="display:none">0</span>' : '') +
            '</button>';
        }).join('');
      }
    }

    installPriceFilter();

    /* Demo switcher — every storefront carries the same way back. */
    mountSwitcher();

    if (cfg.onMount) { try { cfg.onMount(); } catch (e) { console.warn('[WL] onMount', e); } }

    initReveal();
    restoreHashRoute();
  }

  var STORES = [
    ['01', 'Ascofizz', 'Effervescents', 'ascofizz'],
    ['02', 'Arcadia', 'Premium Wellness', 'arcadia'],
    ['03', 'Forge', 'Sports Nutrition', 'forge'],
    ['04', 'Algaeva', 'Spirulina & Greens', 'algaeva'],
    ['05', 'Chewly', 'Gummies & Chewables', 'chewly'],
    ['06', 'Ascofizz Original', 'Baseline Template', 'ascofizz-original']
  ];
  WL.stores = STORES;

  function mountSwitcher() {
    if (document.getElementById('wlSwitch')) return;
    var root = BASE.replace(/[^/]+\/$/, '');
    var el = document.createElement('div');
    el.id = 'wlSwitch';
    el.innerHTML =
      '<button class="wl-sw-tab" onclick="WL.toggleSwitcher()" aria-expanded="false">' +
      '<span class="wl-sw-dot"></span>White-label demo<span class="wl-sw-name">' + WL.esc(cfg.name) + '</span></button>' +
      '<div class="wl-sw-panel" hidden>' +
      '<p class="wl-sw-head">One platform · six storefronts</p>' +
      '<p class="wl-sw-sub">Same cart, checkout, orders, accounts and admin behind every one.</p>' +
      STORES.map(function (s) {
        var on = s[3] === cfg.slug;
        return '<a class="wl-sw-item' + (on ? ' is-on' : '') + '" href="' + root + s[3] + '/">' +
          '<span class="wl-sw-num">' + s[0] + '</span>' +
          '<span class="wl-sw-txt"><strong>' + s[1] + '</strong><em>' + s[2] + '</em></span>' +
          (on ? '<span class="wl-sw-here">Viewing</span>' : '') + '</a>';
      }).join('') +
      '<a class="wl-sw-all" href="' + root + '">All storefronts →</a>' +
      '</div>';
    document.body.appendChild(el);
  }

  WL.toggleSwitcher = function () {
    var p = document.querySelector('#wlSwitch .wl-sw-panel');
    var b = document.querySelector('#wlSwitch .wl-sw-tab');
    if (!p) return;
    var open = !p.hasAttribute('hidden');
    if (open) p.setAttribute('hidden', ''); else p.removeAttribute('hidden');
    b.setAttribute('aria-expanded', String(!open));
  };

  /* ─────────────────────────  07 · MOTION  ─────────────────────────
     One observer, brand-tuned by CSS. Everything is opt-in per element
     (.wl-rise), honours prefers-reduced-motion, and never moves anything a
     customer is trying to read or click. */
  function initReveal() {
    /* The hidden state is only armed once this runs, so a template whose
       script fails still renders a complete, readable page rather than a
       column of blank sections. */
    document.documentElement.classList.add('wl-motion');
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.wl-rise').forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    document.querySelectorAll('.wl-rise').forEach(function (el) { io.observe(el); });
    WL._io = io;
  }
  WL.observe = function (scope) {
    (scope || document).querySelectorAll('.wl-rise').forEach(function (el) {
      if (WL._io) WL._io.observe(el); else el.classList.add('is-in');
    });
  };

  /* Horizontal rail helper — used by the brands whose merchandising is a
     scroller rather than a grid. */
  WL.rail = function (id, dir) {
    var el = document.getElementById(id);
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 720), behavior: 'smooth' });
  };

  /* Simple tab/filter switch shared by the brands that merchandise by
     format or goal on the homepage. */
  WL.tabTo = function (btn, group, key, target) {
    document.querySelectorAll('[data-tabgroup="' + group + '"]').forEach(function (b) { b.classList.remove('is-on'); });
    if (btn) btn.classList.add('is-on');
    var host = document.getElementById(target);
    if (!host) return;
    host.innerHTML = WL.pick(key, 8).map(function (p) { return window.renderProductCard(p); }).join('');
    if (window._hpiFlush) { try { window._hpiFlush(); } catch (e) {} }
    WL.observe(host);
  };

  /* Send the customer into the engine's shop with a category applied. */
  WL.shop = function (cat) {
    if (typeof window.showShop === 'function') window.showShop(cat || 'all');
    else if (typeof window.showPage === 'function') window.showPage('shop');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* STORE, like PRODUCTS, is a top-level `const` — reachable by name from
     any script and from inline handlers, but absent from `window`. */
  function store() {
    try { return (typeof STORE !== 'undefined') ? STORE : null; } catch (e) { return null; }
  }
  WL.store = store;

  /* Add a whole merchandised set (a stack, a routine, a bundle) at once.
     Straight into the engine's cart — the same one every storefront and the
     checkout behind them use. */
  WL.addSet = function (ids) {
    var s = store();
    if (!s) return;
    ids.forEach(function (id) { s.addToCart(id, 1); });
    if (typeof window.openSideCart === 'function') window.openSideCart();
  };

  /* ─────────────────────────  08 · ENTRY POINT  ─────────────────────────
     Two ways in. define() dresses the engine in a brand template.
     baseline() leaves the engine's own storefront completely alone and
     adds nothing but the demo switcher — template 06 proves the existing
     Ascofizz storefront stays available, unchanged, on the same platform. */
  WL.baseline = function (brand) {
    cfg = WL.cfg = Object.assign({ catalog: null }, brand);
    installRouting();
    function go() { mountSwitcher(); restoreHashRoute(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
    window.addEventListener('hashchange', restoreHashRoute);
  };

  WL.define = function (brand) {
    cfg = WL.cfg = brand;
    document.documentElement.setAttribute('data-tpl', brand.slug);
    document.title = brand.title || (brand.name + ' — ' + (brand.tagline || ''));

    installRouting();
    installCatalog(brand.catalog || []);
    installOverrides();

    function go() {
      mountChrome();
      /* The engine finishes some work on timers; re-assert the chrome once
         after it has settled so nothing it writes late can outrank the
         template. */
      setTimeout(function () {
        if (!document.getElementById('wlHeader') || !document.getElementById('wlSwitch')) mountChrome();
        if (typeof window.applyFilters === 'function' && document.getElementById('shopGrid')) window.applyFilters();
      }, 1200);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();

    window.addEventListener('hashchange', restoreHashRoute);
  };
})();
