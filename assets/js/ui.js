/* ═══════════════════════════════════════════════════════════════
   ASCOFIZZ · UI
   Routing, view rendering and the interaction layer.

   Everything below is new for this design. It talks to the preserved
   modules through the same names they always used, so the data,
   payment and auth layers did not have to change to get a new face.
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────  APP STATE  ───────────────────────── */
let currentPage    = 'home';
let currentProduct = null;
let currentCat     = 'all';
let currentSort    = 'featured';
let currentQuery   = '';
let priceMax       = 2500;
let pQty           = 1;
let appliedDiscount = null;
let activePromoCode = null;
let selectedRating  = 0;
const selectedTiers = {};
let galleryIdx = 0;

const CATEGORIES = [
  { id: 'all',          name: 'Everything',    ico: 'sparkle' },
  { id: 'effervescent', name: 'Effervescent',  ico: 'bubble'  },
  { id: 'premium',      name: 'Premium',       ico: 'crown'   },
  { id: 'spirulina',    name: 'Spirulina',     ico: 'wave'    },
  { id: 'ayurvedic',    name: 'Ayurvedic',     ico: 'leaf'    },
  { id: 'immunity',     name: 'Immunity',      ico: 'shield'  },
];

const GOALS = [
  { id: 'bestsellers', name: 'Bestsellers', ico: 'flame'  },
  { id: 'new',         name: 'New in',      ico: 'sparkle'},
  { id: 'skin',        name: 'Skin & Glow', ico: 'glow'   },
  { id: 'energy',      name: 'Energy',      ico: 'bolt'   },
  { id: 'immunity',    name: 'Immunity',    ico: 'shield' },
  { id: 'weight',      name: 'Weight',      ico: 'target' },
  { id: 'brain',       name: 'Focus',       ico: 'brain'  },
  { id: 'sale',        name: 'On offer',    ico: 'tag'    },
];

/* ─────────────────────────  ICONS  ─────────────────────────
   One stroke weight, one corner treatment, drawn on a 24 grid. */
const ICONS = {
  bag:     '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  heart:   '<path d="M12 20s-7-4.4-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.8C19 15.6 12 20 12 20Z"/>',
  user:    '<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  search:  '<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>',
  menu:    '<path d="M4 7h16M4 12h16M4 17h10"/>',
  close:   '<path d="m6 6 12 12M18 6 6 18"/>',
  chevD:   '<polyline points="6 9 12 15 18 9"/>',
  chevR:   '<polyline points="9 6 15 12 9 18"/>',
  chevL:   '<polyline points="15 6 9 12 15 18"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  minus:   '<path d="M5 12h14"/>',
  check:   '<polyline points="20 6 9 17 4 12"/>',
  home:    '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>',
  grid:    '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  leaf:    '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14Z"/><path d="M5 19c3-4 6-6 10-8"/>',
  bubble:  '<circle cx="12" cy="14" r="6"/><circle cx="17.5" cy="6.5" r="2.2"/><circle cx="9" cy="5" r="1.4"/>',
  crown:   '<path d="m4 17 1-9 4.5 4L12 6l2.5 6L19 8l1 9H4Z"/><path d="M4 20h16"/>',
  wave:    '<path d="M3 9c2.5-2.4 5-2.4 7.5 0S15.5 11.4 18 9M3 15c2.5-2.4 5-2.4 7.5 0s5-2.4 7.5 0"/>',
  shield:  '<path d="M12 3.5 19 6v6c0 4.4-3 7.5-7 8.5-4-1-7-4.1-7-8.5V6l7-2.5Z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
  sparkle: '<path d="M12 4.5 13.6 10 19 11.6 13.6 13.2 12 18.6 10.4 13.2 5 11.6 10.4 10 12 4.5Z"/>',
  flame:   '<path d="M12 3.5c3.5 3.5 5.5 6 5.5 9a5.5 5.5 0 0 1-11 0c0-1.6.7-3 2-4.4.4 1.4 1.2 2.2 2.2 2.4-.6-2.6-.2-4.8 1.3-7Z"/>',
  bolt:    '<path d="M13.5 3 6 13.5h5L10.5 21 18 10.5h-5L13.5 3Z"/>',
  glow:    '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  target:  '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.4"/>',
  brain:   '<path d="M9.5 5.5a2.8 2.8 0 0 0-2.8 2.8 2.6 2.6 0 0 0-1.2 4.6A2.8 2.8 0 0 0 8 17.6a2.6 2.6 0 0 0 4 .9V5.9a2.6 2.6 0 0 0-2.5-.4Z"/><path d="M14.5 5.5a2.8 2.8 0 0 1 2.8 2.8 2.6 2.6 0 0 1 1.2 4.6 2.8 2.8 0 0 1-2.5 4.7 2.6 2.6 0 0 1-4 .9"/>',
  tag:     '<path d="M4 12.5V5h7.5L20 13.5 12.5 21 4 12.5Z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
  truck:   '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  lab:     '<path d="M10 3v6L4.8 18A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3L14 9V3"/><path d="M9 3h6M8 14h8"/>',
  award:   '<circle cx="12" cy="9" r="5.2"/><path d="m8.5 13.6-1 7L12 18l4.5 2.6-1-7"/>',
  lock:    '<rect x="5" y="10.5" width="14" height="9.5" rx="2.4"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M20 19v-4h-4"/>',
  pkg:     '<path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z"/><path d="M4 7.2 12 11l8-3.8M12 11v10"/>',
  phone:   '<path d="M6.5 3.5h4l1.6 4-2.2 1.6a12 12 0 0 0 5 5L16.5 12l4 1.6v4a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
  mail:    '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.5 7.5 8.5 6 8.5-6"/>',
  pin:     '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  chat:    '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5Z"/>',
  eye:     '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff:  '<path d="M4 4l16 16"/><path d="M9.6 5.4A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.3 4.1M6.3 7.9A17 17 0 0 0 2.5 12S6 19 12 19c1 0 1.9-.2 2.8-.5"/>',
  trash:   '<path d="M5 7h14M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M7 7v12a1.6 1.6 0 0 0 1.6 1.6h6.8A1.6 1.6 0 0 0 17 19V7"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowR:  '<path d="M5 12h13M13 6l6 6-6 6"/>',
  star:    '<path d="m12 4 2.3 5 5.5.6-4.1 3.7 1.2 5.4L12 15.9 7.1 18.7l1.2-5.4L4.2 9.6 9.7 9 12 4Z"/>',
  filter:  '<path d="M4 6h16M7 12h10M10 18h4"/>',
  wa:      '<path d="M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.5 20.5l4.4-1.2A8.4 8.4 0 1 0 12 3.5Z"/><path d="M9 9.2c.3-.7.6-.7.9-.7h.6c.2 0 .5 0 .7.5l.7 1.7c.1.3 0 .5-.1.7l-.4.5c-.2.2-.3.4-.1.7a6 6 0 0 0 2.8 2.4c.3.1.5.1.7-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5a2 2 0 0 1-1.4 1.7 3 3 0 0 1-2.3-.2 10 10 0 0 1-5-4.6 3.6 3.6 0 0 1-.3-2.5Z"/>',
  insta:   '<rect x="4" y="4" width="16" height="16" rx="4.6"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r="1"/>',
  fb:      '<path d="M14.5 8.5H17V5.2h-2.7c-2.3 0-3.8 1.6-3.8 3.9v1.6H8v3.3h2.5V21h3.4v-7h2.6l.4-3.3h-3V9.4c0-.6.3-.9 1.1-.9Z"/>',
  yt:      '<rect x="3" y="6" width="18" height="12" rx="3.6"/><path d="m11 9.8 4 2.2-4 2.2V9.8Z"/>',
};

