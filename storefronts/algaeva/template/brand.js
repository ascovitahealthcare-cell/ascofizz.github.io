/* ═══════════════════════════════════════════════════════════════════════
   TEMPLATE 04 · ALGAEVA — SPIRULINA & SUPERFOODS
   Ingredient-first. The customer shops by format (tablets, powder,
   capsules, blends) and by the plant itself, and every product page opens
   on where the ingredient was grown rather than on a price.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var E = WL.esc, INR = WL.inr;

  function art(p) {
    return WL.pack({
      shape: p.pack || 'pouch',
      bg: '#F6F3E9',
      body: p.tint || '#2E5E42',
      cap: '#22432F',
      label: '#FBF9F1',
      accent: '#C8B274',
      ink: '#FBF9F1',
      font: 'Lora, Georgia, serif',
      brand: 'ALGAEVA',
      name: p.shortName || p.name,
      sub: p.format,
      meta: p.size
    });
  }

  /* ── PORTFOLIO ──────────────────────────────────────────────────── */
  var CATALOG = [
    { id: 401, name: 'Organic Spirulina Tablets 500mg', shortName: 'Spirulina Tablets', category: 'spirulina',
      format: 'tablets', plant: 'spirulina', tags: ['featured', 'bestseller', 'spirulina'],
      price: 890, salePrice: 749, size: '250 tablets', tint: '#2E5E42',
      rating: 4.8, reviews: 736, stock: 240, badge: 'Best seller',
      source: 'Open ponds, Coimbatore · Tamil Nadu',
      description: 'Pressed from a single harvest with nothing added — no binders, no fillers, no flow agents. Just spirulina, dried below 45°C so the phycocyanin survives the process, and pressed into 500mg tablets.',
      keyIngredients: ['Organic Arthrospira platensis 500mg'],
      howToUse: 'Six tablets daily with water, ideally before a meal. Start with two for the first week.',
      nutrition: [['Protein', '60–65%'], ['Phycocyanin', '15%'], ['Iron', '28mg/100g'], ['Vitamin B12 analogue', '160mcg/100g']] },

    { id: 402, name: 'Spirulina Powder — Single Harvest', shortName: 'Spirulina Powder', category: 'spirulina',
      format: 'powder', plant: 'spirulina', tags: ['featured', 'bestseller', 'spirulina'],
      price: 990, salePrice: null, size: '250 g', tint: '#27563C',
      rating: 4.7, reviews: 512, stock: 180,
      source: 'Open ponds, Coimbatore · Tamil Nadu',
      description: 'The same harvest as the tablets, left as powder. Deep blue-green, faintly marine, and best hidden in something with a strong flavour of its own until you are used to it.',
      keyIngredients: ['Organic Arthrospira platensis 100%'],
      howToUse: 'One teaspoon (3g) in juice or a smoothie, once daily. It will turn anything it touches green.',
      nutrition: [['Protein', '60–65%'], ['Phycocyanin', '15%'], ['Chlorophyll', '1.1%'], ['Beta-carotene', '140mg/100g']] },

    { id: 403, name: 'Spirulina Capsules 500mg', shortName: 'Spirulina Capsules', category: 'spirulina',
      format: 'capsules', plant: 'spirulina', tags: ['spirulina'],
      price: 950, salePrice: null, size: '120 capsules', tint: '#33684A', pack: 'bottle',
      rating: 4.6, reviews: 298, stock: 160,
      source: 'Open ponds, Coimbatore · Tamil Nadu',
      description: 'For anyone who cannot get past the taste. Vegetable cellulose capsules, no gelatin, same single-harvest spirulina inside.',
      keyIngredients: ['Organic Arthrospira platensis 500mg', 'Vegetable cellulose capsule'],
      howToUse: 'Six capsules daily with water.',
      nutrition: [['Protein', '60–65%'], ['Phycocyanin', '15%'], ['Capsule', 'Vegetable cellulose'], ['Servings', '20 days']] },

    { id: 404, name: 'Chlorella Tablets — Cracked Cell Wall', shortName: 'Chlorella Tablets', category: 'chlorella',
      format: 'tablets', plant: 'chlorella', tags: ['featured', 'chlorella', 'bestseller'],
      price: 1090, salePrice: 949, size: '250 tablets', tint: '#3A7A46',
      rating: 4.7, reviews: 421, stock: 150,
      source: 'Closed photobioreactors · Gujarat',
      description: 'Chlorella has a cellulose wall the human gut cannot open, so it is milled mechanically before pressing. Uncracked chlorella passes straight through — the milling is the whole product.',
      keyIngredients: ['Organic Chlorella vulgaris 500mg (cracked cell wall)'],
      howToUse: 'Six tablets daily with water, away from mineral supplements.',
      nutrition: [['Protein', '55–60%'], ['Chlorophyll', '2.8%'], ['Iron', '190mg/100g'], ['CGF', 'Present']] },

    { id: 405, name: 'Daily Greens Blend', shortName: 'Daily Greens', category: 'blends',
      format: 'powder', plant: 'greens', tags: ['featured', 'bestseller', 'blends'],
      price: 1690, salePrice: 1449, size: '300 g · 30 servings', tint: '#4A8A4E',
      rating: 4.6, reviews: 604, stock: 200, badge: 'Best seller',
      description: 'Eleven greens with spirulina and chlorella at the front of the list rather than the back, plus wheatgrass, moringa and alfalfa. Mint and lemon make it drinkable in water alone.',
      keyIngredients: ['Spirulina 2g', 'Chlorella 1.5g', 'Wheatgrass 1g', 'Moringa 1g', 'Alfalfa 500mg', 'Barley grass 500mg', 'Peppermint', 'Lemon'],
      howToUse: 'One scoop (10g) in 250ml water each morning.',
      nutrition: [['Greens', '11'], ['Serving', '10 g'], ['Servings', '30'], ['Added sugar', 'None']] },

    { id: 406, name: 'Moringa Leaf Powder', shortName: 'Moringa Powder', category: 'superfoods',
      format: 'powder', plant: 'moringa', tags: ['superfoods'],
      price: 690, salePrice: null, size: '200 g', tint: '#6B9A3F',
      rating: 4.5, reviews: 287, stock: 220,
      source: 'Shade-dried leaf · Andhra Pradesh',
      description: 'Shade-dried rather than sun-dried, which is the difference between a bright green powder and a khaki one. Leaf only — no stem, no seed pod.',
      keyIngredients: ['Organic Moringa oleifera leaf 100%'],
      howToUse: 'One teaspoon in warm water, dal or a smoothie, once daily.',
      nutrition: [['Protein', '27%'], ['Calcium', '2000mg/100g'], ['Iron', '28mg/100g'], ['Vitamin A', 'High']] },

    { id: 407, name: 'Wheatgrass Tablets', shortName: 'Wheatgrass Tablets', category: 'superfoods',
      format: 'tablets', plant: 'wheatgrass', tags: ['superfoods'],
      price: 790, salePrice: null, size: '200 tablets', tint: '#78A83E',
      rating: 4.4, reviews: 176, stock: 140,
      source: 'Young shoots, cut at day 9 · Maharashtra',
      description: 'Cut at nine days, when chlorophyll is at its highest and the grass has not yet turned fibrous. Freeze-dried within an hour of cutting.',
      keyIngredients: ['Organic wheatgrass 500mg'],
      howToUse: 'Five tablets daily with water.',
      nutrition: [['Chlorophyll', 'High'], ['Protein', '24%'], ['Tablets', '200'], ['Harvest', 'Day 9']] },

    { id: 408, name: 'Spirulina + B12 & D3 Tablets', shortName: 'Spirulina B12+D3', category: 'spirulina',
      format: 'tablets', plant: 'spirulina', tags: ['spirulina', 'new'],
      price: 1190, salePrice: null, size: '180 tablets', tint: '#2B6350',
      rating: 4.6, reviews: 214, stock: 130, badge: 'New',
      description: 'Spirulina carries a B12 analogue the body cannot use, which is the honest caveat on every spirulina label. This one adds real methylcobalamin and D3 from lichen — the two a plant-based diet most often lacks.',
      keyIngredients: ['Organic spirulina 500mg', 'Methylcobalamin (B12) 5mcg', 'Vitamin D3 from lichen 800 IU'],
      howToUse: 'Six tablets daily with water.',
      nutrition: [['Spirulina', '3g/day'], ['Vitamin B12', '5mcg'], ['Vitamin D3', '800 IU'], ['Source', 'Lichen, vegan']] },

    { id: 409, name: 'Antioxidant Berry & Greens Blend', shortName: 'Berry Greens', category: 'blends',
      format: 'powder', plant: 'greens', tags: ['blends', 'new'],
      price: 1790, salePrice: 1590, size: '300 g · 30 servings', tint: '#7A4A6B',
      rating: 4.5, reviews: 143, stock: 110, badge: 'New',
      description: 'Greens with acai, amla and pomegranate for people who want the nutrition without the pond. Reads red, tastes of berry, still a third spirulina by weight.',
      keyIngredients: ['Spirulina 2g', 'Acai 800mg', 'Amla 1g', 'Pomegranate 800mg', 'Beetroot 1g', 'Chlorella 800mg'],
      howToUse: 'One scoop (10g) in 250ml water or juice, daily.',
      nutrition: [['Serving', '10 g'], ['Servings', '30'], ['ORAC', 'High'], ['Added sugar', 'None']] },

    { id: 410, name: 'Plant Protein — Spirulina & Pea', shortName: 'Plant Protein', category: 'blends',
      format: 'powder', plant: 'greens', tags: ['blends'],
      price: 2190, salePrice: null, size: '1 kg · 33 servings', tint: '#3E7F58',
      rating: 4.4, reviews: 189, stock: 90,
      description: 'Pea protein with 3g of spirulina folded in, which covers the amino acids pea is short of and adds the iron a plant-based diet usually misses.',
      keyIngredients: ['Pea protein isolate 24g', 'Spirulina 3g', 'Pumpkin seed protein 3g', 'Cacao'],
      howToUse: 'One scoop in 300ml water or plant milk after training or with breakfast.',
      nutrition: [['Protein', '27 g'], ['Iron', '35% RDA'], ['Servings', '33'], ['Sweetener', 'None']] },

    { id: 411, name: 'Chlorella + Coriander Capsules', shortName: 'Chlorella Complex', category: 'chlorella',
      format: 'capsules', plant: 'chlorella', tags: ['chlorella'], pack: 'bottle',
      price: 1290, salePrice: null, size: '120 capsules', tint: '#35714A',
      rating: 4.3, reviews: 118, stock: 95,
      source: 'Closed photobioreactors · Gujarat',
      description: 'Cracked-wall chlorella with coriander leaf extract, a pairing from the traditional literature. We make no clinical claim for it; the ingredient list is on the front and you can judge it yourself.',
      keyIngredients: ['Cracked-wall chlorella 400mg', 'Coriander leaf extract 100mg'],
      howToUse: 'Four capsules daily with water.',
      nutrition: [['Chlorella', '1.6g/day'], ['Coriander', '400mg/day'], ['Capsules', '120'], ['Capsule', 'Vegetable']] },

    { id: 412, name: 'Barley Grass Powder', shortName: 'Barley Grass', category: 'superfoods',
      format: 'powder', plant: 'barley', tags: ['superfoods'],
      price: 740, salePrice: null, size: '200 g', tint: '#89A83B',
      rating: 4.3, reviews: 96, stock: 120,
      source: 'Young shoots · Rajasthan',
      description: 'Milder than wheatgrass and easier to start with. Cut young, freeze-dried, nothing else in the packet.',
      keyIngredients: ['Organic barley grass 100%'],
      howToUse: 'One teaspoon in water or juice daily.',
      nutrition: [['Chlorophyll', 'High'], ['Fibre', '18%'], ['Potassium', 'High'], ['Servings', '60']] },

    { id: 413, name: 'The Green Ritual Kit', shortName: 'Green Ritual Kit', category: 'blends', pack: 'box',
      format: 'blends', plant: 'greens', tags: ['featured', 'blends'],
      price: 2670, salePrice: 2290, size: '3 products · 1 month', tint: '#2E5E42',
      rating: 4.7, reviews: 108, stock: 50, badge: 'Save ₹380',
      description: 'Spirulina Tablets, Daily Greens and Moringa Powder — the morning routine most customers assemble for themselves by their third order.',
      keyIngredients: ['Organic Spirulina Tablets — 250', 'Daily Greens Blend — 300g', 'Moringa Leaf Powder — 200g'],
      howToUse: 'Greens in water on waking, spirulina before lunch, moringa with dinner.',
      nutrition: [['Products', '3'], ['Duration', '1 month'], ['Saving', '₹380'], ['Format', 'Mixed']] },

    { id: 414, name: 'Sea Moss & Spirulina Capsules', shortName: 'Sea Moss Complex', category: 'superfoods',
      format: 'capsules', plant: 'seamoss', tags: ['superfoods', 'new'], pack: 'bottle',
      price: 1390, salePrice: 1190, size: '90 capsules', tint: '#2F6E77',
      rating: 4.3, reviews: 87, stock: 85, badge: 'New',
      description: 'Wildcrafted Irish sea moss with spirulina and burdock. Sea moss is a genuine source of iodine, which is worth knowing before you take it alongside another iodine supplement.',
      keyIngredients: ['Irish sea moss 500mg', 'Spirulina 200mg', 'Bladderwrack 100mg', 'Burdock root 100mg'],
      howToUse: 'Three capsules daily. Check your total iodine intake if you take other supplements.',
      nutrition: [['Sea moss', '1.5g/day'], ['Iodine', 'Naturally occurring'], ['Capsules', '90'], ['Harvest', 'Wildcrafted']] }
  ];

  var FORMATS = [
    { key: 'tablets',  label: 'Tablets',  note: 'Pressed, nothing added' },
    { key: 'powder',   label: 'Powder',   note: 'Loose, for drinks and food' },
    { key: 'capsules', label: 'Capsules', note: 'Vegetable cellulose, no taste' },
    { key: 'blends',   label: 'Blends',   note: 'Multi-ingredient formulas' }
  ];

  /* ── PRODUCT CARD ───────────────────────────────────────────────── */
  function card(p) {
    var price = p.salePrice || p.price;
    return '' +
    '<article class="al-card wl-rise" data-product-id="' + p.id + '" style="--tint:' + p.tint + '" onclick="openProduct(' + p.id + ')">' +
      '<div class="al-card-shot">' +
        '<img data-src="' + p._art + '" src="' + p._art + '" alt="' + E(p.name) + '" loading="lazy" decoding="async">' +
        (p.badge ? '<span class="al-card-badge">' + E(p.badge) + '</span>' : '') +
      '</div>' +
      '<div class="al-card-body">' +
        '<p class="al-card-fmt">' + E(p.format) + '</p>' +
        '<h3 class="al-card-name">' + E(p.name) + '</h3>' +
        '<p class="al-card-size">' + E(p.size) + '</p>' +
        (p.nutrition && p.nutrition[0] ? '<p class="al-card-nut"><span>' + E(p.nutrition[0][0]) + '</span><strong>' + E(p.nutrition[0][1]) + '</strong></p>' : '') +
        WL.stars(p.rating, p.reviews) +
        '<div class="al-card-foot">' +
          '<span class="al-card-price">' + INR(price) + (p.salePrice ? '<s>' + INR(p.price) + '</s>' : '') + '</span>' +
          '<button class="al-card-add" onclick="event.stopPropagation();STORE.addToCart(' + p.id + ')">Add to basket</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* ── PRODUCT PAGE — ingredient first ────────────────────────────── */
  function productPage(p) {
    var host = document.getElementById('productDetail');
    if (!host) return '';
    var price = p.salePrice || p.price;

    host.innerHTML = '' +
    '<div class="al-pd" style="--tint:' + p.tint + '">' +
      '<div class="al-pd-media">' +
        '<img src="' + p._art + '" alt="' + E(p.name) + '">' +
        (p.source ? '<p class="al-pd-source"><span>Grown at</span>' + E(p.source) + '</p>' : '') +
      '</div>' +
      '<div class="al-pd-body">' +
        '<p class="al-pd-fmt">' + E(p.format) + ' · ' + E(p.size) + '</p>' +
        '<h1>' + E(p.name) + '</h1>' +
        WL.stars(p.rating, p.reviews) +
        '<p class="al-pd-desc">' + E(p.description) + '</p>' +
        '<table class="al-pd-nut"><tbody>' + (p.nutrition || []).map(function (n) {
          return '<tr><th>' + E(n[0]) + '</th><td>' + E(n[1]) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="al-pd-buy">' +
          '<span class="al-pd-price">' + INR(price) + (p.salePrice ? '<s>' + INR(p.price) + '</s>' : '') + '</span>' +
          '<button class="al-pd-add" onclick="STORE.addToCart(' + p.id + ');openSideCart()">Add to basket</button>' +
        '</div>' +
        '<p class="al-pd-stock">' + (p.stock > 0 ? 'In stock · packed to order' : 'Next harvest coming soon') + '</p>' +
      '</div>' +
    '</div>' +
    '<div class="al-pd-detail">' +
      '<section><h2>Ingredients</h2><ul>' + (p.keyIngredients || []).map(function (i) { return '<li>' + E(i) + '</li>'; }).join('') + '</ul></section>' +
      '<section><h2>How to use</h2><p>' + E(p.howToUse) + '</p></section>' +
      '<section><h2>Quality</h2><p>Every batch is tested for heavy metals, microcystins and microbiology before it is packed, and the certificate is filed against the batch code printed on your pouch.</p></section>' +
      '<section><h2>Questions</h2>' +
        '<details><summary>Will it stain or taste strong?</summary><p>Spirulina and chlorella are both strongly flavoured and will colour anything they are mixed into. If that is a problem, the capsules are the same material with none of the taste.</p></details>' +
        '<details><summary>Can I take this with other supplements?</summary><p>Yes, with one caution: chlorella binds minerals, so take it a couple of hours apart from an iron or zinc supplement.</p></details>' +
        '<details><summary>Is the B12 in spirulina usable?</summary><p>No. Spirulina contains a B12 analogue the body cannot use. That is why the Spirulina + B12 & D3 product exists.</p></details>' +
      '</section>' +
    '</div>';

    var rg = document.getElementById('relatedGrid');
    if (rg) rg.innerHTML = WL.all().filter(function (x) { return x.format === p.format && x.id !== p.id; }).slice(0, 3).map(card).join('');
    WL.observe(host);
    return '';
  }

  /* ── HEADER ─────────────────────────────────────────────────────── */
  function header() {
    return '' +
    '<header class="al-head">' +
      '<div class="al-head-top">' +
        '<div class="al-wrap al-head-in">' +
          '<button class="al-burger" onclick="AL.menu()" aria-label="Menu">☰</button>' +
          '<a class="al-logo" onclick="showPage(\'home\')">' +
            '<span class="al-logo-leaf"></span>ALGAEVA' +
          '</a>' +
          '<div class="al-head-acts">' +
            '<button onclick="WL.shop(\'all\')">Search</button>' +
            '<button onclick="handleAccountNavClick()">Account</button>' +
            '<button class="al-basket" onclick="openSideCart()">Basket <span class="cart-badge" style="display:none">0</span></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<nav class="al-nav">' +
        '<a onclick="WL.shop(\'all\')">SHOP</a>' +
        '<a onclick="WL.shop(\'spirulina\')">SPIRULINA</a>' +
        '<a onclick="WL.shop(\'superfoods\')">SUPERFOODS</a>' +
        '<a onclick="AL.jump(\'alScience\')">INGREDIENTS</a>' +
        '<a onclick="AL.jump(\'alSource\')">OUR SOURCE</a>' +
        '<a onclick="showPage(\'blog\')">JOURNAL</a>' +
      '</nav>' +
      '<div class="al-drawer" id="alDrawer">' +
        '<a onclick="WL.shop(\'all\');AL.menu()">Shop all</a>' +
        '<a onclick="WL.shop(\'spirulina\');AL.menu()">Spirulina</a>' +
        '<a onclick="WL.shop(\'chlorella\');AL.menu()">Chlorella</a>' +
        '<a onclick="WL.shop(\'superfoods\');AL.menu()">Superfoods</a>' +
        '<a onclick="WL.shop(\'blends\');AL.menu()">Blends</a>' +
        '<a onclick="AL.jump(\'alSource\');AL.menu()">Our source</a>' +
        '<a onclick="handleAccountNavClick();AL.menu()">Account</a>' +
      '</div>' +
    '</header>';
  }

  window.AL = {
    menu: function () { document.getElementById('alDrawer').classList.toggle('is-open'); },
    jump: function (id) {
      if (typeof currentPage !== 'undefined' && currentPage !== 'home') showPage('home');
      setTimeout(function () {
        var el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    },
    /* "Blends" is a category rather than a physical format — a blend ships
       as powder. Everything else matches on the format itself. */
    match: function (key) {
      return WL.all().filter(function (p) {
        return key === 'blends' ? p.category === 'blends' : p.format === key;
      });
    },
    format: function (btn, key) {
      document.querySelectorAll('.al-fmt').forEach(function (b) { b.classList.remove('is-on'); });
      if (btn) btn.classList.add('is-on');
      var host = document.getElementById('alFormatGrid');
      if (!host) return;
      host.innerHTML = AL.match(key).slice(0, 4).map(card).join('');
      WL.observe(host);
    }
  };

  /* ── HOMEPAGE ───────────────────────────────────────────────────── */
  function home() {
    return '' +
    '<section class="al-hero">' +
      '<div class="al-wrap">' +
        '<p class="al-hero-eye">Spirulina · Chlorella · Green superfoods</p>' +
        '<h1>Power from<br>the green.</h1>' +
        '<p class="al-hero-lede">Single-harvest spirulina grown in open ponds in Tamil Nadu, dried below 45°C and pressed with nothing added. One ingredient on the label, and the pond it came from printed on the pouch.</p>' +
        '<div class="al-hero-cta">' +
          '<button class="al-btn" onclick="WL.shop(\'spirulina\')">Shop spirulina</button>' +
          '<button class="al-btn-out" onclick="AL.jump(\'alFormats\')">Shop by format</button>' +
        '</div>' +
        '<div class="al-hero-row">' + WL.pick('bestseller', 3).map(function (p) {
          return '<button class="al-hero-p" onclick="openProduct(' + p.id + ')"><img src="' + p._art + '" alt="">' +
            '<span><strong>' + E(p.shortName || p.name) + '</strong><em>' + E(p.format) + ' · ' + INR(p.salePrice || p.price) + '</em></span></button>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="al-sec">' +
      '<div class="al-wrap">' +
        '<div class="al-sec-head wl-rise"><p class="al-eyebrow">Why spirulina</p><h2>The most nutrient-dense thing we know how to grow.</h2></div>' +
        '<div class="al-facts">' + [
          ['60–65%', 'protein by weight', 'More than any plant food in common use, and a complete amino acid profile — unusual outside animal protein.'],
          ['15%', 'phycocyanin', 'The blue pigment that gives spirulina its colour and most of its antioxidant activity. Heat destroys it, which is why ours is dried cool.'],
          ['28 mg', 'iron per 100g', 'In a form that does not bring the gut side effects of an iron tablet, alongside the vitamin C that helps absorb it.']
        ].map(function (f) {
          return '<article class="al-fact wl-rise"><strong>' + E(f[0]) + '</strong><span>' + E(f[1]) + '</span><p>' + E(f[2]) + '</p></article>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="al-sec al-sec-tint" id="alFormats">' +
      '<div class="al-wrap">' +
        '<div class="al-sec-head wl-rise"><p class="al-eyebrow">Shop by format</p><h2>Same plant, four ways to take it.</h2></div>' +
        '<div class="al-fmts">' + FORMATS.map(function (f, i) {
          return '<button class="al-fmt' + (i === 0 ? ' is-on' : '') + '" onclick="AL.format(this,\'' + f.key + '\')">' +
            '<strong>' + E(f.label) + '</strong><em>' + E(f.note) + '</em>' +
            '<span>' + WL.count(AL.match(f.key).length, 'product') + '</span></button>';
        }).join('') + '</div>' +
        '<div class="al-grid" id="alFormatGrid"></div>' +
      '</div>' +
    '</section>' +

    '<section class="al-sec" id="alScience">' +
      '<div class="al-wrap al-split">' +
        '<div class="wl-rise">' +
          '<p class="al-eyebrow">Ingredient science</p>' +
          '<h2>Two things decide whether green powder is worth taking.</h2>' +
          '<p>The first is drying temperature. Phycocyanin, the pigment carrying most of spirulina\'s antioxidant activity, degrades above about 50°C — so spray-dried spirulina can be a fraction of the colour and the activity of the same harvest dried cool. Ours never goes above 45°C.</p>' +
          '<p>The second is the cell wall. Chlorella\'s is cellulose, and the human gut has no enzyme for it. Uncracked chlorella passes through almost untouched. Cracking it mechanically — not chemically — is most of what the process costs.</p>' +
          '<button class="al-link" onclick="AL.jump(\'alSource\')">See how we grow it →</button>' +
        '</div>' +
        '<table class="al-compare wl-rise">' +
          '<thead><tr><th></th><th>Algaeva</th><th>Commodity</th></tr></thead>' +
          '<tbody>' +
            '<tr><th>Drying</th><td>Below 45°C</td><td>Spray-dried, 150°C+</td></tr>' +
            '<tr><th>Phycocyanin</th><td>15%</td><td>4–8%</td></tr>' +
            '<tr><th>Harvest</th><td>Single, traceable</td><td>Pooled, blended</td></tr>' +
            '<tr><th>Chlorella wall</th><td>Mechanically cracked</td><td>Often uncracked</td></tr>' +
            '<tr><th>Tablet binders</th><td>None</td><td>Usually present</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>' +

    '<section class="al-sec al-sec-deep" id="alSource">' +
      '<div class="al-wrap">' +
        '<div class="al-sec-head wl-rise"><p class="al-eyebrow al-eyebrow-l">Our source</p><h2>From pond to pouch in eleven days.</h2></div>' +
        '<ol class="al-steps">' + [
          ['Grown', 'Open ponds outside Coimbatore, fed with mineral salts and sunlight. Alkalinity is checked twice daily — spirulina thrives at pH 10, where almost nothing else will grow, which is what keeps the ponds clean without chemistry.'],
          ['Harvested', 'Filtered from the pond in the early morning and washed in filtered water. One harvest is kept as one batch and never pooled with another.'],
          ['Dried', 'Low-temperature dried below 45°C over several hours rather than spray-dried in seconds. Slower, more expensive, and the reason the powder is still deep blue-green.'],
          ['Tested & packed', 'Every batch is tested for heavy metals, microcystins and microbiology. The certificate is filed against the batch code printed on your pouch.']
        ].map(function (s, i) {
          return '<li class="wl-rise"><span>' + String(i + 1).padStart(2, '0') + '</span><h3>' + E(s[0]) + '</h3><p>' + E(s[1]) + '</p></li>';
        }).join('') + '</ol>' +
      '</div>' +
    '</section>' +

    '<section class="al-sec al-sec-tint">' +
      '<div class="al-wrap">' +
        '<div class="al-sec-head wl-rise"><p class="al-eyebrow">The daily green ritual</p><h2>Three minutes, once a day.</h2></div>' +
        '<div class="al-ritual">' + [
          ['On waking', 'Daily Greens in 250ml cold water. Cold water, not warm — it mixes better and tastes less of pond.'],
          ['Before lunch', 'Six spirulina tablets with water. Before a meal rather than after, which most people find sits better.'],
          ['With dinner', 'A teaspoon of moringa stirred into dal or soup, where the flavour disappears entirely.']
        ].map(function (r) {
          return '<article class="al-rit wl-rise"><h3>' + E(r[0]) + '</h3><p>' + E(r[1]) + '</p></article>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="al-sec">' +
      '<div class="al-wrap">' +
        '<div class="al-sec-head wl-rise"><p class="al-eyebrow">Reviews</p><h2>4.6 average across 3,400 orders</h2></div>' +
        '<div class="al-revs">' + [
          ['The colour told me everything', 'I had been taking a supermarket spirulina for a year. This one is a completely different colour — properly blue-green instead of grey. I understood the drying temperature thing the moment I opened the pouch.', 'Divya P.'],
          ['Finally a greens powder I finish', 'I have abandoned three tubs of greens powder before this one. The mint is doing a lot of work and I mean that as a compliment.', 'Sanjay T.'],
          ['The B12 honesty sold me', 'Every other spirulina brand implies it is a B12 source. This one says plainly that it is not and sells a version with real B12 in it. That is why I buy here.', 'Fatima R.']
        ].map(function (r) {
          return '<figure class="al-rev wl-rise"><h3>' + E(r[0]) + '</h3><blockquote>' + E(r[1]) + '</blockquote><figcaption>' + E(r[2]) + '</figcaption></figure>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>';
  }

  function shopIntro() {
    return '<div class="al-shop-intro"><p class="al-eyebrow">The range</p><h1>Everything we grow and press</h1>' +
      '<p>Filter by plant or by format. Every batch traceable to one harvest.</p></div>';
  }

  function footer() {
    return '<div class="al-foot">' +
      '<div class="al-wrap">' +
        '<div class="al-foot-top">' +
          '<div><p class="al-foot-logo"><span class="al-logo-leaf"></span>ALGAEVA</p>' +
            '<p class="al-foot-tag">Single-harvest spirulina, cracked-cell chlorella and green superfoods. Grown in India, tested batch by batch, packed with nothing added.</p></div>' +
          '<div class="al-foot-nl"><label>The Journal — growing notes and recipes</label>' +
            '<div><input type="email" placeholder="Email address" aria-label="Email address"><button onclick="showToast(\'Thank you — see you in your inbox.\')">Sign up</button></div></div>' +
        '</div>' +
        '<div class="al-foot-cols">' +
          '<div><h4>Shop</h4><a onclick="WL.shop(\'spirulina\')">Spirulina</a><a onclick="WL.shop(\'chlorella\')">Chlorella</a><a onclick="WL.shop(\'superfoods\')">Superfoods</a><a onclick="WL.shop(\'blends\')">Blends</a></div>' +
          '<div><h4>Format</h4>' + FORMATS.map(function (f) { return '<a onclick="WL.shop(\'' + f.key + '\')">' + E(f.label) + '</a>'; }).join('') + '</div>' +
          '<div><h4>Learn</h4><a onclick="showPage(\'about\')">Our source</a><a onclick="showPage(\'blog\')">Journal</a><a onclick="showPage(\'faq\')">FAQ</a><a onclick="showPage(\'contact\')">Contact</a></div>' +
          '<div><h4>Care</h4><a onclick="showPage(\'shipping\')">Delivery</a><a onclick="showPage(\'refund\')">Returns</a><a onclick="showPage(\'privacy\')">Privacy</a><a onclick="showPage(\'terms\')">Terms</a></div>' +
        '</div>' +
        '<div class="al-foot-legal"><p>© ' + new Date().getFullYear() + ' Algaeva</p><p>White-label storefront demo — template 04 of six</p></div>' +
      '</div>' +
    '</div>';
  }

  var ICON = function (d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  };

  WL.define({
    slug: 'algaeva',
    mark: { bg: '#23523A', fg: '#F8F5EC', letter: 'A', round: 30, font: 'Georgia,serif', weight: 600, size: 54 },
    name: 'Algaeva',
    tagline: 'Power from the green',
    title: 'Algaeva — Spirulina, Chlorella & Green Superfoods',
    catalog: CATALOG,
    packshot: art,
    card: card,
    productPage: productPage,
    header: header,
    home: home,
    footer: footer,
    shopIntro: shopIntro,
    categories: [
      { key: 'all', label: 'All' },
      { key: 'spirulina', label: 'Spirulina' },
      { key: 'chlorella', label: 'Chlorella' },
      { key: 'superfoods', label: 'Superfoods' },
      { key: 'blends', label: 'Blends' },
      { key: 'tablets', label: 'Tablets' },
      { key: 'powder', label: 'Powder' },
      { key: 'capsules', label: 'Capsules' },
      { key: 'bestsellers', label: 'Best sellers' }
    ],
    bottomNav: [
      { page: 'home', label: 'Home', icon: ICON('<path d="M4 10.5 12 4l8 6.5V20H4z"/>') },
      { page: 'shop', label: 'Shop', icon: ICON('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>') },
      { page: 'wishlist', label: 'Saved', icon: ICON('<path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z"/>') },
      { page: 'cart', label: 'Basket', icon: ICON('<path d="M4 8h16l-1.5 11H5.5z"/><path d="M9 8l1.5-4h3L15 8"/>'), action: "openSideCart();setAppNav('cart')" },
      { page: 'account', label: 'Account', icon: ICON('<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'), action: "handleAccountNavClick();setAppNav('account')" }
    ],
    onMount: function () {
      var first = document.querySelector('.al-fmt');
      if (first) AL.format(first, 'tablets');
    }
  });
})();
