/* ═══════════════════════════════════════════════════════════════════════
   TEMPLATE 05 · CHEWLY — GUMMIES, CHEWABLES & SUCKERS
   A retail-shelf storefront: colour-coded by flavour, merchandised in
   three format rails plus benefit and audience. Playful in colour and
   copy, professional in structure — this is a consumer wellness brand,
   not a children's site.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var E = WL.esc, INR = WL.inr;

  function art(p) {
    return WL.pack({
      shape: p.pack || 'jar',
      bg: '#FFF8F3',
      body: 'rgba(255,255,255,.92)',
      cap: p.tint || '#FF5A8A',
      label: '#FFFFFF',
      accent: p.tint || '#FF5A8A',
      ink: '#26212B',
      capInk: '#FFFFFF',
      font: 'Poppins, Arial, sans-serif',
      brand: 'CHEWLY',
      name: p.shortName || p.name,
      sub: p.flavour,
      meta: p.count,
      gummies: p.gummies || [p.tint || '#FF5A8A']
    });
  }

  /* ── PORTFOLIO ──────────────────────────────────────────────────── */
  var CATALOG = [
    { id: 501, name: 'Vitamin C Gummies', shortName: 'Vitamin C', category: 'gummies',
      format: 'gummies', benefit: 'immunity', audience: 'adults', tags: ['featured', 'bestseller', 'immunity'],
      price: 599, salePrice: 499, flavour: 'Orange', count: '60 gummies', tint: '#FF8A3D',
      gummies: ['#FF8A3D', '#FFB627', '#FF6F3C'],
      rating: 4.8, reviews: 1142, stock: 320, badge: 'Best seller',
      description: 'A full 500mg of Vitamin C in two gummies, sweetened to a tenth of the sugar in a boiled sweet and set with pectin rather than gelatin.',
      keyIngredients: ['Vitamin C 500mg (per 2 gummies)', 'Zinc 5mg', 'Pectin (plant based)', 'Natural orange flavour'],
      howToUse: 'Two gummies a day, any time. Chew, do not swallow whole.',
      facts: [['Vitamin C', '500 mg'], ['Sugar', '2 g'], ['Gummies', '60'], ['Gelatin', 'None']] },

    { id: 502, name: 'Multivitamin Gummies', shortName: 'Multivitamin', category: 'gummies',
      format: 'gummies', benefit: 'daily', audience: 'adults', tags: ['featured', 'bestseller', 'daily'],
      price: 699, salePrice: 599, flavour: 'Mixed Fruit', count: '60 gummies', tint: '#FF5A8A',
      gummies: ['#FF5A8A', '#FFC93C', '#5AC8FA', '#7ED957'],
      rating: 4.7, reviews: 986, stock: 280, badge: 'Best seller',
      description: 'Thirteen vitamins in two gummies, in four fruit flavours that come from the fruit rather than from a flavour house.',
      keyIngredients: ['Vitamin A, C, D, E', 'B-complex (B6, B12, folate, biotin)', 'Zinc 5mg', 'Iodine 75mcg'],
      howToUse: 'Two gummies daily with breakfast.',
      facts: [['Vitamins', '13'], ['Sugar', '2.5 g'], ['Gummies', '60'], ['Flavours', '4']] },

    { id: 503, name: 'Immunity Gummies — Elderberry & Zinc', shortName: 'Immunity', category: 'gummies',
      format: 'gummies', benefit: 'immunity', audience: 'adults', tags: ['immunity', 'bestseller'],
      price: 749, salePrice: null, flavour: 'Blackberry', count: '60 gummies', tint: '#8A4FBF',
      gummies: ['#8A4FBF', '#B36BE0', '#6B3FA0'],
      rating: 4.6, reviews: 642, stock: 210,
      description: 'Elderberry extract with zinc and Vitamin C, for the week you feel something coming rather than for every week of the year.',
      keyIngredients: ['Elderberry extract 200mg', 'Zinc 7.5mg', 'Vitamin C 120mg', 'Vitamin D3 400 IU'],
      howToUse: 'Two gummies daily, up to four during a rough week.',
      facts: [['Elderberry', '200 mg'], ['Zinc', '7.5 mg'], ['Gummies', '60'], ['Sugar', '2 g']] },

    { id: 504, name: "Kids' Chewable Multivitamin", shortName: "Kids' Multi", category: 'chewables',
      format: 'chewables', benefit: 'daily', audience: 'kids', tags: ['featured', 'bestseller', 'kids'],
      price: 549, salePrice: 469, flavour: 'Strawberry', count: '90 chewables', tint: '#FF4D6D',
      gummies: ['#FF4D6D', '#FF8FA3'],
      rating: 4.8, reviews: 874, stock: 260, badge: 'Parents’ pick',
      description: 'A chewable tablet rather than a gummy — no sticky residue on teeth — with the vitamins children most often fall short on and none of the ones they do not need.',
      keyIngredients: ['Vitamin D3 400 IU', 'Vitamin C 40mg', 'Vitamin B12 1mcg', 'Iodine 60mcg', 'No added iron'],
      howToUse: 'One chewable daily for ages 4–12, after a meal.',
      facts: [['Age', '4–12'], ['Sugar', '0.8 g'], ['Chewables', '90'], ['Iron', 'None']] },

    { id: 505, name: 'Collagen Beauty Gummies', shortName: 'Collagen Beauty', category: 'gummies',
      format: 'gummies', benefit: 'beauty', audience: 'adults', tags: ['featured', 'beauty'],
      price: 899, salePrice: 799, flavour: 'Peach', count: '60 gummies', tint: '#FF9E7D',
      gummies: ['#FF9E7D', '#FFC9A8'],
      rating: 4.5, reviews: 428, stock: 180,
      description: 'Marine collagen peptides with Vitamin C and biotin, in a gummy that does not taste of the sea — which took eleven attempts.',
      keyIngredients: ['Marine collagen peptides 1000mg', 'Vitamin C 60mg', 'Biotin 2500mcg', 'Zinc 3mg'],
      howToUse: 'Two gummies daily. Give it twelve weeks before you judge it.',
      facts: [['Collagen', '1000 mg'], ['Biotin', '2500 mcg'], ['Gummies', '60'], ['Sugar', '2 g']] },

    { id: 506, name: 'Biotin Hair & Nail Gummies', shortName: 'Biotin', category: 'gummies',
      format: 'gummies', benefit: 'beauty', audience: 'adults', tags: ['beauty'],
      price: 649, salePrice: null, flavour: 'Strawberry', count: '60 gummies', tint: '#F4557A',
      gummies: ['#F4557A', '#FF8FA3'],
      rating: 4.5, reviews: 371, stock: 200,
      description: 'Biotin at 5000mcg with folate and zinc. High-dose biotin can skew some blood tests, which is worth mentioning to your doctor before one.',
      keyIngredients: ['Biotin 5000mcg', 'Folate 200mcg', 'Zinc 5mg', 'Vitamin E 6mg'],
      howToUse: 'Two gummies daily with food.',
      facts: [['Biotin', '5000 mcg'], ['Sugar', '2 g'], ['Gummies', '60'], ['Gelatin', 'None']] },

    { id: 507, name: 'Vitamin D3 Chewables', shortName: 'Vitamin D3', category: 'chewables',
      format: 'chewables', benefit: 'immunity', audience: 'adults', tags: ['immunity'],
      price: 499, salePrice: null, flavour: 'Lemon', count: '90 chewables', tint: '#FFC93C',
      gummies: ['#FFC93C', '#FFE066'],
      rating: 4.6, reviews: 296, stock: 240,
      description: '2000 IU of D3 in a small chewable with no sugar at all — sweetened with xylitol, which is also kinder to teeth.',
      keyIngredients: ['Vitamin D3 2000 IU', 'Vitamin K2-7 25mcg', 'Xylitol', 'Natural lemon'],
      howToUse: 'One chewable daily with the meal containing the most fat.',
      facts: [['Vitamin D3', '2000 IU'], ['Sugar', '0 g'], ['Chewables', '90'], ['Sweetener', 'Xylitol']] },

    { id: 508, name: 'Electrolyte Chews', shortName: 'Electrolyte Chews', category: 'chewables',
      format: 'chewables', benefit: 'energy', audience: 'adults', tags: ['energy', 'new'],
      price: 549, salePrice: 479, flavour: 'Lime', count: '48 chews', tint: '#5AC8FA',
      gummies: ['#5AC8FA', '#7ED957'],
      rating: 4.4, reviews: 187, stock: 190, badge: 'New',
      description: 'Sodium, potassium and magnesium in a soft chew you can take without water. Made for commutes, hot afternoons and long drives.',
      keyIngredients: ['Sodium 200mg', 'Potassium 100mg', 'Magnesium 25mg', 'Vitamin C 30mg'],
      howToUse: 'Two chews as needed, up to six a day.',
      facts: [['Sodium', '200 mg'], ['Chews', '48'], ['Water needed', 'No'], ['Sugar', '1 g']] },

    { id: 509, name: 'Vitamin C Suckers', shortName: 'Vitamin C Suckers', category: 'suckers',
      format: 'suckers', benefit: 'immunity', audience: 'kids', tags: ['featured', 'kids', 'new'], pack: 'box',
      price: 449, salePrice: null, flavour: 'Mixed Berry', count: '24 suckers', tint: '#E8467C',
      gummies: ['#E8467C', '#FF8A3D', '#8A4FBF'],
      rating: 4.6, reviews: 264, stock: 220, badge: 'New',
      description: 'A lollipop with 60mg of Vitamin C, no artificial colours, and a paper stick. Sugar-reduced but not sugar-free — a sucker that tastes of nothing gets thrown away.',
      keyIngredients: ['Vitamin C 60mg', 'Fruit and vegetable concentrates for colour', 'No artificial flavours'],
      howToUse: 'One sucker a day for ages 4 and up.',
      facts: [['Vitamin C', '60 mg'], ['Suckers', '24'], ['Age', '4+'], ['Colours', 'From fruit']] },

    { id: 510, name: 'Immunity Suckers — Honey & Lemon', shortName: 'Honey Lemon Suckers', category: 'suckers',
      format: 'suckers', benefit: 'immunity', audience: 'family', tags: ['immunity'], pack: 'box',
      price: 499, salePrice: null, flavour: 'Honey Lemon', count: '24 suckers', tint: '#F0A93A',
      gummies: ['#F0A93A', '#FFD166'],
      rating: 4.5, reviews: 178, stock: 170,
      description: 'Honey, lemon and zinc in a soothing sucker for a scratchy throat. Not a medicine, and it does not pretend to be one.',
      keyIngredients: ['Honey 1.2g', 'Vitamin C 40mg', 'Zinc 2.5mg', 'Lemon oil'],
      howToUse: 'One sucker as needed, up to three a day. Not for children under one year.',
      facts: [['Honey', '1.2 g'], ['Zinc', '2.5 mg'], ['Suckers', '24'], ['Age', '1+']] },

    { id: 511, name: 'Sugar-Free Multivitamin Chewables', shortName: 'Sugar-Free Multi', category: 'chewables',
      format: 'chewables', benefit: 'daily', audience: 'adults', tags: ['daily'],
      price: 649, salePrice: null, flavour: 'Berry', count: '90 chewables', tint: '#7ED957',
      gummies: ['#7ED957', '#B8E986'],
      rating: 4.4, reviews: 213, stock: 200,
      description: 'The full multivitamin with no sugar at all, for anyone counting it. Sweetened with xylitol and stevia.',
      keyIngredients: ['13 vitamins and minerals', 'Xylitol', 'Stevia leaf extract', 'No added sugar'],
      howToUse: 'One chewable daily with food.',
      facts: [['Sugar', '0 g'], ['Vitamins', '13'], ['Chewables', '90'], ['Sweetener', 'Xylitol']] },

    { id: 512, name: 'Omega-3 Gummies for Kids', shortName: "Kids' Omega-3", category: 'gummies',
      format: 'gummies', benefit: 'daily', audience: 'kids', tags: ['kids'],
      price: 749, salePrice: 649, flavour: 'Orange Cream', count: '60 gummies', tint: '#FFA552',
      gummies: ['#FFA552', '#FFD166'],
      rating: 4.5, reviews: 332, stock: 175,
      description: 'Algal omega-3 rather than fish oil, so there is no fishy repeat and it suits vegetarian households.',
      keyIngredients: ['Algal DHA 100mg', 'EPA 25mg', 'Vitamin D3 200 IU'],
      howToUse: 'Two gummies daily for ages 4–12.',
      facts: [['DHA', '100 mg'], ['Source', 'Algal'], ['Age', '4–12'], ['Gummies', '60']] },

    { id: 513, name: 'Sleep Gummies — Melatonin Free', shortName: 'Sleep Gummies', category: 'gummies',
      format: 'gummies', benefit: 'sleep', audience: 'adults', tags: ['sleep', 'new'],
      price: 799, salePrice: null, flavour: 'Blueberry Lavender', count: '60 gummies', tint: '#6B7FD7',
      gummies: ['#6B7FD7', '#A8B4F0'],
      rating: 4.4, reviews: 156, stock: 140, badge: 'New',
      description: 'Magnesium, L-theanine and chamomile, without melatonin — so it fits an evening routine rather than shifting your body clock.',
      keyIngredients: ['Magnesium 100mg', 'L-Theanine 100mg', 'Chamomile 50mg', 'Vitamin B6 1mg'],
      howToUse: 'Two gummies 45 minutes before bed.',
      facts: [['Melatonin', 'None'], ['Magnesium', '100 mg'], ['Gummies', '60'], ['Sugar', '2 g']] },

    { id: 514, name: 'The Family Box', shortName: 'Family Box', category: 'bundles', pack: 'box',
      format: 'gummies', benefit: 'daily', audience: 'family', tags: ['featured', 'bundles'],
      price: 1897, salePrice: 1549, flavour: 'Three products', count: '3 products', tint: '#FF5A8A',
      gummies: ['#FF5A8A', '#FFC93C', '#5AC8FA'],
      rating: 4.7, reviews: 241, stock: 80, badge: 'Save ₹348',
      description: "Adult Multivitamin Gummies, Kids' Chewable Multivitamin and Vitamin C Suckers — a month of the whole household in one box.",
      keyIngredients: ['Multivitamin Gummies — 60', "Kids' Chewable Multivitamin — 90", 'Vitamin C Suckers — 24'],
      howToUse: 'Adults two gummies, children one chewable, suckers as a treat.',
      facts: [['Products', '3'], ['Saving', '₹348'], ['Covers', 'Whole family'], ['Duration', '~1 month']] }
  ];

  var BENEFITS = [
    { key: 'immunity', label: 'Immunity',   tint: '#FF8A3D' },
    { key: 'daily',    label: 'Daily',      tint: '#FF5A8A' },
    { key: 'beauty',   label: 'Beauty',     tint: '#F4557A' },
    { key: 'energy',   label: 'Hydration',  tint: '#5AC8FA' },
    { key: 'sleep',    label: 'Sleep',      tint: '#6B7FD7' },
    { key: 'kids',     label: 'Kids',       tint: '#7ED957' }
  ];

  var RAILS = [
    { key: 'gummies',   title: 'The gummy collection',    line: 'Pectin-set, no gelatin, four fruit flavours.' },
    { key: 'chewables', title: 'The chewable collection', line: 'No sticky residue, and the sugar-free options live here.' },
    { key: 'suckers',   title: 'The sucker collection',   line: 'Paper sticks, colour from fruit, 60mg of Vitamin C.' }
  ];

  /* ── PRODUCT CARD ───────────────────────────────────────────────── */
  function card(p) {
    var price = p.salePrice || p.price, disc = WL.discount(p);
    return '' +
    '<article class="ch-card wl-rise" data-product-id="' + p.id + '" style="--tint:' + p.tint + '" onclick="openProduct(' + p.id + ')">' +
      '<div class="ch-card-shot">' +
        '<img data-src="' + p._art + '" src="' + p._art + '" alt="' + E(p.name) + '" loading="lazy" decoding="async">' +
        (p.badge ? '<span class="ch-card-badge">' + E(p.badge) + '</span>' : '') +
        (disc ? '<span class="ch-card-off">' + disc + '% off</span>' : '') +
      '</div>' +
      '<div class="ch-card-body">' +
        '<div class="ch-card-tags"><span class="ch-chip">' + E(p.flavour) + '</span><span class="ch-chip is-ghost">' + E(cap(p.benefit)) + '</span></div>' +
        '<h3 class="ch-card-name">' + E(p.name) + '</h3>' +
        '<p class="ch-card-count">' + E(p.count) + '</p>' +
        WL.stars(p.rating, p.reviews) +
        '<div class="ch-card-foot">' +
          '<span class="ch-card-price">' + INR(price) + (p.salePrice ? '<s>' + INR(p.price) + '</s>' : '') + '</span>' +
          '<button class="ch-card-add" onclick="event.stopPropagation();STORE.addToCart(' + p.id + ')">Add</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ── PRODUCT PAGE ───────────────────────────────────────────────── */
  function productPage(p) {
    var host = document.getElementById('productDetail');
    if (!host) return '';
    var price = p.salePrice || p.price;
    var sameFlavourFamily = WL.all().filter(function (x) { return x.benefit === p.benefit && x.id !== p.id; }).slice(0, 4);

    host.innerHTML = '' +
    '<div class="ch-pd" style="--tint:' + p.tint + '">' +
      '<div class="ch-pd-media"><img src="' + p._art + '" alt="' + E(p.name) + '"></div>' +
      '<div class="ch-pd-body">' +
        '<div class="ch-card-tags"><span class="ch-chip">' + E(p.flavour) + '</span><span class="ch-chip is-ghost">' + E(cap(p.format)) + '</span><span class="ch-chip is-ghost">' + E(cap(p.audience)) + '</span></div>' +
        '<h1>' + E(p.name) + '</h1>' +
        WL.stars(p.rating, p.reviews) +
        '<p class="ch-pd-desc">' + E(p.description) + '</p>' +
        '<ul class="ch-pd-facts">' + (p.facts || []).map(function (f) {
          return '<li><strong>' + E(f[1]) + '</strong><span>' + E(f[0]) + '</span></li>';
        }).join('') + '</ul>' +
        '<div class="ch-pd-buy">' +
          '<span class="ch-pd-price">' + INR(price) + (p.salePrice ? '<s>' + INR(p.price) + '</s>' : '') + '</span>' +
          '<button class="ch-pd-add" onclick="STORE.addToCart(' + p.id + ');openSideCart()">Add to cart</button>' +
        '</div>' +
        '<p class="ch-pd-ship">Free delivery over ₹499 · dispatched in 24 hours</p>' +
      '</div>' +
    '</div>' +
    '<div class="ch-pd-info">' +
      '<section><h2>What is in it</h2><ul>' + (p.keyIngredients || []).map(function (i) { return '<li>' + E(i) + '</li>'; }).join('') + '</ul></section>' +
      '<section><h2>How to take it</h2><p>' + E(p.howToUse) + '</p>' +
        '<h2 class="ch-pd-h2b">Texture &amp; format</h2><p>' + E(formatNote(p.format)) + '</p></section>' +
      '<section><h2>Questions</h2>' +
        '<details><summary>Is there gelatin in these?</summary><p>No. Every gummy in the range is set with pectin, so the whole range is vegetarian.</p></details>' +
        '<details><summary>How much sugar is in a serving?</summary><p>Two gummies carry about 2g — roughly a tenth of a boiled sweet. The chewables range from 0.8g down to none at all.</p></details>' +
        '<details><summary>Can children take the adult products?</summary><p>The doses are set for adults. Anything suitable for children is labelled with an age on the front, and the kids’ range is dosed separately.</p></details>' +
      '</section>' +
    '</div>' +
    (sameFlavourFamily.length ? '<div class="ch-pd-more"><h2>Goes well with</h2><div class="ch-pd-more-row">' +
      sameFlavourFamily.map(card).join('') + '</div></div>' : '');

    var rg = document.getElementById('relatedGrid');
    if (rg) rg.innerHTML = '';
    WL.observe(host);
    return '';
  }

  function formatNote(f) {
    if (f === 'gummies') return 'A soft pectin gummy, firm enough to hold its shape in a hot car and soft enough to chew straight from the jar.';
    if (f === 'chewables') return 'A pressed chewable tablet — crumbly rather than sticky, which is why it is the format we use for the children’s range.';
    return 'A hard sucker on a paper stick, coloured with fruit and vegetable concentrates rather than dyes.';
  }

  /* ── HEADER ─────────────────────────────────────────────────────── */
  function header() {
    return '' +
    '<div class="ch-top"><span>Free delivery over ₹499</span><span>·</span><span>No gelatin, ever</span><span>·</span><span>Dispatched in 24 hours</span></div>' +
    '<header class="ch-head">' +
      '<div class="ch-wrap ch-head-in">' +
        '<a class="ch-logo" onclick="showPage(\'home\')"><span class="ch-logo-dot"></span>Chewly</a>' +
        '<nav class="ch-nav">' +
          '<a onclick="WL.shop(\'all\')">Shop</a>' +
          '<a onclick="WL.shop(\'gummies\')">Gummies</a>' +
          '<a onclick="WL.shop(\'chewables\')">Chewables</a>' +
          '<a onclick="WL.shop(\'suckers\')">Suckers</a>' +
          '<a onclick="CH.jump(\'chBenefits\')">By benefit</a>' +
          '<a onclick="showPage(\'about\')">About</a>' +
        '</nav>' +
        '<div class="ch-head-acts">' +
          '<button class="ch-ic" onclick="WL.shop(\'all\')" aria-label="Search">Search</button>' +
          '<button class="ch-ic" onclick="handleAccountNavClick()" aria-label="Account">Account</button>' +
          '<button class="ch-cart" onclick="openSideCart()">Cart<span class="cart-badge" style="display:none">0</span></button>' +
          '<button class="ch-burger" onclick="CH.menu()" aria-label="Menu"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div>' +
      '<div class="ch-drawer" id="chDrawer">' +
        '<a onclick="WL.shop(\'all\');CH.menu()">Shop all</a>' +
        '<a onclick="WL.shop(\'gummies\');CH.menu()">Gummies</a>' +
        '<a onclick="WL.shop(\'chewables\');CH.menu()">Chewables</a>' +
        '<a onclick="WL.shop(\'suckers\');CH.menu()">Suckers</a>' +
        '<a onclick="WL.shop(\'kids\');CH.menu()">Kids</a>' +
        '<a onclick="WL.shop(\'bundles\');CH.menu()">Bundles</a>' +
        '<a onclick="handleAccountNavClick();CH.menu()">Account</a>' +
      '</div>' +
    '</header>';
  }

  window.CH = {
    menu: function () { document.getElementById('chDrawer').classList.toggle('is-open'); },
    jump: function (id) {
      if (typeof currentPage !== 'undefined' && currentPage !== 'home') showPage('home');
      setTimeout(function () {
        var el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    },
    faq: function (btn) {
      var open = btn.parentElement.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    }
  };

  /* ── HOMEPAGE ───────────────────────────────────────────────────── */
  function home() {
    var hero = WL.byId(502) || WL.pick('bestseller', 1)[0];
    var best = WL.pick('bestseller', 4);

    return '' +
    '<section class="ch-hero">' +
      '<div class="ch-wrap ch-hero-in">' +
        '<div class="ch-hero-copy">' +
          '<p class="ch-eyebrow">Gummies · chewables · suckers</p>' +
          '<h1>Good health should taste good.</h1>' +
          '<p class="ch-hero-lede">Vitamins your family will actually finish. Pectin instead of gelatin, colour from fruit, and about a tenth of the sugar in a boiled sweet.</p>' +
          '<div class="ch-hero-cta">' +
            '<button class="ch-btn" onclick="WL.shop(\'all\')">Shop all</button>' +
            '<button class="ch-btn-out" onclick="CH.jump(\'chBenefits\')">Shop by benefit</button>' +
          '</div>' +
          '<div class="ch-flavours">' +
            '<span>Flavours</span>' +
            ['#FF8A3D', '#FF5A8A', '#8A4FBF', '#7ED957', '#5AC8FA', '#FFC93C'].map(function (c) {
              return '<i style="background:' + c + '"></i>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="ch-hero-art">' +
          '<img src="' + (hero ? hero._art : '') + '" alt="Chewly multivitamin gummies">' +
          '<div class="ch-hero-tag"><strong>13 vitamins</strong><span>in two gummies</span></div>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ch-sec">' +
      '<div class="ch-wrap">' +
        '<div class="ch-sec-head wl-rise"><h2>Best sellers</h2><button class="ch-link" onclick="WL.shop(\'bestsellers\')">See all →</button></div>' +
        '<div class="ch-grid">' + best.map(card).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ch-sec ch-sec-tint" id="chBenefits">' +
      '<div class="ch-wrap">' +
        '<div class="ch-sec-head wl-rise"><h2>Shop by benefit</h2></div>' +
        '<div class="ch-benefits">' + BENEFITS.map(function (b) {
          var n = WL.all().filter(function (p) { return p.benefit === b.key || p.audience === b.key || (p.tags || []).indexOf(b.key) > -1; }).length;
          return '<button class="ch-benefit wl-rise" style="--tint:' + b.tint + '" onclick="WL.shop(\'' + b.key + '\')">' +
            '<span class="ch-benefit-blob"></span><strong>' + E(b.label) + '</strong><em>' + WL.count(n, 'product') + '</em></button>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    RAILS.map(function (r, i) {
      var items = WL.all().filter(function (p) { return p.format === r.key; });
      return '<section class="ch-sec' + (i % 2 ? ' ch-sec-tint' : '') + '">' +
        '<div class="ch-wrap">' +
          '<div class="ch-sec-head wl-rise">' +
            '<div><h2>' + E(r.title) + '</h2><p class="ch-sec-line">' + E(r.line) + '</p></div>' +
            '<div class="ch-rail-btns"><button onclick="WL.rail(\'chRail-' + r.key + '\',-1)" aria-label="Scroll left">‹</button>' +
            '<button onclick="WL.rail(\'chRail-' + r.key + '\',1)" aria-label="Scroll right">›</button></div>' +
          '</div>' +
          '<div class="ch-rail" id="chRail-' + r.key + '">' + items.map(card).join('') + '</div>' +
        '</div>' +
      '</section>';
    }).join('') +

    '<section class="ch-sec ch-why">' +
      '<div class="ch-wrap">' +
        '<div class="ch-sec-head wl-rise"><h2>Why chewables?</h2></div>' +
        '<div class="ch-why-grid">' + [
          ['They get taken', 'The best supplement is the one that is not still full in six months. Format is most of adherence, and a gummy at breakfast beats a capsule anyone dreads.'],
          ['Doses are honest', 'A gummy holds less than a capsule, so we say what fits. Where a dose cannot be reached in two gummies, we make it as a chewable instead of quietly shrinking it.'],
          ['No gelatin, less sugar', 'Pectin-set, so the whole range is vegetarian. Two gummies carry about 2g of sugar and the sugar-free chewables carry none.']
        ].map(function (w) {
          return '<article class="ch-why-c wl-rise"><h3>' + E(w[0]) + '</h3><p>' + E(w[1]) + '</p></article>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ch-sec ch-sec-tint">' +
      '<div class="ch-wrap">' +
        '<div class="ch-sec-head wl-rise"><h2>What families say</h2></div>' +
        '<div class="ch-revs">' + [
          ['My eight-year-old asks for them', 'She used to hide the old chewable in a napkin. These she asks for at breakfast, which is a first.', 'Preeti J.', "Kids' Chewable Multivitamin"],
          ['I finally finished a bottle', 'Third brand I have tried and the first I have got to the end of. The orange one genuinely tastes of orange.', 'Nikhil A.', 'Vitamin C Gummies'],
          ['The sugar-free option matters', 'I am diabetic and had written off the whole category. The sugar-free chewables are the reason I am here.', 'Ravi S.', 'Sugar-Free Multivitamin Chewables']
        ].map(function (r) {
          return '<figure class="ch-rev wl-rise"><div class="ch-rev-stars">★★★★★</div><h3>' + E(r[0]) + '</h3>' +
            '<blockquote>' + E(r[1]) + '</blockquote><figcaption><strong>' + E(r[2]) + '</strong><span>' + E(r[3]) + '</span></figcaption></figure>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ch-sec">' +
      '<div class="ch-wrap ch-faq-wrap">' +
        '<div class="ch-sec-head wl-rise"><h2>Questions, answered</h2></div>' +
        '<div class="ch-faq">' + [
          ['Are these vegetarian?', 'Yes. Every gummy is set with pectin rather than gelatin, and nothing in the range uses animal-derived ingredients apart from the honey in the Honey &amp; Lemon suckers and the marine collagen in the Beauty gummies, both stated on the front.'],
          ['How much sugar is in them?', 'Two gummies carry about 2–2.5g. The chewables run from 0.8g down to zero, and the sugar-free range is sweetened with xylitol and stevia.'],
          ['Can my child take the adult gummies?', 'The doses are set for adults. Anything suitable for children carries an age on the front of the pack, and the kids’ range is dosed separately rather than being the adult product in a smaller jar.'],
          ['Will they melt in transit?', 'They are formulated to hold their shape up to 35°C and shipped in insulated packs between April and July. If a jar arrives fused, we replace it — no photo needed.']
        ].map(function (f) {
          return '<div class="ch-faq-i"><button onclick="CH.faq(this)" aria-expanded="false">' + f[0] + '<i></i></button><div class="ch-faq-a"><p>' + f[1] + '</p></div></div>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>';
  }

  function shopIntro() {
    return '<div class="ch-shop-intro"><h1>Shop everything</h1>' +
      '<p>Gummies, chewables and suckers — filter by format, benefit or who it is for.</p></div>';
  }

  function footer() {
    return '<div class="ch-foot">' +
      '<div class="ch-wrap">' +
        '<div class="ch-foot-top">' +
          '<div><p class="ch-foot-logo"><span class="ch-logo-dot"></span>Chewly</p>' +
            '<p class="ch-foot-tag">Vitamins that taste good enough to finish. No gelatin, colour from fruit, made in India.</p></div>' +
          '<div class="ch-foot-nl"><label>Get 10% off your first order</label>' +
            '<div><input type="email" placeholder="Email address" aria-label="Email address"><button onclick="showToast(\'Check your inbox for the code.\')">Get code</button></div></div>' +
        '</div>' +
        '<div class="ch-foot-cols">' +
          '<div><h4>Shop</h4><a onclick="WL.shop(\'gummies\')">Gummies</a><a onclick="WL.shop(\'chewables\')">Chewables</a><a onclick="WL.shop(\'suckers\')">Suckers</a><a onclick="WL.shop(\'bundles\')">Bundles</a></div>' +
          '<div><h4>Benefit</h4>' + BENEFITS.slice(0, 5).map(function (b) { return '<a onclick="WL.shop(\'' + b.key + '\')">' + E(b.label) + '</a>'; }).join('') + '</div>' +
          '<div><h4>About</h4><a onclick="showPage(\'about\')">Our story</a><a onclick="showPage(\'blog\')">Blog</a><a onclick="showPage(\'faq\')">FAQ</a><a onclick="showPage(\'contact\')">Contact</a></div>' +
          '<div><h4>Help</h4><a onclick="showPage(\'shipping\')">Shipping</a><a onclick="showPage(\'refund\')">Returns</a><a onclick="showPage(\'privacy\')">Privacy</a><a onclick="showPage(\'terms\')">Terms</a></div>' +
        '</div>' +
        '<div class="ch-foot-legal"><p>© ' + new Date().getFullYear() + ' Chewly</p><p>White-label storefront demo — template 05 of six</p></div>' +
      '</div>' +
    '</div>';
  }

  var ICON = function (d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  };

  WL.define({
    slug: 'chewly',
    name: 'Chewly',
    tagline: 'Good health should taste good',
    title: 'Chewly — Gummies, Chewables & Vitamin Suckers',
    catalog: CATALOG,
    packshot: art,
    card: card,
    productPage: productPage,
    header: header,
    home: home,
    footer: footer,
    shopIntro: shopIntro,
    categories: [
      { key: 'all', label: 'Everything' },
      { key: 'gummies', label: 'Gummies' },
      { key: 'chewables', label: 'Chewables' },
      { key: 'suckers', label: 'Suckers' },
      { key: 'bundles', label: 'Bundles' },
      { key: 'immunity', label: 'Immunity' },
      { key: 'beauty', label: 'Beauty' },
      { key: 'kids', label: 'Kids' },
      { key: 'bestsellers', label: 'Best sellers' }
    ],
    bottomNav: [
      { page: 'home', label: 'Home', icon: ICON('<path d="M4 10.5 12 4l8 6.5V20H4z"/>') },
      { page: 'shop', label: 'Shop', icon: ICON('<circle cx="12" cy="13" r="7"/><path d="M9 6h6"/>') },
      { page: 'wishlist', label: 'Saved', icon: ICON('<path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z"/>') },
      { page: 'cart', label: 'Cart', icon: ICON('<path d="M4 7h16l-1.4 12H5.4z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/>'), action: "openSideCart();setAppNav('cart')" },
      { page: 'account', label: 'Account', icon: ICON('<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'), action: "handleAccountNavClick();setAppNav('account')" }
    ]
  });
})();
