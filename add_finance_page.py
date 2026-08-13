import re, sys

path = '/home/ubuntu/frontend/admin.html'
with open(path) as f:
    html = f.read()

# ── 1. Add nav item inside navSecFinance ─────────────────────────────
marker_nav = """    <div class="nav-item" onclick="showPage('invoices')"><span class="nav-ico">🧾</span> Invoices</div>
"""
if marker_nav not in html:
    print('NAV MARKER NOT FOUND'); sys.exit(1)
nav_item = marker_nav.replace("'invoices'", "'finance'")
nav_item = nav_item.replace('Invoices</div>', 'Finance <span class="nav-new"></span></div>')
# place before the Invoices nav item
html = html.replace(marker_nav, nav_item + marker_nav)

# ── 2. Insert Finance page markup before INVOICES section ────────────
finance_page = """<!-- ═════════════ FINANCE ═════════════ -->
<div class="page" id="page-finance">
  <div class="page-hdr">
    <div><div class="page-title">💰 Finance</div><div class="page-sub">Collections from couriers + payment gateway · net of platform charges · live from Shiprocket / Delhivery / Cashfree</div></div>
    <div class="page-actions">
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="ep-chip" id="finChip30"  onclick="setFinanceRange(30,this)">30D</button>
        <button class="ep-chip active" id="finChip90" onclick="setFinanceRange(90,this)">90D</button>
        <button class="ep-chip" id="finChip365" onclick="setFinanceRange(365,this)">1Y</button>
      </div>
      <button class="btn btn-secondary" onclick="loadFinance(true)">↺ Refresh</button>
    </div>
  </div>
  <div style="font-size:0.78rem;color:var(--text3);margin-bottom:14px;">
    💡 COD money collected by the courier ≠ money in your bank — the platform first deducts its own shipping / RTO charges from the remittance. This dashboard splits both sides out per partner so you always see the true realizable revenue.
  </div>
  <!-- ══ API STATUS STRIP ══ -->
  <div id="financeApiStatus" style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;"></div>
  <!-- ══ KPI ROW ══ -->
  <div class="grid-4" id="financeKpis" style="margin-bottom:20px">
    <div class="kpi skel" style="height:108px"></div><div class="kpi skel" style="height:108px"></div><div class="kpi skel" style="height:108px"></div><div class="kpi skel" style="height:108px"></div>
  </div>
  <!-- ══ PER-SOURCE CARDS ══ -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="card-hdr"><span class="card-title">🚚 Shiprocket</span><span class="badge" id="finSrStatus">…</span></div>
      <div style="padding:16px 20px;" id="finSrBody"></div>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="card-hdr"><span class="card-title">📮 Delhivery</span><span class="badge badge-blue" id="finDlStatus">…</span></div>
      <div style="padding:16px 20px;" id="finDlBody"></div>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px;padding:0;overflow:hidden;">
    <div class="card-hdr"><span class="card-title">💳 Payment Gateway (Cashfree) — settlements land in your bank after fees</span><span class="badge badge-amber" id="finCfStatus">…</span></div>
    <div style="padding:16px 20px;" id="finCfBody"></div>
  </div>
  <!-- ══ TIMELINE ══ -->
  <div class="card" style="padding:0;overflow:hidden;">
    <div class="card-hdr"><span class="card-title">📅 Monthly collection timeline (per source)</span><span class="badge" id="finTimeRange">—</span></div>
    <canvas id="financeTimelineCanvas" style="display:block;width:100%;height:240px;"></canvas>
    <div style="display:flex;gap:18px;padding:8px 20px 14px;flex-wrap:wrap;font-size:0.78rem;color:var(--text2);">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#4a8a28;margin-right:5px;"></span>Shiprocket COD collected</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#3B7EA6;margin-right:5px;"></span>Delhivery COD collected</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#8F6417;margin-right:5px;"></span>Online paid (gateway)</span>
    </div>
  </div>
  <!-- ══ COLLECTED WHEN ══ -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="card-hdr"><span class="card-title">🚚 Shiprocket COD money, transaction by transaction</span></div>
      <div style="padding:10px 20px;max-height:300px;overflow:auto;font-size:0.8rem;" id="finSrTxns">—</div>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="card-hdr"><span class="card-title">📮 Delhivery COD collected, order by order</span></div>
      <div style="padding:10px 20px;max-height:300px;overflow:auto;font-size:0.8rem;" id="finDlTxns">—</div>
    </div>
  </div>
  <!-- ══ GATEWAY SETTLEMENTS TABLE ══ -->
  <div class="card" style="margin-top:16px;padding:0;overflow:hidden;">
    <div class="card-hdr"><span class="card-title">🏦 Gateway settlements — what actually hits the bank account</span></div>
    <div style="padding:6px 20px;max-height:340px;overflow:auto;">
      <table class="data-table" id="finSettleTable">
        <thead><tr><th>Settlement</th><th>Net banked</th><th>Fee taken</th><th>Gross</th><th>Status</th><th>Bank ref</th><th>Date</th></tr></thead>
        <tbody id="finSettleTbody"><tr><td colspan="7" style="text-align:center;color:var(--text3);">—</td></tr></tbody>
      </table>
    </div>
  </div>
</div>
"""
anchor = '<!-- ═════════════ INVOICES ═════════════ -->'
if anchor not in html:
    print('INVOICES ANCHOR NOT FOUND'); sys.exit(1)
html = html.replace(anchor, finance_page + anchor)

# ── 3. Wire lazy-load + refreshCurrent ───────────────────────────────
lazy = "if(name === 'payments') loadPayments();"
if lazy not in html:
    print('LAZY PAYMENTS NOT FOUND'); sys.exit(1)
html = html.replace(lazy, lazy + "\n  if(name === 'finance') loadFinance();", 1)

# refreshCurrent map
rc_marker = "payments:loadPayments"
html = html.replace(rc_marker, rc_marker + ",finance:loadFinance", 1)

with open(path, 'w') as f:
    f.write(html)
print('HTML patched OK; length:', len(html))
