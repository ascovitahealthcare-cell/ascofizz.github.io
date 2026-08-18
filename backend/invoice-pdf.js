/* ══════════════════════════════════════════════════════════════════════
   ASCOFIZZ — SERVER-SIDE A4 GST TAX INVOICE (PDF, pdfkit)

   Produces the same statutory document the storefront's invoice-template.js
   renders — A4, GST Rule 46 layout, supplier GSTIN, HSN, tax split,
   amount-in-words, reverse-charge declaration and digitally-generated
   signature panel — but as a genuine .pdf file the customer can download
   and open in any viewer.

   The storefront keeps the HTML "Print" path (window.print() on the same
   shared template) and uses this endpoint for "Download Invoice".
   ══════════════════════════════════════════════════════════════════════ */

const PDFDocument = require('pdfkit');

// ══════════════════════════════════════════════════════════════
// Statutory identifiers — the legal supplier details printed on every
// tax invoice. These are a legal declaration, not branding, so they are
// read from the environment rather than baked into the source: a wrong
// GSTIN on an issued invoice is a compliance problem, and a fork that
// silently inherits the previous seller's identifiers would issue
// invoices in someone else's name.
//
// invoice-template.js (the storefront's HTML/print path) must be kept in
// step with the same values — the two render the same document.
// ══════════════════════════════════════════════════════════════
const LEGAL = {
  legalName:  process.env.SELLER_LEGAL_NAME  || 'Ascofizz Healthcare',
  tradeName:  process.env.BRAND_NAME         || 'Ascofizz',
  addr1:      process.env.SELLER_ADDR1       || '',
  addr2:      process.env.SELLER_ADDR2       || '',
  gstin:      process.env.SELLER_GST_TIN     || '',
  fssai:      process.env.SELLER_FSSAI       || '',
  stateName:  process.env.SELLER_STATE       || '',
  stateCode:  process.env.SELLER_STATE_CODE  || '',
  phone:      process.env.SUPPORT_PHONE      || '',
  email:      process.env.SUPPORT_EMAIL      || '',
  site:       (process.env.FRONTEND_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
  hsnDefault: process.env.SELLER_HSN_DEFAULT || '2106',
  gstRate:    Number(process.env.SELLER_GST_RATE || 5),
};

// A missing GSTIN makes the document non-compliant. Warn loudly at boot
// rather than silently printing a blank field on a customer's invoice.
if (!LEGAL.gstin) {
  console.warn('[invoice] SELLER_GST_TIN is not set — invoices will print without a supplier GSTIN.');
}

const IN_STATE_CODES = {
  'jammu and kashmir':'01','himachal pradesh':'02','punjab':'03','chandigarh':'04',
  'uttarakhand':'05','haryana':'06','delhi':'07','rajasthan':'08','uttar pradesh':'09',
  'bihar':'10','sikkim':'11','arunachal pradesh':'12','nagaland':'13','manipur':'14',
  'mizoram':'15','tripura':'16','meghalaya':'17','assam':'18','west bengal':'19',
  'jharkhand':'20','odisha':'21','chhattisgarh':'22','madhya pradesh':'23','gujarat':'24',
  'maharashtra':'27','karnataka':'29','goa':'30','kerala':'32','tamil nadu':'33',
  'puducherry':'34','telangana':'36','andhra pradesh':'37','ladakh':'38'
};

// ₹ → Indian number words (matches the storefront version).
function _amtWords(n) {
  n = Math.round(n || 0);
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function two(x){ return x<20 ? a[x] : b[Math.floor(x/10)] + (x%10 ? ' ' + a[x%10] : ''); }
  function three(x){ return (x>=100 ? a[Math.floor(x/100)] + ' Hundred' + (x%100?' ':'') : '') + (x%100?two(x%100):''); }
  if (n === 0) return 'Zero Rupees Only';
  let out = '', cr = Math.floor(n/10000000); n %= 10000000;
  let lk = Math.floor(n/100000); n %= 100000;
  let th = Math.floor(n/1000); n %= 1000;
  if (cr) out += three(cr) + ' Crore ';
  if (lk) out += three(lk) + ' Lakh ';
  if (th) out += three(th) + ' Thousand ';
  if (n)  out += three(n);
  return out.trim().replace(/\s+/g,' ') + ' Rupees Only';
}

// Coerce the many shapes an order arrives in into a clean item array —
// mirrors _coerceInvoiceItems / normaliseOrderForInvoice in the template.
function _normalise(o) {
  let raw = o.items;
  if (raw == null || raw === '') raw = o.srItems || o.line_items || o.order_items || o.products || [];
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.charAt(0) === '[' || t.charAt(0) === '{') {
      try { raw = JSON.parse(t); } catch(e) { raw = t; }
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    raw = (raw.name || raw.product_name) ? [raw] : Object.keys(raw).map(k => raw[k]);
  }
  if (typeof raw === 'string') {
    raw = raw.split(/\s*,\s*(?![^()]*\))/).filter(Boolean).map(part => {
      const m = part.match(/^(.*?)\s*[×xX]\s*(\d+)\s*$/);
      return m ? { name: m[1].trim(), qty: Number(m[2]) } : { name: part.trim(), qty: 1 };
    });
  }
  if (!Array.isArray(raw)) raw = [];
  const items = raw.map(i => {
    if (typeof i === 'string') i = { name: i, qty: 1 };
    const qty  = Number(i.qty || i.units || i.quantity || 1) || 1;
    const rate = Number(i.price || i.selling_price || i.rate || i.unit_price || 0) || 0;
    const mrp = Number(i.mrp || i.list_price || i.original_price || rate) || rate;
    const itemDiscount = Math.max(0, (mrp - rate) * qty);
    return { name: i.name || i.product_name || i.title || 'Item', hsn: i.hsn || LEGAL.hsnDefault, qty, rate, mrp, itemDiscount, itemDiscountName: i.discount_name || i.discountName || i.offer_name || i.offerName || i.applied_offer || (itemDiscount ? 'Product price saving' : ''), gross: qty*rate };
  });
  const total = Number(o.total || o.amount || o.order_total || 0) || 0;
  let gross = items.reduce((t,i) => t + i.gross, 0);
  if (!gross && total && items.length) {
    const per = total / items.reduce((t,i) => t + i.qty, 0);
    items.splice(0, items.length, ...items.map(i => ({ name:i.name, hsn:i.hsn, qty:i.qty, rate:per, mrp:per, itemDiscount:0, itemDiscountName:'', gross:per*i.qty })));
    gross = total;
  }
  const state = (o.state || o.customer_state || (o.formData && o.formData.state) || '').toString();
  const buyerCode = IN_STATE_CODES[(state||'').toLowerCase().trim()] || '';
  return {
    orderId: String(o.orderId || o.id || o.order_id || ''),
    date: o.date || (o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : new Date().toLocaleDateString('en-IN')),
    customer: o.customer || o.customer_name || [o.firstName,o.lastName].filter(Boolean).join(' ') || o.name || '',
    email: o.email || o.customer_email || '',
    phone: o.phone || o.customer_phone || '',
    address: o.address || o.customer_address || o.shipping_address || '',
    state, buyerCode,
    intra: !!state ? buyerCode === LEGAL.stateCode : true,
    items: items.length ? items : [{ name:'Order '+ (o.orderId||o.id||''), hsn: LEGAL.hsnDefault, qty:1, rate: total, mrp: total, gross: total }],
    mrpTotal: Number(o.mrp_total || o.mrpTotal || o.list_total || 0) || items.reduce((t,i) => t + (i.mrp || i.rate) * i.qty, 0) || gross,
    ship: Number(o.ship || o.shipping || o.shipping_charge || 0) || 0,
    tierDiscount: Number(o.tier_discount || o.tierDiscount || o.pack_discount || 0) || 0,
    mixMatchDiscount: Number(o.mix_match_discount || o.mixMatchDiscount || o.mix_discount || 0) || 0,
    couponDiscount: Number(o.coupon_discount || o.couponDiscount || o.promo_discount || 0) || 0,
    couponCode: o.coupon_code || o.couponCode || o.promo_code || '',
    vitaPointsDiscount: Number(o.vita_points_discount || o.vitaPointsDiscount || o.points_discount || 0) || 0,
    vitaPoints: Number(o.vita_points || o.vitaPoints || o.points_redeemed || 0) || 0,
    discount: Number(o.discount || o.totalDisc || 0) || 0,
    total,
    method: o.method || o.payment_method || 'Online'
  };
}

