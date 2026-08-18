/* ═══ ASCOFIZZ · AUTH — email + Google Identity (preserved verbatim) ═══ */
// AUTH SYSTEM
// ═══════════════════════════════════════════════════════

function openAuth(tab = 'login') {
  switchAuthTab(tab);
  document.getElementById('authOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAuth() {
  document.getElementById('authOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  clearAuthMessages();
  try { localStorage.setItem('asc_login_prompt_dismissed', String(Date.now())); } catch(e) {}
}

function clearAuthMessages() {
  const err = document.getElementById('authError');
  const suc = document.getElementById('authSuccess');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  if (suc) { suc.style.display = 'none'; suc.textContent = ''; }
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function showAuthSuccess(msg) {
  const el = document.getElementById('authSuccess');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function switchAuthTab(tab) {
  clearAuthMessages();
  document.getElementById('loginTab')?.classList.toggle('active', tab === 'login');
  document.getElementById('registerTab')?.classList.toggle('active', tab === 'register');
  const lf=document.getElementById('loginForm'); if(lf) lf.style.display = tab === 'login' ? 'block' : 'none';
  const rf=document.getElementById('registerForm'); if(rf) rf.style.display = tab === 'register' ? 'block' : 'none';
}

function handleAccountNavClick() {
  const user = getCurrentUser();
  if (user) {
    showPage('account');
    loadAccountPage();
  } else {
    openAuth('login');
  }
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('asc_user') || 'null'); } catch(e) { return null; }
}

// Shared post-login navigation: go to the account page, UNLESS the
// person was mid-checkout (let them stay + autofill) or mid-review on
// a product page (rebuild it and drop them back on the reviews tab
// instead of yanking them away from what they were doing).
function postLoginRedirect() {
  const onCheckout = document.getElementById('page-checkout')?.classList.contains('active');
  if (onCheckout) return;
  const onProduct = document.getElementById('page-product')?.classList.contains('active');
  if (onProduct && currentProduct) {
    try { buildProductPage(currentProduct); switchTab(document.querySelectorAll('.tab')[2], 'rvs'); } catch(e) {}
    return;
  }
  showPage('account'); loadAccountPage();
}

// ── Offline-fallback password hashing (SHA-256 + per-user salt) ──
// Used ONLY when the backend is unreachable. This is not a replacement for
// real server-side auth (bcrypt/argon2 + JWT) — it just avoids storing
// passwords reversibly (e.g. plain Base64) in localStorage.
async function hashPasswordLocal(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex || Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const data = enc.encode(salt + ':' + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: hashHex, salt };
}

async function doLogin() {
  clearAuthMessages();
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  if (!email || !pass) { showAuthError('Please enter your email and password.'); return; }
  try {
    const res = await fetchWithTimeout(API_BASE + '/api/auth/email-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    }, 8000);
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error || 'Invalid email or password.'); return; }
    localStorage.setItem('asc_jwt', data.token);
    localStorage.setItem('asc_user', JSON.stringify(data.user));
    closeAuth(); updateAccountNavBtn();
    postLoginRedirect();
    showToast('🌿 Welcome back, ' + data.user.name.split(' ')[0] + '!');
  } catch(e) {
    // Fallback to localStorage if backend offline
    const users = JSON.parse(localStorage.getItem('asc_users') || '[]');
    const candidate = users.find(u => u.email === email);
    let user = null;
    if (candidate) {
      if (candidate.passwordSalt) {
        const { hash } = await hashPasswordLocal(pass, candidate.passwordSalt);
        if (hash === candidate.passwordHash) user = candidate;
      } else if (candidate.password === btoa(pass)) {
        // Legacy record from before this fix — migrate it to a salted hash now.
        const { hash, salt } = await hashPasswordLocal(pass);
        candidate.passwordHash = hash;
        candidate.passwordSalt = salt;
        delete candidate.password;
        localStorage.setItem('asc_users', JSON.stringify(users));
        user = candidate;
      }
    }
    if (!user) { showAuthError('Invalid email or password. Please try again.'); return; }
    localStorage.setItem('asc_user', JSON.stringify(user));
    closeAuth(); updateAccountNavBtn(); postLoginRedirect();
    showToast('🌿 Welcome back, ' + user.name.split(' ')[0] + '!');
  }
}

async function doRegister() {
  clearAuthMessages();
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const pass  = document.getElementById('regPassword').value;
  if (!name || !email || !pass) { showAuthError('Please fill in all required fields.'); return; }
  if (pass.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
  try {
    const res = await fetchWithTimeout(API_BASE + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password: pass }),
    }, 8000);
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error || 'Registration failed.'); return; }
    localStorage.setItem('asc_jwt', data.token);
    localStorage.setItem('asc_user', JSON.stringify(data.user));
    closeAuth(); updateAccountNavBtn(); postLoginRedirect();
    showToast('🌿 Account created! Welcome to Ascofizz, ' + name.split(' ')[0] + '!');
  } catch(e) {
    // Fallback to localStorage if backend offline
    const users = JSON.parse(localStorage.getItem('asc_users') || '[]');
    if (users.find(u => u.email === email)) { showAuthError('An account with this email already exists.'); return; }
    const { hash, salt } = await hashPasswordLocal(pass);
    const newUser = { name, email, phone, passwordHash: hash, passwordSalt: salt, createdAt: new Date().toISOString(), address: {} };
    users.push(newUser);
    localStorage.setItem('asc_users', JSON.stringify(users));
    localStorage.setItem('asc_user', JSON.stringify(newUser));
    closeAuth(); updateAccountNavBtn(); postLoginRedirect();
    showToast('🌿 Account created! Welcome to Ascofizz, ' + name.split(' ')[0] + '!');
  }
}

