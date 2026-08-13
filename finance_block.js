// ═══════════════════════════════════════════════════════════════
// FINANCE DASHBOARD — feeds from GET /api/admin/finance (owner/admin)
// ═══════════════════════════════════════════════════════════════
let financeRange = 90; // days
function setFinanceRange(days, btn) {
  financeRange = days;
  document.querySelectorAll('[id^=finChip]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadFinance(true);
}
const FIN_IN = v => (v == null || isNaN(v) || v === null || v === undefined) ? '—' :
  '₹' + Math.round(Number(v)).toLocaleString('en-IN');
const FIN_IN2 = v => (v == null || isNaN(v)) ? '—' :
  '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function finMiniCard(title, value, sub, noteCls) {
  return `<div style="flex:1;min-width:120px;">
    <div style="font-size:0.7rem;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;">${title}</div>
    <div style="font-family:var(--display);font-size:1.35rem;font-weight:800;margin-top:4px;">${FIN_IN(value)}</div>
    ${sub ? `<div style="font-size:0.75rem;margin-top:3px;color:${noteCls || 'var(--text3)'};">${sub}</div>` : ''}
  </div>`;
}

async function loadFinance(force = false) {
  const t0 = Date.now();
  const el = id => document.getElementById(id);
  // lazy render of kpi skeletons handled by the page's static .skel divs
  let data;
  try {
    const r = await apiFetch(`/api/admin/finance?days=${financeRange}`);
    data = await r.json();
  } catch (e) {
    console.error('[loadFinance]', e);
    el('financeKpis').innerHTML = `<div class="card" style="grid-column:1/-1"><div class="empty-state"><div class="empty-ico">⚠️</div><div class="empty-msg">Finance data unavailable — ${e.message}. Click Refresh.</div></div></div>`;
    return;
  }
  if (!data || !data.sources) { el('financeKpis').innerHTML = '<div class="card">No data</div>'; return; }
  const { sources, totals, timeline, courierSync } = data;
  const sr = sources.shiprocket, dl = sources.delhivery, gw = sources.gateway;

  // ── API status strip ──
  const syncAge = courierSync && courierSync.lastOkAt ? Math.round((t0 - new Date(courierSync.lastOkAt)) / 60000) : null;
  el('financeApiStatus').innerHTML = [
    ['🚚 Shiprocket', sr.status],
    ['📮 Delhivery', dl.status],
    ['💳 Cashfree', gw.status],
    ['🔄 Courier sync', syncAge == null ? 'never' : (syncAge < 2 ? 'just now' : syncAge + ' min ago')],
  ].map(([n, s]) => `<span style="font-size:0.74rem;padding:4px 10px;border-radius:20px;background:var(--surface);border:1px solid var(--border);color:${s === 'connected' || s === 'just now' ? 'var(--green-text)' : s === 'not_configured' ? 'var(--text3)' : 'var(--danger)'};">${n}: ${s === 'just now' ? 'synced' : s}</span>`).join('');

  // ── KPI row ──
  el('financeKpis').innerHTML = [
    `<div class="kpi"><div class="kpi-label">💵 Collected (this window)</div><div class="kpi-val">${FIN_IN(totals.collected)}</div><div class="kpi-change">COD ${FIN_IN(totals.codCollected)} + online ${FIN_IN(totals.onlinePaid)}</div><div class="kpi-ico">💵</div></div>`,
    `<div class="kpi"><div class="kpi-label">🕐 With couriers, pending</div><div class="kpi-val">${FIN_IN(totals.courierPending)}</div><div class="kpi-change">collected from customer, not yet remitted</div><div class="kpi-ico">🕐</div></div>`,
    `<div class="kpi"><div class="kpi-label">📉 Platform + gateway charges</div><div class="kpi-val">${FIN_IN(totals.charges)}</div><div class="kpi-change">deducted before money reaches bank</div><div class="kpi-ico">📉</div></div>`,
    `<div class="kpi"><div class="kpi-label">✅ Realizable revenue</div><div class="kpi-val">${FIN_IN(totals.netRealizable)}</div><div class="kpi-change">collected minus charges</div><div class="kpi-ico">✅</div></div>`,
  ].join('');

  // ── Shiprocket card ──
  el('finSrStatus').textContent = sr.status === 'connected' ? 'Live' : sr.status;
  el('finSrBody').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;">
    ${finMiniCard('COD pending with SR', sr.pending, 'what the platform still owes', 'var(--amber-text)')}
    ${finMiniCard('COD remitted (banked)', sr.remitted, 'already transferred by the platform')}
    ${finMiniCard('Platform charges deducted', sr.charges, 'forward shipping / RTO taken from remittance', 'var(--danger)')}
    ${finMiniCard('SR-collected orders', sr.collectedOrders, 'marked COD-Collected in our books')}
  </div>${sr.raw && sr.raw.summary && Object.keys(sr.raw.summary).length === 0 ? '<div style="margin-top:10px;font-size:0.72rem;color:var(--text3);">Note: this Shiprocket plan does not expose the COD summary figures via API — remittance detail is in shiprocket.in → Billing → COD Remittance.</div>' : ''}`;
  const srTx = el('finSrTxns');
  srTx.innerHTML = (sr.collectedWhen || []).length ?
    sr.collectedWhen.slice(0, 30).map(t => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text3);max-width:65%;overflow:hidden;text-overflow:ellipsis;">${t.label || t.date || '—'}</span><span style="font-weight:700;">${FIN_IN2(t.amount)}</span></div>`).join('') :
    '<div style="color:var(--text3);padding:12px 0;">No COD transactions returned by the Shiprocket statement API in this window.</div>';

  // ── Delhivery card ──
  el('finDlStatus').textContent = dl.status === 'connected' ? 'Live' : dl.status;
  el('finDlBody').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 24px;">
    ${finMiniCard('COD collected (Delhivery)', dl.collected, dl.collectedOrders + ' orders confirmed', 'var(--green-text)')}
    ${finMiniCard('COD pending (Delhivery)', dl.pending, dl.pendingOrders + ' orders awaiting remittance', 'var(--amber-text)')}
    ${finMiniCard('Shipping fees paid to DL', dl.chargesEstimated, 'estimated charges for pending+collected')}
  </div><div style="margin-top:10px;font-size:0.72rem;color:var(--text3);">${dl.note}</div>`;
  el('finDlTxns').innerHTML = (dl.collectedWhen || []).length ?
    dl.collectedWhen.slice(0, 30).map(t => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text3);">${(t.date || '').slice(0, 10)}</span><span style="font-weight:700;">${FIN_IN2(t.amount)}</span></div>`).join('') :
    '<div style="color:var(--text3);padding:12px 0;">No Delhivery COD orders confirmed collected in this window — collected COD flips to "COD - Collected" automatically via the courier sync.</div>';

  // ── Gateway card ──
  el('finCfStatus').textContent = gw.status === 'connected' ? 'Live' : gw.status;
  const feeLeak = gw.gross - gw.netSettled;
  el('finCfBody').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 24px;">
    ${finMiniCard('Online orders paid', gw.collected, 'booked in our orders')}
    ${finMiniCard('Settlements net (banked)', gw.netSettled, 'after gateway fees')}
    ${finMiniCard('Gateway fees', gw.fees, 'leakage: ' + (gw.gross ? Math.round(feeLeak / gw.gross * 100 * 10) / 10 + '%' : '—'), 'var(--danger)')}
  </div>`;
  const tbody = el('finSettleTbody');
  tbody.innerHTML = (gw.settlements || []).length ?
    gw.settlements.map(s => `<tr><td style="font-family:monospace;font-size:0.78rem;">${(s.id || '').slice(0, 22)}</td><td style="font-weight:700;">${FIN_IN(s.amount)}</td><td style="color:var(--danger);">${FIN_IN(s.fee)}</td><td>${FIN_IN(s.gross)}</td><td>${s.status || '—'}</td><td style="font-family:monospace;font-size:0.75rem;">${s.bank_ref || '—'}</td><td style="color:var(--text3);">${(s.date || '').slice(0, 16).replace('T', ' ')}</td></tr>`).join('') :
    `<tr><td colspan="7" style="text-align:center;color:var(--text3);">No Cashfree settlements in this window — prepaid orders settle to the linked bank account (check Cashfree dashboard for the exact credit date).</td></tr>`;

  // ── Timeline chart ──
  el('finTimeRange').textContent = timeline.length ? `${timeline[0].month} → ${timeline[timeline.length - 1].month}` : '—';
  if (timeline.length) {
    const canvas = el('financeTimelineCanvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    const labels = timeline.map(t => t.month);
    const groups = ['shiprocket', 'delhivery', 'gateway'];
    const colors = { shiprocket: '#4a8a28', delhivery: '#3B7EA6', gateway: '#8F6417' };
    const max = Math.max(1, ...timeline.flatMap(t => groups.map(g => t[g])));
    const padL = 54, padR = 16, padT = 10, padB = 30;
    const w = canvas.clientWidth - padL - padR, h = canvas.clientHeight - padT - padB;
    const bw = w / labels.length;
    // gridlines
    ctx.strokeStyle = 'var(--border)'.includes('var') ? '#e6e9ec' : 'var(--border)';
    ctx.fillStyle = '#9aa5ad';
    ctx.font = '11px inherit';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
      const v = max - (max / 4) * i;
      ctx.fillText(v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : Math.round(v).toString(), 4, y + 4);
    }
    for (let mi = 0; mi < labels.length; mi++) {
      const x = padL + bw * mi + bw / 2;
      ctx.save(); ctx.translate(x, padT + h + 6); ctx.rotate(-0.4);
      ctx.fillText(labels[mi], 0, 0); ctx.restore();
      const total = groups.reduce((s, g) => s + timeline[mi][g], 0);
      let y0 = padT + h;
      for (const g of groups) {
        const v = timeline[mi][g];
        if (!v) continue;
        const bh = (v / max) * h;
        y0 -= bh;
        ctx.fillStyle = colors[g];
        ctx.fillRect(padL + bw * mi + bw * 0.15, y0, bw * 0.7, bh);
        if (bh > 12) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px inherit'; ctx.fillText(FIN_IN(v), padL + bw * mi + 2, y0 + bh - 4); ctx.font = '11px inherit'; }
      }
    }
  }
  console.log('[finance] loaded in', Date.now() - t0, 'ms');
}
