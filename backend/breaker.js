// ═══════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER + TIMEOUT + CONCURRENCY LIMIT
//
// WHY THIS EXISTS
//   This server calls eight or nine third parties, and most of those
//   calls had no timeout at all:
//
//     oauth2.googleapis.com/tokeninfo   — on the LOGIN path
//     google.com/recaptcha/siteverify   — on the login path
//     gkx.gokwik.co/v1/payments/links   — on the CHECKOUT path
//     apiv2.shiprocket.in               — after checkout
//     graph.instagram.com               — on every home page load
//     api.anthropic.com                 — admin AI panel
//     api.twilio.com                    — WhatsApp reports
//
//   `fetch()` with no signal waits forever. If Google's token endpoint
//   stops answering — not refuses, just stops answering — every sign-in
//   request parks in the event loop holding its socket, its request and
//   response objects, and whatever it captured in scope. They never
//   time out, so they never release. New requests keep arriving and
//   joining them. Memory climbs, Render's instance limit is reached, and
//   the process is killed and restarted — taking down checkout, the
//   admin panel and the storefront, none of which had anything to do
//   with Google.
//
//   That is the cascade: one slow dependency, whole app down.
//
//   Three defences, in the order they matter:
//
//     1. TIMEOUT. Nothing may wait forever. A hung call becomes a
//        failed call in a bounded time, and its resources are released.
//
//     2. CONCURRENCY LIMIT. Even with timeouts, a dependency that takes
//        9s instead of 200ms lets requests pile up 45x deeper. A
//        semaphore caps how many calls can be in flight at once, and
//        once the small queue behind it is full, further callers are
//        rejected IMMEDIATELY rather than joining the pile.
//
//     3. CIRCUIT BREAKER. When a dependency is properly broken, waiting
//        for the timeout on every single request is still throwing
//        capacity away. After enough failures the breaker opens and
//        calls fail instantly — no socket, no wait — until a probe
//        shows the dependency is back.
//
// WHAT COUNTS AS A FAILURE
//   Only the dependency being broken: a network error, a timeout, or a
//   5xx. A 401 or a 400 is the dependency working correctly and telling
//   us we asked for something wrong — a burst of failed logins is not a
//   reason to cut everyone off from Google. Callers signal this by
//   throwing an error with `.expected = true`, or by using the
//   `isFailure` option.
// ═══════════════════════════════════════════════════════════════════

const STATE = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half-open' };

class BreakerOpenError extends Error {
  constructor(name, retryInMs) {
    super(`${name} is unavailable (circuit open, retrying in ${Math.ceil(retryInMs / 1000)}s)`);
    this.code = 'CIRCUIT_OPEN';
    this.dependency = name;
    this.retryInMs = retryInMs;
  }
}
class BreakerSaturatedError extends Error {
  constructor(name, limit) {
    super(`${name} is overloaded (already ${limit} calls in flight)`);
    this.code = 'CIRCUIT_SATURATED';
    this.dependency = name;
  }
}
class BreakerTimeoutError extends Error {
  constructor(name, ms) {
    super(`${name} did not respond within ${ms}ms`);
    this.code = 'CIRCUIT_TIMEOUT';
    this.dependency = name;
  }
}

class Breaker {
  constructor(name, opts = {}) {
    this.name = name;
    this.timeoutMs        = opts.timeoutMs        ?? 10000;
    this.maxConcurrent    = opts.maxConcurrent    ?? 6;
    this.maxQueue         = opts.maxQueue         ?? 12;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.windowMs         = opts.windowMs         ?? 60000;
    this.openMs           = opts.openMs           ?? 30000;
    this.halfOpenMax      = opts.halfOpenMax      ?? 1;
    this.isFailure        = opts.isFailure        ?? ((err) => !err.expected);

    this.state = STATE.CLOSED;
    this.failures = [];          // timestamps, trimmed to the window
    this.openedAt = 0;
    this.halfOpenInFlight = 0;
    this.inFlight = 0;
    this.queue = [];
    // Resolved when the in-flight half-open probe settles. Starts
    // already-resolved so a caller that arrives with no probe running
    // never blocks.
    this._probeSettled = Promise.resolve();
    this.stats = { ok: 0, failed: 0, timedOut: 0, rejectedOpen: 0, rejectedSaturated: 0, opened: 0 };
  }

  _trim(now) {
    const cut = now - this.windowMs;
    while (this.failures.length && this.failures[0] < cut) this.failures.shift();
  }

