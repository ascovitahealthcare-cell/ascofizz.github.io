/* ═══ ASCOFIZZ · EDITORIAL + FAQ DATA (preserved verbatim) ═══ */
// ── BLOG DATA ──
const BLOGS = [
  // ── Category 1: Skin & Glow ──
  { id:1,  tag:"Skin Glow",
    title:"The 30-Day Glutathione Glow: What to Expect Week-by-Week",
    excerpt:"A science-backed timeline of results from Ascofizz's 650mg L-Glutathione with L-Cysteine and Astaxanthin — week by week, from first fizz to visible skin brightening.",
    img:"https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=80",
    date:"Jan 15, 2026", readTime:"6 min read", author:"Dr. Ananya Gupta",
    relatedProduct:1 },

  { id:2,  tag:"Hyperpigmentation",
    title:"Why Your Face Serum Isn't Working: The Internal Approach to Hyperpigmentation",
    excerpt:"Topical creams treat the surface. Glutathione with Vitamin C tackles melanin synthesis from within — here's why internal supplementation changes everything.",
    img:"https://images.unsplash.com/photo-1552693673-1bf958298935?w=600&q=80",
    date:"Jan 22, 2026", readTime:"7 min read", author:"Dr. Kavita Sharma",
    relatedProduct:1 },

  { id:3,  tag:"Effervescent Science",
    title:"Effervescent vs. Capsules: Why 'Fizzy' Glutathione Absorbs 3x Faster",
    excerpt:"Bioavailability research explains why Ascofizz's effervescent format reaches your bloodstream 3× faster than traditional capsules or softgels.",
    img:"https://images.unsplash.com/photo-1587854680352-936b22b91030?w=600&q=80",
    date:"Feb 1, 2026", readTime:"6 min read", author:"Dr. Sanjay Mehta",
    relatedProduct:1 },

  { id:4,  tag:"Bridal Wellness",
    title:"The Ultimate Bridal Supplement Routine: 3 Months to Radiant Wedding Skin",
    excerpt:"India's wedding season demands glowing skin. A 12-week supplement stack — Glutathione, B12+Biotin, and Vitamin C — for brides across Gujarat and beyond.",
    img:"https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=80",
    date:"Feb 10, 2026", readTime:"8 min read", author:"Dr. Kavita Sharma",
    relatedProduct:4 },

  { id:5,  tag:"Anti-Pollution",
    title:"Pollution vs. Skin: How Antioxidants Shield Urban Indian Skin",
    excerpt:"Delhi, Mumbai, Bangalore — pollution accelerates skin ageing by 10 years. Astaxanthin and Glutathione form a protective antioxidant shield against smog damage.",
    img:"https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&q=80",
    date:"Feb 18, 2026", readTime:"5 min read", author:"Dr. Ananya Gupta",
    relatedProduct:1 },

  // ── Category 2: Superfoods & Superpowers ──
  { id:6,  tag:"Superfood Guide",
    title:"Spirulina vs. Moringa: Which 'Green Superfood' Does Your Body Need More?",
    excerpt:"Both are nutritional powerhouses — but Spirulina leads on protein and B12 while Moringa wins on iron and antioxidants. A complete comparison to help you choose.",
    img:"https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80",
    date:"Mar 1, 2026", readTime:"7 min read", author:"Nutritionist Priya Rao",
    relatedProduct:10 },

  { id:7,  tag:"Vegan Nutrition",
    title:"The Vegan B12 Crisis in India: How Spirulina Bridges the Nutritional Gap",
    excerpt:"Over 47% of Indian vegetarians are B12 deficient. Ascofizz's Certified Organic Spirulina with D3 is the plant-based answer — no animal products, full absorption.",
    img:"https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80",
    date:"Mar 8, 2026", readTime:"6 min read", author:"Dr. Sanjay Mehta",
    relatedProduct:10 },

  { id:8,  tag:"Hair Growth",
    title:"Moringa for Hair Growth: The 'Miracle Tree' Secret to Thicker Hair",
    excerpt:"Moringa contains sulphur-rich amino acids that directly feed hair follicles. Combined with Biotin in effervescent form — results come faster than you'd expect.",
    img:"https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=80",
    date:"Mar 15, 2026", readTime:"6 min read", author:"Nutritionist Meera Iyer",
    relatedProduct:4 },

  { id:9,  tag:"Fitness Recovery",
    title:"Post-Workout Recovery: Why Spirulina is the Natural Alternative to Synthetic BCAAs",
    excerpt:"Spirulina contains all essential amino acids, phycocyanin, and iron. For plant-based athletes, Ascofizz's VitaPlus Spirulina is the clean recovery choice.",
    img:"https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&q=80",
    date:"Mar 22, 2026", readTime:"7 min read", author:"Fitness Expert Rohit Shah",
    relatedProduct:10 },

  { id:10, tag:"Weight Management",
    title:"Ancient Wisdom, Modern Format: Why We Combined ACV with Moringa",
    excerpt:"Apple Cider Vinegar with Garcinia Cambogia and Moringa Leaf Extract — the story behind Ascofizz's Green Apple effervescent and why it outperforms plain ACV.",
    img:"https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=600&q=80",
    date:"Mar 29, 2026", readTime:"7 min read", author:"Nutritionist Priya Rao",
    relatedProduct:2 },

  // ── Category 3: Urban Wellness & Lifestyle ──
  { id:11, tag:"Productivity",
    title:"The 'Sluggish Morning' Fix: A Supplement Routine for High-Performance Professionals",
    excerpt:"Corporate India runs on caffeine. Here's a smarter morning stack — L-Carnitine, Vitamin C+Moringa, and B12+Biotin — that delivers sustainable all-day energy.",
    img:"https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=600&q=80",
    date:"Apr 5, 2026", readTime:"6 min read", author:"Wellness Expert Rahul Verma",
    relatedProduct:3 },

  { id:12, tag:"Eye Health",
    title:"Screen Time & Eye Strain: Can Superfoods Save Your Vision in 2026?",
    excerpt:"The average Indian professional spends 11+ hours on screens. Astaxanthin and Spirulina's zeaxanthin protect the macula from blue light damage.",
    img:"https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=80",
    date:"Apr 12, 2026", readTime:"5 min read", author:"Dr. Sanjay Mehta",
    relatedProduct:10 },

  { id:13, tag:"Metabolic Health",
    title:"Metabolic Flexibility: How Apple Cider Vinegar Effervescent Prevents 3 PM Brain Fog",
    excerpt:"Post-lunch blood sugar crashes cause 3 PM brain fog. ACV with Moringa and B-vitamins stabilises glucose metabolism and keeps cognition sharp all afternoon.",
    img:"https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&q=80",
    date:"Apr 19, 2026", readTime:"6 min read", author:"Nutritionist Priya Rao",
    relatedProduct:2 },

  { id:14, tag:"Deficiency Alert",
    title:"The Silent Epidemic: Why 70% of Indians Are Vitamin D & B12 Deficient",
    excerpt:"You can live in a sunny country and still be severely deficient. This is why urban Indians need targeted daily supplementation — and which Ascofizz products help most.",
    img:"https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=600&q=80",
    date:"Apr 26, 2026", readTime:"8 min read", author:"Dr. Kavita Sharma",
    relatedProduct:8 },

  { id:15, tag:"Gut-Skin Axis",
    title:"Gut-Skin Axis: Why Your Digestion Is the Key to Clear Skin",
    excerpt:"Leaky gut triggers systemic inflammation that shows up on your face. Moringa, ACV and zinc-rich effervescents repair the gut lining from within.",
    img:"https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=600&q=80",
    date:"May 3, 2026", readTime:"7 min read", author:"Dr. Ananya Gupta",
    relatedProduct:2 },

  // ── Category 4: B2B & Manufacturing ──
  { id:16, tag:"Gujarat Manufacturing",
    title:"Anand: Why India's 'Milk Capital' Is Becoming the Global Hub for Nutraceuticals",
    excerpt:"Ascofizz's WHO-GMP certified plant in Anand, Gujarat sits at the centre of India's emerging nutraceutical corridor — here's why it matters for global quality.",
    img:"https://images.unsplash.com/photo-1581092921461-39b392021a78?w=600&q=80",
    date:"May 10, 2026", readTime:"6 min read", author:"Ascofizz Team" },

  { id:17, tag:"Private Label",
    title:"How to Start Your Own Supplement Brand in India: A Step-by-Step Guide to Private Labeling",
    excerpt:"From FSSAI registration to formulation, packaging and launch — Ascofizz's B2B arm handles everything for aspiring supplement entrepreneurs across India.",
    img:"https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&q=80",
    date:"May 17, 2026", readTime:"9 min read", author:"Ascofizz B2B Team" },

  { id:18, tag:"Manufacturing Science",
    title:"The Science of Solubility: What Goes into Making a World-Class Effervescent Tablet?",
    excerpt:"pH balance, CO₂ release rate, citric acid ratios and coating technology — an inside look at how Ascofizz's WHO-GMP plant formulates effervescents that actually work.",
    img:"https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80",
    date:"May 24, 2026", readTime:"7 min read", author:"Dr. Sanjay Mehta" },

  { id:19, tag:"Global Exports",
    title:"Exporting Health: Why Indian Supplements Are Taking Over Global Markets in 2026",
    excerpt:"India's nutraceutical exports crossed $6 billion in 2025. WHO-GMP certified manufacturers from Gujarat are leading the charge — and Ascofizz is part of that story.",
    img:"https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=600&q=80",
    date:"May 28, 2026", readTime:"6 min read", author:"Ascofizz Team" },

  { id:20, tag:"Sustainability",
    title:"Sustainable Supplementation: How Ascofizz Supports Local Farmers in Gujarat",
    excerpt:"Ascofizz's Moringa and Spirulina are ethically sourced from certified farms across Gujarat. Here's our commitment to sustainable, local, and traceable nutrition.",
    img:"https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&q=80",
    date:"Jun 4, 2026", readTime:"5 min read", author:"Ascofizz Team" },
];