// ── Button loading-state wrappers — injected AFTER doLogin/doRegister are defined ──
// Uses DOMContentLoaded so the DOM buttons also exist when we patch.
document.addEventListener('DOMContentLoaded', function _patchAuthButtons() {
  // Patch doLogin
  const _origLogin = window.doLogin;
  if (typeof _origLogin === 'function') {
    window.doLogin = async function() {
      const btn = document.getElementById('loginSubmitBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
      try { await _origLogin(); }
      finally { if (btn) { btn.disabled = false; btn.textContent = 'Sign In →'; } }
    };
  }
  // Patch doRegister
  const _origRegister = window.doRegister;
  if (typeof _origRegister === 'function') {
    window.doRegister = async function() {
      const btn = document.getElementById('registerSubmitBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
      try { await _origRegister(); }
      finally { if (btn) { btn.disabled = false; btn.textContent = 'Create Account →'; } }
    };
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GOOGLE SIGN-IN — Production-Grade Google Identity Services (GIS)
// Version 2.0 — Multi-strategy with full fallbacks + backend warm-up
// Client ID: 6793142938-b9sl3d3lh2svjkmcnina8fsh31nut0bu.apps.googleusercontent.com
// ══════════════════════════════════════════════════════════════════════════

const GOOGLE_CLIENT_ID = '6793142938-b9sl3d3lh2svjkmcnina8fsh31nut0bu.apps.googleusercontent.com';

// ── State tracking ──
let _googleInitialized = false;
let _googleInitRetries = 0;
const _GOOGLE_MAX_RETRIES = 8;

// ── Backend warm-up: ping Render on page load so it's ready when user signs in ──
(function warmUpBackend() {
  setTimeout(() => {
    // /api/visitors/ping only accepts POST server-side (GET 404s here).
    // /api/wake exists specifically for warm-up pings and returns instantly.
    fetch(API_BASE + '/api/wake', { method: 'GET', mode: 'cors' })
      .catch(() => {}); // Silently warm up — errors are expected and ignored
  }, 1500);
})();

// ── Handle Google OAuth2 redirect return (mobile only) ──
(function() {
  var params = new URLSearchParams(window.location.search);
  var code   = params.get('code');
  if (!code) return; // not a redirect return — do nothing

  // Clean URL so refresh doesn't retrigger
  history.replaceState({}, '', window.location.pathname);

  // Show spinner
  var spinner = document.createElement('div');
  spinner.id  = 'g-spinner';
  spinner.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#FAFAF7;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;font-family:sans-serif';
  spinner.innerHTML = '<style>@keyframes gs{to{transform:rotate(360deg)}}</style>'
    + '<div style="width:40px;height:40px;border:3px solid #ddd;border-top-color:#4F8A28;border-radius:50%;animation:gs .8s linear infinite"></div>'
    + '<p style="color:#4F8A28;margin:0;font-size:14px">Signing you in…</p>';
  document.addEventListener('DOMContentLoaded', function() { document.body.appendChild(spinner); });

  // Send code to backend — server holds client_secret securely
  fetch(((window.ASCOFIZZ_CONFIG && ASCOFIZZ_CONFIG.api && ASCOFIZZ_CONFIG.api.base) || '') + '/api/auth/google-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code, redirect_uri: 'https://www.ascovita.com' })
  })
  .then(function(r){ return r.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    // Complete login directly — no race condition with SDK load
    localStorage.setItem('asc_jwt',  data.token);
    localStorage.setItem('asc_user', JSON.stringify(data.user));
    var el = document.getElementById('g-spinner');
    if (el) el.remove();
    // SDK may not be ready yet — defer UI updates to DOMContentLoaded
    function _finishMobileLogin() {
      try { updateAccountNavBtn(); } catch(e) {}
      var name = ((data.user && data.user.name) || 'there').split(' ')[0];
      try { showToast('🌿 Welcome back, ' + name + '!'); } catch(e) {}
      try { showPage('account'); loadAccountPage(); } catch(e) {}
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _finishMobileLogin);
    } else {
      setTimeout(_finishMobileLogin, 300); // slight delay so page scripts init
    }
  })
  .catch(function(e) {
    console.error('[Auth] redirect exchange failed:', e.message);
    var el = document.getElementById('g-spinner');
    if (el) el.remove();
  });
})();

// ── Global callback fired when GIS SDK finishes loading ──
window.onGoogleLibraryLoad = function() {
  // ── DO NOT run auth for bots/crawlers — prevents noindex from OAuth error page ──
  var ua = navigator.userAgent || '';
  var isBot = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|facebot|ia_archiver|crawler|spider|bot/i.test(ua);
  if (!isBot) _initGoogleOneTap();
};

// ── Safely parse a Google-issued JWT without verification (client-side only) ──
function parseGoogleJWT(token) {
  try {
    if (!token || token.split('.').length < 2) return null;
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '==='.slice((base64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch(e) {
    console.warn('[Ascofizz Auth] JWT parse error:', e);
    return null;
  }
}

// ── Build a synthetic credential object from OAuth2 userinfo ──
function _buildSyntheticCredential(profile) {
  // Encode as a pseudo-JWT so handleGoogleCredential can parse it uniformly
  const header  = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=/g,'');
  const payload = btoa(JSON.stringify({
    sub:        profile.sub        || profile.id || '',
    name:       profile.name       || '',
    email:      profile.email      || '',
    picture:    profile.picture    || '',
    given_name: profile.given_name || (profile.name || '').split(' ')[0],
    email_verified: true,
    iss: 'https://accounts.google.com',
    aud: GOOGLE_CLIENT_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).replace(/=/g,'');
  return { credential: header + '.' + payload + '.synthetic' };
}

// ── Core: called after any successful Google auth (One Tap, popup, or OAuth2) ──
async function handleGoogleCredential(response) {
  if (!response || !response.credential) {
    _showAuthFeedback('error', 'Google sign-in returned no credential. Please try again.');
    return;
  }

  // Show loading state inside auth button
  const googleBtn = document.getElementById('googleSignInBtn');
  const originalText = googleBtn ? googleBtn.innerHTML : '';
  if (googleBtn) {
    googleBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.8s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Signing in...</span>';
    googleBtn.disabled = true;
  }

  const restoreGoogleBtn = () => {
    if (googleBtn) { googleBtn.innerHTML = originalText; googleBtn.disabled = false; }
  };

  try {
    // Parse the JWT locally first so we always have user data
    const payload = parseGoogleJWT(response.credential);
    if (!payload || !payload.email) {
      throw new Error('Invalid credential payload');
    }

    // Attempt backend verification (with generous timeout for cold Render starts)
    let backendUser = null;
    let backendJwt  = null;

    try {
      const res = await fetchWithTimeout(API_BASE + '/api/auth/google', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ credential: response.credential }),
      }, 15000); // 15s timeout — Render cold start can take ~10-12s

      if (res.ok) {
        const data = await res.json();
        backendUser = data.user;
        backendJwt  = data.token;
      } else {
        console.warn('[Ascofizz Auth] Backend returned', res.status, '— using local JWT fallback');
      }
    } catch (backendErr) {
      console.warn('[Ascofizz Auth] Backend unreachable:', backendErr.message, '— using local JWT fallback');
    }

    // Build user object — backend data wins, local payload is the fallback
    const user = backendUser || {
      name:    payload.name       || 'Google User',
      email:   payload.email      || '',
      picture: payload.picture    || '',
      social:  'google',
      sub:     payload.sub        || '',
      verified: true,
    };

    // Persist session
    if (backendJwt) localStorage.setItem('asc_jwt', backendJwt);
    localStorage.setItem('asc_user', JSON.stringify(user));

    // Update UI
    closeAuth();
    restoreGoogleBtn();
    updateAccountNavBtn();
    autofillCheckoutFromGoogle(user);

    const firstName = (user.name || 'there').split(' ')[0];
    const isNew = payload.iat && (Date.now() / 1000 - payload.iat) < 10;
    showToast('🌿 ' + (isNew ? 'Welcome, ' : 'Welcome back, ') + firstName + '!');

    // Navigate to account unless mid-checkout or mid-review (see postLoginRedirect)
    postLoginRedirect();

  } catch(err) {
    console.error('[Ascofizz Auth] handleGoogleCredential error:', err);
    restoreGoogleBtn();
    _showAuthFeedback('error', 'Google sign-in failed. Please try again or use email.');
  }
}

// ── Show inline feedback inside auth modal ──
function _showAuthFeedback(type, msg) {
  if (type === 'error') showAuthError(msg);
  else showAuthSuccess(msg);
}

// ── Auto-fill checkout form fields from Google profile ──
function autofillCheckoutFromGoogle(user) {
  if (!user) return;
  const nameParts = (user.name || '').trim().split(' ');
  const setField = (sel, val) => {
    const el = document.querySelector('#page-checkout ' + sel);
    if (el && val && !el.value) el.value = val;
  };
  setField('input[placeholder="Enter first name"]', nameParts[0] || '');
  setField('input[placeholder="Enter last name"]',  nameParts.slice(1).join(' ') || '');
  setField('input[type="email"]', user.email || '');
  if (user.phone) setField('input[type="tel"]', user.phone);
}

// ── Strategy 1: Google One Tap prompt ──
function _tryOneTap() {
  if (typeof google === 'undefined' || !google.accounts?.id) return false;
  try {
    google.accounts.id.prompt(notification => {
      // isSkippedMoment()/isDismissedMoment() are deprecated ahead of Google's
      // mandatory FedCM migration and log console warnings. isNotDisplayed()
      // alone still covers "One Tap didn't show" going forward.
      if (notification.isNotDisplayed()) {
        // One Tap suppressed — try OAuth2 popup as fallback
        _tryOAuth2Popup();
      }
    });
    return true;
  } catch(e) {
    console.warn('[Ascofizz Auth] One Tap prompt error:', e);
    return false;
  }
}

// ── Strategy 2: OAuth2 token popup → userinfo endpoint (desktop) or redirect (mobile/Safari) ──
function _isMobileBrowser() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
function _isSafariBrowser() {
  // Only match iOS Safari specifically — NOT desktop Safari, NOT Edge, NOT Chrome
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
         /Safari/i.test(navigator.userAgent) &&
         !/CriOS|FxiOS|OPiOS|Chrome/i.test(navigator.userAgent);
}

function _tryOAuth2Popup() {
  if (typeof google === 'undefined' || !google.accounts?.oauth2) {
    _showAuthFeedback('error', 'Google sign-in is unavailable. Please use email login.');
    return;
  }

  // Redirect only for actual mobile devices — desktop always uses popup
  if (_isMobileBrowser() || _isSafariBrowser()) {
    try {
      const client = google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid profile email',
        ux_mode: 'redirect',
        redirect_uri: 'https://www.ascovita.com',
      });
      client.requestCode();
    } catch(e) {
      console.error('[Ascofizz Auth] OAuth2 redirect error:', e);
      _showAuthFeedback('error', 'Google sign-in failed. Please use email login.');
    }
    return;
  }

  // Desktop: popup flow is fine
  try {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid profile email',
      prompt: 'select_account',
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          console.warn('[Ascofizz Auth] OAuth2 error:', tokenResponse.error);
          if (tokenResponse.error !== 'access_denied') {
            _showAuthFeedback('error', 'Google sign-in was cancelled.');
          }
          return;
        }
        try {
          const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: 'Bearer ' + tokenResponse.access_token }
          });
          if (!profileRes.ok) throw new Error('userinfo fetch failed: ' + profileRes.status);
          const profile = await profileRes.json();
          await handleGoogleCredential(_buildSyntheticCredential(profile));
        } catch(e) {
          console.error('[Ascofizz Auth] OAuth2 userinfo error:', e);
          _showAuthFeedback('error', 'Could not retrieve Google profile. Please try again.');
        }
      }
    });
    client.requestAccessToken();
  } catch(e) {
    console.error('[Ascofizz Auth] OAuth2 popup error:', e);
    _showAuthFeedback('error', 'Google sign-in failed. Please use email login.');
  }
}

