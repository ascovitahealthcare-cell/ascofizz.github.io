/**
 * image-cdn.js — ASCOFIZZ
 * ──────────────────────────────────────────────────────────────────────────
 * Edge image proxy: every site image is now delivered from ascofizz.github.io
 * instead of Supabase Storage, so Supabase egress drops to near zero.
 *
 * How it works:
 *   1) The storefront and admin panel reference images as
 *        /cdn-storage/<bucket>/<path>   (e.g. /cdn-storage/product-images/1786544808269-q1ro7o.webp)
 *   2) The Worker (see index.js) catches anything under /cdn-storage/ and
 *      fetches it from Supabase Storage in the background:
 *        https://YOUR_SUPABASE_PROJECT.supabase.co/storage/v1/object/public/<bucket>/<path>
 *   3) The response is stored in the Cloudflare Cache API with a YEAR-long
 *      TTL — the FIRST visitor pays for the Supabase transfer once, every
 *      visitor after that is served straight from Cloudflare's edge and
 *      costs Supabase nothing.
 *
 * Uploads are unchanged: the admin panel still uploads into Supabase
 * Storage through POST /api/upload/image exactly as before.
 * ──────────────────────────────────────────────────────────────────────────
 */

// The Supabase project that owns the product-images bucket (the same ref
// the storefront's SUPABASE_URL points at).
export const SUPABASE_STORAGE_ORIGIN = 'https://YOUR_SUPABASE_PROJECT.supabase.co'; // set in wrangler.jsonc vars at deploy

// All buckets the site may serve images from. Add new ones here as the
// admin uploads to new buckets — the proxy itself needs no other changes.
export const CDN_BUCKETS = new Set(['product-images']);

const CDN_PREFIX = '/cdn-storage/';
const CACHE_TTL_SECONDS = 31536000; // 1 year — images are immutable (timestamped names)
const IMAGE_TYPES = /\.(webp|png|jpe?g|gif|svg|avif|mp4|mov)$/i;

/**
 * True if the request should be handled by this proxy.
 */
export function isCdnRequest(pathname) {
  return pathname.startsWith(CDN_PREFIX);
}

/**
 * Map /cdn-storage/<bucket>/<path> -> Supabase public object URL.
 * Returns null for malformed paths or buckets we don't serve.
 */
export function toSupabaseUrl(pathname) {
  const rest = pathname.slice(CDN_PREFIX.length);
  if (!rest) return null;
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (!bucket || !path || !CDN_BUCKETS.has(bucket)) return null;
  // Prevent path traversal (e.g. ../ escaping the bucket root).
  if (/(^|\/)\.\.(\/|$)/.test(path)) return null;
  return `${SUPABASE_STORAGE_ORIGIN}/storage/v1/object/public/${bucket}/${path}`;
}

/**
 * Serve a cached/origin image response.
 */
export async function handleCdnRequest(request) {
  const url = new URL(request.url);
  const supabaseUrl = toSupabaseUrl(url.pathname);
  if (!supabaseUrl) {
    return new Response('Not found', { status: 404 });
  }

  // Cloudflare Cache key includes the full ascofizz.github.io URL; ?w= and similar
  // transforms land in different cache entries, which is fine (and useful).
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  // Miss — fetch from Supabase once, cache forever.
  const origin = await fetch(supabaseUrl, {
    cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
  });

  if (!origin.ok) {
    // Propagate 404s (and other errors) but with a short cache so a deleted
    // image stops hitting Supabase quickly without being cached forever.
    return new Response('Not found', {
      status: origin.status === 404 ? 404 : 502,
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }

  const headers = new Headers({
    'Content-Type': origin.headers.get('Content-Type') || 'application/octet-stream',
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, immutable`,
    'Access-Control-Allow-Origin': '*',
  });
  const len = origin.headers.get('Content-Length');
  if (len) headers.set('Content-Length', len);
  if (origin.headers.get('Accept-Ranges')) headers.set('Accept-Ranges', 'bytes');

  response = new Response(origin.body, { status: 200, headers });

  // Only cache image/video types; skip HTML errors or redirect bodies.
  const ct = headers.get('Content-Type') || '';
  if (IMAGE_TYPES.test(url.pathname) || ct.startsWith('image/') || ct.startsWith('video/')) {
    response = response.clone(); // clone so we can store one copy and return another
    const storeTask = cache.put(cacheKey, response.clone());
    storeTask.catch(() => {}); // never let a cache failure break the response
  }

  return response;
}