function ico(name, size = 20, cls = '') {
  const d = ICONS[name] || '';
  return '<svg class="' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
}
/* Fillable variant. Drawn with fill="currentColor" so a container can turn
   it solid (.ibtn--on, .star-btn.on) while it stays an outline by default —
   one markup path for both states. */
function icoF(name, size = 20) {
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" ' +
         'stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

/* ─────────────────────────  ROUTING  ───────────────────────── */
const PAGE_TITLES = {
  home: 'Ascofizz — Effervescent nutrition, made properly',
  shop: 'Shop all supplements · Ascofizz',
  product: 'Ascofizz',
  cart: 'Your bag · Ascofizz',
  checkout: 'Checkout · Ascofizz',
  thankyou: 'Order confirmed · Ascofizz',
  blog: 'Journal · Ascofizz',
  about: 'About Ascofizz',
  contact: 'Contact · Ascofizz',
  faq: 'Help & FAQ · Ascofizz',
  account: 'Your account · Ascofizz',
  wishlist: 'Wishlist · Ascofizz',
  b2b: 'Manufacturing & private label · Ascofizz',
};

function showPage(pg, opts) {
  opts = opts || {};
  const target = document.getElementById('page-' + pg);
  if (!target) return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  target.classList.add('active');
  currentPage = pg;

  document.querySelectorAll('[data-page]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-page') === pg);
  });

  document.title = PAGE_TITLES[pg] || 'Ascofizz';
  closeMobileNav();
  closeCartDrawer();

  if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  if (!opts.silent) {
    const path = pg === 'home' ? '/' : '/#' + pg;
    try { history.replaceState(null, '', path); } catch (e) {}
  }

  if (window._trackPage) window._trackPage(pg);

  /* Per-page hydration */
  if (pg === 'shop')     applyFilters();
  if (pg === 'cart')     renderCart();
  if (pg === 'checkout') renderCheckoutSummary();
  if (pg === 'account')  loadAccountPage();
  if (pg === 'wishlist') renderWishlist();
  if (pg === 'blog')     renderBlog();
  if (pg === 'faq')      renderFaq();

  revealNow();
}

function showShop(cat) {
  currentCat = cat || 'all';
  currentQuery = '';
  const s = document.getElementById('shopSearch');
  if (s) s.value = '';
  showPage('shop');
  syncFilterUI();
  applyFilters();
}

function openProduct(id) {
  const p = PRODUCTS.find(x => x.id === Number(id));
  if (!p) return;
  currentProduct = p;
  pQty = 1;
  galleryIdx = 0;
  buildProductPage(p);
  showPage('product');
  try { history.replaceState(null, '', '/#product/' + slugify(p.name)); } catch (e) {}
  if (window._trackViewItem) window._trackViewItem(p);
  if (typeof loadProductReviews === 'function') loadProductReviews(p.id);
}

/* Deep links: /#shop, /#product/<slug>, /?gk_order=… */
function routeFromLocation() {
  const hash = (location.hash || '').replace(/^#/, '');
  if (hash.startsWith('product/')) {
    const slug = hash.split('/')[1];
    const p = PRODUCTS.find(x => slugify(x.name) === slug);
    if (p) { openProduct(p.id); return; }
  }
  const clean = hash.split('/')[0];
  if (clean && document.getElementById('page-' + clean)) { showPage(clean, { silent: true }); return; }

  const path = location.pathname.replace(/^\/+|\/+$/g, '');
  if (path && document.getElementById('page-' + path)) { showPage(path, { silent: true }); return; }

  showPage('home', { silent: true });
}

/* ─────────────────────────  PRODUCT CARD  ───────────────────────── */
function renderProductCard(p) {
  const img   = getProductImg(p);
  const now   = unitPrice(p);
  const mrp   = Number(p.price || 0);
  const onSale = p.salePrice && mrp > now;
  const off   = onSale ? Math.round((1 - now / mrp) * 100) : 0;
  const faved = STORE.wishlist.indexOf(p.id) > -1;
  const oos   = p.stock === 0 && p.trackStock;

  const tags = [];
  if (p.badge) tags.push('<span class="chip chip--fizz">' + esc(p.badge) + '</span>');
  if (onSale)  tags.push('<span class="chip chip--berry">−' + off + '%</span>');

  return `
  <article class="pcard" data-product-id="${p.id}" data-reveal>
    <div class="pcard-plate" onclick="openProduct(${p.id})">
      ${tags.length ? '<div class="pcard-tags">' + tags.join('') + '</div>' : ''}
      <img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy"
           onerror="this.onerror=null;this.src='${NO_IMAGE_PLACEHOLDER}'">
      ${oos ? '<div class="pcard-oos">Out of stock</div>' : ''}
    </div>
    <button class="ibtn ibtn--sm ibtn--face pcard-fav ${faved ? 'ibtn--on' : ''}"
            data-fav="${p.id}" aria-label="Save ${esc(p.name)} to wishlist"
            onclick="event.stopPropagation();STORE.toggleWishlist(${p.id})">
      ${icoF('heart', 15)}
    </button>
    <div class="pcard-body" onclick="openProduct(${p.id})">
      <div class="pcard-brand">${esc(p.brand || 'Ascofizz')}</div>
      <h3 class="pcard-name">${esc(p.name)}</h3>
      <div class="pcard-rating">${stars(p.rating || 4.5)}<span class="dim">(${p.reviews || 0})</span></div>
      <div class="pcard-foot">
        <div class="price">
          <span class="price-now">${fmt(now)}</span>
          ${onSale ? `<span class="price-was">${fmt(mrp)}</span>` : ''}
        </div>
        <button class="pcard-add" aria-label="Add ${esc(p.name)} to bag"
                onclick="event.stopPropagation();STORE.addToCart(${p.id})">${ico('plus', 18)}</button>
      </div>
    </div>
  </article>`;
}

function skeletonCards(n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += '<div class="pcard-skel surface"><div class="skeleton s-plate"></div>' +
           '<div class="skeleton s-line" style="width:40%"></div>' +
           '<div class="skeleton s-line" style="width:80%"></div>' +
           '<div class="skeleton s-line" style="width:55%;margin-bottom:20px"></div></div>';
  }
  return out;
}

