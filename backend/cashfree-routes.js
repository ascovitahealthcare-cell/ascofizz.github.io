// ═══════════════════════════════════════════════════════════════
// CASHFREE PAYMENT GATEWAY
//
// Same trust model as the GoKwik integration in server.js:
//   - The amount charged is ALWAYS recomputed server-side from the
//     products table (computeServerSideTotal) — never the client's number.
//   - VitaPoints redemption is bound to the verified JWT, never a
//     client-supplied email (that was a real vulnerability fixed
//     elsewhere in this codebase — don't reintroduce it here).
//   - Every write path is idempotent per order id, so a retried
//     confirm call or a duplicate webhook cannot create a second order
//     or award points twice.
//
// Cashfree Orders API docs: https://docs.cashfree.com/reference/pgcreateorder
// Env vars required: CASHFREE_APP_ID, CASHFREE_SECRET_KEY,
//   CASHFREE_ENV = SANDBOX | PRODUCTION
//
// NOTE: this module was built and syntax-checked, but could not be
// exercised against Cashfree's live API from this environment (no
// network egress to api.cashfree.com here, and no sandbox credentials
// were available). Test end-to-end with real sandbox keys before
// relying on it for real orders — the create/confirm/webhook contract
// matches Cashfree's published API as of this writing, but Cashfree's
// API can change.
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');
const BRAND = require('./brand.config');

