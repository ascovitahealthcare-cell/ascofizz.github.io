// ═══════════════════════════════════════════════════════════════════
// DATABASE SELF-CHECK
//
// WHY THIS EXISTS
//   Three separate customer-facing features were dead in production and
//   nothing said so. The Render log had one line, once, buried:
//
//     [returns] return_eligibility RPC failed, using JS fallback:
//     column "delivered_at" does not exist
//
//   That is migration 004 never having been run. The same shape of
//   failure explains the rest: awardVitaPoints() calls vita_earn_on_order,
//   the cancel path calls vita_reverse_order, the account panel calls
//   vita_summary — and every one of those calls is wrapped in a
//   try/catch that logs a warning and carries on. So an order earns no
//   points, cancelling it reverses nothing, and the storefront shows a
//   customer a zero balance with no error anywhere they can see.
//
//   Failing soft is right for a request — a checkout should not 500
//   because the loyalty ledger is missing. Failing soft *silently at
//   boot* is not: it means the operator finds out from their sister
//   instead of from the server. This checks the objects the code
//   depends on when the process starts, prints exactly which migration
//   to run for anything missing, and exposes the same answer at
//   GET /api/health/db so it can be checked without shell access.
//
//   It never blocks startup. A missing loyalty table should not take
//   the storefront offline.
// ═══════════════════════════════════════════════════════════════════

// Postgres / PostgREST error codes that mean "this object is not here",
// as opposed to "this object exists and your arguments were wrong".
const MISSING_TABLE = '42P01';
const MISSING_COLUMN = '42703';
const MISSING_FUNCTION = 'PGRST202';   // PostgREST: no function matches

// What the running code actually calls. Keep this in step with the
// call sites — an entry here that nothing calls is noise, and a call
// site missing from here is the silent failure this file exists to stop.
const REQUIRED = {
  tables: [
    { name: 'orders',            migration: 'base schema' },
    { name: 'order_status_logs', migration: 'base schema' },
    { name: 'products',          migration: 'base schema' },
    { name: 'reviews',           migration: 'base schema' },
    { name: 'returns',           migration: '003_returns.sql' },
  ],
  columns: [
    { table: 'orders', column: 'delivered_at', migration: '004_returns_delivered_at.sql' },
  ],
  // Probed with deliberately empty arguments. We are asking "does this
  // function exist", not "does it work" — a wrong-arguments error proves
  // it exists, which is all we need.
  functions: [
    { name: 'return_eligibility', migration: '003_returns.sql + 004_returns_delivered_at.sql' },
    { name: 'approve_return',     migration: '003_returns.sql' },
    { name: 'reject_return',      migration: '003_returns.sql' },
    { name: 'decrement_stock',    migration: '002_atomic_counters.sql' },
    // The VitaPoints v2 API. server.js and vitapoints-routes.js call all
    // of these. 001_vita_points_schema is a v1 schema (vita_award /
    // vita_redeem / vita_reverse over a vita_ledger table) and does not
    // answer to these names, which is why they read as missing on an
    // instance that has only ever run 001. If they come back missing the
    // loyalty scheme is inert: orders earn nothing and cancellations
    // reverse nothing.
    { name: 'vita_earn_on_order',     migration: '006_vitapoints_v2.sql' },
    { name: 'vita_reverse_order',     migration: '006_vitapoints_v2.sql' },
    { name: 'vita_summary',           migration: '006_vitapoints_v2.sql' },
    { name: 'vita_mark_delivered',    migration: '006_vitapoints_v2.sql' },
    { name: 'vita_release_due',       migration: '006_vitapoints_v2.sql' },
    { name: 'vita_reserve',           migration: '006_vitapoints_v2.sql' },
    { name: 'vita_commit_redemption', migration: '006_vitapoints_v2.sql' },
    { name: 'vita_claim_milestone',   migration: '006_vitapoints_v2.sql' },
    // Returns points the customer SPENT on an order that was then
    // cancelled or returned. Without it a cancellation refunds the money
    // and keeps the points.
    { name: 'vita_refund_redemption', migration: '006_vitapoints_v2.sql' },
    // Takes a coupon use and enforces max_uses in one atomic statement.
    // Missing (or erroring) means sp_place_order silently falls back to
    // read-then-write and a single-use code can be spent concurrently.
    { name: 'claim_coupon_use',       migration: '006_vitapoints_v2.sql' },
  ],
};

async function probeTable(supabase, name) {
  const { error } = await supabase.from(name).select('*').limit(0);
  if (!error) return { ok: true };
  if (error.code === MISSING_TABLE) return { ok: false, reason: 'table does not exist' };
  // Anything else (RLS, permissions) means the table is there.
  return { ok: true, note: error.code };
}

async function probeColumn(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(0);
  if (!error) return { ok: true };
  if (error.code === MISSING_COLUMN) return { ok: false, reason: `column "${column}" does not exist` };
  if (error.code === MISSING_TABLE) return { ok: false, reason: `table "${table}" does not exist` };
  return { ok: true, note: error.code };
}

