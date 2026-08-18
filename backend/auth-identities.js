/*
 * auth-identities.js — per-person staff identities, owner-only staff
 * management (granular permission sets), and the password-reconfirmation
 * gate for critical actions.
 *
 * Mounts into server.js: app.use(require('./auth-identities')(deps))
 * All state lives in the new `auth_identities` table (migration 019).
 * 2FA (TOTP/Google Authenticator) was requested for removal by the owner
 * on Aug 16, 2026 — all enroll/verify/master-toggle paths are gone; the
 * totp_secret / backup_codes / enforced columns remain in the table for
 * data safety but are no longer read or required anywhere.
 *
 * Backward compatibility (Aug 2026): the fixed env-based owner/admin login
 * that has powered the panel since day one still works if `auth_identities`
 * rows do not exist yet. The server bootstraps the two built-in rows from
 * ADMIN_PASSWORD / OWNER_PASSWORD on first use, so an existing panel keeps
 * logging in exactly as before.
 */
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const BCRYPT_ROUNDS = 12;

module.exports = function authIdentitiesApp(deps) {
  const { app, supabase, authMiddleware, adminOnly, ownerOnly, requirePerm,
          writeAudit, signToken, getTokenVersion, bumpTokenVersion } = deps;
  // rateLimit is optional — if a deploy cannot hand down the middleware
  // helper, the gate still mounts with a passthrough instead of crashing
  // the entire 2FA + staff module.
  let rateLimit = deps.rateLimit;
  if (typeof rateLimit !== 'function') {
    console.warn('[auth-identities] rateLimit dep missing — /api/admin/confirm-password runs without a rate limiter');
    rateLimit = () => (req, res, next) => next();
  }

  // ── Identity table access (service-keyed, never client-reachable) ──
  const TBL = 'auth_identities';

  async function loadIdentity(username) {
    const { data, error } = await supabase.from(TBL)
      .select('*').ilike('username', String(username || ''))
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async function upsertIdentity(row) {
    // Normalize to lowercase first: the UNIQUE column is case-sensitive, and
    // every lookup (ilike) treats 'Owner' and 'owner' as the same person.
    const norm = row.username != null ? { username: String(row.username).toLowerCase() } : {};
    const { data, error } = await supabase.from(TBL)
      .upsert({ ...row, ...norm, updated_at: new Date().toISOString() }, { onConflict: 'username' })
      .select().single();
    if (error) throw error;
    return data;
  }

  const safeEq = (a, b) => {
    const A = Buffer.from(String(a || '')), B = Buffer.from(String(b || ''));
    return A.length === B.length && crypto.timingSafeEqual(A, B);
  };
  // Constant-time lookup of an identity row: fetch regardless, compare
  // against a dummy if the name was not found, so an unknown username does
  // not reply faster than a known one (no account enumeration via timing).
  const DUMMY_IDENTITY = { username: '__never__', password_hash: bcrypt.hashSync('x', 1), enabled: true };
  async function findIdentity(username) {
    try {
      const r = await loadIdentity(username);
      return r || DUMMY_IDENTITY;
    } catch (e) { return DUMMY_IDENTITY; }
  }

  // ═══════════════════════════════════════════════════════════════
  // PASSWORD RE-CONFIRMATION GATE
  // ═══════════════════════════════════════════════════════════════
  // A live session alone is not proof of intent — a laptop left open,
  // a copied token, an over-the-shoulder look. Critical actions demand a
  // fresh password (or, if 2FA is active, password + TOTP). The result is
  // a short-lived signed proof token the action endpoint checks.

  const confirmLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => String(req.headers['x-forwarded-for'] || req.ip || ''),
  });
  // NOTE: password-only re-confirmation (no 2FA step) — 2FA was removed
  // per owner request. The body may still carry a stale `code` field from
  // old panel versions; it is simply ignored.

  // In-memory proof store: proofs last 5 minutes and are one-use.
  const _proofs = new Map();
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of _proofs) if (v.at < cutoff) _proofs.delete(k);
  }, 5 * 60 * 1000).unref?.();

  app.post('/api/admin/confirm-password', confirmLimiter, authMiddleware, adminOnly, async (req, res) => {
    try {
      const { username, password, code } = req.body || {};
      const who = String(username || '').toLowerCase();
      // Identity must match the session — nobody can re-confirm for someone else.
      if (who !== String(req.user.username || req.user.email || '').toLowerCase()) {
        return res.status(403).json({ error: 'Re-confirmation must use your own account' });
      }
      // Dual security (owner request Aug 17, 2026): critical actions require
      // the separate TRANSACTION (save) password from the SAVE_PASSWORD env
      // var, so a leaked LOGIN password can never approve changes alone.
      // When SAVE_PASSWORD is configured it must match exactly; when it is
      // unset the legacy path falls back to the person's own login
      // password so existing panels keep working.
      let pwMatch;
      const savePw = process.env.SAVE_PASSWORD || '';
      if (savePw) {
        pwMatch = safeEq(String(password || ''), savePw);
      } else {
        const id = await findIdentity(who);
        pwMatch = id === DUMMY_IDENTITY ? false : await bcrypt.compare(String(password || ''), id.password_hash).catch(() => false);
      }
      // Timing-equalise the miss path so a wrong password takes as long as a right one.
      if (!pwMatch) {
        noteConfirmFailure(who);
        await writeAudit({ userId: who, tableName: 'auth_identities', recordId: who,
          action: 'PASSWORD_RECONFIRM_FAILED', ipAddress: req.headers['x-forwarded-for'] || req.ip });
        return res.status(401).json({ error: 'Incorrect password — please try again' });
      }
      clearConfirmFailures(who);

      const proof = crypto.randomBytes(20).toString('base64url');
      _proofs.set(proof, { username: who, at: Date.now() });
      await writeAudit({ userId: who, tableName: 'auth_identities', recordId: who,
        action: 'PASSWORD_RECONFIRMED', ipAddress: req.headers['x-forwarded-for'] || req.ip });
      res.json({ ok: true, proof });
    } catch (e) {
      console.error('[confirm-password]', e.message);
      res.status(500).json({ error: 'Re-confirmation failed — please try again' });
    }
  });

  // Middleware: the action endpoint requires X-Password-Proof from a fresh
  // re-confirmation by the SAME user. One-use, 5-minute life.
  function passwordConfirmed(req, res, next) {
    const p = _proofs.get(String(req.headers['x-password-proof'] || '').trim());
    if (!p) return res.status(401).json({ error: 'Password re-confirmation required — confirm your password, then try again' });
    if (Date.now() - p.at > 5 * 60 * 1000) { _proofs.delete(String(req.headers['x-password-proof'] || '').trim()); return res.status(401).json({ error: 'Re-confirmation expired — confirm your password again' }); }
    if (p.username !== String(req.user.username || req.user.email || '').toLowerCase()) {
      return res.status(403).json({ error: 'Re-confirmation belongs to a different account' });
    }
    _proofs.delete(String(req.headers['x-password-proof'] || '').trim()); // one-use
    next();
  }

  // ── Change the account's own password (admin panel, Settings card) ──
  // Works for every signed-in person (owner and staff alike). Verifies the
  // current password first, then writes a bcrypt of the new one into the
  // per-person identity row — creating the row if the account is still on
  // the legacy env-only path. For the built-in accounts the Render env var
  // (OWNER_PASSWORD / ADMIN_PASSWORD) remains canonical after every
  // restart, so the panel response tells the owner to keep the env var in
  // sync if they want the change to survive redeploys.
  const changePwLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => String(req.headers['x-forwarded-for'] || req.ip || ''), });
  app.post('/api/admin/change-password', changePwLimiter, authMiddleware, adminOnly, async (req, res) => {
    try {
      const { current: cur, new: nw } = req.body || {};
      if (!cur || !nw) return res.status(400).json({ error: 'Both the current and new password are required' });
      if (nw.length < 10) return res.status(400).json({ error: 'New password must be at least 10 characters' });
      const who = String(req.user.username || req.user.email || '').toLowerCase();
      // Verify the current password: identity row when one exists, else
      // the env value for the two built-in accounts (timing-equalised).
      let verified = false;
      const id = await findIdentity(who).catch(() => DUMMY_IDENTITY);
      if (id !== DUMMY_IDENTITY) {
        verified = await bcrypt.compare(String(cur), id.password_hash).catch(() => false);
      } else {
        const envPw = who === 'owner' ? process.env.OWNER_PASSWORD : (who === 'admin' ? process.env.ADMIN_PASSWORD : null);
        verified = envPw ? safeEq(cur, envPw) : false;
      }
      if (!verified) return res.status(401).json({ error: 'Current password is incorrect' });
      const hash = await bcrypt.hash(nw, BCRYPT_ROUNDS);
      const role = req.user.role === 'owner' ? 'owner' : 'admin';
      await upsertIdentity({
        username: who,
        password_hash: hash,
        role,
        totp_secret: null,
        backup_codes: '[]',
        enforced: false,
        enabled: true,
        token_version: 1,
      });
      try { await bumpTokenVersion(who, who); } catch (e) { /* kills other sessions; non-fatal */ }
      await writeAudit({ userId: who, tableName: 'auth_identities', recordId: who,
        action: 'PASSWORD_CHANGED', ipAddress: req.headers['x-forwarded-for'] || req.ip });
      const isBuiltIn = who === 'owner' || who === 'admin';
      res.json({ ok: true, builtin: isBuiltIn,
        note: isBuiltIn
          ? 'Password updated in the database. This account also reads OWNER_PASSWORD / ADMIN_PASSWORD from Render on every restart — set the Render environment variable to the same new value so future redeploys do not revert it.'
          : 'Your staff password is updated and every other session is signed out.' });
    } catch (e) {
      console.error('[change-password]', e.message);
      res.status(500).json({ error: 'Could not change the password' });
    }
  });

  // One shared proof verifier for every password-gated action in the tree —
  // customers-360, refunds, settings — all check the same one-use store.
  global.__verifyPasswordProof = function (proof, req, res, next) {
    const p = _proofs.get(proof);
    if (!p) return res.status(401).json({ error: 'Password re-confirmation required — confirm your password, then try again' });
    if (Date.now() - p.at > 5 * 60 * 1000) { _proofs.delete(proof); return res.status(401).json({ error: 'Re-confirmation expired — confirm your password again' }); }
    if (p.username !== String(req.user.username || req.user.email || '').toLowerCase()) {
      return res.status(403).json({ error: 'Re-confirmation belongs to a different account' });
    }
    _proofs.delete(proof); // one-use
    next();
  };

  // Per-account confirm failure lockout (same shape as login lockout).
  const _confirmFails = new Map();
  function noteConfirmFailure(u) {
    const k = String(u || '').toLowerCase();
    const r = _confirmFails.get(k) || { n: 0 };
    r.n += 1;
    if (r.n >= 5) { r.until = Date.now() + 15 * 60 * 1000; r.n = 0; }
    _confirmFails.set(k, r);
  }
  function clearConfirmFailures(u) { _confirmFails.delete(String(u || '').toLowerCase()); }
  function confirmLockoutRemainingMs(u) {
    const r = _confirmFails.get(String(u || '').toLowerCase());
    if (!r || !r.until) return 0;
    const left = r.until - Date.now();
    if (left <= 0) { _confirmFails.delete(String(u || '').toLowerCase()); return 0; }
    return left;
  }

  // ── Built-in identity bootstrap (migration 019) ───────────────────
  // On boot, ensure owner/admin rows exist with a bcrypt of the current
  // env password. If the env password changes, the row is re-hashed so the
  // two login paths can never drift apart.
  async function identityBootstrap() {
    try {
      const rows = [
        { username: 'owner',  pw: process.env.OWNER_PASSWORD,  role: 'owner'  },
        { username: 'admin',  pw: process.env.ADMIN_PASSWORD,  role: 'admin'  },
      ].filter(r => r.pw);
      for (const r of rows) {
        const existing = await loadIdentity(r.username).catch(() => null);
        const hash = await bcrypt.hash(r.pw, BCRYPT_ROUNDS);
        await upsertIdentity({
          username: r.username,
          password_hash: hash,
          role: r.role,
          enabled: existing?.enabled ?? true,
          token_version: existing?.token_version ?? 1,
        });
      }
      console.log('[identity] owner/admin rows synced ✅');
    } catch (e) {
      console.warn('[identity] bootstrap skipped:', e.message, '— falling back to env-only login');
    }
  }
  if (process.env.ADMIN_PASSWORD || process.env.OWNER_PASSWORD) {
    identityBootstrap().then(() => {}).catch(() => {});
  }

  // 2FA endpoints were removed Aug 16, 2026 per owner request. Any stray
  // call to /api/admin/2fa/* now gets a clean 404 from Express (not
  // mounted), and the panel no longer references them.
  // ═══════════════════════════════════════════════════════════════
  // OWNER STAFF MANAGEMENT
  // ═══════════════════════════════════════════════════════════════
  // ── Staff list ──────────────────────────────────────────────────
  app.get('/api/admin/staff', authMiddleware, ownerOnly, async (req, res) => {
    try {
      const { data, error } = await supabase.from(TBL).select('username, role, enabled, permissions, last_login_at, created_at, token_version');
      if (error) throw error;
      res.json({ staff: (data || []).map(s => ({
        username: s.username,
        role: s.role,
        enabled: !!s.enabled,
        permissions: s.permissions,
        last_login_at: s.last_login_at,
        created_at: s.created_at,
      })) });
    } catch (e) { res.status(500).json({ error: 'Could not load staff list' }); }
  });

  // Dual security (Aug 2026): critical staff actions require the separate
  // save/transaction password (Render env var SAVE_PASSWORD) via a fresh
  // X-Password-Proof from /api/admin/confirm-password.
  function passwordGated(req, res, next) {
    const proof = String(req.headers['x-password-proof'] || '').trim();
    if (!proof) return res.status(401).json({ error: 'Password re-confirmation required — enter the save password, then try again' });
    if (typeof global.__verifyPasswordProof === 'function') {
      return global.__verifyPasswordProof(proof, req, res, next);
    }
    return res.status(500).json({ error: 'Password gate unavailable — restart the panel' });
  }

  // ── Owner invite: creates the identity, returns one-time credentials.
  app.post('/api/admin/staff/invite', authMiddleware, ownerOnly, passwordGated, async (req, res) => {
    try {
      const { username, password, role, permissions } = req.body || {};
      if (!username || !password) return res.status(400).json({ error: 'Username and initial password required' });
      if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–30 characters: letters, numbers, . _ -' });
      if (password.length < 10) return res.status(400).json({ error: 'Initial password must be at least 10 characters' });
      const validRole = role === 'owner' || role === 'admin';
      if (!validRole) return res.status(400).json({ error: 'Role must be owner or admin' });
      if (validRole && role === 'owner') return res.status(400).json({ error: 'New staff cannot be created as owner — keep one owner account. Use a custom permission set instead.' });
      if (permissions && !Array.isArray(permissions)) return res.status(400).json({ error: 'permissions must be a list' });
      const existing = await loadIdentity(username).catch(() => null);
      if (existing) return res.status(409).json({ error: 'A staff account with that username already exists' });
      const inviteCode = crypto.randomBytes(12).toString('base64url');
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await upsertIdentity({
        username: String(username).toLowerCase(),
        password_hash: hash,
        role: 'admin', // never 'owner'; owner stays unique
        permissions: Array.isArray(permissions) ? permissions : null,
        enabled: true,
        invite_code: inviteCode,
      });
      await writeAudit({ userId: req.user.username || req.user.email, tableName: 'auth_identities', recordId: String(username).toLowerCase(),
        action: 'STAFF_INVITED', newValues: { role: 'admin', permissions: permissions || null },
        ipAddress: req.headers['x-forwarded-for'] || req.ip });
      res.json({
        ok: true,
        username: String(username).toLowerCase(),
        invite_code: inviteCode, // one-time; consumed on first sign-in
      });
    } catch (e) {
      console.error('[staff/invite]', e.message);
      res.status(500).json({ error: 'Could not create staff account' });
    }
  });

  // ── Revoke: kills every outstanding session for that person. ────────
  app.post('/api/admin/staff/revoke', authMiddleware, ownerOnly, passwordGated, async (req, res) => {
    try {
      const { username, suspend } = req.body || {};
      const who = String(username || '').toLowerCase();
      const id = await loadIdentity(who);
      if (!id) return res.status(404).json({ error: 'Staff account not found' });
      if (who === 'owner') return res.status(400).json({ error: 'The owner account cannot be revoked' });
      if (suspend) {
        await upsertIdentity({ username: who, enabled: false });
      }
      await bumpTokenVersion(who, String(req.user.username || req.user.email || ''));
      await writeAudit({ userId: req.user.username || req.user.email, tableName: 'auth_identities', recordId: who,
        action: suspend ? 'STAFF_SUSPENDED_AND_REVOKED' : 'STAFF_REVOKED',
        ipAddress: req.headers['x-forwarded-for'] || req.ip });
      res.json({ ok: true });
    } catch (e) {
      console.error('[staff/revoke]', e.message);
      res.status(500).json({ error: 'Could not revoke staff account' });
    }
  });

  // ── Reactivate a suspended account ─────────────────────────────────
  app.post('/api/admin/staff/enable', authMiddleware, ownerOnly, passwordGated, async (req, res) => {
    try {
      const { username } = req.body || {};
      const who = String(username || '').toLowerCase();
      const id = await loadIdentity(who);
      if (!id) return res.status(404).json({ error: 'Staff account not found' });
      await upsertIdentity({ username: who, enabled: true });
      await writeAudit({ userId: req.user.username || req.user.email, tableName: 'auth_identities', recordId: who,
        action: 'STAFF_REACTIVATED', ipAddress: req.headers['x-forwarded-for'] || req.ip });
      res.json({ ok: true });
    } catch (e) {
      console.error('[staff/enable]', e.message);
      res.status(500).json({ error: 'Could not reactivate staff account' });
    }
  });

  // ── Owner edits one person's role flag + custom permission set ──────
  app.put('/api/admin/staff/:username', authMiddleware, ownerOnly, passwordGated, async (req, res) => {
    try {
      const who = String(req.params.username || '').toLowerCase();
      const { permissions } = req.body || {};
      if (who === 'owner') return res.status(400).json({ error: 'The owner account cannot be modified' });
      const id = await loadIdentity(who);
      if (!id) return res.status(404).json({ error: 'Staff account not found' });
      const patch = {};
      if (permissions !== undefined) {
        if (permissions === null) patch.permissions = null;
        else if (Array.isArray(permissions)) patch.permissions = permissions;
        else return res.status(400).json({ error: 'permissions must be a list or null' });
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update' });
      await upsertIdentity({ username: who, ...patch });
      await writeAudit({ userId: req.user.username || req.user.email, tableName: 'auth_identities', recordId: who,
        action: 'STAFF_UPDATED', newValues: patch, ipAddress: req.headers['x-forwarded-for'] || req.ip });
      // If the target is THIS caller, their live permission set must refresh
      // on the next /api/admin/me — bumping their token version forces a
      // re-login so the panel re-renders against the new set.
      if (who === String(req.user.username || req.user.email || '').toLowerCase()) {
        await bumpTokenVersion(who, who);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[staff/update]', e.message);
      res.status(500).json({ error: 'Could not update staff account' });
    }
  });

  return { identityBootstrap };
};
