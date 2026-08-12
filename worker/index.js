/**
 * Ozylix — routing shim for Cloudflare Workers static assets.
 *
 * The storefront is one index.html single-page app. Cloudflare serves any real
 * file straight from the edge WITHOUT invoking this Worker, so this code only
 * runs for paths that do not exist on disk: the SPA's own routes, and genuine
 * 404s. Images, sw.js, manifest.json etc. never touch it.
 *
 * Why this exists rather than a `_redirects` file:
 * `_redirects` used to carry these routes, but wrangler's own parser rejects the
 * one that mattered most:
 *
 *   Found 1 invalid redirect rule:
 *   > Infinite loop detected in this rule and has been ignored.
 *       at _redirects:29 | /product/*   /index.html  200
 *
 * A `200` rewrite whose target is itself served by the asset server re-enters
 * the rule, so Cloudflare drops it. That silently took out all 16 product URLs —
 * the entire reason for moving off GitHub Pages, where 22 of 23 sitemap URLs
 * returned 404. `_redirects` was removed rather than left half-working, so
 * routing has exactly one source of truth: this file.
 *
 * Keep SPA_ROUTES in step with `_validPages` in index.html (search for
 * `const _validPages`). A route listed here but missing there renders the home
 * page under a different URL — a soft 404, which is worse than a real one.
 */

const SPA_ROUTES = new Set([
  '/shop',
  '/blog',
  '/about',
  '/contact',
  '/faq',
  '/advisor',
  '/b2b', // index.html forwards this on to the Ascovita corporate site
  '/wishlist',
  '/subscriptions',
]);

// /product/<slug> only. Bare /product/ has no product to open, and
// /product/a/b is not a shape the app produces.
const PRODUCT_PATH = /^\/product\/[^/]+$/;

function isSpaPath(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return SPA_ROUTES.has(path) || PRODUCT_PATH.test(path);
}

// The admin panel has its own hostname. Without this it is simply another
// Custom Domain on the same Worker, so back.ozylix.com would serve a second
// complete copy of the storefront — duplicate content for Google, under a name
// that is meant to be private.
const ADMIN_HOST = 'back.ozylix.com';
const ADMIN_ENTRY = new Set(['/', '/admin', '/admin.html']);

// Never let the admin hostname into a search index, whatever it serves.
function noIndex(res) {
  const headers = new Headers(res.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(res.body, { status: res.status, headers });
}

async function serveAdmin(request, env, url) {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;

  if (ADMIN_ENTRY.has(path)) {
    const page = await env.ASSETS.fetch(new URL('/admin.html', url));
    return noIndex(new Response(page.body, { status: 200, headers: page.headers }));
  }

  // Real files still resolve, because admin.html pulls in invoice-template.js,
  // the logo and so on. Anything else — storefront routes in particular — is
  // left to 404 here rather than serving the shop under the admin name.
  return noIndex(await env.ASSETS.fetch(request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname.toLowerCase() === ADMIN_HOST) {
      return serveAdmin(request, env, url);
    }

    if (isSpaPath(url.pathname)) {
      // Serve the app shell while keeping the visitor's URL and a 200, so the
      // page is indexable. index.html reads location.pathname on boot and opens
      // the matching page or product.
      const shell = await env.ASSETS.fetch(new URL('/index.html', url));
      return new Response(shell.body, { status: 200, headers: shell.headers });
    }

    // Real asset, or nothing — in which case not_found_handling serves 404.html
    // with a genuine 404 status.
    return env.ASSETS.fetch(request);
  },
};

// Exported for the local routing test; ignored by the Workers runtime.
export { isSpaPath, ADMIN_HOST, ADMIN_ENTRY };
