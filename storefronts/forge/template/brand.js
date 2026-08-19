/* ═══════════════════════════════════════════════════════════════════════
   TEMPLATE 03 · FORGE — SPORTS & GYM NUTRITION
   Merchandised by performance goal, training stage and stack. The one
   piece of real interaction on the site is the stack builder: pick a slot
   per training phase, see the total, add the whole thing to the same cart
   every other storefront uses.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var E = WL.esc, INR = WL.inr;

  function art(p) {
    return WL.pack({
      shape: p.pack || 'tub',
      bg: '#EFF1F4',
      body: '#1A1D22',
      cap: p.tint || '#FF4A17',
      label: '#22262C',
      accent: p.tint || '#FF4A17',
      ink: '#FFFFFF',
      capInk: '#FFFFFF',
      font: 'Archivo, Arial Black, sans-serif',
      brand: 'FORGE',
      name: p.shortName || p.name,
      sub: p.flavour,
      meta: p.servings ? p.servings + ' SERVINGS' : p.size
    });
  }

  /* ── PORTFOLIO ──────────────────────────────────────────────────── */
  var CATALOG = [
    { id: 301, name: 'Whey Protein Isolate', shortName: 'Whey Isolate', category: 'protein',
      goal: 'muscle', stage: 'post', tags: ['featured', 'bestseller', 'muscle'],
      price: 3990, salePrice: 3490, flavour: 'Belgian Chocolate', size: '2 kg', servings: 60, tint: '#FF4A17',
      rating: 4.8, reviews: 1284, stock: 220, badge: 'No.1',
      description: '27g of protein per scoop from cold-filtered whey isolate, at 90% protein by weight. Filtered rather than heat-treated, so the amino profile survives the process.',
      keyIngredients: ['Whey protein isolate 30g', 'BCAA 6.2g naturally occurring', 'Leucine 2.7g', 'Digestive enzyme blend'],
      howToUse: 'One scoop in 250ml water or milk within an hour of training.',
      specs: [['Protein per serving', '27 g'], ['Carbs', '1.2 g'], ['Sugar', '0.5 g'], ['Servings', '60']] },

    { id: 302, name: 'Plant Protein — Pea & Rice', shortName: 'Plant Protein', category: 'protein',
      goal: 'muscle', stage: 'post', tags: ['featured', 'muscle'],
      price: 3290, salePrice: null, flavour: 'Vanilla Bean', size: '1.8 kg', servings: 54, tint: '#3FA24B',
      rating: 4.5, reviews: 412, stock: 140,
      description: 'Pea and brown rice in a 70:30 ratio, which between them cover the amino acids each one is short of. 24g of protein per serving, no gritty aftertaste.',
      keyIngredients: ['Pea protein isolate', 'Brown rice protein', 'Added L-methionine 500mg', 'Natural vanilla'],
      howToUse: 'One scoop in 300ml water or oat milk after training.',
      specs: [['Protein per serving', '24 g'], ['Carbs', '3 g'], ['Iron', '30% RDA'], ['Servings', '54']] },

    { id: 303, name: 'Pre-Workout — Surge', shortName: 'Surge Pre-Workout', category: 'performance',
      goal: 'energy', stage: 'pre', tags: ['featured', 'bestseller', 'energy'],
      price: 2490, salePrice: 2190, flavour: 'Blue Raspberry', size: '400 g', servings: 40, tint: '#2C6ECB',
      rating: 4.7, reviews: 856, stock: 180, badge: 'Best seller',
      description: 'A fully dosed pre-workout with the amounts printed on the label: 6g citrulline malate, 3.2g beta-alanine, 200mg caffeine. No proprietary blend hiding a light scoop.',
      keyIngredients: ['L-Citrulline malate 6g', 'Beta-alanine 3.2g', 'Caffeine anhydrous 200mg', 'L-Theanine 100mg', 'Betaine 2.5g'],
      howToUse: 'One scoop in 300ml water, 20–30 minutes before training. Assess tolerance with half a scoop first.',
      specs: [['Caffeine', '200 mg'], ['Citrulline', '6 g'], ['Beta-alanine', '3.2 g'], ['Servings', '40']] },

    { id: 304, name: 'Creatine Monohydrate — Micronised', shortName: 'Creatine', category: 'performance',
      goal: 'strength', stage: 'daily', tags: ['featured', 'bestseller', 'strength'],
      price: 1490, salePrice: null, flavour: 'Unflavoured', size: '500 g', servings: 100, tint: '#8C93A0',
      rating: 4.9, reviews: 1620, stock: 300, badge: 'Best seller',
      description: 'Creapure monohydrate, micronised so it stays in suspension instead of sitting at the bottom of the shaker. The most studied sports supplement there is, at the dose the studies used.',
      keyIngredients: ['Creatine monohydrate (Creapure) 5g'],
      howToUse: '5g daily, any time. No loading phase required — saturation takes about three weeks either way.',
      specs: [['Creatine per serving', '5 g'], ['Purity', '99.9%'], ['Servings', '100'], ['Loading needed', 'No']] },

    { id: 305, name: 'EAA + Electrolyte Intra', shortName: 'EAA Intra', category: 'performance',
      goal: 'endurance', stage: 'intra', tags: ['endurance'],
      price: 2190, salePrice: null, flavour: 'Citrus Ice', size: '450 g', servings: 45, tint: '#25B39B',
      rating: 4.6, reviews: 388, stock: 160,
      description: 'All nine essential amino acids plus the electrolytes lost in a long session. Built to be sipped through training rather than taken in one hit.',
      keyIngredients: ['EAA blend 10g', 'Leucine 3.5g', 'Sodium 400mg', 'Potassium 250mg', 'Coconut water powder 1g'],
      howToUse: 'One scoop in 700ml water, sipped through your session.',
      specs: [['EAA', '10 g'], ['Sodium', '400 mg'], ['Calories', '5 kcal'], ['Servings', '45']] },

    { id: 306, name: 'Hydration Sticks', shortName: 'Hydration Sticks', category: 'hydration',
      goal: 'endurance', stage: 'intra', tags: ['endurance', 'new'], pack: 'box',
      price: 990, salePrice: 849, flavour: 'Lemon Lime', size: '20 sticks', servings: 20, tint: '#F5B723',
      rating: 4.6, reviews: 244, stock: 240, badge: 'New',
      description: 'A single-serve electrolyte stick at the sodium level that actually replaces sweat loss — 500mg — instead of the token 150mg most sports drinks carry.',
      keyIngredients: ['Sodium 500mg', 'Potassium 300mg', 'Magnesium 60mg', 'Vitamin C 60mg'],
      howToUse: 'One stick in 500ml water during or after training, or on hot days.',
      specs: [['Sodium', '500 mg'], ['Sugar', '1 g'], ['Sticks', '20'], ['Calories', '10 kcal']] },

    { id: 307, name: 'Post-Workout Recovery Matrix', shortName: 'Recovery Matrix', category: 'recovery',
      goal: 'recovery', stage: 'post', tags: ['featured', 'recovery'],
      price: 2790, salePrice: null, flavour: 'Mixed Berry', size: '1 kg', servings: 30, tint: '#B8437E',
      rating: 4.5, reviews: 297, stock: 120,
      description: 'Fast carbohydrate, whey hydrolysate and creatine in one post-training scoop, at the 3:1 carb-to-protein ratio used for glycogen replacement after hard sessions.',
      keyIngredients: ['Cluster dextrin 45g', 'Whey hydrolysate 15g', 'Creatine 3g', 'L-Glutamine 5g'],
      howToUse: 'One scoop in 400ml water immediately after training, on hard days only.',
      specs: [['Carbs', '45 g'], ['Protein', '15 g'], ['Creatine', '3 g'], ['Servings', '30']] },

    { id: 308, name: 'ZMA Night Recovery', shortName: 'ZMA Night', category: 'recovery',
      goal: 'recovery', stage: 'rest', tags: ['recovery'],
      price: 1290, salePrice: 1090, flavour: 'Unflavoured', size: '90 capsules', servings: 30, tint: '#5A4FBF', pack: 'bottle',
      rating: 4.4, reviews: 209, stock: 150,
      description: 'Zinc, magnesium aspartate and B6 taken before sleep. Training raises the requirement for all three, and sleep is where the training actually turns into progress.',
      keyIngredients: ['Zinc 30mg', 'Magnesium aspartate 450mg', 'Vitamin B6 10.5mg'],
      howToUse: 'Three capsules 30 minutes before bed, on an empty stomach.',
      specs: [['Zinc', '30 mg'], ['Magnesium', '450 mg'], ['Capsules', '90'], ['Servings', '30']] },

    { id: 309, name: 'Protein Bar — 20g', shortName: 'Protein Bar', category: 'food',
      goal: 'muscle', stage: 'daily', tags: ['bestseller', 'muscle'], pack: 'box',
      price: 1590, salePrice: null, flavour: 'Peanut Cookie', size: '12 bars', servings: 12, tint: '#C97A2B',
      rating: 4.5, reviews: 531, stock: 260,
      description: '20g of protein and 2g of sugar in a bar that is chewy rather than chalky. The version before this one was rejected twice on texture alone.',
      keyIngredients: ['Milk protein isolate 20g', 'Roasted peanuts', 'Soluble fibre 8g', 'Sea salt'],
      howToUse: 'One bar as a snack, between meals or after training.',
      specs: [['Protein', '20 g'], ['Sugar', '2 g'], ['Calories', '210 kcal'], ['Bars', '12']] },

    { id: 310, name: 'Beta-Alanine Pure', shortName: 'Beta-Alanine', category: 'performance',
      goal: 'endurance', stage: 'pre', tags: ['endurance'],
      price: 1190, salePrice: null, flavour: 'Unflavoured', size: '300 g', servings: 100, tint: '#E0673B',
      rating: 4.4, reviews: 176, stock: 130,
      description: 'Carnosine precursor for the 60-to-240-second efforts where the burn arrives first. Works on saturation, so consistency matters more than timing.',
      keyIngredients: ['Beta-alanine 3.2g'],
      howToUse: '3.2g daily, split into two doses if the tingling is distracting.',
      specs: [['Per serving', '3.2 g'], ['Servings', '100'], ['Timing', 'Any'], ['Tingle', 'Expected']] },

    { id: 311, name: 'Athlete Multivitamin', shortName: 'Athlete Multi', category: 'health',
      goal: 'recovery', stage: 'daily', tags: ['recovery'], pack: 'bottle',
      price: 1390, salePrice: null, flavour: 'Unflavoured', size: '90 tablets', servings: 90, tint: '#3B9E6E',
      rating: 4.5, reviews: 263, stock: 175,
      description: 'A multivitamin dosed for people training four or more times a week — higher B vitamins, magnesium and zinc, all three of which training depletes faster.',
      keyIngredients: ['B-complex at 200% RDA', 'Magnesium 200mg', 'Zinc 15mg', 'Vitamin D3 2000 IU', 'Iron-free'],
      howToUse: 'One tablet with breakfast, every day including rest days.',
      specs: [['Vitamin D3', '2000 IU'], ['Magnesium', '200 mg'], ['Tablets', '90'], ['Iron', 'None']] },

    { id: 312, name: 'Casein Night Protein', shortName: 'Night Casein', category: 'protein',
      goal: 'recovery', stage: 'rest', tags: ['recovery', 'new'],
      price: 3190, salePrice: null, flavour: 'Chocolate Malt', size: '1.8 kg', servings: 50, tint: '#6B4C8A',
      rating: 4.4, reviews: 148, stock: 100, badge: 'New',
      description: 'Micellar casein, which digests over six to eight hours instead of ninety minutes. The overnight half of a protein plan, not a second whey.',
      keyIngredients: ['Micellar casein 30g', 'Calcium 400mg', 'Tryptophan 350mg'],
      howToUse: 'One scoop in 300ml milk before bed.',
      specs: [['Protein', '26 g'], ['Digestion', '6–8 hrs'], ['Servings', '50'], ['Calcium', '40% RDA']] },

    { id: 313, name: 'The Strength Stack', shortName: 'Strength Stack', category: 'stacks', pack: 'box',
      goal: 'strength', stage: 'daily', tags: ['featured', 'stacks'],
      price: 8970, salePrice: 7490, flavour: 'Three products', size: '4–8 weeks', servings: 0, tint: '#FF4A17',
      rating: 4.8, reviews: 214, stock: 60, badge: 'Save ₹1,480',
      description: 'Whey Isolate, Creatine and Surge Pre-Workout — the three that do the most for a strength block, bought together at a lower price than separately.',
      keyIngredients: ['Whey Protein Isolate 2kg', 'Creatine Monohydrate 500g', 'Surge Pre-Workout 400g'],
      howToUse: 'Creatine daily, pre-workout before sessions, whey after.',
      specs: [['Products', '3'], ['Saving', '₹1,480'], ['Duration', '4–8 weeks'], ['Goal', 'Strength']] },

    { id: 314, name: 'The Endurance Stack', shortName: 'Endurance Stack', category: 'stacks', pack: 'box',
      goal: 'endurance', stage: 'daily', tags: ['stacks'],
      price: 5670, salePrice: 4790, flavour: 'Three products', size: '6 weeks', servings: 0, tint: '#25B39B',
      rating: 4.6, reviews: 118, stock: 55,
      description: 'EAA Intra, Hydration Sticks and Beta-Alanine: everything that goes into a long session, and nothing that belongs to a strength block.',
      keyIngredients: ['EAA + Electrolyte Intra 450g', 'Hydration Sticks × 20', 'Beta-Alanine 300g'],
      howToUse: 'Beta-alanine daily, EAA through sessions, sticks on long or hot days.',
      specs: [['Products', '3'], ['Saving', '₹880'], ['Duration', '6 weeks'], ['Goal', 'Endurance']] }
  ];

  var GOALS = [
    { key: 'muscle',    label: 'Build muscle',   line: 'Protein, casein, bars' },
    { key: 'strength',  label: 'Get stronger',   line: 'Creatine, pre-workout' },
    { key: 'energy',    label: 'Train harder',   line: 'Pre-workout, caffeine' },
    { key: 'endurance', label: 'Go longer',      line: 'EAA, electrolytes, beta-alanine' },
    { key: 'recovery',  label: 'Recover faster', line: 'Post-workout, ZMA, multi' }
  ];

  /* the four slots of a stack, in training order */
  var SLOTS = [
    { key: 'pre',  label: 'Pre-workout',  note: 'Before the session' },
    { key: 'intra', label: 'Intra',       note: 'During the session' },
    { key: 'post', label: 'Post-workout', note: 'After the session' },
    { key: 'daily', label: 'Daily',       note: 'Every day, training or not' }
  ];

  /* ── PRODUCT CARD — a spec sheet ────────────────────────────────── */
  function card(p) {
    var price = p.salePrice || p.price, disc = WL.discount(p);
    return '' +
    '<article class="fg-card wl-rise" data-product-id="' + p.id + '" style="--tint:' + p.tint + '" onclick="openProduct(' + p.id + ')">' +
      '<div class="fg-card-shot">' +
        '<img data-src="' + p._art + '" src="' + p._art + '" alt="' + E(p.name) + '" loading="lazy" decoding="async">' +
        (p.badge ? '<span class="fg-card-badge">' + E(p.badge) + '</span>' : '') +
        (disc ? '<span class="fg-card-off">−' + disc + '%</span>' : '') +
      '</div>' +
      '<div class="fg-card-body">' +
        '<p class="fg-card-cat">' + E(p.category) + '</p>' +
        '<h3 class="fg-card-name">' + E(p.name) + '</h3>' +
        '<p class="fg-card-flav">' + E(p.flavour) + '</p>' +
        '<dl class="fg-card-spec">' +
          '<div><dt>Size</dt><dd>' + E(p.size) + '</dd></div>' +
          '<div><dt>Servings</dt><dd>' + (p.servings || '—') + '</dd></div>' +
        '</dl>' +
        WL.stars(p.rating, p.reviews) +
        '<div class="fg-card-foot">' +
          '<span class="fg-card-price">' + INR(price) + (p.salePrice ? '<s>' + INR(p.price) + '</s>' : '') + '</span>' +
          '<button class="fg-card-add" onclick="event.stopPropagation();STORE.addToCart(' + p.id + ')">ADD</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* ── PRODUCT PAGE ───────────────────────────────────────────────── */
  function productPage(p) {
    var host = document.getElementById('productDetail');
    if (!host) return '';
    var price = p.salePrice || p.price;
    var stackWith = WL.all().filter(function (x) { return x.goal === p.goal && x.id !== p.id && x.category !== 'stacks'; }).slice(0, 3);

    host.innerHTML = '' +
    '<div class="fg-pd" style="--tint:' + p.tint + '">' +
      '<div class="fg-pd-media">' +
        '<img src="' + p._art + '" alt="' + E(p.name) + '">' +
        '<ul class="fg-pd-stats">' + (p.specs || []).map(function (s) {
          return '<li><strong>' + E(s[1]) + '</strong><span>' + E(s[0]) + '</span></li>';
        }).join('') + '</ul>' +
      '</div>' +
      '<div class="fg-pd-body">' +
        '<p class="fg-pd-cat">' + E(p.category) + ' · ' + E((GOALS.filter(function (g) { return g.key === p.goal; })[0] || {}).label || '') + '</p>' +
        '<h1>' + E(p.name) + '</h1>' +
        WL.stars(p.rating, p.reviews) +
        '<p class="fg-pd-desc">' + E(p.description) + '</p>' +
        '<div class="fg-pd-opts">' +
          '<div><span class="fg-pd-lab">Flavour</span><strong>' + E(p.flavour) + '</strong></div>' +
          '<div><span class="fg-pd-lab">Size</span><strong>' + E(p.size) + '</strong></div>' +
          '<div><span class="fg-pd-lab">Servings</span><strong>' + (p.servings || '—') + '</strong></div>' +
        '</div>' +
        '<div class="fg-pd-buy">' +
          '<span class="fg-pd-price">' + INR(price) + (p.salePrice ? '<s>' + INR(p.price) + '</s>' : '') + '</span>' +
          '<button class="fg-pd-add" onclick="STORE.addToCart(' + p.id + ');openSideCart()">ADD TO CART</button>' +
        '</div>' +
        '<p class="fg-pd-stock">' + (p.stock > 0 ? 'In stock · ships today on orders before 4pm' : 'Out of stock') + '</p>' +
        '<div class="fg-pd-blocks">' +
          '<section><h2>What is in it</h2><ul>' + (p.keyIngredients || []).map(function (i) { return '<li>' + E(i) + '</li>'; }).join('') + '</ul></section>' +
          '<section><h2>How to take it</h2><p>' + E(p.howToUse) + '</p></section>' +
        '</div>' +
      '</div>' +
    '</div>' +
    (stackWith.length ? '<div class="fg-pd-stack"><h2>Stacks well with</h2><div class="fg-pd-stack-row">' +
      stackWith.map(function (x) {
        return '<button onclick="openProduct(' + x.id + ')"><img src="' + x._art + '" alt=""><span><strong>' + E(x.shortName || x.name) + '</strong><em>' + INR(x.salePrice || x.price) + '</em></span></button>';
      }).join('') + '</div></div>' : '');

    var rg = document.getElementById('relatedGrid');
    if (rg) rg.innerHTML = WL.pick(p.category, 4).filter(function (x) { return x.id !== p.id; }).slice(0, 4).map(card).join('');
    WL.observe(host);
    return '';
  }

  /* ── STACK BUILDER ──────────────────────────────────────────────── */
  window.FG = {
    stack: {},
    slotOptions: function (key) {
      return WL.all().filter(function (p) { return p.stage === key && p.category !== 'stacks'; });
    },
    pick: function (slot, id) {
      FG.stack[slot] = id ? Number(id) : null;
      FG.render();
    },
    render: function () {
      var total = 0, chosen = [];
      SLOTS.forEach(function (s) {
        var id = FG.stack[s.key];
        if (!id) return;
        var p = WL.byId(id);
        if (!p) return;
        total += (p.salePrice || p.price);
        chosen.push(p);
      });
      var bar = document.getElementById('fgStackBar');
      if (!bar) return;
      var saving = chosen.length >= 3 ? Math.round(total * 0.08) : 0;
      bar.innerHTML =
        '<div class="fg-stack-sum">' +
          '<span class="fg-stack-count">' + chosen.length + ' of 4 slots filled</span>' +
          '<span class="fg-stack-total">' + INR(total - saving) +
            (saving ? '<s>' + INR(total) + '</s><em>bundle −8%</em>' : '') + '</span>' +
        '</div>' +
        '<button class="fg-stack-add"' + (chosen.length ? '' : ' disabled') +
          ' onclick="FG.addStack()">ADD STACK TO CART</button>';
    },
    addStack: function () {
      var ids = SLOTS.map(function (s) { return FG.stack[s.key]; }).filter(Boolean);
      if (!ids.length) return;
      WL.addSet(ids);
    },
    preset: function (goal) {
      FG.stack = {};
      SLOTS.forEach(function (s) {
        var opt = WL.all().filter(function (p) { return p.stage === s.key && p.goal === goal && p.category !== 'stacks'; })[0] ||
                  WL.all().filter(function (p) { return p.stage === s.key && p.category !== 'stacks'; })[0];
        if (opt) FG.stack[s.key] = opt.id;
      });
      SLOTS.forEach(function (s) {
        var sel = document.getElementById('fgSlot-' + s.key);
        if (sel) sel.value = FG.stack[s.key] || '';
      });
      FG.render();
      document.querySelectorAll('.fg-preset').forEach(function (b) { b.classList.toggle('is-on', b.dataset.goal === goal); });
    },
    menu: function () { document.getElementById('fgDrawer').classList.toggle('is-open'); },
    jump: function (id) {
      if (typeof currentPage !== 'undefined' && currentPage !== 'home') showPage('home');
      setTimeout(function () {
        var el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  };

  /* ── HEADER ─────────────────────────────────────────────────────── */
  function header() {
    return '' +
    '<div class="fg-strip"><span>FREE SHIPPING OVER ₹1,500</span><span>SHIPS SAME DAY BEFORE 4PM</span><span>LAB TESTED · BATCH VERIFIED</span></div>' +
    '<header class="fg-head">' +
      '<div class="fg-head-in">' +
        '<a class="fg-logo" onclick="showPage(\'home\')">FORGE<span></span></a>' +
        '<nav class="fg-nav">' +
          '<a onclick="WL.shop(\'all\')">SHOP</a>' +
          '<a onclick="WL.shop(\'protein\')">PROTEIN</a>' +
          '<a onclick="WL.shop(\'performance\')">PERFORMANCE</a>' +
          '<a onclick="WL.shop(\'recovery\')">RECOVERY</a>' +
          '<a onclick="FG.jump(\'fgStack\')">STACKS</a>' +
          '<a onclick="showPage(\'blog\')">LEARN</a>' +
        '</nav>' +
        '<div class="fg-head-acts">' +
          '<button class="fg-icon" onclick="WL.shop(\'all\')" aria-label="Search">SEARCH</button>' +
          '<button class="fg-icon" onclick="handleAccountNavClick()" aria-label="Account">ACCOUNT</button>' +
          '<button class="fg-cart" onclick="openSideCart()">CART<span class="cart-badge" style="display:none">0</span></button>' +
          '<button class="fg-burger" onclick="FG.menu()" aria-label="Menu"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div>' +
      '<div class="fg-drawer" id="fgDrawer">' +
        '<a onclick="WL.shop(\'all\');FG.menu()">SHOP ALL</a>' +
        '<a onclick="WL.shop(\'protein\');FG.menu()">PROTEIN</a>' +
        '<a onclick="WL.shop(\'performance\');FG.menu()">PERFORMANCE</a>' +
        '<a onclick="WL.shop(\'recovery\');FG.menu()">RECOVERY</a>' +
        '<a onclick="WL.shop(\'stacks\');FG.menu()">STACKS</a>' +
        '<a onclick="handleAccountNavClick();FG.menu()">ACCOUNT</a>' +
      '</div>' +
    '</header>';
  }

  /* ── HOMEPAGE ───────────────────────────────────────────────────── */
  function home() {
    var best = WL.pick('bestseller', 4);

    return '' +
    '<section class="fg-hero">' +
      '<div class="fg-hero-in">' +
        '<div class="fg-hero-copy">' +
          '<p class="fg-eyebrow">Sports nutrition · fully dosed · nothing hidden</p>' +
          '<h1>TRAIN HARD.<br><span>RECOVER SMART.</span></h1>' +
          '<p class="fg-hero-lede">Every dose printed on the label. No proprietary blends, no fairy dusting, no flavour that quits after week two.</p>' +
          '<div class="fg-hero-cta">' +
            '<button class="fg-btn" onclick="WL.shop(\'all\')">SHOP ALL</button>' +
            '<button class="fg-btn-out" onclick="FG.jump(\'fgStack\')">BUILD YOUR STACK</button>' +
          '</div>' +
        '</div>' +
        '<div class="fg-hero-art">' + WL.pick('bestseller', 2).map(function (p, i) {
          return '<img class="fg-hero-p' + (i + 1) + '" src="' + p._art + '" alt="">';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="fg-stats">' +
        '<div><strong>27g</strong><span>protein per scoop</span></div>' +
        '<div><strong>0</strong><span>proprietary blends</span></div>' +
        '<div><strong>100%</strong><span>batches lab tested</span></div>' +
        '<div><strong>40k+</strong><span>athletes supplied</span></div>' +
      '</div>' +
    '</section>' +

    '<section class="fg-sec">' +
      '<div class="fg-wrap">' +
        '<div class="fg-sec-head wl-rise"><h2>SHOP BY GOAL</h2><button class="fg-link" onclick="WL.shop(\'all\')">ALL PRODUCTS →</button></div>' +
        '<div class="fg-goals">' + GOALS.map(function (g) {
          return '<button class="fg-goal wl-rise" onclick="WL.shop(\'' + g.key + '\')">' +
            '<strong>' + E(g.label) + '</strong><em>' + E(g.line) + '</em>' +
            '<span>' + WL.count(WL.pick(g.key).length, 'product') + '</span></button>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="fg-sec fg-sec-alt">' +
      '<div class="fg-wrap">' +
        '<div class="fg-sec-head wl-rise"><h2>BEST SELLERS</h2>' +
          '<div class="fg-rail-btns"><button onclick="WL.rail(\'fgBest\',-1)" aria-label="Scroll left">←</button><button onclick="WL.rail(\'fgBest\',1)" aria-label="Scroll right">→</button></div>' +
        '</div>' +
        '<div class="fg-rail" id="fgBest">' + best.concat(WL.pick('featured', 4)).filter(function (p, i, a) {
          return a.findIndex(function (x) { return x.id === p.id; }) === i;
        }).slice(0, 6).map(card).join('') + '</div>' +
      '</div>' +
    '</section>' +

    /* the stack builder */
    '<section class="fg-sec fg-stack-sec" id="fgStack">' +
      '<div class="fg-wrap">' +
        '<div class="fg-sec-head wl-rise"><h2>BUILD YOUR STACK</h2></div>' +
        '<p class="fg-stack-lede wl-rise">Four slots, one for each part of a training day. Start from a goal or pick each slot yourself — the whole stack goes into the same cart and checkout as everything else.</p>' +
        '<div class="fg-presets">' +
          '<span>START FROM:</span>' +
          GOALS.map(function (g) {
            return '<button class="fg-preset" data-goal="' + g.key + '" onclick="FG.preset(\'' + g.key + '\')">' + E(g.label) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="fg-slots">' + SLOTS.map(function (s) {
          var opts = WL.all().filter(function (p) { return p.stage === s.key && p.category !== 'stacks'; });
          return '<div class="fg-slot">' +
            '<p class="fg-slot-h">' + E(s.label) + '</p>' +
            '<p class="fg-slot-n">' + E(s.note) + '</p>' +
            '<select id="fgSlot-' + s.key + '" onchange="FG.pick(\'' + s.key + '\', this.value)">' +
              '<option value="">— none —</option>' +
              opts.map(function (p) {
                return '<option value="' + p.id + '">' + E(p.shortName || p.name) + ' · ' + INR(p.salePrice || p.price) + '</option>';
              }).join('') +
            '</select>' +
          '</div>';
        }).join('') + '</div>' +
        '<div class="fg-stack-bar" id="fgStackBar"></div>' +
      '</div>' +
    '</section>' +

    '<section class="fg-sec">' +
      '<div class="fg-wrap">' +
        '<div class="fg-sec-head wl-rise"><h2>PERFORMANCE INGREDIENTS</h2></div>' +
        '<div class="fg-ings">' + [
          ['CREATINE MONOHYDRATE', '5 g', 'The most studied ergogenic aid there is. Saturation matters, loading does not.'],
          ['CITRULLINE MALATE', '6 g', 'The clinical dose. Most pre-workouts use half of it and call it a blend.'],
          ['BETA-ALANINE', '3.2 g', 'For the 60–240 second efforts. The tingle is harmless and expected.'],
          ['WHEY ISOLATE', '27 g', 'Cold-filtered, 90% protein by weight, 1.2g carbs per serving.']
        ].map(function (i) {
          return '<article class="fg-ing wl-rise"><span class="fg-ing-dose">' + E(i[1]) + '</span><h3>' + E(i[0]) + '</h3><p>' + E(i[2]) + '</p></article>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="fg-sec fg-sec-alt">' +
      '<div class="fg-wrap">' +
        '<div class="fg-sec-head wl-rise"><h2>RESULTS</h2></div>' +
        '<div class="fg-results">' + [
          ['+18 kg', 'squat in 12 weeks', 'Ran the Strength Stack through an off-season block. Nothing exotic — creatine daily, pre-workout on heavy days, whey after everything.', 'Arjun D. · Powerlifting'],
          ['2:58', 'first sub-3 marathon', 'The EAA and hydration sticks were the difference on long runs. I stopped cramping at 32km and that was the whole race.', 'Nikita S. · Marathon'],
          ['6 days', 'a week, no crash', 'The athlete multi and ZMA are the boring half of my shelf and the half I would replace last.', 'Rehan M. · CrossFit']
        ].map(function (r) {
          return '<figure class="fg-result wl-rise"><strong>' + E(r[0]) + '</strong><span>' + E(r[1]) + '</span>' +
            '<blockquote>' + E(r[2]) + '</blockquote><figcaption>' + E(r[3]) + '</figcaption></figure>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>';
  }

  function shopIntro() {
    return '<div class="fg-shop-intro"><h1>ALL PRODUCTS</h1>' +
      '<p>Every dose printed. Filter by category, goal or training stage.</p></div>';
  }

  function footer() {
    return '<div class="fg-foot">' +
      '<div class="fg-wrap">' +
        '<div class="fg-foot-top">' +
          '<div><p class="fg-foot-logo">FORGE</p>' +
            '<p class="fg-foot-tag">Sports nutrition with the doses printed on the front. Lab tested every batch, shipped from Pune.</p></div>' +
          '<div class="fg-foot-nl"><label>TRAINING TIPS + DROPS</label>' +
            '<div><input type="email" placeholder="Email" aria-label="Email"><button onclick="showToast(\'You are in.\')">JOIN</button></div></div>' +
        '</div>' +
        '<div class="fg-foot-cols">' +
          '<div><h4>SHOP</h4><a onclick="WL.shop(\'protein\')">Protein</a><a onclick="WL.shop(\'performance\')">Performance</a><a onclick="WL.shop(\'recovery\')">Recovery</a><a onclick="WL.shop(\'hydration\')">Hydration</a><a onclick="WL.shop(\'food\')">Bars</a></div>' +
          '<div><h4>GOALS</h4>' + GOALS.map(function (g) { return '<a onclick="WL.shop(\'' + g.key + '\')">' + E(g.label) + '</a>'; }).join('') + '</div>' +
          '<div><h4>LEARN</h4><a onclick="showPage(\'blog\')">Training guides</a><a onclick="showPage(\'faq\')">FAQ</a><a onclick="showPage(\'about\')">About Forge</a><a onclick="showPage(\'contact\')">Contact</a></div>' +
          '<div><h4>HELP</h4><a onclick="showPage(\'shipping\')">Shipping</a><a onclick="showPage(\'refund\')">Returns</a><a onclick="showPage(\'privacy\')">Privacy</a><a onclick="showPage(\'terms\')">Terms</a></div>' +
        '</div>' +
        '<div class="fg-foot-legal"><p>© ' + new Date().getFullYear() + ' FORGE PERFORMANCE NUTRITION</p><p>WHITE-LABEL STOREFRONT DEMO — TEMPLATE 03 OF SIX</p></div>' +
      '</div>' +
    '</div>';
  }

  var ICON = function (d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  };

  WL.define({
    slug: 'forge',
    name: 'Forge',
    tagline: 'Train hard. Recover smart.',
    title: 'FORGE — Protein, Performance & Recovery Supplements',
    catalog: CATALOG,
    packshot: art,
    card: card,
    productPage: productPage,
    header: header,
    home: home,
    footer: footer,
    shopIntro: shopIntro,
    categories: [
      { key: 'all', label: 'ALL' },
      { key: 'protein', label: 'PROTEIN' },
      { key: 'performance', label: 'PERFORMANCE' },
      { key: 'recovery', label: 'RECOVERY' },
      { key: 'hydration', label: 'HYDRATION' },
      { key: 'food', label: 'BARS' },
      { key: 'health', label: 'HEALTH' },
      { key: 'stacks', label: 'STACKS' },
      { key: 'bestsellers', label: 'BEST SELLERS' }
    ],
    bottomNav: [
      { page: 'home', label: 'Home', icon: ICON('<path d="M4 10.5 12 4l8 6.5V20H4z"/>') },
      { page: 'shop', label: 'Shop', icon: ICON('<path d="M4 7h16l-1 13H5z"/><path d="M9 7V5h6v2"/>') },
      { page: 'stack', label: 'Stack', icon: ICON('<rect x="4" y="14" width="16" height="5"/><rect x="6" y="8" width="12" height="5"/><rect x="8" y="2" width="8" height="5"/>'), action: "showPage('home');setTimeout(function(){FG.jump('fgStack')},200)" },
      { page: 'cart', label: 'Cart', icon: ICON('<path d="M3 5h2l2 11h10l2-8H7"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>'), action: "openSideCart();setAppNav('cart')" },
      { page: 'account', label: 'Account', icon: ICON('<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'), action: "handleAccountNavClick();setAppNav('account')" }
    ],
    onMount: function () { FG.preset('strength'); }
  });
})();
