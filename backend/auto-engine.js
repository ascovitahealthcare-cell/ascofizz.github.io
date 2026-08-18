// ═══════════════════════════════════════════════════════════════════
// AUTO-ENGINE — ascofizz-backend
//
// WHY THIS FILE EXISTS
// The user asked (2026-08-16): everything runs automatic, no manual
// action — returns approve → pick-up → refund happen end to end,
// money reconciliation and the wallet picture update themselves,
// orders ship themselves, and manual actions stay available only as a
// safe override. This module is that engine. It registers a small set
// of periodic jobs and exposes admin endpoints so the owner can watch
// what it is doing and overrule it.
//
// JOBS
//   1. autoReturnsCycle      every  AUTO_CYCLE_MS      (default 30 min)
//      - 'requested'  → approve (env AUTO_APPROVE_HOURS delay)
//      - 'approved'   → picked_up (env AUTO_PICKUP_HOURS delay,
//                      Delhivery pickup request attempted when
//                      AUTO_PICKUP=1 and the order has a waybill)
//      - 'picked_up'  → refunded (env AUTO_REFUND_HOURS delay):
//          * Cashfree-prepaid → real Cashfree refund API call
//          * COD              → ledger row 'processed' (no money moves)
//          * GoKwik           → ledger row 'recorded' + alert
//      - stale 'requested'  → auto-expire/resolve (env RETURN_EXPIRY_HOURS)
//      All point reversals reuse the idempotent `vita_reverse_order`
//      keys ('return:<id>'), so the webhook/poller/admin paths can
//      never double-deduct even when this engine runs in parallel.
//
//   2. reconciliationJob     every  RECON_INTERVAL_MS  (default 6 h)
//      Pulls Cashfree settlements + COD wallet state, writes one
//      row per day to `finance_reconciliation`, and raises alerts on
//      fee leakage or COD money stuck with couriers too long.
//      /api/admin/finance keeps showing live data; the table is the
//      history + alert source.
//
//   3. autoShipJob           every  AUTO_SHIP_MS       (default 15 min)
//      Orders stuck in 'Processing' with a paid status and no waybill
//      get a Delhivery waybill created automatically (env AUTO_SHIP=1).
//      The manual "Create shipping order" button keeps working.
//
// ENV OVERRIDES (all have safe in-memory defaults)
//   AUTO_APPROVE_HOURS=0   AUTO_PICKUP_HOURS=24   AUTO_REFUND_HOURS=0
//   RETURN_EXPIRY_HOURS=72   AUTO_CYCLE_MS=1800000
//   RECON_INTERVAL_MS=21600000   AUTO_SHIP=1   AUTO_PICKUP=1
//   AUTO_SHIP_MS=900000
// ═══════════════════════════════════════════════════════════════════

const { parseOrderItems } = require('./order-items');