/* ─────────────────────────  SHOP  ───────────────────────── */
function visibleProducts() {
  return PRODUCTS.filter(p => !p._hidden && p.active !== false);
}

/* Goal tags map onto the tag list each product already carries. */
function matchesGoal(p, goal) {
  if (goal === 'bestsellers') return p.tags.includes('bestseller');
  if (goal === 'sale')        return !!p.salePrice;
  return p.tags.includes(goal);
}

function applyFilters() {
  let list = visibleProducts();

  if (currentCat !== 'all') {
    const isCat = CATEGORIES.some(c => c.id === currentCat);
    list = isCat ? list.filter(p => p.category === currentCat)
                 : list.filter(p => matchesGoal(p, currentCat));
  }

  if (currentQuery) {
    const q = currentQuery.toLowerCase();
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.tags || []).join(' ').toLowerCase().includes(q));
  }

  list = list.filter(p => unitPrice(p) <= priceMax);

  if (currentSort === 'low')       list.sort((a, b) => unitPrice(a) - unitPrice(b));
  else if (currentSort === 'high') list.sort((a, b) => unitPrice(b) - unitPrice(a));
  else if (currentSort === 'rated')list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else                             list.sort(byPosition);

  const grid = document.getElementById('shopGrid');
  if (grid) {
    grid.innerHTML = list.length
      ? list.map(renderProductCard).join('')
      : `<div class="empty" style="grid-column:1/-1">
           <div class="empty-ico">${ico('search', 32)}</div>
           <h4 style="margin-bottom:8px">Nothing matches that yet</h4>
           <p class="muted small" style="margin-bottom:20px">Try a wider price range or clear the filters.</p>
           <button class="btn btn--quiet" onclick="clearFilters()">Clear filters</button>
         </div>`;
  }

  const c = document.getElementById('shopCount');
  if (c) c.textContent = list.length + (list.length === 1 ? ' product' : ' products');
  revealNow();
}

function filterCat(cat) {
  currentCat = cat;
  syncFilterUI();
  applyFilters();
}

function setSort(v) { currentSort = v; applyFilters(); }

function updatePrice(v) {
  priceMax = Number(v);
  const l = document.getElementById('priceLabel');
  if (l) l.textContent = 'Up to ' + fmt(priceMax);
  applyFilters();
}

function searchShop(v) { currentQuery = v; applyFilters(); }

function clearFilters() {
  currentCat = 'all'; currentQuery = ''; priceMax = 2500; currentSort = 'featured';
  const s = document.getElementById('shopSearch'); if (s) s.value = '';
  const r = document.getElementById('priceRange'); if (r) r.value = 2500;
  const so = document.getElementById('sortSelect'); if (so) so.value = 'featured';
  updatePrice(2500);
  syncFilterUI();
}

function syncFilterUI() {
  document.querySelectorAll('[data-cat]').forEach(b => {
    b.classList.toggle('on', b.getAttribute('data-cat') === currentCat);
  });
}

function toggleFilters() {
  document.getElementById('shopFilters')?.classList.toggle('open');
  document.getElementById('filterScrim')?.classList.toggle('open');
}

/* ─────────────────────────  HOME  ───────────────────────── */
function initHome() {
  const cats = document.getElementById('catGrid');
  if (cats) {
    cats.innerHTML = CATEGORIES.filter(c => c.id !== 'all').map(c => {
      const n = visibleProducts().filter(p => p.category === c.id).length;
      return `<button class="cat" onclick="showShop('${c.id}')" data-reveal>
        <span class="cat-ico">${ico(c.ico, 26)}</span>
        <span class="cat-name">${c.name}</span>
        <span class="cat-n">${n} product${n === 1 ? '' : 's'}</span>
      </button>`;
    }).join('');
  }

  const goals = document.getElementById('goalRow');
  if (goals) {
    goals.innerHTML = GOALS.map(g =>
      `<button class="goal" onclick="showShop('${g.id}')">${ico(g.ico, 15)}<span>${g.name}</span></button>`).join('');
  }

  renderFeatured();
  renderNewArrivals();
  hydrateHeroStage();
}

/* The hero stage shows the highest-positioned featured product that has
   a real photograph; falls back to the plate if none do yet. */
function hydrateHeroStage() {
  const stage = document.getElementById('heroStage');
  if (!stage) return;
  const withPhoto = visibleProducts()
    .filter(p => p.tags.includes('featured'))
    .sort(byPosition)
    .find(p => p.image && String(p.image).startsWith('http'));
  const p = withPhoto || visibleProducts().sort(byPosition)[0];
  if (!p) return;
  stage.innerHTML =
    '<span class="stage-well"></span>' +
    '<img src="' + esc(getProductImg(p)) + '" alt="' + esc(p.name) + '" ' +
    'onerror="this.onerror=null;this.src=\'' + NO_IMAGE_PLACEHOLDER + '\'">' +
    '<span class="stage-tag stage-tag--a">' + ico('lab', 15) + 'FSSAI approved</span>' +
    '<span class="stage-tag stage-tag--b">' + ico('bubble', 15) + 'Dissolves in 60s</span>' +
    '<span class="stage-tag stage-tag--c">' + ico('leaf', 15) + '100% vegetarian</span>';
  stage.onclick = () => openProduct(p.id);
  stage.style.cursor = 'pointer';
}

