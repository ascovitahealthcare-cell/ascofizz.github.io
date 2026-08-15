/* ═══════════════════════════════════════════════════════════════════
   Ozylix — "Fly to Cart" add-to-cart animation (v2)

   Inspired by the animated add-to-cart pattern: a mini product
   thumbnail flies along a smooth arc from the tapped card to the cart
   icon, the cart badge pulses and increments, the button flips to
   "✓ Added", and a mobile floating "View cart" pill rises up — then
   the side cart is opened so the customer can proceed.

   Adapted to the Ozylix design language:
     • parchment paper background (--paper #FBF3E8)
     • Ozylix crimson accents (--indigo #C0394A, --indigo-hi #D7535D)
     • the existing fz-bump spring on badges

   Targets (in priority order):
     desktop  → navbar cart icon   (.navbar .nav-icon-btn[title="Cart"])
     mobile   → app-topbar cart button + floating "View cart" FAB

   Hooks:
     1. window.STORE.addToCart — grid / recommendation quick-adds
     2. window.addToCartWithTier — product-detail "Add to Cart" /
        "Buy Now" (falls back to inline onclick parsing if not found)
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';
  if (window.__OZYFLY) return; // idempotent
  window.__OZYFLY = true;

  const CSS = `
/* ── flying thumbnail ─────────────────────────────────────── */
.fly-ghost {
  position: fixed; z-index: 9999; pointer-events: none;
  width: 54px; height: 54px; border-radius: 14px;
  background-size: cover; background-position: center;
  background-color: var(--paper, #FBF3E8);
  box-shadow: 0 12px 28px -8px rgba(192, 57, 74, .38);
  border: 2px solid var(--indigo-hi, #D7535D);
  will-change: transform, left, top, opacity;
  display: flex; align-items: center; justify-content: center;
}
.fly-ghost::after {
  content: ''; position: absolute; inset: -5px; border-radius: 17px;
  background: radial-gradient(circle, rgba(215,83,93,.30), transparent 70%);
}
.fly-ghost.takeoff::after { animation: ofc-glow .55s ease-out .05s both; }
@keyframes ofc-glow {
  0%   { transform: scale(.6); opacity: 1; }
  100% { transform: scale(2.2); opacity: 0; }
}

/* ── landing ring on the cart target ─────────────────────── */
.fly-target-ring {
  position: absolute; top: 50%; left: 50%;
  width: 46px; height: 46px; margin: -23px 0 0 -23px;
  border-radius: 50%; pointer-events: none;
  border: 2px solid var(--indigo-hi, #D7535D);
  animation: ofc-ring .55s ease-out both;
}
@keyframes ofc-ring {
  0%   { transform: scale(.3); opacity: 1; }
  100% { transform: scale(2.1); opacity: 0; }
}

/* ── badge bump on landing (reuses the site spring) ──────── */
.fly-landed { animation: fz-bump .42s var(--fizz); }

/* ── ✓ Added button state ────────────────────────────────── */
.ofc-added {
  background: #4c6b5e !important;
  box-shadow: 0 4px 12px rgba(76, 107, 94, .32) !important;
}

/* ── floating "View cart" FAB (mobile, reel-style) ──────── */
.ofc-fab {
  position: fixed; z-index: 9000;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
  left: 50%;
  transform: translateX(-50%) translateY(130%) scale(.85);
  display: flex; align-items: center; gap: 9px;
  padding: 12px 20px 12px 16px;
  border: none; border-radius: 999px;
  background: var(--indigo, #C0394A);
  color: #fff; font-family: var(--font-ui, system-ui);
  font-size: .9rem; font-weight: 800;
  box-shadow: 0 14px 34px -8px rgba(192, 57, 74, .55);
  opacity: 0; cursor: pointer; line-height: 1;
  transition: transform .45s var(--fizz), opacity .4s var(--fizz);
}
.ofc-fab.visible { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
.ofc-fab:active { transform: translateX(-50%) scale(.96); }
.ofc-fab .ofc-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 24px; height: 24px; padding: 0 7px;
  border-radius: 999px;
  background: #fff; color: var(--indigo, #C0394A);
  font-size: .8rem; font-weight: 900;
}
.ofc-fab.pop { animation: ofc-pop .42s var(--fizz); }
@keyframes ofc-pop {
  0%   { transform: translateX(-50%) scale(1); }
  45%  { transform: translateX(-50%) scale(1.15); }
  100% { transform: translateX(-50%) scale(1); }
}
@media (min-width: 768px) { .ofc-fab { display: none !important; } }
`;

  const style = document.createElement('style');
  style.id = 'ozylix-fly-cart-styles';
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ── geometry ──────────────────────────────────────────────── */
  function findCartTarget() {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    const desktop = document.querySelector('.navbar .nav-icon-btn[title="Cart"]');
    const mobileBtn = document.querySelector('.app-topbar-btn[title="Cart"]');
    let target = null;
    if (isDesktop && desktop && desktop.getBoundingClientRect().width > 0) target = desktop;
    if (!target && mobileBtn && mobileBtn.getBoundingClientRect().width > 0) target = mobileBtn;
    if (!target && desktop) target = desktop;
    return target;
  }

  function fly(opts) {
    const srcEl = opts.srcEl;
    const target = findCartTarget();
    if (!target) { if (opts.done) opts.done(); return; }

    const ghost = document.createElement('div');
    ghost.className = 'fly-ghost';
    const img = srcEl && srcEl.tagName === 'IMG' ? srcEl
            : (srcEl ? srcEl.querySelector('img') : null);
    if (img && (img.currentSrc || img.src)) {
      ghost.style.backgroundImage = `url("${img.currentSrc || img.src}")`;
    } else {
      ghost.textContent = '🛒';
      ghost.style.fontSize = '1.6rem';
    }

    const srcRect = srcEl ? srcEl.getBoundingClientRect() : { left: 0, top: 0, width: 54, height: 54 };
    const tarRect = target.getBoundingClientRect();
    ghost.style.left = (srcRect.left + srcRect.width / 2 - 27) + 'px';
    ghost.style.top = (srcRect.top + srcRect.height / 2 - 27) + 'px';
    ghost.style.transform = 'scale(.9)';
    document.body.appendChild(ghost);
    requestAnimationFrame(() => ghost.classList.add('takeoff'));

    const startX = srcRect.left + srcRect.width / 2;
    const startY = srcRect.top + srcRect.height / 2;
    const endX = tarRect.left + tarRect.width / 2;
    const endY = tarRect.top + tarRect.height / 2;
    const dx = endX - startX;
    const cpX = (startX + endX) / 2 - dx * 0.18;
    const cpY = Math.min(startY, endY) - Math.hypot(dx, endY - startY) * 0.34;
    const duration = 640;

    requestAnimationFrame((t0) => {
      function frame(t) {
        const p = Math.min((t - t0) / duration, 1);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const x = (1 - e) * (1 - e) * startX + 2 * (1 - e) * e * cpX + e * e * endX;
        const y = (1 - e) * (1 - e) * startY + 2 * (1 - e) * e * cpY + e * e * endY;
        const scale = 0.9 + 0.35 * (1 - e);
        ghost.style.left = (x - 27) + 'px';
        ghost.style.top = (y - 27) + 'px';
        ghost.style.transform = `scale(${scale}) rotate(${e * 16}deg)`;
        if (p < 1) { requestAnimationFrame(frame); } else { land(); }
      }
      requestAnimationFrame(frame);
    });

    function land() {
      const ring = document.createElement('span');
      ring.className = 'fly-target-ring';
      ring.setAttribute('aria-hidden', 'true');
      target.appendChild(ring);
      setTimeout(() => ring.remove(), 600);

      target.classList.add('fly-landed');
      setTimeout(() => target.classList.remove('fly-landed'), 500);

      ghost.style.transition = 'transform .14s ease, opacity .14s ease';
      ghost.style.transform = 'scale(.4)';
      ghost.style.opacity = '0';
      setTimeout(() => ghost.remove(), 150);

      const fab = document.getElementById('ofcFab');
      if (fab) {
        fab.classList.remove('pop');
        void fab.offsetWidth;
        fab.classList.add('pop');
      }
      if (opts.done) opts.done();
    }
  }

  /* ── button flip ───────────────────────────────────────────── */
  function markAdded(btn, label) {
    if (!btn || btn.dataset.ofcFlipped) return;
    btn.dataset.ofcFlipped = '1';
    const orig = label || btn.textContent.trim();
    btn.textContent = '✓ Added';
    btn.classList.add('ofc-added');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('ofc-added');
      delete btn.dataset.ofcFlipped;
    }, 1600);
  }

  /* ── global resolver ───────────────────────────────────────────
     The storefront's inline scripts run inside IIFEs, and for reasons
     specific to this page the names STORE / addToCartWithTier are not
     reachable as window properties from a normal script — but they ARE
     visible in the true global scope (onclick handlers on the site use
     them fine). Indirect eval (0, eval)('...') runs in that global
     scope, so we read them through it. */
  function resolve(name) {
    try { return (0, eval)("typeof " + name + " !== 'undefined' ? " + name + " : null"); } catch (e) { return null; }
  }

  /* ── FAB ───────────────────────────────────────────────────── */
  function ensureFab() {
    if (document.getElementById('ofcFab') || window.matchMedia('(min-width: 768px)').matches) return;
    const fab = document.createElement('button');
    fab.id = 'ofcFab';
    fab.className = 'ofc-fab';
    fab.setAttribute('aria-hidden', 'true');
    fab.innerHTML = '<span class="ofc-count" id="ofcCount">0</span><span>View cart</span>';
    fab.addEventListener('click', () => {
      if (typeof window.openSideCart === 'function') window.openSideCart();
    });
    document.body.appendChild(fab);
  }

  function syncFab() {
    const fab = document.getElementById('ofcFab');
    if (!fab) return;
    const store = resolve('STORE');
    const count = store && Array.isArray(store.cart) ? store.cart.reduce((s, i) => s + (i.qty || 1), 0) : 0;
    const el = fab.querySelector('#ofcCount');
    if (el) el.textContent = count;
    if (count > 0) fab.classList.add('visible');
    else fab.classList.remove('visible');
  }

  /* ── find the product image for a clicked button ───────────── */
  function sourceFor(btn) {
    if (!btn) return null;
    const card = btn.closest('.product-card');
    if (card) { const im = card.querySelector('img'); if (im) return im; }
    const row = btn.closest('.cart-row, .sc-item, .ck-item-row, .vita-rec-card, .vm-rec-card, .sc-reco-item');
    if (row) { const im = row.querySelector('img'); if (im) return im; }
    return btn;
  }

  /* ── hook window.STORE.addToCart ───────────────────────────── */
  function hookStore() {
    const store = resolve('STORE');
    if (!store || typeof store.addToCart !== 'function' || window.__ofcStoreHooked) return false;
    window.__ofcStoreHooked = true;
    const real = store.addToCart.bind(store);
    store.addToCart = function (id, qty) {
      const btn = (window.event && window.event.target) ? window.event.target.closest('button') : null;
      real(id, qty);
      fly({ srcEl: sourceFor(btn), done: () => { markAdded(btn); syncFab(); } });
      setTimeout(syncFab, 800);
    };
    return true;
  }

  /* ── hook addToCartWithTier (product detail page) ──────────── */
  function hookTier() {
    if (!window.addToCartWithTier || window.__ofcTierHooked) return false;
    window.__ofcTierHooked = true;
    const real = window.addToCartWithTier;
    window.addToCartWithTier = function (id) {
      const btn = (window.event && window.event.target) ? window.event.target.closest('button') : null;
      const card = btn && (btn.closest('#productDetail') || btn.closest('.sc-reco-item') || btn.closest('.product-card'));
      const p = window.PRODUCTS ? window.PRODUCTS.find(p => p.id === id) : null;
      const img = card ? (card.querySelector('img') || (p && document.querySelector(`img[src*="${p.image || ''}"]`))) : null;
      real(id);
      fly({ srcEl: img || sourceFor(btn) || btn, done: () => { markAdded(btn, '🛒 Add to Cart'); syncFab(); } });
      setTimeout(syncFab, 800);
    };
  }

  /* ── hook inline onclick strings (checkout recomm., upsells…) ── */
  function hookInlineAdds() {
    if (window.__ofcInlineHooked) return;
    window.__ofcInlineHooked = true;
    const selectors = '.vm-rec-add, .vita-rec-add, .upsell-add, .sc-reco-add, .ck-reco-add-btn, .bundle-add-btn';
    document.addEventListener('click', (e) => {
      const btn = e.target.closest(selectors);
      if (!btn) return;
      setTimeout(() => {
        fly({ srcEl: sourceFor(btn), done: () => { markAdded(btn); syncFab(); } });
        syncFab();
      }, 60);
    }, true);
    return true;
  }

  /* ── hook bundle builder (addBundleToCart) ──────────────────
     The bundle builder adds every selected product in one go, so we
     fly one composite thumbnail from the bundle bar and flip the
     bundle button rather than animating each product separately. */
  function hookBundleBuilder() {
    if (window.__ofcBundleHooked) return false;
    window.__ofcBundleHooked = true;
    const real = resolve('addBundleToCart');
    if (!real) return false;
    (0, eval)("window.__ofcRealAddBundleToCart = addBundleToCart");
    window.__ofcAddBundleToCart = function () {
      const btn = (window.event && window.event.target) ? window.event.target.closest('button') : null;
      const bar = btn && (btn.closest('#bundleSection') || btn.closest('[id*=bundle]'));
      const imgs = bar ? [...bar.querySelectorAll('img')].filter(im => im.currentSrc || im.src) : [];
      real();
      if (imgs.length) {
        const ghost = document.createElement('div');
        ghost.className = 'fly-ghost';
        ghost.style.backgroundImage = `url("${imgs[0].currentSrc || imgs[0].src}")`;
        const srcRect = (btn || imgs[0]).getBoundingClientRect();
        ghost.style.left = (srcRect.left + srcRect.width / 2 - 27) + 'px';
        ghost.style.top = (srcRect.top + srcRect.height / 2 - 27) + 'px';
        const badge = document.createElement('span');
        badge.style.cssText = 'position:absolute;top:-8px;right:-8px;background:var(--indigo,#C0394A);color:#fff;font-size:.68rem;font-weight:900;min-width:20px;height:20px;border-radius:999px;display:flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 2px 8px rgba(0,0,0,.25)';
        badge.textContent = imgs.length;
        ghost.appendChild(badge);
        document.body.appendChild(ghost);
        const target = findCartTarget();
        if (target) {
          const srcX = srcRect.left + srcRect.width / 2;
          const srcY = srcRect.top + srcRect.height / 2;
          const tarRect = target.getBoundingClientRect();
          const endX = tarRect.left + tarRect.width / 2;
          const endY = tarRect.top + tarRect.height / 2;
          const dx = endX - srcX;
          const cpX = (srcX + endX) / 2 - dx * 0.18;
          const cpY = Math.min(srcY, endY) - Math.hypot(dx, endY - srcY) * 0.34;
          const duration = 640;
          requestAnimationFrame((t0) => {
            function frame(t) {
              const p = Math.min((t - t0) / duration, 1);
              const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
              const x = (1 - e) * (1 - e) * srcX + 2 * (1 - e) * e * cpX + e * e * endX;
              const y = (1 - e) * (1 - e) * srcY + 2 * (1 - e) * e * cpY + e * e * endY;
              ghost.style.left = (x - 27) + 'px';
              ghost.style.top = (y - 27) + 'px';
              ghost.style.transform = `scale(${0.9 + 0.35 * (1 - e)}) rotate(${e * 16}deg)`;
              if (p < 1) requestAnimationFrame(frame);
              else {
                const ring = document.createElement('span');
                ring.className = 'fly-target-ring';
                ring.setAttribute('aria-hidden', 'true');
                target.appendChild(ring);
                setTimeout(() => ring.remove(), 600);
                target.classList.add('fly-landed');
                setTimeout(() => target.classList.remove('fly-landed'), 500);
                ghost.style.transition = 'transform .14s ease, opacity .14s ease';
                ghost.style.transform = 'scale(.4)'; ghost.style.opacity = '0';
                setTimeout(() => ghost.remove(), 150);
              }
            }
            requestAnimationFrame(frame);
          });
        } else ghost.remove();
      }
      if (btn) markAdded(btn, 'Added to cart');
      setTimeout(syncFab, 800);
    };
    (0, eval)("addBundleToCart = window.__ofcAddBundleToCart");
    return true;
  }

  /* ── hook sticky cart bar (scAddToCart) ──────────────────────
     The sticky bar's Add-to-cart button flies its product thumbnail
     up to the cart target (the bar itself is usually below the fold, so
     the arc reads clearly on both desktop and mobile). */
  function hookStickyCart() {
    if (window.__ofcStickyHooked) return false;
    const real = resolve('scAddToCart');
    if (!real) return false;
    window.__ofcStickyHooked = true;
    (0, eval)("window.__ofcRealScAddToCart = scAddToCart");
    window.__ofcScAddToCart = function () {
      const btn = (window.event && window.event.target) ? window.event.target.closest('button') : null;
      const bar = btn && (btn.closest('#stickyCart') || btn.closest('.sticky-cart'));
      const img = bar ? bar.querySelector('img') : null;
      real();
      fly({ srcEl: img || btn, done: () => { markAdded(btn); syncFab(); } });
      setTimeout(syncFab, 800);
    };
    (0, eval)("scAddToCart = window.__ofcScAddToCart");
    return true;
  }

  /* ── boot ──────────────────────────────────────────────────── */
  function boot() {
    ensureFab();
    hookStore();
    hookTier();
    hookInlineAdds();
    hookBundleBuilder();
    hookStickyCart();
    // The site's inline script blocks define STORE / addToCartWithTier at
    // parse time, but the page is enormous and a mid-block parse error
    // (pre-existing in the Meta Pixel block, unrelated to this file) can
    // defer or disrupt normal execution order on some loads. Keep retrying
    // until every hook is attached — stop at 30s to avoid an infinite timer.
    if (!window.__ofcTierBooted) {
      window.__ofcTierBooted = true;
      const started = Date.now();
      const iv = setInterval(() => {
        if (resolve('addToCartWithTier') && !window.__ofcTierHooked) hookTier();
        if (!window.__ofcStoreHooked) hookStore();
        if (window.__ofcTierHooked && window.__ofcStoreHooked) return clearInterval(iv);
        if (Date.now() - started > 30000) clearInterval(iv);
      }, 250);
      setTimeout(() => clearInterval(iv), 30000);
    }
    // FAB visibility sync on every cart-badge update
    const obs = new MutationObserver(syncFab);
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.cart-badge, .app-topbar-badge').forEach(b => {
        obs.observe(b, { subtree: true, childList: true, characterData: true });
      });
      syncFab();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