// Probe arguments. An empty-args probe cannot tell "function missing" apart
// from "no overload matches these arguments" — PostgREST answers both with
// PGRST202 — so pass the real argument names and only treat "function does
// not exist" (42703 / P0001) as missing.
const FUNCTION_ARGS = {
  return_eligibility:        { p_order_id: 'selfcheck-probe-00000000' },
  approve_return:            { p_return_id: '00000000-0000-0000-0000-000000000000', p_actor: 'selfcheck', p_note: '' },
  reject_return:             { p_return_id: '00000000-0000-0000-0000-000000000000', p_actor: 'selfcheck', p_note: '' },
  decrement_stock:           { p_id: 0, p_qty: 0 },
  vita_earn_on_order:        { p_user: 'selfcheck@example.com', p_order: 'selfcheck-order-0', p_eligible_value: 0, p_key: 'selfcheck:earn:0' },
  vita_reverse_order:        { p_order: 'selfcheck-order-0', p_returned_value: 0, p_reason: 'selfcheck', p_type: 'CANCELLED', p_key: 'selfcheck:rev:0' },
  vita_summary:              { p_user: 'selfcheck@example.com' },
  vita_mark_delivered:       { p_order: 'selfcheck-order-0', p_delivered_at: new Date().toISOString() },
  vita_release_due:          {},
  vita_reserve:              { p_user: 'selfcheck@example.com', p_order: 'selfcheck-order-0', p_points: 0 },
  vita_commit_redemption:    { p_order: 'selfcheck-order-0' },
  vita_claim_milestone:      { p_user: 'selfcheck@example.com' },
  vita_refund_redemption:    { p_order: 'selfcheck-order-0', p_reason: 'selfcheck' },
  claim_coupon_use:          { p_code: 'selfcheck-coupon-0' },
};

async function probeFunction(supabase, name) {
  const args = FUNCTION_ARGS[name] || {};
  const { error } = await supabase.rpc(name, args);
  if (!error) return { ok: true };
  if (error.code === MISSING_FUNCTION || error.code === 'P0001') {
    return { ok: false, reason: 'function does not exist' };
  }
  // Wrong argument count/types proves the function is there, which is
  // the only thing being asked.
  return { ok: true, note: error.code };
}

async function runDbSelfCheck(supabase) {
  const missing = [];
  const checked = { tables: 0, columns: 0, functions: 0 };

  for (const t of REQUIRED.tables) {
    checked.tables++;
    const r = await probeTable(supabase, t.name);
    if (!r.ok) missing.push({ kind: 'table', name: t.name, reason: r.reason, migration: t.migration });
  }
  for (const c of REQUIRED.columns) {
    checked.columns++;
    const r = await probeColumn(supabase, c.table, c.column);
    if (!r.ok) missing.push({ kind: 'column', name: `${c.table}.${c.column}`, reason: r.reason, migration: c.migration });
  }
  for (const f of REQUIRED.functions) {
    checked.functions++;
    const r = await probeFunction(supabase, f.name);
    if (!r.ok) missing.push({ kind: 'function', name: f.name, reason: r.reason, migration: f.migration });
  }

  return { ok: missing.length === 0, checked, missing, checkedAt: new Date().toISOString() };
}

function printReport(report) {
  if (report.ok) {
    console.log(`✅ [db-selfcheck] all required objects present ` +
      `(${report.checked.tables} tables, ${report.checked.columns} columns, ${report.checked.functions} functions)`);
    return;
  }
  const byMigration = {};
  for (const m of report.missing) (byMigration[m.migration] ||= []).push(m);

  console.error('\n' + '═'.repeat(70));
  console.error('⚠️  [db-selfcheck] MISSING DATABASE OBJECTS — features are silently dead');
  console.error('═'.repeat(70));
  for (const [migration, items] of Object.entries(byMigration)) {
    console.error(`\n  Run: ${migration}`);
    for (const i of items) console.error(`    • ${i.kind} ${i.name} — ${i.reason}`);
  }
  console.error('\n  Apply these in Supabase → SQL Editor, then redeploy or hit');
  console.error('  GET /api/health/db to confirm.');
  console.error('═'.repeat(70) + '\n');
}

module.exports = function mountDbSelfCheck(app, { supabase }) {
  let last = null;

  // On demand, so it can be checked from a phone without shell access.
  app.get('/api/health/db', async (req, res) => {
    try {
      last = await runDbSelfCheck(supabase);
      res.status(last.ok ? 200 : 503).json(last);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // At boot, once, after a short delay so it never competes with the
  // first real requests on a cold deploy.
  setTimeout(async () => {
    try {
      last = await runDbSelfCheck(supabase);
      printReport(last);
    } catch (e) {
      console.error('[db-selfcheck] could not run:', e.message);
    }
  }, 5000);

  return { run: () => runDbSelfCheck(supabase), get last() { return last; } };
};

module.exports.runDbSelfCheck = runDbSelfCheck;
module.exports.REQUIRED = REQUIRED;
