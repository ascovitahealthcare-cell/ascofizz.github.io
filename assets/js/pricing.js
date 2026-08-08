/* ═══════════════════════════════════════════════════════════════
   ASCOFIZZ · PRICING & ORDER HELPERS
   Preserved verbatim. getOrderTotal() returns { sub, disc } — an
   OBJECT, not a number — because checkout-gokwik.js and the COD
   flow both destructure it. Do not change that shape.
   Online orders ship free; COD adds ₹60 below ₹599.
   ═══════════════════════════════════════════════════════════════ */

async function applyCode() {
  const input = document.getElementById('couponInput');
  const code = input?.value?.trim().toUpperCase();
  if (!code) return;

  // Local test codes only
  if (typeof PROMO_CODES !== 'undefined' && PROMO_CODES[code]) {
    const promo = PROMO_CODES[code];
    activePromoCode = { code, ...promo };
    appliedDiscount = { label: promo.label, type: promo.type === 'pct' ? 'percent' : 'flat', value: promo.value };
    showToast(`🏷️ ${code} applied — ${promo.label}!`);
    renderCart();
    return;
  }

  // All real codes come from backend
  const subtotal = STORE.cart.reduce((s,i) => {
    const p = PRODUCTS.find(x => x.id === i.id);
    return s + ((p?.salePrice || p?.price || 0) * i.qty);
  }, 0);
  try {
    const backendPromo = await validateCouponWithBackend(code, subtotal);
    if (backendPromo) {
      const type = backendPromo.type === 'percent' ? 'pct' : 'flat';
      activePromoCode = { code, type, value: backendPromo.value, label: backendPromo.label || `${code} applied` };
      appliedDiscount = { label: activePromoCode.label, type: backendPromo.type, value: backendPromo.value };
      showToast(`🏷️ ${code} applied — ${activePromoCode.label}!`);
      renderCart();
      return;
    }
  } catch(e) {}

  showToast('❌ Invalid or expired code. Check admin for active codes.', 'error');
}

// ── CHECKOUT ──
function updateCodBtnNote() {
  const note = document.getElementById('codBtnNote');
  if (!note) return;
  const { sub, disc } = getOrderTotal();
  const net = sub - disc;
  note.textContent = net >= 599 ? '✅ Free COD on your order!' : '+₹60 COD charge · Free if order ≥ ₹599';
  note.style.color = net >= 599 ? '#d4edda' : 'rgba(255,255,255,0.85)';
}

// ══════════════════════════════════════════════
// ORDER HELPERS — used by checkout (COD + online).
// These were missing entirely, which is why every
// order attempt threw "getOrderTotal is not defined"
// / "generateOrderId is not defined" and silently
// failed at the very first line of the checkout flow.
// ══════════════════════════════════════════════
function getOrderTotal() {
  const sub = STORE.cart.reduce((s, item) => {
    const p = PRODUCTS.find(p => p.id === item.id);
    if (!p) return s;
    const unitPrice = item.tierRate !== undefined ? item.tierRate : (p.salePrice || p.price);
    return s + unitPrice * item.qty;
  }, 0);

  let disc = 0;
  if (typeof activePromoCode !== 'undefined' && activePromoCode) {
    disc = activePromoCode.type === 'pct' ? Math.round(sub * activePromoCode.value / 100) : Math.min(activePromoCode.value, sub);
  } else if (typeof appliedDiscount !== 'undefined' && appliedDiscount) {
    disc = appliedDiscount.type === 'percent' ? Math.round(sub * appliedDiscount.value / 100) : appliedDiscount.value;
  }

  return { sub, disc };
}

function generateOrderId() {
  // Matches the "AVC-########" format used everywhere else
  // (invoice numbers, order tracking, thank-you page placeholder).
  const ts  = Date.now().toString().slice(-6);
  const rnd = Math.floor(10 + Math.random() * 89);
  return 'AVC-' + ts + rnd;
}

function placeOrder() {
  // Route to the real payment gateway
  initiatePayment();
}

/* ── GoKwik gateway call + payment return handler ──────────────
   These two were CALLED by the checkout flow but defined nowhere in
   the Ascofizz build, so every online payment threw a ReferenceError
   and only COD worked. Restored from the reference implementation.
   The server recomputes the amount from real product prices, so the
   `total` passed in is display-only — the customer is charged the
   server's figure, never the browser's.
   ────────────────────────────────────────────────────────────── */
