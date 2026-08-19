/* ═══════════════════════════════════════════════════════════════════════
   TEMPLATE 02 · ARCADIA — PREMIUM EVERYDAY WELLNESS
   An editorial storefront. Products are merchandised by wellness goal and
   by daily routine rather than by product type, the page is set in a
   serif at a wide measure, and the card is a quiet catalogue entry — no
   badges, no discount flags, no colour blocks.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  var E = WL.esc, INR = WL.inr;

  function art(p) {
    return WL.pack({
      shape: p.pack || 'bottle',
      bg: '#F7F4ED',
      body: p.tint || '#C7A87A',
      cap: '#2C2A25',
      label: '#FBFAF6',
      accent: '#8C7B54',
      ink: '#2C2A25',
      font: 'Cormorant Garamond, Georgia, serif',
      brand: 'ARCADIA',
      name: p.shortName || p.name,
      sub: p.form,
      meta: p.count
    });
  }

  /* ── PORTFOLIO — a broad premium nutraceutical range ─────────────── */
  var CATALOG = [
    { id: 201, name: 'Daily Multivitamin Complex', shortName: 'Daily Complex', category: 'daily',
      goal: 'daily', routine: 'morning', form: 'Capsules', count: '60 capsules', tint: '#B99A6B',
      tags: ['featured', 'bestseller', 'daily'], price: 1650, salePrice: null, rating: 4.8, reviews: 640, stock: 120,
      description: 'The foundation of the range. Twenty-three vitamins and minerals in the forms the body uses most readily — methylated folate, methylcobalamin, chelated minerals — at doses meant for daily, long-term use.',
      keyIngredients: ['Vitamin D3 1000 IU', 'Methylfolate 400mcg', 'Methylcobalamin 500mcg', 'Magnesium bisglycinate 100mg', 'Zinc picolinate 15mg', 'Vitamin K2-7 75mcg'],
      howToUse: 'Two capsules with breakfast. Taken with food for absorption of the fat-soluble vitamins.',
      story: 'Formulated with a nutritional biochemist over eighteen months, then reformulated twice after tolerance testing.' },

    { id: 202, name: 'Marine Omega-3 Concentrate', shortName: 'Marine Omega-3', category: 'daily',
      goal: 'daily', routine: 'morning', form: 'Softgels', count: '60 softgels', tint: '#7C9BA8',
      tags: ['featured', 'bestseller', 'daily'], price: 1890, salePrice: null, rating: 4.7, reviews: 412, stock: 96,
      description: 'A triglyceride-form concentrate at 1000mg EPA and 500mg DHA per serving, distilled from small cold-water fish and third-party tested for heavy metals on every batch.',
      keyIngredients: ['EPA 1000mg', 'DHA 500mg', 'Vitamin E (as preservative) 5mg', 'Lemon oil'],
      howToUse: 'Two softgels daily with a meal containing fat.',
      story: 'Sourced from an MSC-certified fishery in the North Atlantic; each batch carries its own certificate of analysis.' },

    { id: 203, name: 'Ashwagandha KSM-66', shortName: 'Ashwagandha', category: 'calm',
      goal: 'calm', routine: 'evening', form: 'Capsules', count: '60 capsules', tint: '#A88B62',
      tags: ['featured', 'bestseller', 'calm'], price: 1450, salePrice: 1250, rating: 4.8, reviews: 528, stock: 140,
      description: 'Full-spectrum root extract standardised to 5% withanolides, at the 600mg daily dose used in the clinical literature rather than the smaller dose usually found on a shelf.',
      keyIngredients: ['KSM-66 Ashwagandha 600mg', 'Organic root, water-extracted'],
      howToUse: 'One capsule in the evening, or twice daily during demanding weeks.',
      story: 'Root only. Leaf material is cheaper and more common; it is also where the harshness comes from.' },

    { id: 204, name: 'Liposomal Vitamin C', shortName: 'Liposomal C', category: 'immunity',
      goal: 'immunity', routine: 'morning', form: 'Capsules', count: '60 capsules', tint: '#D8A657',
      tags: ['immunity', 'bestseller'], price: 1390, salePrice: null, rating: 4.6, reviews: 287, stock: 110,
      description: 'Vitamin C wrapped in a phospholipid shell, which carries it past the absorption ceiling that limits ordinary ascorbic acid at higher doses.',
      keyIngredients: ['Vitamin C 1000mg', 'Sunflower phospholipids 500mg', 'Citrus bioflavonoids 50mg'],
      howToUse: 'Two capsules daily, away from food.',
      story: 'Sunflower-derived phospholipids, not soy — a small change that matters to anyone avoiding soy entirely.' },

    { id: 205, name: 'Marine Collagen Peptides', shortName: 'Collagen Peptides', category: 'beauty',
      goal: 'beauty', routine: 'morning', form: 'Powder', count: '30 servings', tint: '#D3AFA2', pack: 'pouch',
      tags: ['featured', 'beauty', 'bestseller'], price: 2450, salePrice: 2150, rating: 4.7, reviews: 366, stock: 84,
      description: 'Type I peptides at 10g per serving, hydrolysed to a molecular weight low enough to dissolve clear in a cold drink, with Vitamin C and hyaluronic acid alongside.',
      keyIngredients: ['Marine collagen peptides 10g', 'Vitamin C 80mg', 'Hyaluronic acid 100mg', 'Bamboo silica 20mg'],
      howToUse: 'One scoop in coffee, tea or water each morning. Unflavoured.',
      story: 'Wild-caught, sustainably sourced marine collagen. It dissolves clear — the test we set ourselves before shipping it.' },

    { id: 206, name: 'Magnesium Bisglycinate', shortName: 'Magnesium', category: 'calm',
      goal: 'calm', routine: 'evening', form: 'Capsules', count: '90 capsules', tint: '#8E9E90',
      tags: ['calm', 'bestseller'], price: 1250, salePrice: null, rating: 4.9, reviews: 594, stock: 160,
      description: 'Fully chelated magnesium at 400mg elemental. The bisglycinate form is absorbed well and does not carry the laxative effect that oxide is known for.',
      keyIngredients: ['Magnesium bisglycinate 400mg elemental', 'Vitamin B6 (P-5-P) 2mg'],
      howToUse: 'Three capsules in the evening, or split across the day.',
      story: 'Fully reacted chelate, not a blend buffered with oxide — a distinction most labels quietly avoid making.' },

    { id: 207, name: 'Advanced Antioxidant Blend', shortName: 'Antioxidant Blend', category: 'daily',
      goal: 'daily', routine: 'morning', form: 'Capsules', count: '60 capsules', tint: '#9C6B7E',
      tags: ['daily'], price: 1750, salePrice: null, rating: 4.5, reviews: 173, stock: 78,
      description: 'Astaxanthin, resveratrol, CoQ10 and alpha-lipoic acid in one capsule — four antioxidants that work in different compartments of the cell rather than four versions of the same idea.',
      keyIngredients: ['Astaxanthin 6mg', 'Trans-resveratrol 150mg', 'CoQ10 (ubiquinol) 100mg', 'Alpha-lipoic acid 200mg'],
      howToUse: 'Two capsules with the largest meal of the day.',
      story: 'Ubiquinol rather than ubiquinone: the reduced form, which the body does not have to convert first.' },

    { id: 208, name: 'Beauty Complex — Skin, Hair & Nails', shortName: 'Beauty Complex', category: 'beauty',
      goal: 'beauty', routine: 'morning', form: 'Capsules', count: '60 capsules', tint: '#C99AA6',
      tags: ['beauty', 'featured'], price: 1590, salePrice: null, rating: 4.6, reviews: 249, stock: 92,
      description: 'Biotin, zinc, silica and saw palmetto with a botanical base. Built for the twelve-week horizon that hair and nail growth actually runs on.',
      keyIngredients: ['Biotin 5000mcg', 'Zinc picolinate 15mg', 'Bamboo silica 300mg', 'Saw palmetto 160mg', 'Vitamin E 15mg'],
      howToUse: 'Two capsules daily with food, consistently for at least twelve weeks.',
      story: 'Doses set to what the evidence supports, not to what looks impressive on a label.' },

    { id: 209, name: 'Sleep Ritual — Glycine & L-Theanine', shortName: 'Sleep Ritual', category: 'sleep',
      goal: 'sleep', routine: 'evening', form: 'Powder', count: '30 servings', tint: '#7E86A0', pack: 'pouch',
      tags: ['featured', 'sleep', 'new'], price: 1690, salePrice: null, rating: 4.7, reviews: 158, stock: 70,
      description: 'Glycine, L-theanine and magnesium in a warm drink taken an hour before bed. No melatonin, so it supports a routine rather than replacing one.',
      keyIngredients: ['Glycine 3g', 'L-Theanine 200mg', 'Magnesium bisglycinate 150mg', 'Chamomile extract 100mg'],
      howToUse: 'One scoop in warm water or milk, 45–60 minutes before bed.',
      story: 'Deliberately melatonin-free. Melatonin shifts the clock; this supports the wind-down before it.' },

    { id: 210, name: "Women's Daily Essentials", shortName: "Women's Daily", category: 'women',
      goal: 'daily', routine: 'morning', form: 'Capsules', count: '60 capsules', tint: '#BD8B93',
      tags: ['bestseller', 'women'], price: 1750, salePrice: null, rating: 4.7, reviews: 331, stock: 105,
      description: 'A daily formula built around iron in a gentle chelated form, methylfolate, iodine and D3 — the four that most often come up short, at doses matched to real intake gaps.',
      keyIngredients: ['Iron bisglycinate 18mg', 'Methylfolate 400mcg', 'Iodine 150mcg', 'Vitamin D3 1000 IU', 'Calcium 200mg'],
      howToUse: 'Two capsules with breakfast.',
      story: 'Iron is included at a level that helps without the gut cost that puts people off taking it at all.' },

    { id: 211, name: "Men's Daily Essentials", shortName: "Men's Daily", category: 'men',
      goal: 'daily', routine: 'morning', form: 'Capsules', count: '60 capsules', tint: '#6F7F8C',
      tags: ['men'], price: 1750, salePrice: null, rating: 4.6, reviews: 214, stock: 98,
      description: 'Iron-free by design, with zinc, selenium, magnesium and a saw palmetto and lycopene base for prostate and cardiovascular support.',
      keyIngredients: ['Zinc picolinate 20mg', 'Selenium 100mcg', 'Magnesium 150mg', 'Saw palmetto 200mg', 'Lycopene 10mg'],
      howToUse: 'Two capsules with breakfast.',
      story: 'No added iron. Men rarely need supplemental iron, and excess is not benign.' },

    { id: 212, name: 'Gut Health Probiotic 30 Billion', shortName: 'Gut Probiotic', category: 'daily',
      goal: 'daily', routine: 'morning', form: 'Capsules', count: '30 capsules', tint: '#93A98D',
      tags: ['new', 'daily'], price: 1950, salePrice: 1690, rating: 4.5, reviews: 126, stock: 66,
      description: 'Twelve strains at 30 billion CFU in a delayed-release capsule, guaranteed to the end of shelf life rather than at the moment of manufacture.',
      keyIngredients: ['12 strains, 30 billion CFU', 'Lactobacillus rhamnosus GG', 'Bifidobacterium lactis BB-12', 'Prebiotic inulin 100mg'],
      howToUse: 'One capsule daily, with or without food. Shelf stable.',
      story: 'CFU guaranteed through expiry. A count measured only at manufacture tells you very little.' },

    { id: 213, name: 'Turmeric Curcumin Phytosome', shortName: 'Turmeric Curcumin', category: 'daily',
      goal: 'daily', routine: 'evening', form: 'Capsules', count: '60 capsules', tint: '#CF9E45',
      tags: ['daily'], price: 1490, salePrice: null, rating: 4.6, reviews: 198, stock: 88,
      description: 'A phytosome complex that solves curcumin\'s real problem — it is very poorly absorbed on its own — without relying on black pepper extract.',
      keyIngredients: ['Curcumin phytosome 500mg', 'Ginger extract 100mg', 'Vitamin D3 500 IU'],
      howToUse: 'One capsule twice daily with meals.',
      story: 'Phytosome rather than piperine: better absorption without the drug-interaction questions piperine raises.' },

    { id: 214, name: 'The Morning Ritual Set', shortName: 'Morning Ritual', category: 'sets', pack: 'box',
      goal: 'daily', routine: 'morning', form: 'Three products', count: '3 products · 1 month', tint: '#B99A6B',
      tags: ['featured', 'sets'], price: 4990, salePrice: 4290, rating: 4.8, reviews: 142, stock: 40,
      description: 'Daily Multivitamin, Marine Omega-3 and Liposomal Vitamin C, boxed as one month of the morning routine that most customers arrive at on their own after a few orders.',
      keyIngredients: ['Daily Multivitamin Complex — 60 capsules', 'Marine Omega-3 Concentrate — 60 softgels', 'Liposomal Vitamin C — 60 capsules'],
      howToUse: 'Taken together with breakfast. Thirty days per set.',
      story: 'Assembled from what customers actually reorder together, not from what we would like to sell together.' },

    { id: 215, name: 'The Evening Ritual Set', shortName: 'Evening Ritual', category: 'sets', pack: 'box',
      goal: 'sleep', routine: 'evening', form: 'Three products', count: '3 products · 1 month', tint: '#7E86A0',
      tags: ['sets'], price: 4390, salePrice: 3790, rating: 4.7, reviews: 97, stock: 36,
      description: 'Magnesium Bisglycinate, Ashwagandha KSM-66 and the Sleep Ritual powder — the wind-down half of the range, in one box.',
      keyIngredients: ['Magnesium Bisglycinate — 90 capsules', 'Ashwagandha KSM-66 — 60 capsules', 'Sleep Ritual — 30 servings'],
      howToUse: 'Magnesium and ashwagandha after dinner; the powder an hour before bed.',
      story: 'Three products with one job between them: making the last hour of the day quieter.' }
  ];

  var GOALS = [
    { key: 'daily',    label: 'Daily Wellness', line: 'The foundation — multivitamin, omega-3, antioxidants.' },
    { key: 'immunity', label: 'Immunity',       line: 'Vitamin C, zinc and D3 in absorbable forms.' },
    { key: 'calm',     label: 'Calm',           line: 'Adaptogens and magnesium for demanding weeks.' },
    { key: 'beauty',   label: 'Beauty',         line: 'Collagen, biotin and silica for skin, hair and nails.' },
    { key: 'sleep',    label: 'Sleep',          line: 'A wind-down ritual without melatonin.' }
  ];

  /* ── PRODUCT CARD — a catalogue entry, not a promotion ───────────── */
  function card(p) {
    var price = p.salePrice || p.price;
    return '' +
    '<article class="ar-card wl-rise" data-product-id="' + p.id + '" onclick="openProduct(' + p.id + ')">' +
      '<div class="ar-card-shot"><img data-src="' + p._art + '" src="' + p._art + '" alt="' + E(p.name) + '" loading="lazy" decoding="async"></div>' +
      '<p class="ar-card-kicker">' + E(p.form) + ' · ' + E(p.count) + '</p>' +
      '<h3 class="ar-card-name">' + E(p.name) + '</h3>' +
      '<p class="ar-card-note">' + E((p.description || '').split('.')[0]) + '.</p>' +
      '<div class="ar-card-foot">' +
        '<span class="ar-card-price">' + INR(price) + (p.salePrice ? ' <s>' + INR(p.price) + '</s>' : '') + '</span>' +
        '<button class="ar-card-add" onclick="event.stopPropagation();STORE.addToCart(' + p.id + ')">Add</button>' +
      '</div>' +
    '</article>';
  }

  /* ── PRODUCT PAGE — lifestyle, ingredients, quality, routine ─────── */
  function productPage(p) {
    var host = document.getElementById('productDetail');
    if (!host) return '';
    var price = p.salePrice || p.price;
    var pairs = WL.pick(p.routine === 'evening' ? 'evening' : 'morning', 6)
      .filter(function (x) { return x.id !== p.id && x.category !== 'sets'; }).slice(0, 3);

    host.innerHTML = '' +
    '<div class="ar-pd">' +
      '<div class="ar-pd-media"><img src="' + p._art + '" alt="' + E(p.name) + '"></div>' +
      '<div class="ar-pd-body">' +
        '<p class="ar-pd-kicker">' + E((GOALS.filter(function (g) { return g.key === p.goal; })[0] || {}).label || 'Wellness') + '</p>' +
        '<h1>' + E(p.name) + '</h1>' +
        '<p class="ar-pd-form">' + E(p.form) + ' · ' + E(p.count) + '</p>' +
        '<p class="ar-pd-lede">' + E(p.description) + '</p>' +
        '<div class="ar-pd-buy">' +
          '<span class="ar-pd-price">' + INR(price) + (p.salePrice ? ' <s>' + INR(p.price) + '</s>' : '') + '</span>' +
          '<button class="ar-pd-add" onclick="STORE.addToCart(' + p.id + ');openSideCart()">Add to bag</button>' +
        '</div>' +
        '<dl class="ar-pd-meta">' +
          '<div><dt>Routine</dt><dd>' + (p.routine === 'evening' ? 'Evening' : 'Morning') + '</dd></div>' +
          '<div><dt>Format</dt><dd>' + E(p.form) + '</dd></div>' +
          '<div><dt>Supply</dt><dd>' + E(p.count) + '</dd></div>' +
          '<div><dt>Rating</dt><dd>' + (p.reviews ? p.rating.toFixed(1) + ' / 5' : 'No reviews yet') + '</dd></div>' +
        '</dl>' +
      '</div>' +
    '</div>' +
    '<div class="ar-pd-cols">' +
      '<section><h2>Ingredients</h2><ul>' +
        (p.keyIngredients || []).map(function (i) { return '<li>' + E(i) + '</li>'; }).join('') +
      '</ul></section>' +
      '<section><h2>How to use</h2><p>' + E(p.howToUse) + '</p>' +
        '<h2 class="ar-pd-h2b">Quality</h2><p>' + E(p.story) + '</p></section>' +
      '<section><h2>The routine it belongs to</h2>' +
        '<div class="ar-pd-pair">' + pairs.map(function (x) {
          return '<button onclick="openProduct(' + x.id + ')"><img src="' + x._art + '" alt=""><span><strong>' + E(x.shortName || x.name) + '</strong><em>' + INR(x.salePrice || x.price) + '</em></span></button>';
        }).join('') + '</div>' +
      '</section>' +
    '</div>';

    var rg = document.getElementById('relatedGrid');
    if (rg) rg.innerHTML = WL.pick(p.goal, 4).filter(function (x) { return x.id !== p.id; }).slice(0, 3).map(card).join('');
    WL.observe(host);
    return '';
  }

  /* ── HEADER — two rows: utility bar, then wordmark over the nav ──── */
  function header() {
    return '' +
    '<div class="ar-util"><div class="ar-wrap ar-util-in">' +
      '<span>Complimentary delivery on orders above ₹1,500</span>' +
      '<span class="ar-util-r"><a onclick="showPage(\'about\')">Our story</a><a onclick="handleAccountNavClick()">Account</a></span>' +
    '</div></div>' +
    '<header class="ar-head">' +
      '<div class="ar-wrap ar-head-top">' +
        '<button class="ar-burger" onclick="AR.menu()" aria-label="Menu">Menu</button>' +
        '<a class="ar-word" onclick="showPage(\'home\')">ARCADIA</a>' +
        '<div class="ar-head-acts">' +
          '<button onclick="WL.shop(\'all\')">Search</button>' +
          '<button onclick="openSideCart()">Bag <span class="cart-badge" style="display:none">0</span></button>' +
        '</div>' +
      '</div>' +
      '<nav class="ar-nav">' +
        '<a onclick="WL.shop(\'all\')">SHOP</a>' +
        '<a onclick="AR.jump(\'arGoals\')">WELLNESS</a>' +
        '<a onclick="AR.jump(\'arIngredients\')">INGREDIENTS</a>' +
        '<a onclick="showPage(\'about\')">OUR STORY</a>' +
        '<a onclick="showPage(\'blog\')">JOURNAL</a>' +
      '</nav>' +
      '<div class="ar-drawer" id="arDrawer">' +
        '<a onclick="WL.shop(\'all\');AR.menu()">Shop all</a>' +
        '<a onclick="AR.jump(\'arGoals\');AR.menu()">Shop by goal</a>' +
        '<a onclick="WL.shop(\'sets\');AR.menu()">Ritual sets</a>' +
        '<a onclick="AR.jump(\'arIngredients\');AR.menu()">Ingredients</a>' +
        '<a onclick="showPage(\'about\');AR.menu()">Our story</a>' +
        '<a onclick="showPage(\'blog\');AR.menu()">Journal</a>' +
        '<a onclick="handleAccountNavClick();AR.menu()">Account</a>' +
      '</div>' +
    '</header>';
  }

  window.AR = {
    menu: function () { document.getElementById('arDrawer').classList.toggle('is-open'); },
    jump: function (id) {
      if (typeof currentPage !== 'undefined' && currentPage !== 'home') showPage('home');
      setTimeout(function () {
        var el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    },
    routine: function (btn, key) {
      document.querySelectorAll('.ar-rit-tab').forEach(function (b) { b.classList.remove('is-on'); });
      btn.classList.add('is-on');
      var list = WL.all().filter(function (p) { return p.routine === key && p.category !== 'sets'; }).slice(0, 4);
      var host = document.getElementById('arRitualList');
      if (!host) return;
      host.innerHTML = list.map(function (p, i) {
        return '<li><span class="ar-rit-n">' + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="ar-rit-c"><strong>' + E(p.name) + '</strong><em>' + E(p.howToUse) + '</em></span>' +
          '<button onclick="openProduct(' + p.id + ')">View</button></li>';
      }).join('');
    }
  };

  /* ── HOMEPAGE ───────────────────────────────────────────────────── */
  function home() {
    var best = WL.pick('bestseller', 3);
    var sets = WL.pick('sets', 2);

    return '' +
    '<section class="ar-hero">' +
      '<div class="ar-wrap">' +
        '<p class="ar-hero-eye">Est. 2019 · Premium nutraceuticals</p>' +
        '<h1>Wellness,<br><em>thoughtfully</em> formulated.</h1>' +
        '<div class="ar-hero-rule"></div>' +
        '<p class="ar-hero-lede">Fewer products, chosen carefully. Every formula in the Arcadia range is built around the form of a nutrient the body actually uses, at a dose the evidence supports — and nothing else.</p>' +
        '<div class="ar-hero-cta">' +
          '<button class="ar-btn" onclick="WL.shop(\'all\')">Shop the range</button>' +
          '<button class="ar-btn-text" onclick="AR.jump(\'arGoals\')">Shop by goal →</button>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ar-sec" id="arGoals">' +
      '<div class="ar-wrap">' +
        '<p class="ar-eyebrow wl-rise">Shop by goal</p>' +
        '<div class="ar-goals">' +
          GOALS.map(function (g) {
            return '<button class="ar-goal wl-rise" onclick="WL.shop(\'' + g.key + '\')">' +
              '<span class="ar-goal-n">' + WL.pick(g.key).length + '</span>' +
              '<strong>' + E(g.label) + '</strong>' +
              '<em>' + E(g.line) + '</em>' +
              '<span class="ar-goal-go">Explore</span></button>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ar-sec ar-sec-line">' +
      '<div class="ar-wrap">' +
        '<div class="ar-sec-head wl-rise"><h2>Best sellers</h2><button class="ar-btn-text" onclick="WL.shop(\'bestsellers\')">View all →</button></div>' +
        '<div class="ar-grid">' + best.map(card).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ar-sec ar-sec-cream">' +
      '<div class="ar-wrap">' +
        '<div class="ar-sec-head wl-rise"><h2>Daily rituals</h2></div>' +
        '<p class="ar-lead wl-rise">The range is organised around two moments in a day rather than around shelves in a warehouse. Most customers begin with one and add the other after a month or two.</p>' +
        '<div class="ar-rit-tabs">' +
          '<button class="ar-rit-tab is-on" onclick="AR.routine(this,\'morning\')">Morning</button>' +
          '<button class="ar-rit-tab" onclick="AR.routine(this,\'evening\')">Evening</button>' +
        '</div>' +
        '<ol class="ar-rit" id="arRitualList"></ol>' +
        '<div class="ar-sets">' + sets.map(function (s) {
          return '<article class="ar-set wl-rise" onclick="openProduct(' + s.id + ')">' +
            '<img src="' + s._art + '" alt="' + E(s.name) + '">' +
            '<div><h3>' + E(s.name) + '</h3><p>' + E(s.description) + '</p>' +
            '<span class="ar-set-price">' + INR(s.salePrice || s.price) + '</span></div></article>';
        }).join('') + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ar-sec" id="arIngredients">' +
      '<div class="ar-wrap ar-split">' +
        '<div class="ar-split-a wl-rise">' +
          '<p class="ar-eyebrow">The ingredient story</p>' +
          '<h2>The form matters more than the number on the front.</h2>' +
          '<p>Magnesium oxide and magnesium bisglycinate both let a label claim 400mg. Only one of them is absorbed well enough to be worth taking. The same is true of folate against folic acid, of ubiquinol against ubiquinone, and of triglyceride-form omega-3 against the ethyl esters most of the market uses.</p>' +
          '<p>Arcadia formulates from the absorbed form backwards. It costs more per bottle and it is the reason the range is fourteen products rather than forty.</p>' +
          '<button class="ar-btn-text" onclick="showPage(\'about\')">Read our sourcing standards →</button>' +
        '</div>' +
        '<ul class="ar-split-b wl-rise">' +
          '<li><strong>Methylfolate</strong><span>The active form, usable by everyone — including the large minority who convert folic acid poorly.</span></li>' +
          '<li><strong>Bisglycinate chelates</strong><span>Minerals bound to glycine: absorbed well, gentle on the stomach, no metallic aftertaste.</span></li>' +
          '<li><strong>Triglyceride omega-3</strong><span>The form found in fish. Better absorbed than the re-esterified oils that dominate the category.</span></li>' +
          '<li><strong>Phytosome complexes</strong><span>Used where a botanical is poorly absorbed on its own, rather than masking the problem with pepper extract.</span></li>' +
        '</ul>' +
      '</div>' +
    '</section>' +

    '<section class="ar-sec ar-sec-cream">' +
      '<div class="ar-wrap">' +
        '<div class="ar-sec-head wl-rise"><h2>Why Arcadia</h2></div>' +
        '<div class="ar-why">' +
          [['01', 'Third-party tested, every batch', 'Identity, potency, heavy metals and microbiology — with the certificate of analysis published against the batch code on your bottle.'],
           ['02', 'Doses from the literature', 'Where a clinical dose exists, that is the dose. Where it does not, we say so on the page rather than inventing one.'],
           ['03', 'No proprietary blends', 'Every ingredient is listed with its own amount. A blend total exists to hide which ingredient is the expensive one.'],
           ['04', 'Fourteen products, not forty', 'The range only grows when a formula earns its place. Most requests we receive are for products we have decided not to make.']].map(function (w) {
            return '<article class="ar-why-c wl-rise"><span>' + w[0] + '</span><h3>' + E(w[1]) + '</h3><p>' + E(w[2]) + '</p></article>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>' +

    '<section class="ar-sec">' +
      '<div class="ar-wrap ar-quotes">' +
        [['I came for the collagen and stayed for the magnesium. Two years in, and the only supplements in my cupboard are these.', 'Meera R.', 'Customer since 2023'],
         ['The certificate of analysis on every batch is what convinced me. I have not found another brand in India that publishes them.', 'Karthik V.', 'Customer since 2022']].map(function (q) {
          return '<figure class="ar-quote wl-rise"><blockquote>“' + E(q[0]) + '”</blockquote>' +
            '<figcaption>' + E(q[1]) + '<span>' + E(q[2]) + '</span></figcaption></figure>';
        }).join('') +
      '</div>' +
    '</section>' +

    '<section class="ar-sec ar-sec-line">' +
      '<div class="ar-wrap">' +
        '<div class="ar-sec-head wl-rise"><h2>The Journal</h2><button class="ar-btn-text" onclick="showPage(\'blog\')">All articles →</button></div>' +
        '<div class="ar-journal">' +
          [['Sourcing', 'What a certificate of analysis actually tells you', 'Four lines on a COA are worth reading and the rest is packaging. Here is how to read one in under a minute.'],
           ['Formulation', 'Why we will not make a fat burner', 'A short, unglamorous explanation of the category we have turned down three times.'],
           ['Routine', 'Building a supplement routine you will keep', 'Two moments a day, three products, and the reason a fourth usually gets abandoned.']].map(function (j) {
            return '<article class="ar-journal-c wl-rise"><p class="ar-journal-t">' + E(j[0]) + '</p><h3>' + E(j[1]) + '</h3><p>' + E(j[2]) + '</p></article>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function shopIntro() {
    return '<div class="ar-shop-intro">' +
      '<p class="ar-eyebrow">The range</p>' +
      '<h1>Fourteen formulas</h1>' +
      '<p>Organised by wellness goal. Every product third-party tested, with the certificate of analysis published against your batch code.</p>' +
    '</div>';
  }

  function footer() {
    return '<div class="ar-foot">' +
      '<div class="ar-wrap">' +
        '<div class="ar-foot-top">' +
          '<div>' +
            '<p class="ar-foot-word">ARCADIA</p>' +
            '<p class="ar-foot-tag">Premium nutraceuticals, thoughtfully formulated. Third-party tested, published batch by batch.</p>' +
          '</div>' +
          '<div class="ar-foot-nl">' +
            '<label>Join the Journal</label>' +
            '<div><input type="email" placeholder="Email address" aria-label="Email address"><button onclick="showToast(\'Thank you — welcome to Arcadia.\')">Subscribe</button></div>' +
          '</div>' +
        '</div>' +
        '<div class="ar-foot-cols">' +
          '<div><h4>Shop</h4><a onclick="WL.shop(\'all\')">All products</a><a onclick="WL.shop(\'sets\')">Ritual sets</a><a onclick="WL.shop(\'bestsellers\')">Best sellers</a><a onclick="WL.shop(\'new\')">New</a></div>' +
          '<div><h4>Wellness</h4>' + GOALS.map(function (g) { return '<a onclick="WL.shop(\'' + g.key + '\')">' + E(g.label) + '</a>'; }).join('') + '</div>' +
          '<div><h4>Company</h4><a onclick="showPage(\'about\')">Our story</a><a onclick="showPage(\'blog\')">Journal</a><a onclick="showPage(\'contact\')">Contact</a><a onclick="showPage(\'faq\')">FAQ</a></div>' +
          '<div><h4>Care</h4><a onclick="showPage(\'shipping\')">Delivery</a><a onclick="showPage(\'refund\')">Returns</a><a onclick="showPage(\'privacy\')">Privacy</a><a onclick="showPage(\'terms\')">Terms</a></div>' +
        '</div>' +
        '<div class="ar-foot-legal"><p>© ' + new Date().getFullYear() + ' Arcadia Wellness</p><p>White-label storefront demo — template 02 of six</p></div>' +
      '</div>' +
    '</div>';
  }

  var ICON = function (d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  };

  WL.define({
    slug: 'arcadia',
    mark: { bg: '#23201B', fg: '#F4EFE4', letter: 'A', round: 8, font: 'Georgia,serif', weight: 400, size: 54 },
    name: 'Arcadia',
    tagline: 'Premium everyday wellness',
    title: 'Arcadia — Wellness, thoughtfully formulated',
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
      { key: 'daily', label: 'Daily wellness' },
      { key: 'immunity', label: 'Immunity' },
      { key: 'calm', label: 'Calm' },
      { key: 'beauty', label: 'Beauty' },
      { key: 'sleep', label: 'Sleep' },
      { key: 'women', label: "Women's" },
      { key: 'men', label: "Men's" },
      { key: 'sets', label: 'Ritual sets' }
    ],
    bottomNav: [
      { page: 'home', label: 'Home', icon: ICON('<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>') },
      { page: 'shop', label: 'Shop', icon: ICON('<rect x="4" y="7" width="16" height="14" rx="1"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>') },
      { page: 'blog', label: 'Journal', icon: ICON('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 9h8M8 13h8M8 17h5"/>') },
      { page: 'cart', label: 'Bag', icon: ICON('<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'), action: "openSideCart();setAppNav('cart')" },
      { page: 'account', label: 'Account', icon: ICON('<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'), action: "handleAccountNavClick();setAppNav('account')" }
    ],
    onMount: function () {
      var first = document.querySelector('.ar-rit-tab');
      if (first) AR.routine(first, 'morning');
    }
  });
})();