// ── FAQ DATA ──
const FAQS = [
  { q:"How long does delivery take?", a:"Standard delivery across India takes 3–5 business days. Express delivery in major cities (Mumbai, Delhi, Bangalore, Hyderabad, Ahmedabad, Chennai) takes 1–2 business days. Free shipping on all orders above ₹599.", cat:"Shipping" },
  { q:"What payment methods do you accept?", a:"We accept UPI (Google Pay, PhonePe, Paytm, BHIM), Credit/Debit Cards (Visa, Mastercard, RuPay), Net Banking for all major banks, and No-Cost EMI options via GoKwik. COD is not available — online payments only.", cat:"Payment" },
  { q:'What does "Buy 4 Get 50% OFF" mean?', a:"When you add 4 or more units of any eligible product (marked with the offer) to your cart, the 50% discount is automatically applied to all those units at checkout. This is our way of rewarding customers who stock up!", cat:"Offers" },
  { q:"Are Ascofizz products FSSAI approved?", a:"Yes. All Ascofizz products are manufactured in FSSAI-licensed GMP-compliant facilities and meet all regulatory requirements for food supplements in India. Product licenses are available on request.", cat:"Products" },
  { q:"Can I take multiple supplements together?", a:"Generally yes, but we recommend checking with your doctor if you're on medications. Ascofizz supplements are designed to be safe when combined. Our Combo Kits are specifically curated for safe, effective multi-supplement use.", cat:"Products" },
  { q:"How do I track my order?", a:"After dispatch, you'll receive an SMS and email with a tracking link from our shipping partner (Shiprocket). Track directly at shiprocket.in/shipment-tracking or via the link in your confirmation email.", cat:"Shipping" },
  { q:"Is COD available? Any extra charges?", a:"Yes, COD is not available. We accept UPI, Cards, Net Banking and EMI across India. A nominal COD convenience fee of ₹40 applies. No COD for orders above ₹5,000.", cat:"Payment" },
  { q:"Can I return or exchange products?", a:"We offer a 7-day return policy for sealed, unused products. If you receive a damaged or wrong product, we will replace it at no cost. Contact ascovitahealthcare@gmail.com with your order details and photo.", cat:"Returns" },
  { q:"How should I store the products?", a:"Store all Ascofizz products in a cool, dry place below 30°C. Keep away from direct sunlight and moisture. After opening effervescent tablet tubes, seal tightly and use within 30 days.", cat:"Products" },
  { q:"Are these suitable for vegetarians/vegans?", a:"All Ascofizz supplements are 100% vegetarian. The spirulina products are also vegan. Glutathione and B1+Biotin are vegetarian but check if vegan-strict, as some capsule shells may vary.", cat:"Products" },
  { q:"How do I apply a discount code?", a:"At checkout, enter your promo code in the 'Apply Coupon' field and click Apply. Valid promo codes are shared on our Instagram, WhatsApp channel, and promotional emails.", cat:"Offers" },
  { q:"Do you offer bulk/wholesale pricing?", a:"Yes! For bulk orders of 50+ units or wholesale partnerships, contact us at ascovitahealthcare@gmail.com or call +91 9898 582 650. We offer attractive pricing for distributors, pharmacies, and gyms.", cat:"Orders" },
];