module.exports = function mountCashfreeRoutes(app, deps) {
  const {
    supabase, verifyToken, resolveVitaDiscount, releaseVitaReservation, reverseVitaForRefund, computeServerSideTotal,
    sp_place_order, awardVitaPoints, sendOrderEmail, authMiddleware, adminOnly, rateLimit,
    recordWebhookEvent,
  } = deps;

  // AUDIT FIX: payment-session creation had no rate limit — same gap
  // fixed on the GoKwik routes in server.js.
  const paymentLimiter = rateLimit
    ? rateLimit({ windowMs: 10 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false,
        message: { error: 'Too many payment attempts. Please wait a few minutes.' } })
    : (req, res, next) => next();

  const CF_ENV    = (process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase();
  const CF_BASE   = CF_ENV === 'PRODUCTION' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  const CF_API_VERSION = process.env.CASHFREE_API_VERSION || '2023-08-01';

  function cfConfigured() {
    return !!(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
  }

  function cfHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-client-id':     process.env.CASHFREE_APP_ID,
      'x-client-secret':  process.env.CASHFREE_SECRET_KEY,
      'x-api-version':    CF_API_VERSION,
    };
  }

  function jwtEmailFrom(req) {
    try {
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Bearer ')) return null;
      return verifyToken(auth.slice(7))?.email || null;
    } catch { return null; }
  }

  // ── CREATE ORDER — opens a Cashfree checkout session ────────────
  // Mirrors /api/create-gokwik-order: items are mandatory, the amount
  // is always recomputed, VitaPoints are only previewed (not committed)
  // since payment hasn't happened yet.
  // FIX (Aug 2026 1000-scenario audit): payment-session creation had no
  // authentication — anyone could open checkout sessions at will. GoKwik's
  // mirror already required a logged-in customer; Cashfree must be
  // identical. The amount is still recomputed server-side, so an
  // authenticated attacker cannot inflate what they pay — but anonymous
  // abuse (churning the gateway, spamming order references) is now gated.
  app.post('/api/create-cashfree-order', paymentLimiter, authMiddleware, async (req, res) => {
    try {
      if (!cfConfigured()) {
        return res.status(500).json({ error: 'Cashfree not configured. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY on Render.' });
      }
      const body  = req.body || {};
      const phone = String(body.customer_phone || body.customer?.phone || '').replace(/\D/g, '').slice(-10);
      const name  = body.customer_name  || body.customer?.name  || 'Customer';
      const email = body.customer_email || body.customer?.email || '';
      const refId = body.merchant_reference_id || body.order_id || ('ASC' + Date.now());

      if (!body.items || (Array.isArray(body.items) && !body.items.length)) {
        return res.status(400).json({ error: 'Cart items are required to create a payment session' });
      }
      if (!phone || phone.length !== 10) {
        return res.status(400).json({ error: 'Invalid phone number (must be 10 digits)' });
      }

      // The verified JWT identity is the source of truth for WHO is
      // paying. A body-supplied email alone is no longer sufficient —
      // it mirrors the trust rule on confirm (redemption bound to the
      // JWT, never to a client-supplied value).
      const jwtEmail = jwtEmailFrom(req);
      if (!jwtEmail) {
        return res.status(401).json({ error: 'Please sign in to your account before paying' });
      }
      let amount;
      try {
        const vita = await resolveVitaDiscount({
          email: jwtEmail, pointsRequested: body.vita_points, orderId: refId, commit: false,
        });
        const computed = await computeServerSideTotal(body.items, body.coupon_code, { vitaRupees: vita.rupees, customerEmail: jwtEmail || email });
        amount = computed.total;
      } catch (calcErr) {
        return res.status(400).json({ error: 'Could not verify cart total: ' + calcErr.message });
      }
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

      const BACKEND_URL  = BRAND.apiUrl;
      const FRONTEND_URL = BRAND.siteUrl;

      // customer_id must be a stable, URL-safe identifier — email works,
      // but Cashfree rejects some characters, so it's sanitised.
      const customerId = (jwtEmail || email || phone || refId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

      const payload = {
        order_id: refId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: customerId,
          customer_name: name,
          customer_email: email || undefined,
          customer_phone: phone,
        },
        order_meta: {
          return_url: `${FRONTEND_URL}/?cf_order_id={order_id}`,
          notify_url: `${BACKEND_URL}/api/cashfree-webhook`,
        },
        order_note: body.description || `Payment for order ${refId}`,
      };

      console.log(`[Cashfree] Creating order: ${refId} ₹${amount}`);

      const r = await fetch(`${CF_BASE}/orders`, {
        method: 'POST', headers: cfHeaders(), body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
      const data = await r.json();

      if (!r.ok) {
        console.error(`[Cashfree] Create order FAILED (${r.status}):`, data?.message || JSON.stringify(data));
        return res.status(r.status || 500).json({ error: data?.message || 'Could not create Cashfree order' });
      }

      console.log(`[Cashfree] ✅ Order created: ${data.order_id} | session: ${data.payment_session_id} | env: ${CF_ENV}`);
      res.json({
        success: true,
        order_id: data.order_id,
        cf_order_id: data.cf_order_id,
        payment_session_id: data.payment_session_id,
        order_status: data.order_status,
        // Tells the frontend which mode to initialise the Cashfree SDK in
        // (sandbox vs production), so it always matches whichever
        // CASHFREE_ENV this order was actually created under — no need
        // to separately keep a frontend flag in sync by hand.
        cf_env: CF_ENV === 'PRODUCTION' ? 'production' : 'sandbox',
      });
    } catch (err) {
      console.error('[Cashfree] create-cashfree-order error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── VERIFY — re-fetch order status directly from Cashfree ───────
  // Never trust a client's claim that payment succeeded; always ask
  // Cashfree directly, the same way /api/verify-gokwik-order works.
  app.get('/api/verify-cashfree-order/:orderId', async (req, res) => {
    try {
      if (!cfConfigured()) return res.status(500).json({ error: 'Cashfree not configured' });
      const r = await fetch(`${CF_BASE}/orders/${encodeURIComponent(req.params.orderId)}`, {
        headers: cfHeaders(), signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status || 500).json({ error: data?.message || 'Could not fetch order status' });
      res.json({
        success: true,
        order_status: data.order_status, // ACTIVE | PAID | EXPIRED | TERMINATED
        paid: data.order_status === 'PAID',
        order_id: data.order_id,
        cf_order_id: data.cf_order_id,
        order_amount: data.order_amount,
      });
    } catch (err) {
      console.error('[Cashfree] verify error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Shared: verify payment with Cashfree, save the order ─────────
  // Used by BOTH the client-triggered confirm call and the webhook, so
  // the two paths can never disagree about what it takes to save an
  // order. Idempotent per order id (checked by the caller before this
  // runs, and again here as a second guard).
  async function verifyAndSaveCashfreeOrder(orderId, orderData, actorEmail) {
    // 1. Ask Cashfree directly — the client/webhook claiming "paid" is
    //    never sufficient on its own.
    const r = await fetch(`${CF_BASE}/orders/${encodeURIComponent(orderId)}`, {
      headers: cfHeaders(), signal: AbortSignal.timeout(15000),
    });
    const cfOrder = await r.json();
    if (!r.ok) throw new Error(cfOrder?.message || 'Could not verify order with Cashfree');
    if (cfOrder.order_status !== 'PAID') {
      throw new Error(`Order is not paid yet (status: ${cfOrder.order_status})`);
    }

    // 2. Already saved? Idempotent no-op — a webhook and a client confirm
    //    can both arrive for the same order.
    const { data: existing } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (existing) {
      const { data: updated } = await supabase.from('orders').update({
        payment_status: 'Paid', payment_gateway: 'cashfree',
        fulfillment: existing.fulfillment || 'Pending', updated_at: new Date().toISOString(),
      }).eq('id', orderId).select().single();
      // Profile auto-save still runs on the duplicate path — the payment is
      // real, so the customer's details deserve saving for the next order.
      const { saveCustomerProfile } = require('./order-breakdown');
      await saveCustomerProfile(supabase, orderData, 'cashfree-verify').catch(() => {});
      return { order: updated || existing, duplicate: true };
    }

    // 3. Bind VitaPoints redemption to the verified customer, never a
    //    value carried in orderData from the client/webhook.
    let redeemEmail = actorEmail;
    if (!redeemEmail) {
      try { redeemEmail = orderData.customer_email; } catch { /* noop */ }
    }
    const vita = await resolveVitaDiscount({
      email: redeemEmail, pointsRequested: orderData.vita_points, orderId, commit: true,
    });

    // resolveVitaDiscount({commit:true}) SPENDS the points. Everything from
    // here to the insert can still throw — an amount mismatch, a sold-out
    // line, a database error — and the customer has ALREADY PAID by this
    // point. Without this guard they lose the money and the points, with no
    // order to show for either. Release, then rethrow so the caller still
    // reports the failure.
    let order, recalculated;
    try {
      recalculated = await computeServerSideTotal(orderData.items, orderData.coupon_code, { vitaRupees: vita.rupees, customerEmail: redeemEmail });

      // Cashfree's own recorded amount must cover what we computed — small
      // epsilon for rounding, same tolerance the GoKwik path uses.
      const cfAmount = Number(cfOrder.order_amount) || 0;
      if (cfAmount + 1 < recalculated.total) {
        throw new Error(`Amount paid (₹${cfAmount}) does not match cart total (₹${recalculated.total})`);
      }

      orderData.total = recalculated.total;
      orderData.subtotal = recalculated.subtotal;
      orderData.discount = Number(((recalculated.discount || 0) + (recalculated.mixMatchDiscount || 0) + (recalculated.vitaDiscount || 0)).toFixed(2));
      orderData.shipping = recalculated.shippingFee;
      orderData.vita_points_redeemed = vita.points;
      orderData.payment_status = 'Paid';
      orderData.payment_gateway = 'cashfree';
      orderData.fulfillment = 'Pending';
      orderData.cashfree_order_id = cfOrder.order_id;
      orderData.cf_payment_id = (cfOrder.payments && cfOrder.payments[0] && cfOrder.payments[0].cf_payment_id) || null;
      // 2026-08: per-component discount columns (tier/mix&match/coupon/vita)
      // so the invoice and My Account list every discount by name and amount.
      const { persistBreakdown, saveCustomerProfile } = require('./order-breakdown');
      persistBreakdown(orderData, recalculated);

      order = await sp_place_order({ ...orderData, id: orderId });
      // 2026-08: auto-save the checkout contact details to the customer's
      // profile so the NEXT order pre-fills name, phone, address, city/state/pin.
      await saveCustomerProfile(supabase, orderData, 'cashfree-verify').catch(() => {});
    } catch (saveErr) {
      if (typeof releaseVitaReservation === 'function') {
        await releaseVitaReservation(orderId, 'paid order not created — ' + (saveErr.message || 'save failed'))
          .catch(() => {});
      }
      throw saveErr;
    }

    // Award VitaPoints — pending until delivery, same as every other
    // prepaid path (confirm-gokwik-order does the identical thing).
    const eligible = Math.max(0, (recalculated.total || 0) - (recalculated.shippingFee || 0));
    const pts = await awardVitaPoints(order, { eligibleValue: eligible });
    if (pts > 0) order.vita_points_earned = pts;

    sendOrderEmail(order).catch(e => console.warn('[Cashfree] Email failed:', e.message));
    console.log(`[Cashfree] ✅ Order saved: ${orderId} ₹${recalculated.total}`);
    return { order, duplicate: false };
  }

  // ── CONFIRM — called by the frontend right after checkout returns ──
  app.post('/api/confirm-cashfree-order', paymentLimiter, async (req, res) => {
    try {
      if (!cfConfigured()) return res.status(500).json({ error: 'Cashfree not configured' });
      const { order_id, order_data } = req.body || {};
      if (!order_id || !order_data) return res.status(400).json({ error: 'order_id and order_data are required' });

      const jwtEmail = jwtEmailFrom(req);
      if (jwtEmail) order_data.customer_email = jwtEmail;
      else if (order_data.vita_points) {
        return res.status(401).json({ error: 'Please sign in to redeem VitaPoints.' });
      }

      const { order, duplicate } = await verifyAndSaveCashfreeOrder(order_id, order_data, jwtEmail);
      res.json({ success: true, order_id, duplicate, data: order });
    } catch (err) {
      console.error('[confirm-cashfree-order]', err.message);
      res.status(400).json({ error: err.message });
    }
  });

  // ── WEBHOOK — Cashfree's server-to-server payment notification ──
  // SECURITY: Cashfree signs every webhook with HMAC-SHA256 over
  // (timestamp + raw body) using your secret key, in x-webhook-signature
  // / x-webhook-timestamp. An unsigned or wrongly-signed request is
  // rejected outright — this is the same class of gap that was found
  // and fixed on the GoKwik webhook (which had no verification at all
  // before), built in from the start here.
  app.post('/api/cashfree-webhook', async (req, res) => {
    try {
      if (!cfConfigured()) return res.status(500).json({ error: 'Cashfree not configured' });

      const signature = req.headers['x-webhook-signature'];
      const timestamp  = req.headers['x-webhook-timestamp'];
      if (!signature || !timestamp || !req.rawBody) {
        console.warn('[Cashfree] Webhook missing signature/timestamp — rejected');
        return res.status(400).json({ error: 'Missing signature' });
      }
      const expected = crypto
        .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
        .update(timestamp + req.rawBody.toString())
        .digest('base64');
      const sigBuf = Buffer.from(String(signature));
      const expBuf = Buffer.from(expected);
      const validSig = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
      if (!validSig) {
        console.warn('[Cashfree] ⛔ Webhook signature mismatch — rejected');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = req.body || {};
      const type  = event.type;
      console.log('[Cashfree] Webhook verified:', type);

      // Idempotency. Cashfree retries on timeout, and the refund branch
      // below is not self-guarding the way the payment branch is — it
      // would happily re-apply a refund status transition. Record the
      // delivery first and stop here if this exact event was already
      // handled. Signature verification has already passed at this point,
      // so a duplicate is a genuine redelivery, not a forgery.
      const _cfEventId =
        event.data?.payment?.cf_payment_id ||
        event.data?.refund?.cf_refund_id ||
        event.data?.refund?.refund_id ||
        event.event_id ||
        // Last resort: the provider's own event timestamp plus the order
        // id is stable across retries of the SAME event.
        (event.event_time && event.data?.order?.order_id
          ? `${type}:${event.data.order.order_id}:${event.event_time}`
          : null);

      if (typeof recordWebhookEvent === 'function') {
        const seen = await recordWebhookEvent({
          provider:  'cashfree',
          eventId:   _cfEventId,
          eventType: type,
          orderId:   event.data?.order?.order_id || event.data?.refund?.order_id || null,
          payload:   event,
        });
        if (seen.duplicate) return res.json({ received: true, duplicate: true });
      }

      if (type === 'PAYMENT_SUCCESS_WEBHOOK' || type === 'PAYMENT_STATUS_WEBHOOK') {
        const orderId = event.data?.order?.order_id;
        const status  = event.data?.payment?.payment_status;
        if (orderId && status === 'SUCCESS') {
          const { data: existingOrder } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
          if (!existingOrder) {
            // Order not yet saved (client confirm hasn't landed). We can't
            // reconstruct cart/items/coupon/vita_points from the webhook
            // alone, so this just logs — the client's confirm call (or a
            // retry of it) remains the actual save path. Real payment
            // status is safe either way: verify-cashfree-order always
            // re-checks with Cashfree directly.
            console.warn(`[Cashfree] Webhook for unsaved order ${orderId} — waiting for client confirm`);
          } else if (existingOrder.payment_status !== 'Paid') {
            await supabase.from('orders').update({
              payment_status: 'Paid', payment_gateway: 'cashfree', updated_at: new Date().toISOString(),
            }).eq('id', orderId);
            console.log(`[Cashfree] Order ${orderId} marked Paid via webhook`);
          }
        }
      }

      if (type === 'REFUND_STATUS_WEBHOOK') {
        const orderId  = event.data?.refund?.order_id;
        const refundId = event.data?.refund?.refund_id || event.data?.refund?.cf_refund_id;
        const status   = event.data?.refund?.refund_status; // SUCCESS | FAILED | PENDING
        if (orderId && refundId) {
          const mapped = status === 'SUCCESS' ? 'processed' : status === 'FAILED' ? 'failed' : 'pending';
          await supabase.from('refunds')
            .update({ status: mapped, raw_response: event.data, updated_at: new Date().toISOString() })
            .eq('order_id', orderId).eq('gateway_refund_id', refundId);
          console.log(`[Cashfree] Refund ${refundId} for ${orderId} -> ${mapped}`);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[Cashfree] Webhook error:', err.message);
      // Still 200 — Cashfree retries on non-2xx, and a logged/investigated
      // failure here shouldn't cause a retry storm.
      res.status(200).json({ success: false, error: err.message });
    }
  });

  // ── REFUND — admin-triggered, calls Cashfree's real Refunds API ──
  // This is the automated counterpart to the free-text refund_ref an
  // admin can already type into a return manually. Call this for a
  // Cashfree-paid order and the money actually moves; the returns
  // status update elsewhere in the app records the outcome.


  // ── Admin: list refund attempts for an order ─────────────────────


  // ── Health check ──────────────────────────────────────────────
  // FIX (Aug 2026 1000-scenario audit): this endpoint was public and
  // leaked payment-gateway environment configuration (key presence,
  // env, base URL) to anyone on the internet. It is admin-only now —
  // the storefront has no use for it, and diagnostics live in the
  // admin panel's server-side checks instead.
  app.get('/api/health/cashfree-env', authMiddleware, adminOnly, (req, res) => {
    res.json({
      CASHFREE_APP_ID:     process.env.CASHFREE_APP_ID     ? '✅ set' : '❌ MISSING',
      CASHFREE_SECRET_KEY: process.env.CASHFREE_SECRET_KEY ? '✅ set' : '❌ MISSING',
      CASHFREE_ENV:        process.env.CASHFREE_ENV        || '(not set — defaults to SANDBOX)',
      resolved_base_url:   CF_BASE,
      note: 'Set CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV=PRODUCTION on Render for live payments.',
    });
  });

  console.log('[mount] cashfree-routes ✅');
};