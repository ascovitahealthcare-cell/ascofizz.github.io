/* ═══════════════════════════════════════════════════════════════════════
   TEMPLATE 01 · ASCOFIZZ — EFFERVESCENT SUPPLEMENTS
   Everyday wellness, sold on convenience. The storefront is built around
   one gesture: a tablet dropped into water. Merchandising is by vitamin,
   by benefit and by format — the three ways a shopper actually looks for
   an effervescent.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var E = WL.esc, INR = WL.inr;

  var FLAV = {
    citrus:   '#F3A712', orange: '#E8762C', lemon: '#EFC33B', berry: '#C84A63',
    mint:     '#3FA98A', cola:   '#8A5A34', apple: '#7CA83F', grape: '#8A5FA8',
    natural:  '#2E7D5B'
  };

  function art(p) {
    return WL.pack({
      shape: p.pack || 'tube',
      bg: '#F1F7F1',
      body: '#FFFFFF',
      cap: p.tint || FLAV.citrus,
      label: '#FFFFFF',
      accent: p.tint || FLAV.citrus,
      ink: '#153E30',
      capInk: '#FFFFFF',
      font: 'Outfit, Inter, sans-serif',
      brand: 'ASCOFIZZ',
      name: p.shortName || p.name,
      sub: p.flavour,
      meta: p.count
    });
  }

  /* ── PRODUCT PORTFOLIO ──────────────────────────────────────────────
     Same field shape the engine has always used, so cart, checkout,
     orders, search and filtering read these exactly as before. The extra
     keys (flavour, count, benefit, vitamin) are merchandising only. */
  var CATALOG = [
    { id: 101, name: 'Vitamin C 1000mg Effervescent', shortName: 'Vitamin C 1000', category: 'vitamin-c',
      vitamin: 'vitamin-c', benefit: 'immunity', tags: ['featured', 'bestseller', 'immunity'],
      price: 449, salePrice: 379, flavour: 'Orange', tint: FLAV.orange, count: '20 tablets',
      rating: 4.8, reviews: 412, stock: 180, badge: 'Best seller',
      description: 'A full 1000mg of Vitamin C with zinc and rosehip, dissolved in a glass of water in under 60 seconds. Effervescence buffers the acidity, which is why this sits easier on an empty stomach than a swallowed tablet of the same strength.',
      keyIngredients: ['Vitamin C 1000mg', 'Zinc 10mg', 'Rosehip extract 50mg', 'Natural orange flavour'],
      howToUse: 'Drop one tablet into 200ml of water. Wait for the fizz to settle, then drink. Once daily, with or after food.',
      nutrition: [['Vitamin C', '1000mg', '2500% RDA'], ['Zinc', '10mg', '100% RDA'], ['Sodium', '180mg', '—'], ['Energy', '9 kcal', '—']] },

    { id: 102, name: 'Glutathione + Vitamin C Effervescent', shortName: 'Glutathione', category: 'specialty',
      vitamin: 'glutathione', benefit: 'skin', tags: ['featured', 'bestseller', 'skin'],
      price: 899, salePrice: 749, flavour: 'Lychee', tint: '#D6708A', count: '15 tablets',
      rating: 4.7, reviews: 286, stock: 90, badge: 'Skin',
      description: 'Reduced L-glutathione paired with Vitamin C, which the body uses to keep glutathione in its active form. A skin-and-antioxidant formula in a format that absorbs faster than a capsule.',
      keyIngredients: ['L-Glutathione (reduced) 500mg', 'Vitamin C 500mg', 'Vitamin E 10mg', 'Grape seed extract 25mg'],
      howToUse: 'One tablet in 200ml water, once daily. Best taken in the evening, at least an hour after a meal.',
      nutrition: [['L-Glutathione', '500mg', '—'], ['Vitamin C', '500mg', '1250% RDA'], ['Vitamin E', '10mg', '100% RDA']] },

    { id: 103, name: 'Daily Multivitamin Effervescent', shortName: 'Multivitamin', category: 'multivitamin',
      vitamin: 'multivitamin', benefit: 'daily', tags: ['featured', 'bestseller', 'daily'],
      price: 499, salePrice: 429, flavour: 'Mixed Berry', tint: FLAV.berry, count: '20 tablets',
      rating: 4.6, reviews: 358, stock: 210, badge: 'Best seller',
      description: 'Nineteen vitamins and minerals at meaningful doses, in one glass. Built as the single supplement most people actually need, rather than the fourth bottle on the shelf.',
      keyIngredients: ['Vitamin C 80mg', 'B-complex (B1, B2, B3, B5, B6, B12)', 'Vitamin D3 600 IU', 'Zinc 10mg', 'Magnesium 60mg', 'Biotin 50mcg'],
      howToUse: 'One tablet in 200ml water each morning with breakfast.',
      nutrition: [['Vitamin C', '80mg', '100% RDA'], ['Vitamin D3', '600 IU', '75% RDA'], ['Vitamin B12', '2.4mcg', '100% RDA'], ['Zinc', '10mg', '100% RDA']] },

    { id: 104, name: 'Magnesium Complex Effervescent', shortName: 'Magnesium', category: 'mineral',
      vitamin: 'magnesium', benefit: 'calm', tags: ['featured', 'calm', 'bestseller'],
      price: 549, salePrice: null, flavour: 'Lemon', tint: FLAV.lemon, count: '20 tablets',
      rating: 4.7, reviews: 194, stock: 140, badge: null,
      description: 'Three magnesium forms — citrate, glycinate and malate — at 375mg elemental. Citrate is what makes it dissolve; glycinate is what makes it gentle enough for an evening routine.',
      keyIngredients: ['Magnesium citrate', 'Magnesium glycinate', 'Magnesium malate', 'Vitamin B6 1.4mg'],
      howToUse: 'One tablet in 200ml water in the evening, roughly an hour before bed.',
      nutrition: [['Magnesium', '375mg', '100% RDA'], ['Vitamin B6', '1.4mg', '100% RDA']] },

    { id: 105, name: 'Calcium + D3 + K2 Effervescent', shortName: 'Calcium D3 K2', category: 'mineral',
      vitamin: 'calcium', benefit: 'bones', tags: ['bones', 'new'],
      price: 479, salePrice: null, flavour: 'Vanilla Lime', tint: '#9BB24A', count: '20 tablets',
      rating: 4.5, reviews: 88, stock: 120, badge: 'New',
      description: 'Calcium is only as useful as the vitamins that direct it. D3 handles absorption, K2-7 handles where it ends up — which is why this is a three-part formula rather than a calcium tablet.',
      keyIngredients: ['Calcium carbonate 500mg', 'Vitamin D3 600 IU', 'Vitamin K2-7 55mcg', 'Magnesium 50mg'],
      howToUse: 'One tablet in 200ml water daily, with a meal.',
      nutrition: [['Calcium', '500mg', '50% RDA'], ['Vitamin D3', '600 IU', '75% RDA'], ['Vitamin K2-7', '55mcg', '73% RDA']] },

    { id: 106, name: 'Iron + Folate Effervescent', shortName: 'Iron + Folate', category: 'mineral',
      vitamin: 'iron', benefit: 'energy', tags: ['energy', 'new'],
      price: 429, salePrice: 379, flavour: 'Blackcurrant', tint: '#7A3D64', count: '20 tablets',
      rating: 4.4, reviews: 76, stock: 95, badge: 'New',
      description: 'Iron bisglycinate — the form chosen because it does not bring the constipation and metallic aftertaste that iron supplements are known for — with folate and B12 alongside, since all three work on the same pathway.',
      keyIngredients: ['Iron bisglycinate 14mg', 'Folic acid 200mcg', 'Vitamin B12 2.4mcg', 'Vitamin C 40mg'],
      howToUse: 'One tablet in 200ml water daily, away from tea or coffee.',
      nutrition: [['Iron', '14mg', '78% RDA'], ['Folic acid', '200mcg', '100% RDA'], ['Vitamin B12', '2.4mcg', '100% RDA']] },

    { id: 107, name: 'Electrolyte Hydration Effervescent', shortName: 'Electrolytes', category: 'hydration',
      vitamin: 'electrolyte', benefit: 'hydration', tags: ['featured', 'bestseller', 'hydration'],
      price: 399, salePrice: 349, flavour: 'Lemon Lime', tint: '#5FBF6A', count: '20 tablets',
      rating: 4.8, reviews: 503, stock: 260, badge: 'Best seller',
      description: 'Sodium, potassium and magnesium in the ratio lost through sweat, with only 1g of sugar. For long days, hot cities, training and the morning after.',
      keyIngredients: ['Sodium 300mg', 'Potassium 200mg', 'Magnesium 50mg', 'Vitamin C 40mg'],
      howToUse: 'One tablet in 300–500ml water. Up to two per day on heavy-sweat days.',
      nutrition: [['Sodium', '300mg', '—'], ['Potassium', '200mg', '10% RDA'], ['Magnesium', '50mg', '13% RDA'], ['Sugar', '1g', '—']] },

    { id: 108, name: 'Vitamin B-Complex Effervescent', shortName: 'B-Complex', category: 'vitamin-b',
      vitamin: 'b-complex', benefit: 'energy', tags: ['energy'],
      price: 449, salePrice: null, flavour: 'Tropical', tint: '#E5883C', count: '20 tablets',
      rating: 4.5, reviews: 141, stock: 150, badge: null,
      description: 'All eight B vitamins at 100% RDA or above. B vitamins do not give energy directly — they are what the body uses to release it from food, which is why the whole set matters more than a large dose of any one.',
      keyIngredients: ['B1 1.4mg', 'B2 1.6mg', 'B3 18mg', 'B5 6mg', 'B6 2mg', 'B7 50mcg', 'B9 200mcg', 'B12 2.5mcg'],
      howToUse: 'One tablet in 200ml water each morning.',
      nutrition: [['Vitamin B12', '2.5mcg', '104% RDA'], ['Vitamin B6', '2mg', '143% RDA'], ['Niacin', '18mg', '100% RDA']] },

    { id: 109, name: 'Vitamin D3 2000 IU Effervescent', shortName: 'Vitamin D3', category: 'vitamin-d',
      vitamin: 'vitamin-d', benefit: 'immunity', tags: ['immunity'],
      price: 379, salePrice: null, flavour: 'Orange Cream', tint: '#F0A83E', count: '20 tablets',
      rating: 4.6, reviews: 167, stock: 175, badge: null,
      description: 'Vitamin D3 at 2000 IU with a little K2 and magnesium, both of which the body needs to use it. Made for indoor lives and covered arms.',
      keyIngredients: ['Vitamin D3 2000 IU', 'Vitamin K2-7 25mcg', 'Magnesium 40mg'],
      howToUse: 'One tablet in 200ml water daily, with the meal containing the most fat.',
      nutrition: [['Vitamin D3', '2000 IU', '250% RDA'], ['Vitamin K2-7', '25mcg', '33% RDA']] },

    { id: 110, name: 'Zinc + Vitamin C Immune Effervescent', shortName: 'Zinc + C', category: 'vitamin-c',
      vitamin: 'zinc', benefit: 'immunity', tags: ['immunity', 'bestseller'],
      price: 359, salePrice: 309, flavour: 'Wild Berry', tint: '#B84A6B', count: '20 tablets',
      rating: 4.6, reviews: 221, stock: 190, badge: null,
      description: 'The short-course immune formula: zinc, Vitamin C and elderberry, at doses meant for the days you feel something coming rather than for every day of the year.',
      keyIngredients: ['Zinc gluconate 15mg', 'Vitamin C 500mg', 'Elderberry extract 100mg', 'Selenium 55mcg'],
      howToUse: 'One tablet in 200ml water, up to twice daily for no more than seven days.',
      nutrition: [['Zinc', '15mg', '150% RDA'], ['Vitamin C', '500mg', '1250% RDA'], ['Selenium', '55mcg', '100% RDA']] },

    { id: 111, name: 'Collagen Glow Effervescent', shortName: 'Collagen Glow', category: 'specialty',
      vitamin: 'collagen', benefit: 'skin', tags: ['skin', 'new'],
      price: 799, salePrice: 699, flavour: 'Peach', tint: '#E88C6B', count: '15 tablets',
      rating: 4.4, reviews: 63, stock: 80, badge: 'New',
      description: 'Hydrolysed marine collagen peptides with Vitamin C, hyaluronic acid and biotin. Effervescence solves collagen\'s usual problem, which is a powder that will not dissolve properly in a glass.',
      keyIngredients: ['Marine collagen peptides 2500mg', 'Vitamin C 80mg', 'Hyaluronic acid 40mg', 'Biotin 100mcg'],
      howToUse: 'One tablet in 250ml water daily, ideally at the same time each day.',
      nutrition: [['Collagen peptides', '2500mg', '—'], ['Vitamin C', '80mg', '100% RDA'], ['Biotin', '100mcg', '200% RDA']] },

    { id: 112, name: 'Apple Cider Vinegar Effervescent', shortName: 'ACV', category: 'specialty',
      vitamin: 'acv', benefit: 'digestion', tags: ['digestion'],
      price: 429, salePrice: null, flavour: 'Green Apple', tint: FLAV.apple, count: '20 tablets',
      rating: 4.3, reviews: 118, stock: 130, badge: null,
      description: 'Apple cider vinegar without the burn — 500mg of ACV with the mother, buffered, plus B6 and B12. Taken before a meal.',
      keyIngredients: ['Apple cider vinegar 500mg', 'Vitamin B6 1.3mg', 'Vitamin B12 2.2mcg', 'Chlorophyll 10mg'],
      howToUse: 'One tablet in 250ml water, fifteen minutes before your largest meal.',
      nutrition: [['ACV', '500mg', '—'], ['Vitamin B6', '1.3mg', '93% RDA'], ['Vitamin B12', '2.2mcg', '92% RDA']] },

    { id: 113, name: 'Daily Wellness Tube Trio', shortName: 'Wellness Trio', category: 'combos', pack: 'box',
      vitamin: 'multivitamin', benefit: 'daily', tags: ['featured', 'combos', 'daily'],
      price: 1397, salePrice: 1149, flavour: 'Three flavours', tint: FLAV.mint, count: '3 tubes · 60 tablets',
      rating: 4.7, reviews: 132, stock: 70, badge: 'Save ₹248',
      description: 'The three tubes most people end up buying anyway — Multivitamin, Vitamin C 1000 and Electrolytes — kept together at one price. One in the kitchen, one at the desk, one in the bag.',
      keyIngredients: ['Daily Multivitamin — 20 tablets', 'Vitamin C 1000mg — 20 tablets', 'Electrolyte Hydration — 20 tablets'],
      howToUse: 'One tablet from any tube per day. Multivitamin at breakfast, Vitamin C midday, Electrolytes after activity.',
      nutrition: [['Tubes', '3', '—'], ['Total tablets', '60', '—'], ['Saving', '₹248', '—']] },

    { id: 114, name: 'Sleep & Calm Effervescent', shortName: 'Sleep & Calm', category: 'specialty',
      vitamin: 'magnesium', benefit: 'calm', tags: ['calm', 'new'],
      price: 599, salePrice: 519, flavour: 'Chamomile Honey', tint: '#C9A227', count: '15 tablets',
      rating: 4.5, reviews: 94, stock: 85, badge: 'New',
      description: 'Magnesium glycinate, L-theanine and chamomile in a warm-water tablet. Designed to be the last thing in an evening routine rather than a sedative.',
      keyIngredients: ['Magnesium glycinate 200mg', 'L-Theanine 100mg', 'Chamomile extract 80mg', 'Vitamin B6 1.4mg'],
      howToUse: 'One tablet in 200ml warm water, 45 minutes before bed.',
      nutrition: [['Magnesium', '200mg', '53% RDA'], ['L-Theanine', '100mg', '—'], ['Vitamin B6', '1.4mg', '100% RDA']] }
  ];

  /* ── merchandising taxonomies ───────────────────────────────────────
     Ascofizz sells three ways: by vitamin, by benefit, by format. */
  var BENEFITS = [
    { key: 'immunity',  label: 'Immunity',   note: 'Vitamin C, zinc, D3',      tint: '#F3A712' },
    { key: 'energy',    label: 'Energy',     note: 'B-complex, iron',          tint: '#E8762C' },
    { key: 'skin',      label: 'Skin & Glow', note: 'Glutathione, collagen',   tint: '#D6708A' },
    { key: 'hydration', label: 'Hydration',  note: 'Electrolytes',             tint: '#5FBF6A' },
    { key: 'calm',      label: 'Calm & Sleep', note: 'Magnesium, theanine',    tint: '#6E8FBF' },
    { key: 'bones',     label: 'Bones',      note: 'Calcium, D3, K2',          tint: '#9BB24A' }
  ];

  /* ── PRODUCT CARD ───────────────────────────────────────────────────
     Tube first, flavour and tablet count on the face — the three things a
     shopper compares between two effervescents. */
  function card(p) {
    var price = p.salePrice || p.price, disc = WL.discount(p);
    return '' +
    '<article class="az-card wl-rise" data-product-id="' + p.id + '" style="--tint:' + (p.tint || '#F3A712') + '" onclick="openProduct(' + p.id + ')">' +
      '<div class="az-card-shot">' +
        '<img data-src="' + p._art + '" src="' + p._art + '" alt="' + E(p.name) + '" loading="lazy" decoding="async">' +
        (p.badge ? '<span class="az-card-badge">' + E(p.badge) + '</span>' : '') +
        (disc ? '<span class="az-card-off">' + disc + '% off</span>' : '') +
        '<button class="az-card-wish" onclick="event.stopPropagation();STORE.toggleWishlist(' + p.id + ')" aria-label="Save for later">♡</button>' +
      '</div>' +
      '<div class="az-card-body">' +
        '<p class="az-card-flav"><span class="az-dot"></span>' + E(p.flavour) + '</p>' +
        '<h3 class="az-card-name">' + E(p.name) + '</h3>' +
        '<p class="az-card-count">' + E(p.count) + '</p>' +
        WL.stars(p.rating, p.reviews) +
        '<div class="az-card-foot">' +
          '<p class="az-card-price">' + INR(price) +
            (p.salePrice ? '<s>' + INR(p.price) + '</s>' : '') + '</p>' +
          '<button class="az-card-add" onclick="event.stopPropagation();STORE.addToCart(' + p.id + ')">Add</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* ── PRODUCT PAGE ───────────────────────────────────────────────────
     Writes into the engine's own #productDetail node, so breadcrumb,
     schema, cart and checkout behave exactly as they do on every other
     storefront. */
  function productPage(p) {
    var host = document.getElementById('productDetail');
    if (!host) return '';
    var price = p.salePrice || p.price, disc = WL.discount(p);
    var others = WL.pick(p.benefit, 5).filter(function (x) { return x.id !== p.id; }).slice(0, 4);

    host.innerHTML = '' +
    '<div class="az-pd" style="--tint:' + (p.tint || '#F3A712') + '">' +
      '<div class="az-pd-media">' +
        '<div class="az-pd-shot"><img src="' + p._art + '" alt="' + E(p.name) + '"></div>' +
        '<div class="az-pd-glass">' +
          '<p class="az-pd-glass-h">Dissolves in ~60 seconds</p>' +
          '<p class="az-pd-glass-p">One tablet · 200ml water · no swallowing, no aftertaste</p>' +
        '</div>' +
      '</div>' +
      '<div class="az-pd-info">' +
        '<p class="az-pd-kicker">' + E(p.flavour) + ' · ' + E(p.count) + '</p>' +
        '<h1 class="az-pd-title">' + E(p.name) + '</h1>' +
        WL.stars(p.rating, p.reviews) +
        '<p class="az-pd-desc">' + E(p.description) + '</p>' +
        '<div class="az-pd-buy">' +
          '<div class="az-pd-price">' + INR(price) +
            (p.salePrice ? '<s>' + INR(p.price) + '</s><em>Save ' + disc + '%</em>' : '') + '</div>' +
          '<div class="az-pd-qty">' +
            '<button onclick="AZ.qty(-1)" aria-label="Decrease">−</button>' +
            '<span id="azQty">1</span>' +
            '<button onclick="AZ.qty(1)" aria-label="Increase">+</button>' +
          '</div>' +
          '<button class="az-pd-add" onclick="AZ.add(' + p.id + ')">Add to cart</button>' +
          '<button class="az-pd-buy-now" onclick="AZ.buy(' + p.id + ')">Buy now</button>' +
        '</div>' +
        '<p class="az-pd-stock">' + (p.stock > 0 ? 'In stock · ' + p.stock + ' tubes ready to ship' : 'Back in stock soon') + '</p>' +
        '<div class="az-pd-blocks">' +
          '<section><h2>What is in it</h2><ul class="az-pd-ing">' +
            (p.keyIngredients || []).map(function (i) { return '<li>' + E(i) + '</li>'; }).join('') +
          '</ul></section>' +
          '<section><h2>How to use</h2><p>' + E(p.howToUse) + '</p></section>' +
          '<section><h2>Nutrition per tablet</h2><table class="az-pd-tbl"><tbody>' +
            (p.nutrition || []).map(function (r) {
              return '<tr><th>' + E(r[0]) + '</th><td>' + E(r[1]) + '</td><td>' + E(r[2]) + '</td></tr>';
            }).join('') +
          '</tbody></table></section>' +
        '</div>' +
      '</div>' +
    '</div>';

    var rg = document.getElementById('relatedGrid');
    if (rg) rg.innerHTML = others.map(card).join('');
    WL.observe(host);
    return '';
  }

  window.AZ = {
    q: 1,
    qty: function (d) {
      AZ.q = Math.max(1, AZ.q + d);
      var el = document.getElementById('azQty');
      if (el) el.textContent = AZ.q;
    },
    add: function (id) { STORE.addToCart(id, AZ.q); AZ.q = 1; openSideCart(); },
    buy: function (id) { STORE.addToCart(id, AZ.q); AZ.q = 1; showPage('checkout'); }
  };

  /* ── HEADER ─────────────────────────────────────────────────────────── */
  function header() {
    return '' +
    '<div class="az-ticker"><span>Free delivery on every order · FSSAI approved · Made in Anand, Gujarat</span></div>' +
    '<header class="az-head">' +
      '<div class="az-head-in">' +
        '<button class="az-burger" onclick="AZ.menu()" aria-label="Menu"><span></span><span></span><span></span></button>' +
        '<nav class="az-nav az-nav-l">' +
          '<a onclick="WL.shop(\'all\')">Shop all</a>' +
          '<a onclick="WL.shop(\'vitamin-c\')">Vitamins</a>' +
          '<a onclick="WL.shop(\'mineral\')">Minerals</a>' +
          '<a onclick="WL.shop(\'hydration\')">Hydration</a>' +
        '</nav>' +
        '<a class="az-logo" onclick="showPage(\'home\')">' +
          '<span class="az-logo-mark"><i></i><i></i><i></i></span>' +
          '<span class="az-logo-txt">ASCOFIZZ<em>Effervescent wellness</em></span>' +
        '</a>' +
        '<div class="az-head-right">' +
        '<nav class="az-nav az-nav-r">' +
          '<a onclick="AZ.jump(\'azBenefits\')">By benefit</a>' +
          '<a onclick="AZ.jump(\'azHow\')">How it works</a>' +
          '<a onclick="showPage(\'about\')">About</a>' +
        '</nav>' +
        '<div class="az-head-acts">' +
          '<button onclick="WL.shop(\'all\')" aria-label="Search">⌕</button>' +
          '<button onclick="handleAccountNavClick()" aria-label="Account">◯</button>' +
          '<button class="az-cart" onclick="openSideCart()">Cart<span class="cart-badge" style="display:none">0</span></button>' +
        '</div>' +
        '</div>' +
      '</div>' +
      '<div class="az-drawer" id="azDrawer">' +
        '<a onclick="WL.shop(\'all\');AZ.menu()">Shop all</a>' +
        '<a onclick="WL.shop(\'vitamin-c\');AZ.menu()">Vitamins</a>' +
        '<a onclick="WL.shop(\'mineral\');AZ.menu()">Minerals</a>' +
        '<a onclick="WL.shop(\'hydration\');AZ.menu()">Hydration</a>' +
        '<a onclick="WL.shop(\'combos\');AZ.menu()">Tube bundles</a>' +
        '<a onclick="showPage(\'about\');AZ.menu()">About Ascofizz</a>' +
        '<a onclick="showPage(\'faq\');AZ.menu()">FAQ</a>' +
        '<a onclick="handleAccountNavClick();AZ.menu()">My account</a>' +
      '</div>' +
    '</header>';
  }

  AZ.menu = function () { document.getElementById('azDrawer').classList.toggle('is-open'); };
  AZ.jump = function (id) {
    if (typeof currentPage !== 'undefined' && currentPage !== 'home') showPage('home');
    setTimeout(function () {
      var el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  /* ── HOMEPAGE ───────────────────────────────────────────────────────── */
  function home() {
    var best = WL.pick('bestseller', 4);
    var news = WL.pick('new', 4);

    return '' +
    /* hero — the drop-fizz-drink gesture, told once */
    '<section class="az-hero">' +
      '<div class="az-hero-in">' +
        '<div class="az-hero-copy">' +
          '<p class="az-eyebrow">Effervescent vitamins &amp; minerals</p>' +
          '<h1>Drop. Fizz.<br>Feel good.</h1>' +
          '<p class="az-hero-lede">One tablet, 200ml of water, sixty seconds. A daily supplement routine you will actually keep, because it tastes like a drink instead of feeling like a chore.</p>' +
          '<div class="az-hero-cta">' +
            '<button class="az-btn" onclick="WL.shop(\'all\')">Shop the range</button>' +
            '<button class="az-btn-ghost" onclick="AZ.jump(\'azBenefits\')">Shop by benefit</button>' +
          '</div>' +
          '<ul class="az-hero-proof">' +
            '<li><strong>60 sec</strong>to dissolve</li>' +
            '<li><strong>0 g</strong>added sugar</li>' +
            '<li><strong>FSSAI</strong>approved</li>' +
          '</ul>' +
        '</div>' +
        '<div class="az-hero-art">' +
          '<div class="az-glass">' +
            '<div class="az-glass-water"><span class="az-fizz"></span><span class="az-fizz"></span><span class="az-fizz"></span><span class="az-fizz"></span><span class="az-fizz"></span><span class="az-fizz"></span></div>' +
            '<div class="az-tablet"></div>' +
          '</div>' +
          '<img class="az-hero-tube" src="' + WL.pick('bestseller', 1).map(function (p) { return p._art; })[0] + '" alt="Ascofizz effervescent tube">' +
        '</div>' +
      '</div>' +
    '</section>' +

    /* benefit strip */
    '<section class="az-strip">' +
      '<div class="az-wrap az-strip-in">' +
        '<span>Free delivery, no minimum</span><span>Dissolves in 60 seconds</span>' +
        '<span>No sugar, no swallowing</span><span>Lab tested, batch coded</span>' +
      '</div>' +
    '</section>' +

    /* best sellers */
    '<section class="az-sec">' +
      '<div class="az-wrap">' +
        '<div class="az-sec-head wl-rise">' +
          '<div><p class="az-eyebrow">Most reordered</p><h2>Best sellers</h2></div>' +
          '<button class="az-link" onclick="WL.shop(\'bestsellers\')">See all →</button>' +
        '</div>' +
        '<div class="az-grid">' + best.map(card).join('') + '</div>' +
      '</div>' +
    '</section>' +

    /* shop by benefit */
    '<section class="az-sec az-sec-tint" id="azBenefits">' +
      '<div class="az-wrap">' +
        '<div class="az-sec-head wl-rise"><div><p class="az-eyebrow">Start with the goal</p><h2>Shop by benefit</h2></div></div>' +
        '<div class="az-benefits">' +
          BENEFITS.map(function (b) {
            var n = WL.pick(b.key).length;
            return '<button class="az-benefit wl-rise" style="--tint:' + b.tint + '" onclick="WL.shop(\'' + b.key + '\')">' +
              '<span class="az-benefit-ring"></span>' +
              '<strong>' + E(b.label) + '</strong><em>' + E(b.note) + '</em>' +
              '<span class="az-benefit-n">' + WL.count(n, 'product') + '</span></button>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>' +

    /* how effervescence works */
    '<section class="az-sec" id="azHow">' +
      '<div class="az-wrap">' +
        '<div class="az-sec-head wl-rise"><div><p class="az-eyebrow">The format</p><h2>How effervescence works</h2></div></div>' +
        '<ol class="az-how">' +
          '<li class="wl-rise"><span class="az-how-n">01</span><h3>The tablet meets water</h3><p>Citric acid and bicarbonate react the moment they dissolve. The fizz you see is carbon dioxide leaving the glass — the nutrients stay behind, already in solution.</p></li>' +
          '<li class="wl-rise"><span class="az-how-n">02</span><h3>Nothing has to break down</h3><p>A swallowed tablet has to disintegrate in the stomach first. An effervescent arrives already dissolved, so absorption starts sooner and sits lighter.</p></li>' +
          '<li class="wl-rise"><span class="az-how-n">03</span><h3>You drink 200ml of water with it</h3><p>The format carries its own hydration. That is the quiet reason people stick with it — the routine is a glass of water, not a pill.</p></li>' +
        '</ol>' +
      '</div>' +
    '</section>' +

    /* format comparison */
    '<section class="az-sec az-sec-tint">' +
      '<div class="az-wrap az-narrow">' +
        '<div class="az-sec-head wl-rise"><div><p class="az-eyebrow">Honest comparison</p><h2>Effervescent, tablet or gummy?</h2></div></div>' +
        '<table class="az-compare wl-rise">' +
          '<thead><tr><th></th><th class="is-on">Effervescent</th><th>Swallowed tablet</th><th>Gummy</th></tr></thead>' +
          '<tbody>' +
            '<tr><th>Dose per serving</th><td class="is-on">Full strength</td><td>Full strength</td><td>Usually lower</td></tr>' +
            '<tr><th>Added sugar</th><td class="is-on">None</td><td>None</td><td>2–4g typical</td></tr>' +
            '<tr><th>Easy to swallow</th><td class="is-on">Nothing to swallow</td><td>Can be difficult</td><td>Easy</td></tr>' +
            '<tr><th>Hydrates</th><td class="is-on">200ml per serve</td><td>No</td><td>No</td></tr>' +
            '<tr><th>Travels well</th><td class="is-on">Tube, no spills</td><td>Yes</td><td>Melts in heat</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>' +

    /* new arrivals */
    '<section class="az-sec">' +
      '<div class="az-wrap">' +
        '<div class="az-sec-head wl-rise">' +
          '<div><p class="az-eyebrow">Just added</p><h2>New tubes</h2></div>' +
          '<button class="az-link" onclick="WL.shop(\'new\')">See all →</button>' +
        '</div>' +
        '<div class="az-grid">' + news.map(card).join('') + '</div>' +
      '</div>' +
    '</section>' +

    /* ingredient highlights */
    '<section class="az-sec az-sec-tint">' +
      '<div class="az-wrap">' +
        '<div class="az-sec-head wl-rise"><div><p class="az-eyebrow">Inside the tube</p><h2>Ingredients we chose on purpose</h2></div></div>' +
        '<div class="az-ings">' +
          [['Iron bisglycinate', 'Chosen over sulphate because it is the form that does not bring constipation and a metallic aftertaste.'],
           ['Magnesium glycinate', 'Gentler on the gut than oxide, and the reason the magnesium tube works as an evening routine.'],
           ['Vitamin K2-7', 'Added wherever calcium or D3 appears — it directs calcium to bone rather than soft tissue.'],
           ['Reduced L-glutathione', 'The active form. Paired with Vitamin C, which keeps it from oxidising before it is useful.']].map(function (i) {
            return '<article class="az-ing wl-rise"><h3>' + E(i[0]) + '</h3><p>' + E(i[1]) + '</p></article>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>' +

    /* reviews */
    '<section class="az-sec">' +
      '<div class="az-wrap">' +
        '<div class="az-sec-head wl-rise"><div><p class="az-eyebrow">4.7 average · 2,100+ reviews</p><h2>What customers say</h2></div></div>' +
        '<div class="az-revs">' +
          [['Priya M.', 'Electrolyte Hydration', 'I bought these for the gym and now the whole family drinks them in summer. The lemon-lime one does not taste like salt water, which was my worry.'],
           ['Rahul K.', 'Vitamin C 1000mg', 'Been taking Vitamin C tablets for years and always felt it on an empty stomach. This one I can take with just water at 7am and it is fine.'],
           ['Ananya S.', 'Daily Multivitamin', 'The reason I actually keep up with it is that it feels like a drink. Three months in and I have not skipped a week.']].map(function (r) {
            return '<figure class="az-rev wl-rise"><div class="az-rev-stars">★★★★★</div>' +
              '<blockquote>' + E(r[2]) + '</blockquote>' +
              '<figcaption><strong>' + E(r[0]) + '</strong><span>' + E(r[1]) + '</span></figcaption></figure>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>' +

    /* education */
    '<section class="az-sec az-sec-tint">' +
      '<div class="az-wrap">' +
        '<div class="az-sec-head wl-rise"><div><p class="az-eyebrow">Wellness reading</p><h2>Learn before you buy</h2></div></div>' +
        '<div class="az-learn">' +
          [['How much Vitamin C is actually useful?', 'Above a point the body stops absorbing more. Here is where that point sits and why 1000mg is still a sensible dose.', '4 min read'],
           ['Electrolytes: who genuinely needs them', 'Not everyone, not every day. A straight answer about sweat rate, climate and when plain water is enough.', '6 min read'],
           ['Reading a supplement label without the marketing', 'RDA percentages, ingredient forms, and the three lines on a label that tell you the most.', '5 min read']].map(function (a) {
            return '<article class="az-learn-c wl-rise"><p class="az-learn-t">' + E(a[2]) + '</p><h3>' + E(a[0]) + '</h3><p>' + E(a[1]) + '</p><span class="az-link">Read →</span></article>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  /* ── SHOP INTRO + FOOTER ────────────────────────────────────────────── */
  function shopIntro() {
    return '<div class="az-shop-intro">' +
      '<p class="az-eyebrow">The full range</p>' +
      '<h1>Every tube we make</h1>' +
      '<p>Filter by vitamin, mineral, benefit or format. Every product dissolves in about sixty seconds and ships free.</p>' +
    '</div>';
  }

  function footer() {
    return '<div class="az-foot">' +
      '<div class="az-wrap az-foot-in">' +
        '<div class="az-foot-brand">' +
          '<span class="az-logo-mark"><i></i><i></i><i></i></span>' +
          '<p class="az-foot-name">ASCOFIZZ</p>' +
          '<p class="az-foot-tag">Effervescent vitamins and minerals for everyday wellness. FSSAI approved, lab tested, made in Anand, Gujarat.</p>' +
          '<div class="az-foot-nl"><input type="email" placeholder="Email address" aria-label="Email address"><button onclick="showToast(\'Thanks — you are on the list.\')">Join</button></div>' +
        '</div>' +
        '<div class="az-foot-cols">' +
          '<div><h4>Shop</h4>' +
            '<a onclick="WL.shop(\'all\')">All products</a><a onclick="WL.shop(\'vitamin-c\')">Vitamin C</a>' +
            '<a onclick="WL.shop(\'mineral\')">Minerals</a><a onclick="WL.shop(\'hydration\')">Hydration</a>' +
            '<a onclick="WL.shop(\'combos\')">Tube bundles</a></div>' +
          '<div><h4>Benefit</h4>' +
            BENEFITS.slice(0, 5).map(function (b) { return '<a onclick="WL.shop(\'' + b.key + '\')">' + E(b.label) + '</a>'; }).join('') +
          '</div>' +
          '<div><h4>Company</h4>' +
            '<a onclick="showPage(\'about\')">About</a><a onclick="showPage(\'contact\')">Contact</a>' +
            '<a onclick="showPage(\'faq\')">FAQ</a><a onclick="showPage(\'blog\')">Journal</a></div>' +
          '<div><h4>Help</h4>' +
            '<a onclick="showPage(\'shipping\')">Shipping</a><a onclick="showPage(\'refund\')">Returns</a>' +
            '<a onclick="showPage(\'privacy\')">Privacy</a><a onclick="showPage(\'terms\')">Terms</a></div>' +
        '</div>' +
      '</div>' +
      '<div class="az-wrap az-foot-legal">' +
        '<p>© ' + new Date().getFullYear() + ' Ascofizz. A white-label storefront demo — template 01 of six.</p>' +
        '<p>Not intended to diagnose, treat, cure or prevent any disease.</p>' +
      '</div>' +
    '</div>';
  }

  var ICON = function (d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  };

  WL.define({
    slug: 'ascofizz',
    mark: { bg: '#12503A', fg: '#FFFFFF', dot: '#F3A712', letter: 'A', round: 24, font: 'Helvetica,Arial,sans-serif', weight: 800 },
    name: 'Ascofizz',
    tagline: 'Effervescent wellness',
    title: 'Ascofizz — Effervescent Vitamins, Minerals & Electrolytes',
    catalog: CATALOG,
    packshot: art,
    card: card,
    productPage: productPage,
    header: header,
    home: home,
    footer: footer,
    shopIntro: shopIntro,
    categories: [
      { key: 'all', label: 'All tubes' },
      { key: 'bestsellers', label: 'Best sellers' },
      { key: 'new', label: 'New' },
      { key: 'vitamin-c', label: 'Vitamin C' },
      { key: 'multivitamin', label: 'Multivitamin' },
      { key: 'mineral', label: 'Minerals' },
      { key: 'vitamin-b', label: 'B vitamins' },
      { key: 'vitamin-d', label: 'Vitamin D' },
      { key: 'hydration', label: 'Hydration' },
      { key: 'specialty', label: 'Specialty' },
      { key: 'combos', label: 'Bundles' }
    ],
    bottomNav: [
      { page: 'home', label: 'Home', icon: ICON('<path d="M3 10.4 12 3.5l9 6.9"/><path d="M5.4 9.2V19a1.4 1.4 0 0 0 1.4 1.4h11.8A1.4 1.4 0 0 0 18.6 19V9.2"/>') },
      { page: 'shop', label: 'Tubes', icon: ICON('<rect x="8" y="3" width="8" height="18" rx="3"/><path d="M8 8h8"/>') },
      { page: 'wishlist', label: 'Saved', icon: ICON('<path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z"/>') },
      { page: 'cart', label: 'Cart', icon: ICON('<path d="M3 4.5h2.1l2.2 10.2h9.3L20 8.1H6.2"/><circle cx="9.4" cy="19.4" r="1.4"/><circle cx="16.6" cy="19.4" r="1.4"/>'), action: "openSideCart();setAppNav('cart')" },
      { page: 'account', label: 'Account', icon: ICON('<circle cx="12" cy="8.4" r="3.6"/><path d="M4.9 20.2a7.4 7.4 0 0 1 14.2 0"/>'), action: "handleAccountNavClick();setAppNav('account')" }
    ]
  });
})();