/* ─────────────────────────  PRODUCT DETAIL  ───────────────────────── */
function buildProductPage(p) {
  const el = document.getElementById('pdpBody');
  if (!el || !p) return;

  const imgs = productImages(p);
  const tiers = p._backendTiers || QTY_TIERS[p.id];
  const hasTiers = Array.isArray(tiers) && tiers.length > 0 && tiers[0].rate != null;
  const now = unitPrice(p);
  const mrp = Number(p.price || 0);
  const onSale = p.salePrice && mrp > now;
  const faved = STORE.wishlist.indexOf(p.id) > -1;

  el.innerHTML = `
  <div class="crumbs">
    <a onclick="showPage('home')">Home</a>${ico('chevR', 12)}
    <a onclick="showShop('${esc(p.category)}')">${esc(p.category)}</a>${ico('chevR', 12)}
    <span>${esc(p.name)}</span>
  </div>

  <div class="pdp">
    <div class="gallery">
      <div class="gallery-main" id="galleryMain">
        <img src="${esc(imgs[0])}" alt="${esc(p.name)}" id="galleryImg"
             onerror="this.onerror=null;this.src='${NO_IMAGE_PLACEHOLDER}'">
      </div>
      ${imgs.length > 1 ? `<div class="gallery-thumbs">${imgs.map((u, i) =>
        `<button class="gthumb ${i === 0 ? 'on' : ''}" onclick="galleryGoto(${i})">
           <img src="${esc(u)}" alt="View ${i + 1}" onerror="this.onerror=null;this.src='${NO_IMAGE_PLACEHOLDER}'"></button>`).join('')}</div>` : ''}
    </div>

    <div>
      <div class="pdp-brand">${esc(p.brand || 'Ascofizz')}</div>
      <h1>${esc(p.name)}</h1>

      <div class="pdp-meta">
        <span class="pcard-rating">${stars(p.rating || 4.5)}<span class="dim">· ${p.reviews || 0} reviews</span></span>
        ${p.stock === 0 && p.trackStock
          ? '<span class="chip chip--berry">Out of stock</span>'
          : '<span class="chip"><i class="dot dot--ok"></i>In stock</span>'}
      </div>

      <div class="pdp-price">
        <span class="price-now" id="dynSalePrice">${fmt(now)}</span>
        ${onSale ? `<span class="price-was" id="dynOrigPrice">${fmt(mrp)}</span>
                    <span class="chip chip--berry" id="dynDiscTag">Save ${Math.round((1 - now / mrp) * 100)}%</span>` : ''}
        <span class="small muted" style="width:100%" id="dynSaving">${esc(p.offer || 'Inclusive of all taxes')}</span>
      </div>

      ${hasTiers ? buildTierWidget(p) : ''}

      <div class="pdp-actions">
        <div class="stepper">
          <button onclick="setQty(-1)" aria-label="Decrease quantity">${ico('minus', 15)}</button>
          <span class="val" id="pQtyVal">1</span>
          <button onclick="setQty(1)" aria-label="Increase quantity">${ico('plus', 15)}</button>
        </div>
        <button class="btn btn--lg" id="addCartBtn" data-tier="0" style="flex:1;min-width:200px"
                onclick="addToCartWithTier(${p.id})">${ico('bag', 18)} Add to bag</button>
        <button class="ibtn ${faved ? 'ibtn--on' : ''}" data-fav="${p.id}"
                aria-label="Save to wishlist" onclick="STORE.toggleWishlist(${p.id})">${icoF('heart', 18)}</button>
      </div>

      <button class="btn btn--quiet btn--block" style="margin-bottom:28px"
              onclick="addToCartWithTier(${p.id});showPage('checkout')">Buy it now</button>

      <div class="trust" style="margin-bottom:28px">
        <span class="trust-item">${ico('truck', 19)}<span>Free shipping</span></span>
        <span class="trust-item">${ico('lab', 19)}<span>FSSAI approved</span></span>
        <span class="trust-item">${ico('refresh', 19)}<span>7-day returns</span></span>
      </div>

      <div class="acc" id="pdpAcc">
        ${accItem('About this product', `<p>${esc(p.description || '')}</p>`, true)}
        ${p.keyIngredients && p.keyIngredients.length
          ? accItem('Key ingredients', '<div class="ing-list">' +
              p.keyIngredients.map(i => '<div class="ing"><i></i><span>' + esc(i) + '</span></div>').join('') + '</div>')
          : ''}
        ${p.howToUse ? accItem('How to use', '<p>' + esc(p.howToUse) + '</p>') : ''}
        ${accItem('Shipping & returns',
          '<p>Dispatched within 24 hours on working days. Delivery across India in 3–5 business days via our logistics partner. ' +
          'Sealed, unused products can be returned within 7 days.</p>')}
      </div>

      <div id="pdpReviews" style="margin-top:28px"></div>
    </div>
  </div>`;

  document.querySelectorAll('#pdpAcc .acc-head').forEach(h => {
    h.onclick = () => h.closest('.acc-item').classList.toggle('open');
  });

  renderProductReviews(p);
  renderRelated(p);
}

/* Reviews are real or absent — nothing is seeded. Until a customer writes
   one, the block says so plainly rather than inventing social proof. */