  _open(now) {
    if (this.state !== STATE.OPEN) {
      this.stats.opened++;
      console.warn(`[breaker] ${this.name} OPEN — ${this.failures.length} failures in ${this.windowMs / 1000}s. ` +
                   `Fast-failing for ${this.openMs / 1000}s.`);
    }
    this.state = STATE.OPEN;
    this.openedAt = now;
    this.halfOpenInFlight = 0;
  }

  _close() {
    if (this.state !== STATE.CLOSED) {
      console.log(`[breaker] ${this.name} CLOSED — dependency healthy again.`);
    }
    this.state = STATE.CLOSED;
    this.failures = [];
    this.halfOpenInFlight = 0;
  }

  // Decide whether this call is allowed through right now.
  _admit(now) {
    if (this.state === STATE.OPEN) {
      if (now - this.openedAt >= this.openMs) {
        this.state = STATE.HALF_OPEN;
        this.halfOpenInFlight = 0;
        console.log(`[breaker] ${this.name} HALF-OPEN — letting ${this.halfOpenMax} call(s) through to probe.`);
      } else {
        return { ok: false, err: new BreakerOpenError(this.name, this.openMs - (now - this.openedAt)) };
      }
    }
    if (this.state === STATE.HALF_OPEN && this.halfOpenInFlight >= this.halfOpenMax) {
      // A probe is already out. Don't send a crowd in behind it — but
      // don't turn these callers away either. Rejecting them means that
      // the moment a dependency comes back, the first burst of real
      // traffic still gets errors, for no reason: the probe is about to
      // prove the dependency is healthy and they could have been served.
      // They wait for the probe's verdict instead. See run().
      return { ok: false, waitForProbe: true };
    }
    return { ok: true };
  }

  _onSuccess() {
    this.stats.ok++;
    if (this.state === STATE.HALF_OPEN) this._close();
    else this.failures = [];   // a success clears the run of failures
  }

  _onFailure(now, err) {
    this.stats.failed++;
    if (err instanceof BreakerTimeoutError) this.stats.timedOut++;
    if (this.state === STATE.HALF_OPEN) { this._open(now); return; }
    this._trim(now);
    this.failures.push(now);
    if (this.failures.length >= this.failureThreshold) this._open(now);
  }

  _release() {
    this.inFlight--;
    const next = this.queue.shift();
    if (next) next();
  }

  // Wait for a concurrency slot, or reject if the queue is already full.
  _acquire() {
    if (this.inFlight < this.maxConcurrent) { this.inFlight++; return Promise.resolve(); }
    if (this.queue.length >= this.maxQueue) {
      this.stats.rejectedSaturated++;
      return Promise.reject(new BreakerSaturatedError(this.name, this.maxConcurrent));
    }
    return new Promise(resolve => this.queue.push(() => { this.inFlight++; resolve(); }));
  }

  // fn receives an AbortSignal — pass it to fetch so the socket is
  // actually torn down on timeout, not just abandoned.
  async run(fn, { fallback } = {}) {
    let admit = this._admit(Date.now());

    // A probe is deciding right now whether the dependency is back.
    // Wait for its verdict rather than failing on a stale answer — this
    // is what makes recovery clean instead of costing one more burst of
    // errors. Bounded by the probe's own timeout, and only ever waited
    // on once: if a second probe is running by then, fail fast.
    if (!admit.ok && admit.waitForProbe) {
      await this._probeSettled;
      admit = this._admit(Date.now());
      if (!admit.ok) admit = { ok: false, err: new BreakerOpenError(this.name, this.openMs) };
    }

    if (!admit.ok) {
      this.stats.rejectedOpen++;
      const err = admit.err || new BreakerOpenError(this.name, this.openMs);
      if (fallback) return fallback(err);
      throw err;
    }

    try {
      await this._acquire();
    } catch (satErr) {
      if (fallback) return fallback(satErr);
      throw satErr;
    }

    // If this call IS the probe, publish a promise others can wait on.
    // It must settle on every exit path below — success, failure,
    // timeout — or waiting callers would hang for as long as the
    // dependency is down, which is precisely the bug this whole file
    // exists to prevent. The `finally` is what guarantees that.
    let settleProbe = null;
    const isProbe = this.state === STATE.HALF_OPEN;
    if (isProbe) {
      this.halfOpenInFlight++;
      this._probeSettled = new Promise(resolve => { settleProbe = resolve; });
    }

    const ac = new AbortController();
    let timer;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => fn(ac.signal)),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            ac.abort();
            reject(new BreakerTimeoutError(this.name, this.timeoutMs));
          }, this.timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      this._onSuccess();
      return result;
    } catch (err) {
      clearTimeout(timer);
      // An "expected" error (401, validation, a business no) is the
      // dependency working. Record nothing, and let it propagate.
      if (err instanceof BreakerTimeoutError || this.isFailure(err)) {
        this._onFailure(Date.now(), err);
      } else if (this.state === STATE.HALF_OPEN) {
        this._close();   // it answered us properly; it's alive
      }
      if (fallback) return fallback(err);
      throw err;
    } finally {
      if (isProbe) {
        if (this.halfOpenInFlight > 0) this.halfOpenInFlight--;
        // Release everyone waiting on the verdict, whatever it was.
        if (settleProbe) settleProbe();
      }
      this._release();
    }
  }

  snapshot() {
    const now = Date.now();
    this._trim(now);
    return {
      name: this.name,
      state: this.state,
      inFlight: this.inFlight,
      queued: this.queue.length,
      failuresInWindow: this.failures.length,
      reopensIn: this.state === STATE.OPEN ? Math.max(0, this.openMs - (now - this.openedAt)) : 0,
      limits: { timeoutMs: this.timeoutMs, maxConcurrent: this.maxConcurrent, maxQueue: this.maxQueue,
                failureThreshold: this.failureThreshold, openMs: this.openMs },
      stats: { ...this.stats },
    };
  }
}

