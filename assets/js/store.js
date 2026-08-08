/* ═══════════════════════════════════════════════════════════════
   ASCOFIZZ · STORE
   Cart, wishlist and the shared formatting helpers.

   The public surface here is deliberately identical to the previous
   build — STORE.addToCart / removeFromCart / updateQty / getSubtotal /
   toggleWishlist / updateCartUI, plus fmt() esc() stars() showToast()
   getProductImg() — because checkout-gokwik.js and auth.js are carried
   over verbatim and call into exactly these names. The redesign is in
   how the results are drawn, not in what they are.

   localStorage keys are unchanged (asc_cart, asc_wish, asc_user,
   asc_jwt, asc_orders) so a returning customer keeps their basket.
   ═══════════════════════════════════════════════════════════════ */

/* ── Money, text, rating ────────────────────────────────────── */
function fmt(p) {
  return '₹' + Number(p || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stars(r) {
  const v = Number(r) || 0;
  const full = Math.floor(v);
  const half = v % 1 >= 0.5;
  return '<span class="stars">' + '★'.repeat(full) + (half ? '☆' : '') +
         '</span><span class="rating-n">' + v.toFixed(1) + '</span>';
}

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ── Product imagery ────────────────────────────────────────────
   A product with no photo gets a neutral plate — never another
   product's photograph. Showing the wrong bottle reads as a
   mix-up between SKUs, which is worse than showing nothing. */
const NO_IMAGE_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">' +
  '<rect width="240" height="240" fill="none"/>' +
  '<g fill="none" stroke="#B7C3BB" stroke-width="2.4" stroke-linecap="round">' +
  '<rect x="86" y="64" width="68" height="112" rx="16"/>' +
  '<path d="M104 64V50a8 8 0 0 1 8-8h16a8 8 0 0 1 8 8v14"/>' +
  '<path d="M100 120h40M100 142h28"/>' +
  '<circle cx="163" cy="72" r="7"/><circle cx="178" cy="52" r="4.5"/>' +
  '</g>' +
  '<text x="120" y="205" text-anchor="middle" font-family="system-ui,sans-serif" ' +
  'font-size="12" letter-spacing="1" fill="#9AA79F">PHOTO COMING SOON</text>' +
  '</svg>'
);

const PRODUCT_FALLBACKS = {
  effervescent: NO_IMAGE_PLACEHOLDER,
  spirulina:    NO_IMAGE_PLACEHOLDER,
  premium:      NO_IMAGE_PLACEHOLDER,
  ayurvedic:    NO_IMAGE_PLACEHOLDER,
  immunity:     NO_IMAGE_PLACEHOLDER,
  default:      NO_IMAGE_PLACEHOLDER,
};

function getProductImg(p) {
  if (p && p.image && String(p.image).startsWith('http')) return p.image;
  return PRODUCT_FALLBACKS[p && p.category] || PRODUCT_FALLBACKS.default;
}

/* All gallery images a product actually has, in order. */
function productImages(p) {
  const out = [];
  ['image', 'image2', 'image3', 'image4', 'image5'].forEach(k => {
    if (p && p[k] && String(p[k]).startsWith('http')) out.push(p[k]);
  });
  return out.length ? out : [getProductImg(p)];
}

/* Effective unit price, honouring a sale price when one is set. */
function unitPrice(p) {
  if (!p) return 0;
  return Number(p.salePrice || p.price || 0);
}

/* ── Toast ──────────────────────────────────────────────────── */
const TOAST_ICON = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
  '':      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>',
};

function showToast(msg, type = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.setAttribute('role', 'status');
  t.innerHTML = (TOAST_ICON[type] || TOAST_ICON['']) + '<span>' + esc(msg) + '</span>';
  wrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 3200);
}