function renderProductReviews(p) {
  const host = document.getElementById('pdpReviews');
  if (!host) return;
  const list = (typeof REVIEWS !== 'undefined' && REVIEWS[p.id]) || [];
  const loaded = typeof REVIEWS_LOADED !== 'undefined' && REVIEWS_LOADED[p.id];
  const signedIn = typeof getCurrentUser === 'function' && getCurrentUser();

  host.innerHTML = `
    <div class="row row--between" style="margin-bottom:18px">
      <h4>Reviews${list.length ? ' <span class="muted">(' + list.length + ')</span>' : ''}</h4>
    </div>

    ${!loaded ? '<div class="skeleton" style="height:64px;margin-bottom:12px"></div>' : ''}

    ${list.length ? list.map(r => `
      <div class="surface" style="padding:18px;margin-bottom:10px">
        <div class="row row--between" style="margin-bottom:6px">
          <span class="strong small">${esc(r.user_name || r.name || 'Verified customer')}</span>
          <span class="stars">${'★'.repeat(Math.round(r.rating || 5))}</span>
        </div>
        <p class="small muted">${esc(r.review_text || r.text || '')}</p>
      </div>`).join('')
      : (loaded ? '<p class="small muted" style="margin-bottom:18px">No reviews yet — be the first to write one.</p>' : '')}

    <div class="pad" style="padding:20px;margin-top:16px">
      <div class="label" style="margin-bottom:10px">Write a review</div>
      <div class="row" style="gap:2px;margin-bottom:12px" id="rvStars">
        ${[1,2,3,4,5].map(n => `<button type="button" class="star-btn ${n <= selectedRating ? 'on' : ''}"
             onclick="setRating(${n})" aria-label="${n} star${n>1?'s':''}" data-star="${n}">${icoF('star', 22)}</button>`).join('')}
      </div>
      <textarea class="textarea" id="rvText" placeholder="How did you get on with it?" style="min-height:96px"></textarea>
      <button class="btn btn--quiet" id="rvSubmitBtn" style="margin-top:12px" onclick="submitReview()">
        ${signedIn ? 'Post review' : 'Sign in to review'}
      </button>
    </div>`;
}

function setRating(n) {
  selectedRating = n;
  document.querySelectorAll('#rvStars [data-star]').forEach(b => {
    b.classList.toggle('on', Number(b.dataset.star) <= n);
  });
}

function accItem(title, body, open) {
  return `<div class="acc-item ${open ? 'open' : ''}">
    <button class="acc-head" type="button"><span>${esc(title)}</span>${ico('chevD', 17)}</button>
    <div class="acc-body"><div><div class="inner">${body}</div></div></div>
  </div>`;
}

function galleryGoto(i) {
  if (!currentProduct) return;
  const imgs = productImages(currentProduct);
  galleryIdx = i;
  const main = document.getElementById('galleryImg');
  if (main) main.src = imgs[i];
  document.querySelectorAll('.gthumb').forEach((t, n) => t.classList.toggle('on', n === i));
}

function setQty(d) {
  pQty = Math.max(1, pQty + d);
  const v = document.getElementById('pQtyVal');
  if (v) v.textContent = pQty;
}

/* Pack-size tiers. The maths is carried over unchanged — a tier's `rate`
   is the total for the whole bundle, and 15 tabs = 1 physical pack. */
function buildTierWidget(p) {
  const tiers = p._backendTiers || QTY_TIERS[p.id];
  if (!tiers || !tiers.length) return '';
  const sel = selectedTiers[p.id] !== undefined ? selectedTiers[p.id] : 0;

  return `<div class="tiers" id="tierWidget_${p.id}">
    <div class="label" style="margin-bottom:12px">Choose your pack</div>
    <div class="tier-grid">
      ${tiers.map((t, i) => {
        if (t.rate == null || t.mrp == null) return '';
        const off = Math.round((1 - t.rate / t.mrp) * 100);
        const packs = Math.max(1, Math.round(t.tabs / 15));
        return `<button class="tier ${i === sel ? 'on' : ''}" onclick="selectTier(${p.id},${i})">
          ${off > 0 ? `<span class="tier-save">Save ${off}%</span>` : ''}
          <div class="tier-tabs">${t.tabs}</div>
          <div class="tier-unit">tablets${packs > 1 ? ' · ' + packs + ' packs' : ''}</div>
          <div class="tier-rate">${fmt(t.rate)}</div>
          ${off > 0 ? `<div class="tier-mrp">${fmt(t.mrp)}</div>` : ''}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}

function selectTier(productId, tierIdx) {
  selectedTiers[productId] = tierIdx;
  const p = PRODUCTS.find(x => x.id === productId);
  const tiers = (p && p._backendTiers) || QTY_TIERS[productId];
  if (!tiers) return;

  const widget = document.getElementById('tierWidget_' + productId);
  if (widget) widget.outerHTML = buildTierWidget(p);
  updatePriceDisplay(productId, tierIdx);
}

function updatePriceDisplay(productId, tierIdx) {
  const p = PRODUCTS.find(x => x.id === productId);
  const tiers = (p && p._backendTiers) || QTY_TIERS[productId];
  if (!tiers) return;
  const t = tiers[tierIdx];
  if (!t || t.rate == null) return;
  const off = Math.round((1 - t.rate / t.mrp) * 100);

  const sale = document.getElementById('dynSalePrice');
  const orig = document.getElementById('dynOrigPrice');
  const tag  = document.getElementById('dynDiscTag');
  const save = document.getElementById('dynSaving');

  if (sale) {
    sale.textContent = fmt(t.rate);
    sale.classList.remove('price-updated');
    void sale.offsetWidth;
    sale.classList.add('price-updated');
  }
  if (orig) orig.textContent = fmt(t.mrp);
  if (tag)  tag.textContent  = 'Save ' + off + '%';
  if (save) save.textContent = off > 0 ? 'You save ' + fmt(t.mrp - t.rate) + ' on this pack' : 'Inclusive of all taxes';

  const btn = document.getElementById('addCartBtn');
  if (btn) btn.dataset.tier = tierIdx;
}

function addToCartWithTier(productId) {
  const p = PRODUCTS.find(x => x.id === productId);
  const tiers = (p && p._backendTiers) || QTY_TIERS[productId];
  if (!p) return;

  if (!tiers || !tiers.length || tiers[0].rate == null) {
    STORE.addToCart(productId, pQty);
    return;
  }

  const tierIdx = selectedTiers[productId] !== undefined ? selectedTiers[productId] : 0;
  const tier = tiers[tierIdx];
  const physicalPacks = Math.max(1, Math.round(tier.tabs / 15));

  const ex = STORE.cart.find(i => i.id === productId && i.tierIdx === tierIdx);
  if (ex) {
    ex.qty += 1;
  } else {
    STORE.cart.push({
      id: productId,
      qty: 1,
      tierIdx,
      tierTabs: tier.tabs,
      tierRate: tier.rate,
      tierMRP:  tier.mrp,
      tierDisc: tier.discountPct,
      isBundle: physicalPacks > 1,
    });
  }
  STORE.save();
  if (window._trackAddToCart) window._trackAddToCart(p, 1);
  showToast(p.name + ' — ' + tier.tabs + ' tablets added', 'success');
  openCartDrawer();
}