module.exports = function mountAutoEngine(app, deps) {
  const {
    supabase, authMiddleware, adminOnly, writeAudit,
    raiseAlert, clientIpOf, refundVitaRedemption,
  } = deps;

  const H = n => Math.max(0, Number(process.env[`AUTO_APPROVE_HOURS`]) || n);
  const cfg = {
    autoApproveHours: H(0),
    autoPickupHours: H(24),
    autoRefundHours: H(0),
    expiryHours: H(72),
    cycleMs: Number(process.env.AUTO_CYCLE_MS) || 30 * 60 * 1000,
    reconMs: Number(process.env.RECON_INTERVAL_MS) || 6 * 60 * 60 * 1000,
    autoShipMs: Number(process.env.AUTO_SHIP_MS) || 15 * 60 * 1000,
    autoShipOn: process.env.AUTO_SHIP !== '0',
    autoPickupOn: process.env.AUTO_PICKUP !== '0',
    reconAlertLeakInr: 500,
    reconAlertCodDays: 14,
  };

  const autoState = {
    lastCycleAt: null, lastReconAt: null, lastShipAt: null,
    lastCycleDetail: null, lastReconDetail: null, lastShipDetail: null,
  };

  // ── helper: the order row we need, cheapest possible ──────────────
  async function orderOf(orderId) {
    const { data } = await supabase.from('orders')
      .select('id,customer_email,items,total,shipping,payment_method,payment_status,payment_gateway,fulfillment,delhivery_waybill,shiprocket_id')
      .eq('id', orderId).maybeSingle();
    return data;
  }

  // ── helper: price the items a return row asks for, from stored order ─
  function priceReturn(order, ret) {
    // FIX (audit OZ-19): was `Array.isArray(order.items) ? order.items : []`.
    // orders.items is stored as a JSON STRING, so this always produced [] —
    // silently, with no error. orderQty was therefore always 0, which made the
    // full-reversal test below (retQty >= orderQty) always true, so EVERY
    // partial return was clawed back as if the whole order came back. The
    // pro-rata branch of vita_reverse_order was unreachable in production.
    // returns.items is written by this API as a real array, so it is left as is.
    const orderItems = parseOrderItems(order && order.items);
    const retItems   = Array.isArray(ret.items) ? ret.items : [];
    const priceById = {};
    orderItems.forEach(oi => { priceById[String(oi.id)] = Number(oi.price) || 0; });
    const orderQty = orderItems.reduce((n, oi) => n + (Number(oi.qty) || 0), 0);
    const retQty   = retItems.reduce((n, ri) => n + (Number(ri.qty) || 0), 0);
    if (retQty >= orderQty) return null; // full reversal
    return retItems.reduce((sum, ri) => sum + (priceById[String(ri.id)] || 0) * (Number(ri.qty) || 0), 0);
  }

  // ── Step A: approve ────────────────────────────────────────────────
  async function autoApprove(ret, order, reason) {
    const returnedValue = priceReturn(order, ret);
    const { data: vData, error: vErr } = await supabase.rpc('vita_reverse_order', {
      p_order: ret.order_id, p_returned_value: returnedValue,
      p_reason: 'auto-approve: ' + reason, p_type: 'RETURN_REVERSAL',
      p_key: 'return:' + ret.id,
    });
    if (vErr) throw vErr;
    const v = (Array.isArray(vData) ? vData[0] : vData) || {};
    const { error: uErr } = await supabase.from('returns').update({
      status: 'approved', points_reversed: v.reversed || 0,
      reviewed_by: 'auto-engine', reviewed_at: new Date().toISOString(),
      admin_note: '[auto] ' + reason, updated_at: new Date().toISOString(),
    }).eq('id', ret.id);
    if (uErr) throw uErr;
    // Mirror admin approve: the ORDER becomes Returned too, so the
    // customer account and stock mirrors match the returns ledger.
    await supabase.from('orders').update({
      fulfillment: 'Returned', updated_at: new Date().toISOString(),
    }).eq('id', ret.order_id);
    try { await supabase.from('order_status_logs').insert({
      order_id: ret.order_id, old_status: order.fulfillment, new_status: 'Returned',
      changed_by: 'auto-engine', note: 'Auto-approved return ' + ret.id + ' — ' + reason,
      created_at: new Date().toISOString(),
    }); } catch (e) { console.warn('[auto-engine] order_status_logs write failed:', e.message); }
    await writeAudit({
      userId: 'auto-engine', tableName: 'returns', recordId: ret.id,
      action: 'auto_approve',
      newValues: { reason, points_reversed: v.reversed || 0,
                   debt_created: v.debt_created || 0, partial: returnedValue !== null,
                   returned_value: returnedValue },
    }).catch(() => {});
    if (typeof raiseAlert === 'function') {
          await raiseAlert({
        severity: 'info', category: 'finance', orderId: ret.order_id,
        title: 'Return auto-approved — ' + order.customer_email,
        detail: `Return ${ret.id} — ${reason} · points reversed: ${v.reversed || 0}` +
                (v.debt_created ? ` · debt created: ${v.debt_created}` : ''),
      }).catch(() => {});
    }
    return v.reversed || 0;
  }

  // ── Step B: mark picked up (attempt Delhivery pickup when possible) ─
  async function autoPickup(ret, order, reason) {
    const update = {
      status: 'picked_up', updated_at: new Date().toISOString(),
      admin_note: (ret.admin_note || '') + ' [auto] ' + reason,
    };
    let pickupNote = null;
    if (cfg.autoPickupOn && order.delhivery_waybill && process.env.DELHIVERY_API_TOKEN) {
      // A reverse-pickup request at Delhivery is what actually moves the
      // parcel. It costs nothing unless the parcel is picked up, so it
      // is safe to attempt; a failure degrades to a plain status flip
      // that still needs the admin button, exactly like before.
      try {
        const dlBase = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com';
        const resp = await fetch(
          `${dlBase}/api/v1/packages/json/pickup/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Token ' + process.env.DELHIVERY_API_TOKEN,
            },
            body: JSON.stringify({
              client: process.env.DELHIVERY_CLIENT_NAME || process.env.DELHIVERY_USER_NAME || '',
              pickup_type: 'RVP',
              shipments: [String(order.delhivery_waybill)],
            }),
            signal: AbortSignal.timeout(20000),
          }).catch(() => null);
        if (resp && resp.ok) {
          const j = await resp.json().catch(() => ({}));
          pickupNote = 'Delhivery RVP requested — ' + JSON.stringify(j).slice(0, 200);
        } else { pickupNote = 'Delhivery RVP unavailable (' + (resp ? resp.status : 'network') + ') — status flipped only'; }
      } catch (pe) { pickupNote = 'Delhivery RVP request error: ' + pe.message; }
    }
    if (pickupNote) update.admin_note = (update.admin_note || '') + ' · ' + pickupNote;
    const { error } = await supabase.from('returns').update(update).eq('id', ret.id);
    if (error) throw error;
    await writeAudit({
      userId: 'auto-engine', tableName: 'returns', recordId: ret.id,
      action: 'auto_status:picked_up', newValues: { pickupNote },
    }).catch(() => {});
  }

  // ── Step C: auto-refund, per payment method ────────────────────────
  // Same constants the Cashfree module uses — the auto engine lives
  // outside that closure and cannot see its helpers, so the call is
  // inline but bit-identical to the courier auto-sync refund block.
  async function autoRefund(ret, order, reason) {
    const method = String(order.payment_method || order.payment_gateway || '').toLowerCase();
    // FIX (audit OZ-20): the old list was ['paid', 'cod - collected'].
    // 'cod - collected' does not exist anywhere in the data. The live values are
    // 'COD - Pending' (56), 'Paid - COD Collected' (8), 'Unpaid' (8), 'Paid' (5),
    // so every COD order where cash WAS collected fell through to refundAmt = 0:
    // no gateway call, no refund row, nothing owed recorded. One such order is
    // already sitting Returned with no refund against it.
    //
    // Matched on substance rather than on an exact string, so a future status
    // label like 'Paid - Prepaid' cannot silently reintroduce the same gap.
    const payStatus = String(order.payment_status || '').toLowerCase();
    const paid = payStatus === 'paid' || payStatus.includes('collected');

    // The refund is worth the RETURNED value, not the whole order — a customer
    // sending back 1 of 9 units was previously refunded all nine. priceReturn()
    // returns null when the return covers the entire order, which is the only
    // case where the full total is right.
    const returnedValue = priceReturn(order, ret);
    const refundAmt = !paid ? 0
      : (returnedValue == null ? Number(order.total) || 0
                               : Math.min(Number(returnedValue) || 0, Number(order.total) || 0));
    const refId = 'RF-AUTO-' + order.id + '-' + Math.round(refundAmt * 100);

    let row = null;
    if (refundAmt > 0) {
      const { data: existingRefund } = await supabase.from('refunds')
        .select('id,status').eq('order_id', order.id).eq('gateway_refund_id', refId).maybeSingle();
      if (existingRefund) return { gateway: 'cashfree', status: existingRefund.status, note: 'already recorded' };

      let refundRow = null;
      try { refundRow = (await supabase.from('refunds').insert({
        order_id: order.id, return_id: ret.id, gateway: 'cashfree',
        gateway_refund_id: refId, amount: refundAmt, status: 'pending',
        note: `Auto-refund (return ${ret.id}): shipment auto-exit (${order.delhivery_waybill || order.shiprocket_id || ''})`,
      }).select().single()).data || null; } catch (e) { console.warn('[auto-engine] refund row write failed:', e.message); }
      row = refundRow;
      const cfEnv = (process.env.CASHFREE_ENV || 'SANDBOX').toUpperCase();
      const cfBase = cfEnv === 'PRODUCTION' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
      const cfResp = await fetch(`${cfBase}/orders/${encodeURIComponent(order.id)}/refunds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id':     process.env.CASHFREE_APP_ID,
          'x-client-secret':  process.env.CASHFREE_SECRET_KEY,
          'x-api-version':    process.env.CASHFREE_API_VERSION || '2023-08-01',
        },
        body: JSON.stringify({ refund_id: refId, refund_amount: refundAmt,
                               refund_note: 'Auto-refund: return ' + ret.id + ' — ' + reason }),
        signal: AbortSignal.timeout(30000),
      }).catch(() => null);
      if (!cfResp || !cfResp.ok) {
        const failData = cfResp ? await cfResp.json().catch(() => ({})) : {};
        try {
          if (refundRow) await supabase.from('refunds')
            .update({ status: 'failed', raw_response: failData, updated_at: new Date().toISOString() }).eq('id', refundRow.id);
        } catch (e) { console.warn('[auto-engine] refund status write failed:', e.message); }
        if (typeof raiseAlert === 'function') {
          await raiseAlert({ severity: 'error', category: 'finance', orderId: order.id,
            title: `Auto-refund failed — manual refund needed (return ${ret.id})`,
            detail: `Order ${order.id} (return ${ret.id}): ${(failData.message || 'gateway call failed').slice(0, 150)}` }).catch(() => {});
        }
        return { gateway: 'cashfree', status: 'failed' };
      }
      const cfJson = await cfResp.json().catch(() => ({}));
      const mapped = cfJson.refund_status === 'SUCCESS' ? 'processed' : 'pending';
      try {
        if (refundRow) await supabase.from('refunds')
          .update({ status: mapped, raw_response: cfJson, updated_at: new Date().toISOString() }).eq('id', refundRow.id);
      } catch (e) { console.warn('[auto-engine] refund status write failed:', e.message); }
      return { gateway: 'cashfree', status: mapped };
    }

    // COD or GoKwik: no gateway money path — record the ledger so the
    // finance dashboard counts it, and tell the owner what remains
    // manual on GoKwik.
    const gw = /gokwik/i.test(method) ? 'gokwik' : 'cod';
    const status = gw === 'gokwik' ? 'recorded' : 'processed';
    const note = `Auto-refund (return ${ret.id}) — ${reason}. ` +
      (gw === 'gokwik'
        ? 'GoKwik has no usable refund API — complete it in the GoKwik dashboard and attach the reference via the admin button.'
        : 'COD — no money to move (cash never collected / reclaimed offline).');
    let refundRow = null;
    try { refundRow = (await supabase.from('refunds').insert({
      order_id: order.id, return_id: ret.id, gateway: gw,
      gateway_refund_id: null, amount: refundAmt, status, note,
    }).select().single()).data || null; } catch (e) { console.warn('[auto-engine] refund row write failed:', e.message); }
    row = refundRow;
    if (gw === 'gokwik' && typeof raiseAlert === 'function') {
      await raiseAlert({ severity: 'warn', category: 'finance', orderId: order.id,
        title: `GoKwik refund needs manual completion (return ${ret.id})`,
        detail: `Order ${order.id} (return ${ret.id}): ledger recorded — open the GoKwik dashboard to move the money.` }).catch(() => {});
    }
    return { gateway: gw, status };
  }

  // ── Step D: reverse the redeemed points at actual refund time ──────
  // The earning side (vita_reverse_order, key 'return:<id>') runs at
  // approve — full exit only. This restores the spending side: points
  // the customer put towards the order, which only come back when the
  // whole order exits, same rule as the admin path.
  async function autoVitaRedemption(order, ret) {
    try {
      if (typeof refundVitaRedemption === 'function') {
        await refundVitaRedemption(order.id, 'return auto-refunded (' + (ret && ret.id) + ')');
      }
    } catch (e) { console.warn('[auto-engine] vita redemption reversal failed:', e.message); }
  }

  // ═══════════════════════════════════════════════════════════════════
  // JOB 1 — AUTO RETURNS CYCLE
  // ═══════════════════════════════════════════════════════════════════
  async function autoReturnsCycle() {
    try {
      const now = Date.now();
      const h = (hours, msSince) => msSince >= Math.max(0, hours) * 3600000;
      const detail = { approved: 0, pickedUp: 0, refunded: 0, expired: 0, skipped: [] };

      const { data: open } = await supabase.from('returns')
        .select('id,order_id,status,created_at,updated_at,reviewed_at')
        .in('status', ['requested', 'approved', 'picked_up']);
      if (!open || !open.length) { autoState.lastCycleDetail = detail; return; }

      for (const ret of open) {
        try {
          const order = await orderOf(ret.order_id);
          if (!order) continue; // order gone — orphan row, leave alone
          const createdMs = ret.created_at ? Date.now() - new Date(ret.created_at).getTime() : Infinity;
          const updatedMs = ret.updated_at ? Date.now() - new Date(ret.updated_at).getTime() : Infinity;

          if (ret.status === 'requested') {
            const expired = h(cfg.expiryHours, createdMs);
            const due = expired || h(cfg.autoApproveHours, createdMs);
            // Only touch returns whose order already physically moved:
            // Delivered (customer has it), Returned (courier took it
            // back — via webhook or poller), or Cancelled (courier dead).
            const physicallyMoved = ['Delivered', 'Returned', 'Cancelled'].includes(order.fulfillment);
            if (due && physicallyMoved) {
              const points = await autoApprove(ret, order,
                expired ? 'return expired — order ' + order.fulfillment.toLowerCase() :
                          'auto-approve (order ' + order.fulfillment.toLowerCase() + ')');
              detail.approved++;
              // Advance straight to refund — courier already took the
              // parcel or the order died; nobody waits for a pickup.
              const r = await autoRefund(ret, order, 'auto-exit on approve');
              detail.refunded++;
              await autoVitaRedemption(order, ret);
              await supabase.from('returns').update({
                status: 'refunded', refund_amount: r.gateway === 'cashfree' ? order.total : null,
                refund_method: r.gateway, refund_ref: r.gateway === 'cashfree'
                  ? ('RF-AUTO-' + order.id + '-' + Math.round(Number(order.total) * 100)) : null,
                updated_at: new Date().toISOString(),
              }).eq('id', ret.id);

              if (typeof raiseAlert === 'function') {
                await raiseAlert({ severity: 'info', category: 'finance', orderId: order.id,
                  title: `Return auto-refunded — ${r.gateway} (return ${ret.id})`,
                  detail: `Order ${order.id} → ${r.gateway} ${r.status}` }).catch(() => {});
              }
            } else { detail.skipped.push(ret.id); }
          }

          else if (ret.status === 'approved') {
            if (h(cfg.autoPickupHours, updatedMs)) {
              await autoPickup(ret, order, 'auto pickup (' + (order.delhivery_waybill ? 'waybill ' + order.delhivery_waybill : 'no waybill') + ')');
              detail.pickedUp++;
            } else { detail.skipped.push(ret.id); }
          }

          else if (ret.status === 'picked_up') {
            if (h(cfg.autoRefundHours, updatedMs)) {
              await autoRefund(ret, order, 'auto-refund after pickup');
              detail.refunded++;
              await autoVitaRedemption(order, ret);
              await supabase.from('returns').update({
                status: 'refunded', refund_amount: Number(order.total),
                refund_method: order.payment_method || order.payment_gateway,
                updated_at: new Date().toISOString(),
              }).eq('id', ret.id);

            } else { detail.skipped.push(ret.id); }
          }
        } catch (e) {
          console.warn('[auto-engine] cycle failed on return', ret.id, ':', e.message);
          detail.skipped.push(ret.id + ':error');
        }
      }
      autoState.lastCycleAt = new Date().toISOString();
      autoState.lastCycleDetail = detail;
    } catch (e) {
      console.error('[auto-engine] returns cycle crashed:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // JOB 2 — FINANCE RECONCILIATION
  // ═══════════════════════════════════════════════════════════════════
  async function reconciliationJob() {
    try {
      const period = new Date().toISOString().slice(0, 10);
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const monthISO = monthStart.toISOString();
      const warnings = [];

      // ── 2a. Gateway (Cashfree settlements) ─────────────────────────
      let gateway = { gross: 0, fees: 0, netSettled: 0, settlementCount: 0 };
      try {
        if (process.env.CASHFREE_APP_ID) {
          const tokResp = await fetch('https://api.cashfree.com/pg/generate-token', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-version': '2023-08-01' },
            body: JSON.stringify({ appId: process.env.CASHFREE_APP_ID, secret: process.env.CASHFREE_SECRET_KEY }),
            signal: AbortSignal.timeout(8000),
          });
          const cftoken = (await tokResp.json()).cftoken;
          if (cftoken) {
            const sRes = await fetch(
              'https://api.cashfree.com/pg/settlements?from_time=' + encodeURIComponent(monthISO) +
              '&to_time=' + encodeURIComponent(new Date().toISOString()), {
                headers: { Authorization: 'Bearer ' + cftoken, 'x-api-version': '2023-08-01' },
                signal: AbortSignal.timeout(8000),
              });
            if (sRes.ok) {
              const items = ((await sRes.json()).settlements || []).filter(x => new Date(x.created_at) >= monthStart);
              items.forEach(x => {
                const fee = parseFloat(x.fee || x.charge || x.gst || 0) || 0;
                const net = parseFloat(x.settlement_amount || x.amount || 0) || 0;
                gateway.gross += net + fee; gateway.fees += fee; gateway.netSettled += net;
                gateway.settlementCount++;
              });
            }
          }
        }
      } catch (e) { warnings.push('gateway fetch failed: ' + e.message); }

      // ── 2b. Our books ──────────────────────────────────────────────
      const { data: orders } = await supabase.from('orders')
        .select('id,payment_status,payment_method,fulfillment,total')
        .is('deleted_at', null).gte('created_at', monthISO);
      const paidOnline = (orders || []).filter(o => (o.payment_status || '').toLowerCase().startsWith('paid'));
      const codCollected = (orders || []).filter(o => (o.payment_status || '') === 'COD - Collected' || o.payment_status === 'Paid - COD Collected');
      const codPending = (orders || []).filter(o => (o.payment_status || '') === 'COD - Pending' && (o.fulfillment || '') === 'Shipped');
      const onlinePaid = paidOnline.reduce((s, o) => s + Number(o.total || 0), 0);

      // ── 2c. Cross-check ────────────────────────────────────────────
      const leak = Math.abs(gateway.gross - onlinePaid);
      if (leak > cfg.reconAlertLeakInr) {
        warnings.push(`gateway gross ₹${gateway.gross.toFixed(2)} vs online-paid ₹${onlinePaid.toFixed(2)} — delta ₹${leak.toFixed(2)} needs review`);
        if (typeof raiseAlert === 'function') {
          await raiseAlert({ severity: 'warn', category: 'finance',
            title: 'Reconciliation: online payments vs gateway settlement drift',
            detail: `Month ${period}: gateway gross ₹${gateway.gross.toFixed(2)} vs orders paid online ₹${onlinePaid.toFixed(2)} — check Cashfree dashboard.` }).catch(() => {});
        }
      }

      // ── 2d. COD stuck with courier too long ────────────────────────
      const oldCollected = (orders || []).filter(o => {
        if ((o.payment_status || '') !== 'COD - Collected') return false;
        const d = new Date(o.updated_at || o.created_at);
        return (Date.now() - d.getTime()) > cfg.reconAlertCodDays * 86400000;
      });
      if (oldCollected.length) {
        warnings.push(`${oldCollected.length} COD order(s) marked Collected > ${cfg.reconAlertCodDays} days ago — chase courier remittance`);
        if (typeof raiseAlert === 'function') {
          await raiseAlert({ severity: 'warn', category: 'finance',
            title: 'COD remittance due — money sitting with courier',
            detail: `${oldCollected.length} order(s) collected over ${cfg.reconAlertCodDays} days ago: ${oldCollected.slice(0, 10).map(o => o.id).join(', ')}` }).catch(() => {});
        }
      }

      // ── 2e. Persist the day's snapshot ─────────────────────────────
      const row = {
        period, gateway_gross: gateway.gross, gateway_fees: gateway.fees,
        gateway_net: gateway.netSettled, gateway_settlements: gateway.settlementCount,
        online_paid: onlinePaid, cod_collected: codCollected.reduce((s, o) => s + Number(o.total || 0), 0),
        cod_pending_with_courier: codPending.reduce((s, o) => s + Number(o.total || 0), 0),
        cod_in_transit: codPending.length,
        warnings: warnings.length ? warnings.join(' | ').slice(0, 2000) : null,
        collected: codCollected.reduce((s, o) => s + Number(o.total || 0), 0) + onlinePaid,
        net_realizable: codCollected.reduce((s, o) => s + Number(o.total || 0), 0) + onlinePaid - gateway.fees,
        created_at: new Date().toISOString(),
      };
      let upErr = null;
      try {
        const { error } = await supabase.from('finance_reconciliation').upsert(row, { onConflict: 'period' });
        upErr = error || null;
      } catch (e) {
        // First run: the table does not exist yet — create it once
        // (migrations/010_finance_reconciliation.sql), then insert.
        const create = await supabase.rpc('create_finance_reconciliation_table');
        if (create.error) console.warn('[auto-engine] reconciliation table create failed:', create.error.message);
        else {
          const { error: reupErr } = await supabase.from('finance_reconciliation').upsert(row, { onConflict: 'period' });
          if (reupErr) console.warn('[auto-engine] reconciliation upsert failed after table create:', reupErr.message);
        }
        upErr = null;
      }
      if (upErr) console.warn('[auto-engine] reconciliation upsert failed:', upErr.message);

      autoState.lastReconAt = new Date().toISOString();
      autoState.lastReconDetail = { period, gateway, onlinePaid,
        codCollected: codCollected.length, codPending: codPending.length, warnings };
    } catch (e) {
      console.error('[auto-engine] reconciliation crashed:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // JOB 3 — AUTO SHIP
  // ═══════════════════════════════════════════════════════════════════
  async function autoShipJob() {
    if (!cfg.autoShipOn) return;
    if (!process.env.DELHIVERY_API_TOKEN) return; // nothing to do without the courier
    try {
      const { data: candidates } = await supabase.from('orders')
        .select('id,payment_status,payment_method,fulfillment,delhivery_waybill,shiprocket_id,customer_email,total,items')
        .is('deleted_at', null)
        .in('fulfillment', ['Pending', 'Processing'])
        .neq('payment_status', 'COD - Cancelled');
      const list = (candidates || []).filter(o => !o.delhivery_waybill && !o.shiprocket_id);
      let shipped = 0, failed = 0;
      for (const order of list) {
        try {
          const paid = (order.payment_status || '').toLowerCase();
          const cod = /cod/i.test(String(order.payment_method || ''));
          // Only ship what is actually paid: prepaid orders, or COD
          // orders the admin has accepted (payment_status 'cod - pending'
          // is a genuine COD sale — Delhivery handles the collection).
          if (!cod && paid !== 'paid') continue;

          // FIX (audit OZ-18): was `(order.items || []).map(...)`. orders.items
          // holds a JSON string, and String has no .map — this threw on every
          // order, every cycle. It is the Render log line repeating every 15
          // minutes ("(order.items || []).map is not a function"), which means
          // automated Delhivery shipping has never once succeeded.
          const items = parseOrderItems(order.items).map(i => ({
            name: String(i.name || 'Product').slice(0, 100), units: Number(i.qty) || 1,
            selling_price: Number(i.price) || 0,
          }));
          const subTotal = Number(order.total) || items.reduce((s, i) => s + i.selling_price * i.units, 0);
          const dlBase = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com';
          const payload = {
            pickup_location: {
              name: process.env.DELHIVERY_PICKUP_LOCATION || '', pin: process.env.DELHIVERY_PICKUP_PIN || '',
              add: process.env.DELHIVERY_PICKUP_ADDRESS || '', city: process.env.DELHIVERY_PICKUP_CITY || '',
              state: process.env.DELHIVERY_PICKUP_STATE || '', country: 'India',
              phone: process.env.DELHIVERY_PICKUP_PHONE || '',
            },
            shipments: [{
              order: String(order.id).slice(0, 50), order_date: new Date().toISOString(),
              name: order.customer_email || 'Customer', add: '', city: '', state: '', country: 'India', pin: '',
              phone: '', payment_mode: cod ? 'COD' : 'Prepaid', cod_amount: cod ? subTotal : 0,
              total_amount: subTotal,
              products_desc: items.map(i => i.name).join(', ').slice(0, 500),
              quantity: String(items.reduce((s, i) => s + i.units, 0)),
              seller_gst_tin: process.env.DELHIVERY_SELLER_GST_TIN || '',
              hsn_code: process.env.DELHIVERY_HSN_CODE || '30049099',
              shipment_width: 10, shipment_height: 10,
              weight: Math.round((0.3) * 1000), shipping_mode: 'Surface',
            }],
          };
          if (!payload.pickup_location.name) continue; // misconfigured — skip quietly
          const resp = await fetch(`${dlBase}/api/cmu/create.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Token ' + process.env.DELHIVERY_API_TOKEN },
            body: 'format=json&data=' + encodeURIComponent(JSON.stringify(payload)),
            signal: AbortSignal.timeout(20000),
          });
          const data = await resp.json().catch(() => ({}));
          const pkg = data.packages && data.packages[0];
          if (!pkg || pkg.status !== 'Success') {
            failed++;
            console.warn('[auto-ship]', order.id, 'delhivery rejected:', (pkg && pkg.remarks && pkg.remarks[0]) || JSON.stringify(data).slice(0, 150));
            continue;
          }
          await supabase.from('orders').update({
            delhivery_waybill: pkg.waybill, fulfillment: 'Processing', updated_at: new Date().toISOString(),
          }).eq('id', order.id);
          try { await supabase.from('order_status_logs').insert({
            order_id: order.id, old_status: order.fulfillment, new_status: 'Processing',
            changed_by: 'auto-ship', note: 'Waybill ' + pkg.waybill + ' created automatically',
            created_at: new Date().toISOString(),
          }); } catch (e) { console.warn('[auto-ship] status log write failed:', e.message); }
          shipped++;
        } catch (e) { console.warn('[auto-ship] order', order.id, 'failed:', e.message); failed++; }
      }
      autoState.lastShipAt = new Date().toISOString();
      autoState.lastShipDetail = { shipped, failed };
    } catch (e) {
      console.error('[auto-engine] auto-ship crashed:', e.message);
    }
  }

  // ── Boot the jobs ──────────────────────────────────────────────────
  setInterval(autoReturnsCycle, cfg.cycleMs);
  setInterval(reconciliationJob, cfg.reconMs);
  setInterval(autoShipJob, cfg.autoShipMs);
  // Warm start: let the first cycles run 60 s after boot so the app
  // settles before heavy courier work.
  setTimeout(autoReturnsCycle, 60000);
  setTimeout(reconciliationJob, 120000);
  setTimeout(autoShipJob, 180000);

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN ENDPOINTS — watch + override (manual stays the safe option)
  // ═══════════════════════════════════════════════════════════════════

  app.get('/api/admin/auto-status', authMiddleware, adminOnly, async (req, res) => {
    res.json({ config: cfg, state: autoState });
  });

  app.put('/api/admin/auto-status', authMiddleware, adminOnly, async (req, res) => {
    const b = req.body || {};
    if (typeof b.autoApproveHours === 'number') cfg.autoApproveHours = Math.max(0, b.autoApproveHours);
    if (typeof b.autoPickupHours === 'number') cfg.autoPickupHours = Math.max(0, b.autoPickupHours);
    if (typeof b.autoRefundHours === 'number') cfg.autoRefundHours = Math.max(0, b.autoRefundHours);
    if (typeof b.expiryHours === 'number') cfg.expiryHours = Math.max(1, b.expiryHours);
    if (typeof b.autoShipOn === 'boolean') cfg.autoShipOn = b.autoShipOn;
    if (typeof b.autoPickupOn === 'boolean') cfg.autoPickupOn = b.autoPickupOn;
    if (b.runCycleNow === true) { await autoReturnsCycle(); await reconciliationJob(); }
    if (b.runShipNow === true) { await autoShipJob(); }
    await writeAudit({
      userId: req.user?.email || 'owner', tableName: 'auto_engine', recordId: 'config',
      action: 'config_change', newValues: b,
    }).catch(() => {});
    res.json({ ok: true, config: cfg, state: autoState });
  });

  app.get('/api/admin/returns/queue', authMiddleware, adminOnly, async (req, res) => {
    try {
      const { data: open } = await supabase.from('returns')
        .select('id,order_id,status,created_at,updated_at')
        .in('status', ['requested', 'approved', 'picked_up']);
      const now = Date.now();
      const queue = (open || []).map(r => ({
        ...r,
        nextAction: r.status === 'requested' ? 'approve' : r.status === 'approved' ? 'pickup' : 'refund',
        dueInHours: Math.max(0, Math.round((
          r.status === 'requested' ? cfg.autoApproveHours * 3600000 - (now - new Date(r.created_at).getTime()) :
          r.status === 'approved'   ? cfg.autoPickupHours   * 3600000 - (now - new Date(r.updated_at).getTime()) :
                                      cfg.autoRefundHours   * 3600000 - (now - new Date(r.updated_at).getTime())) / 3600000)),
      }));
      res.json({ queue: queue || [], lastCycle: autoState.lastCycleDetail, config: {
        autoApproveHours: cfg.autoApproveHours, autoPickupHours: cfg.autoPickupHours, autoRefundHours: cfg.autoRefundHours } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/admin/finance/reconciliation', authMiddleware, adminOnly, async (req, res) => {
    try {
      let q = supabase.from('finance_reconciliation').select('*').order('period', { ascending: false }).limit(60);
      if (req.query.period) q = q.eq('period', req.query.period);
      const { data, error } = await q;
      if (error) throw error;
      res.json({ data: data || [], lastRun: autoState.lastReconDetail });
    } catch (e) {
      // Table not created yet (first job has not run): show live only.
      res.json({ data: [], lastRun: autoState.lastReconDetail, note: 'Reconciliation history starts after the first scheduled run.' });
    }
  });

  app.post('/api/admin/finance/reconcile-now', authMiddleware, adminOnly, async (req, res) => {
    await reconciliationJob();
    res.json({ ok: true, lastRun: autoState.lastReconDetail });
  });
};