async function startGoKwikPayment(orderId, total, formData, btn, origText) {
  try {
    const resp = await fetch(API_BASE + '/api/create-gokwik-order', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' },
        localStorage.getItem('asc_jwt') ? { 'Authorization': 'Bearer ' + localStorage.getItem('asc_jwt') } : {}),
      body: JSON.stringify({
        merchant_reference_id: orderId,
        amount: total,
        items: STORE.cart.map(function(i){
          var o = { id: i.id, qty: i.qty };
          if (i.tierTabs) { o.tierTabs = i.tierTabs; o.tierIdx = i.tierIdx; }
          return o;
        }),
        coupon_code: (typeof activePromoCode !== 'undefined' && activePromoCode) ? activePromoCode.code : null,
        vita_points: (typeof VITA_APPLIED !== 'undefined' && VITA_APPLIED > 0) ? VITA_APPLIED : 0,
        customer_name:  [formData.firstName, formData.lastName].filter(Boolean).join(' ') || formData.name || '',
        customer_email: formData.email,
        customer_phone: formData.phone,
        description: 'Ascofizz order ' + orderId,
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.success || !data.short_url) {
      throw new Error(data.error || 'Could not start payment');
    }
    try {
      sessionStorage.setItem('asc_pending_gk', JSON.stringify({
        orderId: orderId, formData: formData, t: Date.now(),
        vitaApplied: (typeof VITA_APPLIED !== 'undefined' ? VITA_APPLIED : 0),
        promoCode: (typeof activePromoCode !== 'undefined' && activePromoCode) ? activePromoCode : null,
      }));
    } catch (e) {}
    window.location.href = data.short_url;
  } catch (err) {
    console.error('[startGoKwikPayment]', err);
    if (typeof hideProcessingScreen === 'function') hideProcessingScreen();
    if (btn) { btn.disabled = false; btn.textContent = origText || '💳 Pay via GoKwik'; }
    document.querySelectorAll('.cfPayBtn').forEach(function(b){ b.disabled = false; b.style.opacity = '1'; });
    if (typeof showPaymentError === 'function') {
      showPaymentError('Payment could not be started: ' + err.message, orderId, formData, total, 'gokwik');
    } else if (typeof showToast === 'function') {
      showToast('❌ ' + err.message, 'error');
    }
  }
}

async function handleGoKwikReturn(merchantRefId) {
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem('asc_pending_gk') || 'null'); } catch (e) {}
  if (!pending || pending.orderId !== merchantRefId) {
    console.warn('[handleGoKwikReturn] No matching pending session for', merchantRefId);
    return;
  }
  sessionStorage.removeItem('asc_pending_gk');
  if (typeof VITA_APPLIED !== 'undefined') VITA_APPLIED = pending.vitaApplied || 0;
  if (typeof activePromoCode !== 'undefined') activePromoCode = pending.promoCode || null;

  showProcessingScreen(merchantRefId, 0, 'gokwik');
  try {
    const resp = await fetch(API_BASE + '/api/verify-gokwik-order/' + encodeURIComponent(merchantRefId));
    const data = await resp.json();
    if (!resp.ok || !data.success) throw new Error(data.error || 'Could not verify payment');
    if (!data.paid) {
      if (typeof hideProcessingScreen === 'function') hideProcessingScreen();
      showPaymentError('Payment was not completed. If money was deducted, it will be auto-refunded by GoKwik within 5-7 days.',
        merchantRefId, pending.formData, data.amount || 0, 'gokwik');
      return;
    }
    await finalizeOrder(merchantRefId, pending.formData, data.amount || 0, 'gokwik', 0);
  } catch (err) {
    console.error('[handleGoKwikReturn]', err);
    if (typeof hideProcessingScreen === 'function') hideProcessingScreen();
    showPaymentError('We could not confirm your payment automatically. If money was deducted, contact +91 98985 82650 with Order ID: ' + merchantRefId + '. (' + err.message + ')',
      merchantRefId, pending.formData, 0, 'gokwik');
  }
}