function renderRelated(p) {
  const host = document.getElementById('relatedGrid');
  if (!host) return;
  const rel = visibleProducts()
    .filter(x => x.id !== p.id && x.category === p.category)
    .sort(byPosition).slice(0, 4);
  const fill = rel.length ? rel : visibleProducts().filter(x => x.id !== p.id).sort(byPosition).slice(0, 4);
  host.innerHTML = fill.map(renderProductCard).join('');
}

/* ─────────────────────────  CART  ───────────────────────── */
function cartLineHTML(i, idx) {
  const p = PRODUCTS.find(x => x.id === i.id);
  if (!p) return '';
  const line = STORE.lineTotal(i);
  const meta = i.tierTabs
    ? i.tierTabs + ' tablets' + (i.isBundle ? ' · ' + Math.round(i.tierTabs / 15) + ' packs' : '')
    : 'Single unit';

  return `<div class="citem">
    <div class="citem-img">
      <img src="${esc(getProductImg(p))}" alt="${esc(p.name)}"
           onerror="this.onerror=null;this.src='${NO_IMAGE_PLACEHOLDER}'">
    </div>
    <div>
      <div class="citem-name">${esc(p.name)}</div>
      <div class="citem-meta">${esc(meta)}</div>
      <button class="btn btn--link tiny" style="margin-top:6px"
              onclick="STORE.removeFromCart(${i.id}, ${i.tierIdx === undefined ? 'undefined' : i.tierIdx})">Remove</button>
    </div>
    <div class="citem-right">
      <div class="strong num">${fmt(line)}</div>
      <div class="stepper">
        <button onclick="STORE.updateQty(${i.id}, ${i.qty - 1}, ${i.tierIdx === undefined ? 'undefined' : i.tierIdx})" aria-label="Decrease">${ico('minus', 14)}</button>
        <span class="val">${i.qty}</span>
        <button onclick="STORE.updateQty(${i.id}, ${i.qty + 1}, ${i.tierIdx === undefined ? 'undefined' : i.tierIdx})" aria-label="Increase">${ico('plus', 14)}</button>
      </div>
    </div>
  </div>`;
}

function emptyState(title, note, cta) {
  return `<div class="empty">
    <div class="empty-ico">${ico('bag', 32)}</div>
    <h4 style="margin-bottom:8px">${esc(title)}</h4>
    <p class="muted small" style="margin-bottom:22px">${esc(note)}</p>
    ${cta || ''}
  </div>`;
}

function discountFor(sub) {
  const { disc } = getOrderTotal();
  return Math.min(disc, sub);
}

function renderCart() {
  const list = document.getElementById('cartList');
  const sum  = document.getElementById('cartSummary');
  if (!list) return;

  if (!STORE.cart.length) {
    list.innerHTML = emptyState('Your bag is empty', 'Everything you save for later shows up here.',
      '<button class="btn" onclick="showShop(\'all\')">Browse the range</button>');
    if (sum) sum.innerHTML = '';
    return;
  }

  list.innerHTML = STORE.cart.map(cartLineHTML).join('');

  const sub  = STORE.getSubtotal();
  const disc = discountFor(sub);
  const ship = shippingFor(sub);
  const total = Math.max(0, sub - disc + ship);
  const saved = STORE.getSavings();

  if (sum) {
    sum.innerHTML = `
      <h4 style="margin-bottom:18px">Order summary</h4>
      <div class="coupon">
        <input class="input" id="couponInput" placeholder="Promo code" aria-label="Promo code">
        <button class="btn btn--quiet" onclick="applyCode()">Apply</button>
      </div>
      <div class="sum-row"><span>Subtotal</span><span class="v">${fmt(sub)}</span></div>
      ${saved > 0 ? `<div class="sum-row sum-row--save"><span>Pack savings</span><span class="v">−${fmt(saved)}</span></div>` : ''}
      ${disc > 0 ? `<div class="sum-row sum-row--save"><span>${esc((activePromoCode && activePromoCode.code) || 'Promo')}</span><span class="v">−${fmt(disc)}</span></div>` : ''}
      <div class="sum-row"><span>Shipping</span><span class="v" style="color:var(--ok)">Free</span></div>
      <div class="sum-row sum-row--total"><span>Total</span><span class="v">${fmt(total)}</span></div>
      <button class="btn btn--lg btn--block" style="margin-top:20px" onclick="showPage('checkout')">
        Checkout ${ico('arrowR', 17)}
      </button>
      <div class="row" style="justify-content:center;margin-top:14px;color:var(--ink-4)">
        ${ico('lock', 14)}<span class="tiny">Secure payment · UPI, cards, net banking</span>
      </div>`;
  }
}

/* Called by STORE.save() so every open view stays in step. */
function renderCartViews() {
  if (currentPage === 'cart') renderCart();
  if (currentPage === 'checkout') renderCheckoutSummary();
  if (currentPage === 'wishlist') renderWishlist();
  renderCartDrawer();
}