// ── Public: triggered by "Continue with Google" button ──
function socialLogin(provider) {
  if (provider !== 'google') {
    showToast('📱 Phone OTP login coming soon!');
    return;
  }
  clearAuthMessages();

  // Desktop flow
  if (typeof google === 'undefined' || !google.accounts) {
    if (_googleInitRetries < 3) {
      _googleInitRetries++;
      showToast('⏳ Connecting to Google…');
      setTimeout(() => socialLogin('google'), 1000 * _googleInitRetries);
    } else {
      _showAuthFeedback('error', 'Google sign-in unavailable. Please use email login or refresh the page.');
    }
    return;
  }

  _googleInitRetries = 0;
  if (!_tryOneTap()) {
    _tryOAuth2Popup();
  }
}

// ── Init One Tap (called on SDK load) ──
function _initGoogleOneTap() {
  if (_googleInitialized) return;
  if (typeof google === 'undefined' || !google.accounts?.id) return;

  // If user already logged in via our JWT — init SDK but suppress ALL prompts
  if (getCurrentUser()) {
    try {
      google.accounts.id.initialize({
        client_id:            GOOGLE_CLIENT_ID,
        callback:             handleGoogleCredential,
        auto_select:          false,
        cancel_on_tap_outside: true,
        itp_support:          true,
        use_fedcm_for_prompt: true,
      });
      google.accounts.id.disableAutoSelect(); // suppress One Tap for logged-in users
      _googleInitialized = true;
    } catch(e) {}
    return; // do NOT show prompt
  }

  try {
    google.accounts.id.initialize({
      client_id:            GOOGLE_CLIENT_ID,
      callback:             handleGoogleCredential,
      auto_select:          false,         // don't auto-sign without user interaction
      cancel_on_tap_outside: true,
      context:              'signin',
      itp_support:          true,          // support Intelligent Tracking Prevention (Safari)
      use_fedcm_for_prompt: true,          // use FedCM API when available (Chrome 108+)
    });
    _googleInitialized = true;

    // NOTE: One Tap is intentionally NOT auto-triggered here anymore.
    // Sign-in (Google or email) only happens when the customer chooses to —
    // via the navbar account icon or the checkout "Sign in" option, which
    // call openAuth()/_tryOneTap() directly on click.
  } catch(e) {
    console.error('[Ascofizz Auth] One Tap init error:', e);
  }
}