// ── text wrapping helper ────────────────────────────────────────────────

/* ══════════════════════════════════════════════════════════════
   buildInvoicePDF(o, res)
   Streams a one-page A4 GST tax invoice for `o` straight into `res`.
   ══════════════════════════════════════════════════════════════ */
function buildInvoicePDF(o, res) {
  const L = LEGAL;
  const d = _normalise(o);
  const invNo = 'INV-' + d.orderId.replace(/^(AVC-|DEMO-)/,'');
  const money = n => 'Rs. ' + Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});

  const gross = d.items.reduce((t,i) => t + i.gross, 0) || d.total;
  const mrpTotal = d.mrpTotal || d.items.reduce((t,i) => t + (i.mrp || i.rate) * i.qty, 0) || gross;
  const componentDiscount = d.tierDiscount + d.mixMatchDiscount + d.couponDiscount + d.vitaPointsDiscount;
  const itemDiscountTotal = d.items.reduce((t,i) => t + (i.itemDiscount || Math.max(0, (i.mrp - i.rate) * i.qty)), 0);
  const totalSavings = Math.max(0, mrpTotal - (d.total || gross), d.discount || 0, componentDiscount + itemDiscountTotal);
  const discountLines = [];
  d.items.forEach(i => {
    const amount = i.itemDiscount || Math.max(0, (i.mrp - i.rate) * i.qty);
    if (amount > 0) discountLines.push({ name: (i.itemDiscountName || 'Product price saving') + ' — ' + i.name, amount });
  });
  if (d.tierDiscount) discountLines.push({ name: 'Pack / tier offer', amount: d.tierDiscount });
  if (d.mixMatchDiscount) discountLines.push({ name: 'Mix & Match — lowest-priced eligible unit free', amount: d.mixMatchDiscount });
  if (d.couponDiscount || (d.discount && !componentDiscount && !itemDiscountTotal)) discountLines.push({ name: 'Coupon' + (d.couponCode ? ' — ' + d.couponCode : ''), amount: d.couponDiscount || d.discount });
  if (d.vitaPointsDiscount) discountLines.push({ name: 'VitaPoints redemption — ' + d.vitaPoints + ' points', amount: d.vitaPointsDiscount });
  const rate = L.gstRate;
  // Discount excluded from taxable value (CGST Act s.15(3)(a));
  // shipping included as consideration (s.15(2)(c)).
  let consideration = Math.max(0, gross - d.discount + d.ship);
  if (d.total > 0 && Math.abs(consideration - d.total) > 0.05) consideration = d.total;
  const taxable = consideration / (1 + rate/100);
  const taxTotal = consideration - taxable;
  const cgstHalf = Math.round((taxTotal/2)*100)/100;
  const cgst = d.intra ? cgstHalf : 0;
  const sgst = d.intra ? Math.round((taxTotal - cgstHalf)*100)/100 : 0;
  const igst = d.intra ? 0 : taxTotal;
  const grand = d.total || consideration;

  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: false });
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Ascofizz-Tax-Invoice-' + encodeURIComponent(invNo) + '.pdf"');
    res.setHeader('Cache-Control', 'no-store');
  }
  doc.pipe(res);

  const MW = 595.28, MH = 841.89; // A4 pts
  const M = 28;                     // page margin (≈10mm)
  const X = M, R = MW - M;          // content bounds
  const C = (l,r) => { doc.rect(l, r.y, r - l, r.h).stroke('#D9CEC0'); };

  let y = M;

  // ── header ── fixed absolute positions; pdfkit has no inline HTML markup ──
  const hdrB = y;
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#3E555C').text('OZY' , X, y, {continued:true})
     .font('Helvetica').fillColor('#547177').text('LIX');
  doc.font('Helvetica').fontSize(5.5).fillColor('#8A9AA0')
     .text('ORGANIC VITAMINS & SUPPLEMENTS', X, doc.y + 3);
  doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#20303A')
     .text(L.legalName, X, doc.y + 4);
  doc.font('Helvetica').fontSize(7.2).fillColor('#5A6B72').lineGap(1.6)
     .text(L.addr1 + '\n' + L.addr2, X, doc.y + 2, { width: 290 });
  doc.text('GSTIN: ', X, doc.y + 1, {continued:true});
  doc.font('Helvetica-Bold').text(L.gstin, {continued:true});
  doc.font('Helvetica').text('  |  State: ' + L.stateName + ' (' + L.stateCode + ')');
  doc.text('FSSAI Lic. No: ' + L.fssai, X, doc.y + 1);

  // right: TAX INVOICE block (fixed y positions, right-aligned)
  // Each row: label right-aligned in an 70pt sub-box at the right edge,
  // value bold right-aligned in its own 112pt sub-box immediately left —
  // both flush with the right page margin, so they can never overlap.
  const tX = R - 186;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#547177')
     .text('TAX INVOICE', tX, hdrB, { width: 186, align: 'right' });
  const rLines = [
    ['Invoice No:', invNo], ['Invoice Date:', d.date],
    ['Order Ref:', d.orderId],
    ['Payment:', (function(m){
      switch (String(m||'').toLowerCase()) {
        case 'cod': case 'cash': return 'COD (Cash on Delivery)';
        case 'cashfree': return 'Online (Cashfree)';
        case 'gokwik': return 'Online (GoKwik)';
        case 'upi': return 'UPI';
        case 'card': return 'Card';
        case 'netbanking': return 'Net Banking';
        case 'emi': return 'EMI';
        default: return String(m || 'Online Payment');
      }
    })(d.method)],
    ['Reverse Charge:', 'No']
  ];
  rLines.forEach(([lab, val], i) => {
    const ry = hdrB + 17 + i * 10;
    doc.font('Helvetica').fontSize(7).fillColor('#5A6B72')
      .text(lab, tX + 116, ry, { width: 70, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#20303A')
      .text(String(val), tX, ry, { width: 114, align: 'right' });
  });
  y = hdrB + 80;

  // ── parties ─────────────────────────────────────────────────────────
  const pW = (R - X - 7)/2;
  const box = (l, w, h) => { doc.rect(l, y, w, h).fill('#FFF').stroke('#D9CEC0'); };
  box(X, pW, 74); box(X + pW + 7, pW, 74);
  const label = (x, t) => doc.font('Helvetica-Bold').fontSize(6)
    .fillColor('#A08B72').text(t, x + 7, y + 7);
  // body(): [{t, b}] — bold line rendered first, normal lines after
  const body = (x, w, lines) => {
    const bx = x + 7, bw = w - 14;
    let ty = y + 19;
    for (const ln of lines) {
      const txt = String(ln.t || ln || '');
      if (!txt) continue;
      if (ln.b) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#20303A').text(txt, bx, ty, { width: bw });
        ty += 12;
      } else {
        doc.font('Helvetica').fontSize(7.2).fillColor('#5A6B72').lineGap(2)
          .text(txt, bx, ty, { width: bw });
        ty = doc.y + 4;
      }
    }
  };
  label(X, 'BILL TO');
  body(X, pW, [
    { t: d.customer, b: true },
    { t: d.address }, { t: (d.phone||'') + (d.email ? '  |  ' + d.email : '') }
  ]);
  label(X + pW + 7, 'SHIP TO / PLACE OF SUPPLY');
  body(X + pW + 7, pW, [
    { t: d.customer, b: true },
    { t: d.address },
    { t: 'Place of Supply: ' + (d.state || L.stateName) + (d.buyerCode ? ' (' + d.buyerCode + ')' : '') },
    { t: 'Supply Type: ' + (d.intra ? 'Intra-State' : 'Inter-State') }
  ]);
  y += 64 + 7;

  // ── items table ─────────────────────────────────────────────────────
  const cols = [
    { k:'#', w:22, a:'center' }, { k:'Description of Goods', w:170, a:'left' },
    { k:'HSN', w:44, a:'center' }, { k:'Qty', w:26, a:'center' },
    { k:'MRP', w:48, a:'right' }, { k:'Rate', w:48, a:'right' }, { k:'Taxable', w:48, a:'right' },
    { k:'GST', w:24, a:'center' }, { k:'Tax Amt', w:52, a:'right' },
    { k:'Amount', w:55, a:'right' }
  ];
  const tw = cols.reduce((s,c)=>s+c.w,0);
  const th = 13;
  doc.rect(X, y, tw, th).fill('#547177');
  let cx = X;
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#FFFFFF');
  for (const c of cols) {
    const cellW = c.k === 'Amount' ? tw - (tw - c.w) : c.w;
    const x0 = c.k === 'Amount' ? R - c.w : cx;
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#FFFFFF')
      .text(c.k, x0 + (c.a === 'left' ? 3 : 0), y + 3.5,
        { width: cellW - 6, align: c.a === 'left' ? 'left' : (c.a === 'right' ? 'right' : 'center') });
    cx += c.w;
  }
  y += th;
  doc.font('Helvetica').fontSize(7.5).fillColor('#20303A');
  d.items.forEach((i, n) => {
    const rowH = i.itemDiscount > 0 ? 24 : 15;
    if (n % 2) doc.rect(X, y, tw, rowH).fill('#FBF7F1');
    doc.fillColor('#20303A');
    const base = i.gross / (1 + rate/100);
    const itemLabel = i.name + (i.itemDiscount > 0 ? ' — ' + (i.itemDiscountName || 'Product price saving') + ' (Save ' + money(i.itemDiscount) + ')' : '');
    const vals = ['#'+(n+1), itemLabel, String(i.hsn), String(i.qty), money(i.mrp || i.rate), money(i.rate),
      money(base), rate+'%', money(i.gross - base), money(i.gross)];
    for (let c = 0; c < cols.length; c++) {
      const cellW = c === cols.length-1 ? tw - (tw - cols[c].w) : cols[c].w;
      const x0 = c === cols.length-1 ? R - cols[c].w : (X + cols.slice(0,c).reduce((s,cl)=>s+cl.w,0));
      const align = cols[c].a === 'left' ? 'left' : (cols[c].a === 'right' ? 'right' : 'center');
      const pad = align === 'left' ? 3 : (align === 'right' ? 0 : 0);
      doc.text(vals[c], x0 + pad, y + 4,
        { width: cellW - (align === 'left' ? 6 : 0), align: align === 'left' ? 'left' : align });
    }
    doc.moveTo(X, y + rowH).lineTo(R, y + rowH).stroke('#E7DED2');
    y += rowH;
  });
  y += 7;

  // ── amount in words + totals ────────────────────────────────────────
  const wordsW = tw - 200;
  box(X, wordsW, 78);
  doc.font('Helvetica-Bold').fontSize(6).fillColor('#A08B72')
    .text('AMOUNT IN WORDS', X + 7, y + 6);
  doc.font('Helvetica').fontSize(7.2).fillColor('#20303A').lineGap(2)
    .text(_amtWords(grand), X + 7, y + 15, { width: wordsW - 14 });
  doc.font('Helvetica').fontSize(6.4).fillColor('#8A9AA0')
    .text('All prices are inclusive of GST. Tax is computed on the taxable value shown above in accordance with Rule 46 of the CGST Rules, 2017.',
      X + 7, doc.y + 6, { width: wordsW - 14 });

  const tX0 = X + wordsW + 7, tW = 200;
  const totRows = [
    ['List / MRP value', money(mrpTotal), false],
    ['Taxable Value', money(taxable), false],
    ...(d.intra
      ? [['CGST @ '+(rate/2)+'%', money(cgst), false], ['SGST @ '+(rate/2)+'%', money(sgst), false]]
      : [['IGST @ '+rate+'%', money(igst), false]]),
    ...discountLines.map(line => [line.name, '- ' + money(line.amount), false]),
    ['Total savings', '- ' + money(totalSavings), false],
    ['Shipping', d.ship ? money(d.ship) : 'FREE', false],
    ['GRAND TOTAL', money(grand), true]
  ];
  let ty = y;
  for (const [k,v,big] of totRows) {
    const rh = big ? 22 : 14;
    doc.rect(tX0, ty, tW, rh).fill(big ? '#547177' : '#FFFFFF').stroke('#D9CEC0');
    doc.font(big ? 'Helvetica-Bold' : 'Helvetica').fontSize(big ? 8 : 7.5)
      .fillColor(big ? '#FFFFFF' : '#20303A');
    doc.text(k, tX0 + 8, ty + (big ? 4 : 3), { width: tW/2, continued:true });
    doc.text(v, tX0 + tW/2 - 8, doc.y, { width: tW/2, align:'right' });
    ty += rh;
  }
  y = Math.max(y + 78 + 7, ty + 7);

  // ── legal / terms + signature ───────────────────────────────────────
  const sW = 104;
  box(X + tw - sW, sW, 66);
  doc.font('Helvetica').fontSize(5.6).fillColor('#8A9AA0').text('For ' + L.tradeName, X + tw - sW + 7, y + 6, { width: sW - 14, align:'center' });
  doc.rect(X + tw - sW + 7, y + 22, sW - 14, 24).stroke('#D9CEC0');
  doc.font('Helvetica-Bold').fontSize(6.4).fillColor('#20303A')
    .text('Authorised Signatory', X + tw - sW + 7, y + 52, { width: sW - 14, align:'center' });
  doc.font('Helvetica').fontSize(5.4).fillColor('#8A9AA0')
    .text('Digitally generated', X + tw - sW + 7, y + 59, { width: sW - 14, align:'center' });

  const polW = tw - sW - 10;
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#547177')
    .text('RETURN & REFUND POLICY', X, y, { width: polW });
  y += 9;
  doc.font('Helvetica').fontSize(6.2).fillColor('#6B7A80').lineGap(1.8)
    .text(
     '• Returns accepted within 7 days of delivery for sealed, unused products in original packaging.\n' +
     '• Damaged, defective or wrong items: report within 48 hours with an unboxing photo/video.\n' +
     '• For hygiene and safety, opened or partially consumed supplements cannot be returned.\n' +
     '• Refunds are issued to the original payment method within 5–7 business days of pickup and quality check.\n' +
     '• Shipping charges are non-refundable unless the return is due to our error.\n\n' +
     'TERMS & CONDITIONS\n' +
     '• Goods once sold are covered only by the return policy stated above.\n' +
     '• This is a computer-generated invoice and is valid without a physical signature.\n' +
     '• Subject to Anand, Gujarat jurisdiction only.\n' +
     '• These are food supplements, not medicine — not intended to diagnose, treat, cure or prevent any disease.\n' +
     '• Store in a cool, dry place away from direct sunlight. Keep out of reach of children.',
     X, y, { width: polW });

  // ── footer ──────────────────────────────────────────────────────────
  doc.moveTo(X, MH - M - 22).lineTo(R, MH - M - 22).stroke('#D9CEC0');
  doc.font('Helvetica').fontSize(6.2).lineGap(1.6).fillColor('#8A9AA0')
    .text(
     L.legalName + '  ·  ' + L.addr2 + '  ·  ' + L.phone + '  ·  ' + L.email + '  ·  ' + L.site + '\n' +
     'FSSAI Lic. ' + L.fssai + '  |  GSTIN ' + L.gstin +
     '  |  Made in India, Anand Gujarat  |  Thank you, ' + (d.customer || 'Customer') + '! We are happy to connect with you. 🌿✨\n' +
     'Policy and order support: Aamin Vahora +91 72658 84137',
     X, MH - M - 16, { width: tw, align:'center' });

  doc.end();
}

module.exports = { buildInvoicePDF };