/* ── Side drawer ── */
function openCartDrawer() {
  if (currentPage === 'cart' || currentPage === 'checkout') return;
  renderCartDrawer();
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('drawerScrim')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('drawerScrim')?.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCartDrawer() {
  const body = document.getElementById('drawerBody');
  const foot = document.getElementById('drawerFoot');
  if (!body) return;

  if (!STORE.cart.length) {
    body.innerHTML = emptyState('Nothing in your bag yet', 'Add something and it will appear here.',
      '<button class="btn btn--quiet" onclick="closeCartDrawer();showShop(\'all\')">Browse</button>');
    if (foot) foot.innerHTML = '';
    return;
  }

  body.innerHTML = STORE.cart.map(cartLineHTML).join('');

  const sub = STORE.getSubtotal();
  if (foot) {
    foot.innerHTML = `
      <div class="sum-row sum-row--total" style="border:0;padding-top:0;margin-top:0">
        <span>Subtotal</span><span class="v">${fmt(sub)}</span>
      </div>
      <p class="tiny muted" style="margin-bottom:14px">Shipping and promo codes applied at checkout.</p>
      <button class="btn btn--block" onclick="closeCartDrawer();showPage('cart')">View bag</button>
      <button class="btn btn--quiet btn--block" style="margin-top:8px"
              onclick="closeCartDrawer();showPage('checkout')">Checkout</button>`;
  }
}

/* ─────────────────────────  CHECKOUT  ───────────────────────── */
function renderCheckoutSummary() {
  const el = document.getElementById('ckSummary');
  if (!el) return;

  if (!STORE.cart.length) {
    el.innerHTML = emptyState('Your bag is empty', 'Add something before checking out.',
      '<button class="btn btn--quiet" onclick="showShop(\'all\')">Browse</button>');
    return;
  }

  const { sub, disc } = getOrderTotal();
  const ship = 0;
  const total = Math.max(0, sub - disc + ship);

  el.innerHTML = `
    <h4 style="margin-bottom:18px">Your order</h4>
    ${STORE.cart.map(i => {
      const p = PRODUCTS.find(x => x.id === i.id);
      if (!p) return '';
      const unit = i.tierRate !== undefined ? i.tierRate : unitPrice(p);
      const label = i.tierTabs ? ' · ' + i.tierTabs + ' tabs' : '';
      return `<div class="row" style="align-items:flex-start;margin-bottom:14px">
        <div class="citem-img" style="width:52px;height:52px;border-radius:10px;flex-shrink:0">
          <img src="${esc(getProductImg(p))}" alt=""
               onerror="this.onerror=null;this.src='${NO_IMAGE_PLACEHOLDER}'">
        </div>
        <div style="flex:1;min-width:0">
          <div class="small strong" style="line-height:1.35">${esc(p.name)}</div>
          <div class="tiny muted">Qty ${i.qty}${label} × ${fmt(unit)}</div>
        </div>
        <div class="small strong num">${fmt(unit * i.qty)}</div>
      </div>`;
    }).join('')}

    <div class="divider" style="margin:18px 0"></div>
    <div class="coupon">
      <input class="input" id="couponInput" placeholder="Promo code" aria-label="Promo code">
      <button class="btn btn--quiet" onclick="applyCode()">Apply</button>
    </div>
    <div class="sum-row"><span>Subtotal</span><span class="v">${fmt(sub)}</span></div>
    ${disc > 0 ? `<div class="sum-row sum-row--save"><span>${esc((activePromoCode && activePromoCode.code) || 'Discount')}</span><span class="v">−${fmt(disc)}</span></div>` : ''}
    <div class="sum-row"><span>Shipping</span><span class="v" style="color:var(--ok)">Free</span></div>
    <div class="sum-row sum-row--total"><span>Total</span><span class="v">${fmt(total)}</span></div>
    <div class="row" style="justify-content:center;margin-top:16px;color:var(--ink-4)">
      ${ico('lock', 14)}<span class="tiny">256-bit SSL · PCI DSS secured</span>
    </div>`;

  if (typeof updateCodBtnNote === 'function') updateCodBtnNote();
}

/* ─────────────────────────  WISHLIST  ───────────────────────── */
function renderWishlist() {
  const g = document.getElementById('wishGrid');
  if (!g) return;
  const items = STORE.wishlist.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  g.innerHTML = items.length
    ? items.map(renderProductCard).join('')
    : `<div style="grid-column:1/-1">${emptyState('No saved products yet',
        'Tap the heart on any product to keep it here.',
        '<button class="btn" onclick="showShop(\'all\')">Browse the range</button>')}</div>`;
  revealNow();
}

/* ─────────────────────────  ACCOUNT  ───────────────────────── */
function loadAccountPage() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (!user) { if (typeof openAuth === 'function') openAuth('login'); showPage('home'); return; }

  const parts = String(user.name || 'A').trim().split(/\s+/);
  const initials = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();

  const av = document.getElementById('accAvatar');   if (av) av.textContent = initials;
  const nm = document.getElementById('accName');     if (nm) nm.textContent = user.name || 'Ascofizz customer';
  const em = document.getElementById('accEmail');    if (em) em.textContent = user.email || '';

  loadOrdersList();
}

function loadOrdersList() {
  const el = document.getElementById('ordersList');
  if (!el) return;

  let orders = [];
  try { orders = JSON.parse(localStorage.getItem('asc_orders') || '[]'); } catch (e) {}

  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const email = (user && user.email || '').toLowerCase().trim();
  if (email) {
    orders = orders.filter(o => (o.userEmail || o.email || '').toLowerCase().trim() === email);
  }

  if (!orders.length) {
    el.innerHTML = emptyState('No orders yet', 'Your order history will appear here once you place one.',
      '<button class="btn" onclick="showShop(\'all\')">Start shopping</button>');
    return;
  }

  el.innerHTML = orders.slice().reverse().map(o => {
    const status = String(o.status || 'Confirmed');
    const tone = /deliver/i.test(status) ? 'ok' : /cancel|fail/i.test(status) ? 'berry' : /ship|transit/i.test(status) ? 'sky' : 'warn';
    return `<div class="order-card">
      <div class="order-top">
        <div>
          <div class="order-id">${esc(o.orderId || '—')}</div>
          <div class="tiny muted">${esc(o.date || '')}</div>
        </div>
        <span class="chip chip--${tone === 'ok' ? 'fizz' : tone}"><i class="dot dot--${tone}"></i>${esc(status)}</span>
      </div>
      <div class="row row--between">
        <span class="small muted">${(o.items || []).length} item${(o.items || []).length === 1 ? '' : 's'}</span>
        <span class="strong num">${fmt(o.total || 0)}</span>
      </div>
    </div>`;
  }).join('');
}