// ── Sign out ──
function doLogout() {
  // Disable Google auto-select so it doesn't auto-sign in again
  if (typeof google !== 'undefined' && google.accounts?.id) {
    try { google.accounts.id.disableAutoSelect(); } catch(e) {}
  }
  localStorage.removeItem('asc_jwt');
  localStorage.removeItem('asc_user');
  updateAccountNavBtn();
  showPage('home');
  showToast('👋 You have been signed out.');
}

// ── Update nav avatar button ──
function updateAccountNavBtn() {
  const user = getCurrentUser();
  // When user logs in, tell Google to stop showing One Tap prompts
  if (user && typeof google !== 'undefined' && google.accounts?.id) {
    try { google.accounts.id.disableAutoSelect(); } catch(e) {}
  }
  const btn  = document.getElementById('accountNavBtn');
  if (!btn) return;
  if (user) {
    if (user.picture) {
      btn.innerHTML = `<img src="${user.picture}" 
        style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid white"
        onerror="this.outerHTML='<span>${(user.name||'U')[0].toUpperCase()}</span>'"
        alt="${user.name || 'User'}">`;
    } else {
      btn.textContent = (user.name || 'U')[0].toUpperCase();
    }
    btn.title = user.name || 'My Account';
    btn.style.cssText = 'background:var(--green);color:white;border-radius:50%;width:36px;height:36px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0;overflow:hidden';
  } else {
    btn.innerHTML = '<svg width="20" height="20"><use href="#ico-user"/></svg>';
    btn.title = 'Account';
    btn.style.cssText = '';
  }
}