const registry = new Map();

function breaker(name, opts) {
  if (!registry.has(name)) registry.set(name, new Breaker(name, opts));
  return registry.get(name);
}

// Convenience: a fetch that is timed, limited, and breaker-guarded.
//
// CONTRACT: identical to fetch(). It RESOLVES with the Response for any
// HTTP status, including 4xx and 5xx, and only throws when there is no
// response at all — a network error, a timeout, an open circuit, or a
// saturated one.
//
// That equivalence is the whole point, and getting it wrong caused a
// real regression: an earlier version threw on any non-2xx, which broke
// every caller that reads the body of an error. Google's tokeninfo
// endpoint answers 400 for an expired token, and /api/auth/google
// parses that body to return a clean "Invalid Google token" 401. With
// the throwing version, an ordinary expired session fell through to the
// route's catch and became a 500 "Authentication failed" — turning a
// normal, expected event into what looks like a server fault. Delhivery
// had the same shape: its real reason ("pickup pincode not
// serviceable") lives in the body of a 400.
//
// So the status only decides what the BREAKER thinks, never what the
// caller receives:
//   5xx — the dependency is broken. Counts toward tripping.
//   4xx — the dependency is working and telling us we asked wrongly.
//         Counts as a success; a burst of bad logins is not an outage
//         and must never cut everyone off from Google.
async function guardedFetch(name, url, options = {}, breakerOpts = {}) {
  const b = breaker(name, breakerOpts);
  return b.run(async (signal) => {
    const r = await fetch(url, { ...options, signal });
    if (r.status >= 500) {
      const e = new Error(`${name} returned HTTP ${r.status}`);
      e.status = r.status;
      e.response = r;      // recovered by the fallback below
      throw e;             // counts against the breaker
    }
    return r;              // 2xx and 4xx alike
  }, {
    ...breakerOpts,
    // Runs for every failure. A 5xx has a real response behind it, so
    // hand it back and let the caller read the body — the breaker has
    // already recorded the failure by this point. Anything else (no
    // socket, no answer, circuit open) genuinely has nothing to return.
    fallback: (err) => {
      if (err && err.response) return err.response;
      throw err;
    },
  });
}

function snapshotAll() {
  return [...registry.values()].map(b => b.snapshot());
}

// Mounts GET /api/health/deps so the state of every dependency can be
// read from a phone without shell access, the same way /api/health/db is.
function mountBreakerHealth(app) {
  app.get('/api/health/deps', (req, res) => {
    const deps = snapshotAll();
    const degraded = deps.filter(d => d.state !== 'closed');
    res.status(degraded.length ? 503 : 200).json({
      ok: degraded.length === 0,
      degraded: degraded.map(d => d.name),
      dependencies: deps,
      checkedAt: new Date().toISOString(),
    });
  });
}

module.exports = {
  breaker, guardedFetch, snapshotAll, mountBreakerHealth,
  BreakerOpenError, BreakerSaturatedError, BreakerTimeoutError,
  STATE,
  _reset: () => registry.clear(),   // tests only
};