/* ─────────────────────────  EDITORIAL  ───────────────────────── */
function renderBlog() {
  const g = document.getElementById('blogGrid');
  if (!g || typeof BLOGS === 'undefined') return;
  g.innerHTML = BLOGS.map(b => `
    <article class="bcard" data-reveal onclick="openArticle(${b.id})">
      <div class="bcard-img"><img src="${esc(b.img)}" alt="${esc(b.title)}" loading="lazy"></div>
      <div class="bcard-body">
        <span class="chip chip--fizz" style="align-self:flex-start">${esc(b.tag)}</span>
        <h4>${esc(b.title)}</h4>
        <p class="small muted" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(b.excerpt)}</p>
        <div class="bcard-meta">
          <span>${esc(b.author)}</span><span>·</span><span>${esc(b.readTime)}</span>
        </div>
      </div>
    </article>`).join('');
  revealNow();
}

function openArticle(id) {
  const b = (typeof BLOGS !== 'undefined' ? BLOGS : []).find(x => x.id === id);
  if (!b) return;
  const box = document.getElementById('articleBody');
  if (!box) return;
  const rel = b.relatedProduct ? PRODUCTS.find(p => p.id === b.relatedProduct) : null;
  box.innerHTML = `
    <span class="chip chip--fizz">${esc(b.tag)}</span>
    <h3 style="margin:14px 0 10px">${esc(b.title)}</h3>
    <div class="row tiny muted" style="margin-bottom:18px">
      <span>${esc(b.author)}</span><span>·</span><span>${esc(b.date)}</span><span>·</span><span>${esc(b.readTime)}</span>
    </div>
    <img src="${esc(b.img)}" alt="" style="width:100%;border-radius:var(--r);margin-bottom:18px">
    <p class="muted" style="line-height:1.8">${esc(b.excerpt)}</p>
    ${rel ? `<div class="divider" style="margin:22px 0"></div>
      <div class="row row--between">
        <div><div class="tiny muted">Featured in this piece</div><div class="strong">${esc(rel.name)}</div></div>
        <button class="btn btn--sm" onclick="closeModal('articleModal');openProduct(${rel.id})">View</button>
      </div>` : ''}`;
  openModal('articleModal');
}

function renderFaq() {
  const el = document.getElementById('faqList');
  if (!el || typeof FAQS === 'undefined') return;
  el.innerHTML = FAQS.map(f => accItem(f.q, '<p>' + esc(f.a) + '</p>')).join('');
  el.querySelectorAll('.acc-head').forEach(h => {
    h.onclick = () => h.closest('.acc-item').classList.toggle('open');
  });
}

/* ─────────────────────────  MODALS  ───────────────────────── */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}
function closeLightbox() { closeModal('articleModal'); }

/* ─────────────────────────  NAV  ───────────────────────── */
function toggleMobile() {
  const m = document.getElementById('mobileNav');
  if (!m) return;
  m.classList.toggle('open');
  document.body.style.overflow = m.classList.contains('open') ? 'hidden' : '';
}
function closeMobileNav() {
  document.getElementById('mobileNav')?.classList.remove('open');
  document.body.style.overflow = '';
}

function openWhatsApp(msg) {
  const num = '919898582650';
  window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg || 'Hi Ascofizz, I have a question.'), '_blank');
}

/* ─────────────────────────  MOTION  ───────────────────────── */
let _revealObserver = null;

function initReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('in'));
    return;
  }
  _revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      /* Stagger siblings so a grid arrives as a wave, not a slab. */
      const sibs = Array.from(el.parentElement ? el.parentElement.children : []);
      const delay = Math.min(sibs.indexOf(el), 7) * 55;
      setTimeout(() => el.classList.add('in'), delay);
      _revealObserver.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  revealNow();
}

function revealNow() {
  if (!_revealObserver) return;
  document.querySelectorAll('[data-reveal]:not(.in)').forEach(el => _revealObserver.observe(el));
}

function initBubbles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.querySelector('.bubbles');
  if (!host) return;
  const n = window.innerWidth < 760 ? 8 : 16;
  for (let i = 0; i < n; i++) {
    const b = document.createElement('span');
    b.className = 'bubble';
    const size = 5 + Math.random() * 13;
    b.style.width = size + 'px';
    b.style.height = size + 'px';
    b.style.left = Math.random() * 100 + '%';
    b.style.animationDuration = (11 + Math.random() * 14) + 's';
    b.style.animationDelay = (Math.random() * 14) + 's';
    host.appendChild(b);
  }
}

function initScrollChrome() {
  const nav = document.querySelector('.nav');
  const bar = document.querySelector('.progress');
  const top = document.getElementById('toTop');
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      nav?.classList.toggle('stuck', y > 20);
      top?.classList.toggle('show', y > 700);
      if (bar) {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ─────────────────────────  BOOT  ───────────────────────── */
function warmUpBackend() {
  try {
    fetch(API_BASE + '/api/wake', { mode: 'cors' }).catch(() => fetch(API_BASE + '/').catch(() => {}));
  } catch (e) {}
}

function bootStorefront() {
  STORE.init();
  initHome();
  initReveal();
  initBubbles();
  initScrollChrome();
  renderBlog();
  renderFaq();
  renderCartDrawer();

  /* Backend is on a cold-start tier — wake it while the customer reads. */
  warmUpBackend();

  /* Live catalogue: admin edits land here without a redeploy. */
  if (typeof syncProductsFromBackend === 'function') {
    syncProductsFromBackend().then(() => {
      initHome();
      if (currentPage === 'shop') applyFilters();
      if (currentPage === 'product' && currentProduct) {
        const fresh = PRODUCTS.find(p => p.id === currentProduct.id);
        if (fresh) { currentProduct = fresh; buildProductPage(fresh); }
      }
      revealNow();
    }).catch(() => {});
  }

  routeFromLocation();

  /* GoKwik sends the customer back with ?gk_order=… */
  const gk = new URLSearchParams(location.search).get('gk_order');
  if (gk && typeof handleGoKwikReturn === 'function') {
    setTimeout(() => handleGoKwikReturn(gk), 800);
  }

  if (typeof updateAccountNavBtn === 'function') updateAccountNavBtn();

  window.addEventListener('hashchange', routeFromLocation);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeCartDrawer();
    closeMobileNav();
    document.querySelectorAll('.modal.open').forEach(m => closeModal(m.id));
    if (typeof closeAuth === 'function') closeAuth();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootStorefront);
} else {
  bootStorefront();
}