// ── Retry init with exponential backoff if SDK loads late ──
function _retryGoogleInit() {
  if (_googleInitialized || _googleInitRetries >= _GOOGLE_MAX_RETRIES) return;
  _googleInitRetries++;
  if (typeof google !== 'undefined' && google.accounts?.id) {
    _initGoogleOneTap();
  } else {
    setTimeout(_retryGoogleInit, Math.min(500 * Math.pow(1.5, _googleInitRetries), 8000));
  }
}

// ── Bootstrap: try init immediately, then with backoff, then on window.load ──
document.addEventListener('DOMContentLoaded', function() {
  // Attempt init immediately
  _initGoogleOneTap();

  // Start retry loop in case SDK loads after DOMContentLoaded
  if (!_googleInitialized) {
    setTimeout(_retryGoogleInit, 300);
  }

  // Last resort: try on full page load
  window.addEventListener('load', function() {
    if (!_googleInitialized) {
      setTimeout(_initGoogleOneTap, 200);
    }
  });

  // ── Wrap showPage to autofill checkout for logged-in Google users ──
  if (!window._googleShowPageWrapped2) {
    window._googleShowPageWrapped2 = true;
    const _origSP = window.showPage;
    if (typeof _origSP === 'function') {
      window.showPage = function(pg) {
        _origSP(pg);
        if (pg === 'checkout') {
          const user = getCurrentUser();
          if (user) autofillCheckoutFromGoogle(user);
          setTimeout(function() {
            const bar = document.getElementById('savedAddressBar');
            if (user && bar) {
              const nameEl    = document.getElementById('savedAddrName');
              const detailsEl = document.getElementById('savedAddrDetails');
              if (nameEl)    nameEl.textContent    = user.name  || '';
              if (detailsEl) detailsEl.textContent = user.email || '';
              bar.style.display = 'flex';
            }
          }, 100);
        }
      };
    }
  }
});

// ── Add CSS spinner keyframe if not already present ──
(function() {
  if (!document.getElementById('_asc_spin_style')) {
    const s = document.createElement('style');
    s.id = '_asc_spin_style';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
})();

function showForgotPassword() {
  clearAuthMessages();
  showAuthSuccess('Password reset link would be sent to your email. (Feature coming soon)');
}

// ═══════════════════════════════════════════════════════