/* ── Cart & wishlist ────────────────────────────────────────── */
const STORE = {
  cart: [],
  wishlist: [],

  init() {
    try { this.cart = JSON.parse(localStorage.getItem('asc_cart') || '[]'); } catch (e) { this.cart = []; }
    try { this.wishlist = JSON.parse(localStorage.getItem('asc_wish') || '[]'); } catch (e) { this.wishlist = []; }
    if (!Array.isArray(this.cart)) this.cart = [];
    if (!Array.isArray(this.wishlist)) this.wishlist = [];
    this.updateCartUI();
  },

  save() {
    try {
      localStorage.setItem('asc_cart', JSON.stringify(this.cart));
      localStorage.setItem('asc_wish', JSON.stringify(this.wishlist));
    } catch (e) { /* private mode — cart stays in memory for this session */ }
    this.updateCartUI();
    if (typeof renderCartViews === 'function') renderCartViews();
  },

  addToCart(id, qty = 1) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    const ex = this.cart.find(i => i.id === id && i.tierIdx === undefined);
    if (ex) ex.qty += qty; else this.cart.push({ id, qty });
    this.save();
    if (window._trackAddToCart) window._trackAddToCart(p, qty);
    showToast(p.name + ' added to bag', 'success');
    if (typeof openCartDrawer === 'function') openCartDrawer();
  },

  removeFromCart(id, tierIdx) {
    this.cart = this.cart.filter(i => !(i.id === id && i.tierIdx === tierIdx));
    this.save();
  },

  updateQty(id, qty, tierIdx) {
    const item = this.cart.find(i => i.id === id && i.tierIdx === tierIdx);
    if (!item) return;
    if (qty <= 0) { this.removeFromCart(id, tierIdx); return; }
    item.qty = qty;
    this.save();
  },

  /* A line is either a plain unit (price × qty) or a tier bundle,
     where tierRate is already the total for the whole bundle. */
  lineTotal(i) {
    if (i.tierRate) return Number(i.tierRate) * i.qty;
    const p = PRODUCTS.find(x => x.id === i.id);
    return p ? unitPrice(p) * i.qty : 0;
  },

  lineMRP(i) {
    if (i.tierMRP) return Number(i.tierMRP) * i.qty;
    const p = PRODUCTS.find(x => x.id === i.id);
    if (!p) return 0;
    return Number(p.price || 0) * i.qty;
  },

  getSubtotal() {
    return this.cart.reduce((s, i) => s + this.lineTotal(i), 0);
  },

  getSavings() {
    return Math.max(0, this.cart.reduce((s, i) => s + (this.lineMRP(i) - this.lineTotal(i)), 0));
  },

  count() {
    return this.cart.reduce((s, i) => s + i.qty, 0);
  },

  applyCode() { return null; },   // every code is validated server-side

  updateCartUI() {
    const n = this.count();
    document.querySelectorAll('.cart-badge').forEach(el => {
      const had = el.textContent;
      el.textContent = n;
      el.style.display = n > 0 ? 'flex' : 'none';
      if (had !== String(n) && n > 0) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    });
    document.querySelectorAll('.wish-badge').forEach(el => {
      el.textContent = this.wishlist.length;
      el.style.display = this.wishlist.length > 0 ? 'flex' : 'none';
    });
  },

  toggleWishlist(id) {
    const idx = this.wishlist.indexOf(id);
    if (idx > -1) {
      this.wishlist.splice(idx, 1);
      showToast('Removed from wishlist');
    } else {
      this.wishlist.push(id);
      showToast('Saved to wishlist', 'success');
    }
    this.save();
    document.querySelectorAll('[data-fav="' + id + '"]').forEach(b => {
      b.classList.toggle('ibtn--on', this.wishlist.indexOf(id) > -1);
    });
    if (typeof renderWishlist === 'function') renderWishlist();
  },
};

/* Online orders ship free — the figure the customer sees in the cart must
   match what checkout charges, so this is the single source for both.
   COD adds its own ₹60 below ₹599; that lives in the COD flow. */
function shippingFor(subtotal) {
  return 0;
}

/* getOrderTotal() and generateOrderId() are NOT defined here — they live in
   pricing.js, preserved verbatim, because getOrderTotal() returns
   { sub, disc } and the payment layer destructures that shape. */
