// media-routes.js
// ─────────────────────────────────────────────────────────────────────────
// Drop-in Express router for the Ascofizz admin.
// Handles:
//   POST   /api/upload/image                 → upload a file to Supabase Storage
//   GET    /api/upload/library                → list every uploaded image
//   DELETE /api/upload/image/:filename        → delete a file AND clear every
//   DELETE /api/upload/library/:filename       reference to it (products, site
//                                               images, promo carousel) in one go
//
// Requires (already used elsewhere in your server, reuse the same instances
// if you have them):
//   npm i @supabase/supabase-js multer
//
// Env vars expected (same ones your existing /api/upload/image already uses):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (service role — needed to bypass storage RLS)
//   SUPABASE_STORAGE_BUCKET     (defaults to "product-images")
//
// HOW TO WIRE THIS IN:
//   const mediaRoutes = require('./media-routes')(supabase, requireAuth);
//   app.use('/api', mediaRoutes);
//
// `supabase` = your existing @supabase/supabase-js client (service role).
// `requireAuth` = your existing auth middleware that validates the
//                 Authorization: Bearer <token> header used everywhere
//                 else in your admin API. Pass whatever function you
//                 already use to protect /api/admin/* routes.
// ─────────────────────────────────────────────────────────────────────────

const express = require('express');
const https = require('https');
const multer = require('multer');

// IMPORTANT — image-optimise.js is NOT required at the top of this file.
// It pulls in `sharp`, a native binary module, and on Render the bundled
// sharp binary does not always match the container's Node/glibc — a load
// failure there used to kill the ENTIRE media-routes mount at boot
// (which is what made every /api/upload/* route 404). Loading it lazily
// inside the upload handler keeps the library routes alive even if the
// optimiser cannot load, and lets the handler degrade gracefully.
function loadOptimiser() {
  try { return require('./image-optimise').optimiseMedia; } catch (e) {
    console.error('[media] image-optimise unavailable:', e.message);
    return null;
  }
}

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — Supabase free/pro plan global ceiling; bucket limits cannot exceed it.
// images compress to under ~1MB anyway, so the practical image cap is
// enforced in the admin UI, not here.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// ── Bucket self-heal ────────────────────────────────────────────────
// The product-images bucket was created with an IMAGE-ONLY allow-list
// (jpeg/png/webp/gif/svg) and a 10 MB file cap. Supabase Storage REJECTS
// anything outside the allow-list with "mime type … is not supported" —
// which is exactly the 500 the admin saw when uploading videos that
// showed "success" on the client side but never reached storage. The cap
// also capped every upload at 10 MB, silently failing larger files.
//
// repairBucket() PATCHes the bucket config via the Supabase Management
// API using the service role key, so videos (and larger files) upload
// normally from then on. It is idempotent and runs once at boot;
// repeating it on every boot costs one tiny authenticated HTTP call.
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg',
];

let _lastBucketRepair = null;

function repairBucket() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  if (!key) { console.warn('[media] SUPABASE_SERVICE_KEY missing — bucket config not repaired'); return; }
  // Ref e.g. https://<project-ref>.supabase.co — pull it out of the URL.
  const refMatch = String(url).match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/);
  const ref = refMatch ? refMatch[1] : null;
  if (!ref) { console.warn('[media] cannot derive project ref from SUPABASE_URL — bucket config not repaired'); return; }
  // Bucket config (allowedMimeTypes / fileSizeLimit) lives in the Management
  // API, not the per-project storage URL.
  // Use https.request, not native fetch — fetch only exists in Node 18+ and
  // the Render project may be pinned to Node 16, where an uncaught
  // ReferenceError would crash the boot (which is what killed /api routes).
  const bodyBuf = Buffer.from(JSON.stringify({
    allowed_mime_types: ALLOWED_MIME_TYPES,
    file_size_limit: MAX_FILE_SIZE, // 100 MB
  }));
  // Fallback target: global Management API (needs a Management-scoped
  // token; used only if the local endpoint rejects the key).
  const mgmtOpts = {
    hostname: 'api.supabase.com',
    path: '/v1/projects/' + ref + '/storage/buckets/' + BUCKET,
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Content-Length': bodyBuf.length,
    },
  };
  // Primary target: the project-local Storage Admin API
  // https://{ref}.supabase.co/storage/v1/bucket/{name} — this endpoint
  // accepts the service_role JWT (Bearer) which is what we hold. The
  // global Management API (api.supabase.com) rejected the same key with
  // "JWT failed verification" (it expects a Management-API-scoped token),
  // so it is used only as a fallback if the local endpoint fails.
  const localOpts = {
    hostname: ref + '.supabase.co',
    path: '/storage/v1/bucket/' + BUCKET,
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Content-Length': bodyBuf.length,
    },
  };
  // Try the local endpoint first; on 401 fall back to the global
  // Management API (its token requirements differ — a service_role JWT
  // that the local Admin API accepts may need a Management-scoped token
  // on api.supabase.com, which is why local goes first).
  const tryRepair = (opts, via) => new Promise((resolve) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(Buffer.concat(chunks).toString()); } catch (e) {}
        if (res.statusCode === 200) {
          _lastBucketRepair = { status: 200, body: parsed, at: new Date().toISOString(), via: via };
          console.log('[media] bucket "' + BUCKET + '" repaired: videos + 100 MB cap enabled (via ' + via + ')');
          resolve(res.statusCode);
        } else if (res.statusCode === 401) {
          _lastBucketRepair = { status: res.statusCode, body: parsed, at: new Date().toISOString(), via: via };
          console.warn('[media] bucket repair ' + via + ' rejected (401) —', JSON.stringify(parsed || {}).slice(0, 200));
          resolve(res.statusCode || 0);
        } else {
          // Always record the outcome (any status) so the admin can see the
          // exact failure reason via /api/health/bucket.
          _lastBucketRepair = { status: res.statusCode, body: parsed, at: new Date().toISOString(), via: via };
          console.warn('[media] bucket repair status via ' + via + ':', res.statusCode, JSON.stringify(parsed || {}).slice(0, 400));
          resolve(res.statusCode);
        }
      });
    });
    req.on('error', (e) => { _lastBucketRepair = { error: e.message, via: via, at: new Date().toISOString() }; console.warn('[media] bucket repair request failed via ' + via + ':', e.message); resolve(0); });
    req.write(bodyBuf);
    req.end();
  });
  // Fall back to the global Management API only when the local Storage
  // Admin endpoint explicitly rejected the key (401). Network errors or
  // other statuses must NOT trigger the fallback — it uses the same key
  // and would just overwrite the diagnostic record with a second failure.
  tryRepair(localOpts, 'storage-admin').then((localStatus) => {
    if (localStatus === 401) tryRepair(mgmtOpts, 'management-api');
  });
}



// Run the self-heal once when the module is loaded (i.e. at boot, before any
// upload request can arrive). Wrapped in setImmediate so a slow patch can
// never hold up the Express listen sequence.
setImmediate(repairBucket);

module.exports = function buildMediaRoutes(supabase, requireAuth) {
  const router = express.Router();
  // GET /api/health/bucket — diagnostic: last bucket-repair attempt + live
  // config. NOTE: this used to be declared at module top level (before
  // `const router` was introduced inside the factory), which threw
  // `router is not defined` at boot and silently unmounted every
  // /api/upload route — the exact cause of the "upload succeeds but 404"
  // outage. Kept inside the factory now so the factory's `router`,
  // `supabase` and `BUCKET` are all in scope.
  router.get('/health/bucket', async (req, res) => {
    try {
      // NOTE: the old implementation queried the `storage.buckets` PostgREST
      // view, which is prone to "Could not find the table in the schema
      // cache" errors after migrations/schema changes. The JS SDK's
      // getBucket talks to the Storage Admin API directly (same channel
      // the repair uses), so it is always consistent with reality.
      const { data, error } = await supabase.storage.getBucket(BUCKET);
      res.json({
        lastRepair: _lastBucketRepair,
        bucket: data ? { name: data.name, public: data.public, fileSizeLimit: data.file_size_limit, allowedMimeTypes: data.allowed_mime_types } : null,
        error: error ? error.message : null,
      });
    } catch (e) { res.json({ lastRepair: _lastBucketRepair, error: e.message }); }
  });

  // Fall back to a no-op middleware if none was passed, but warn loudly —
  // these routes must never be left unauthenticated in production.
  const auth = requireAuth || function (req, res, next) {
    console.warn('⚠️  media-routes: no requireAuth middleware supplied — routes are UNPROTECTED');
    next();
  };

  function publicUrlFor(filename) {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return data.publicUrl;
  }

  // ── POST /api/upload/image ────────────────────────────────────────────
  router.post('/upload/image', auth, upload.single('image'), async (req, res) => {
    const optimiseMedia = loadOptimiser() || (async (buf) => ({ buffer: buf, bytes: buf.length, ext: 'bin', note: 'optimiser unavailable — stored as-is' }));
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field name "image")' });

      // Shrink before storing. Uploads used to land untouched, which is how the
      // bucket ended up averaging 1.5 MB per product image. Images are
      // re-encoded as optimised WebP; videos are re-encoded to H.264/MP4
      // (web-sized, faststart) so Storage never fills with raw phone footage.
      const opt = await optimiseMedia(req.file.buffer, req.file.mimetype, req.file.originalname);
      console.log(`upload/image: ${req.file.originalname} — ${opt.note}`);

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${opt.ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(filename, opt.buffer, {
          contentType: opt.contentType,
          upsert: false,
        });

      if (uploadErr) {
        const msg = (uploadErr.message || '').toLowerCase();
        if (msg.includes('bucket not found')) {
          return res.status(500).json({ error: 'Storage bucket not found. Create a public bucket named "' + BUCKET + '" in Supabase → Storage.' });
        }
        return res.status(500).json({ error: uploadErr.message });
      }

      const url = publicUrlFor(filename);
      res.json({ success: true, url, filename, public_url: url });
    } catch (e) {
      console.error('upload/image error:', e);
      res.status(500).json({ error: e.message || 'Upload failed' });
    }
  });

  // ── GET /api/upload/library ───────────────────────────────────────────
  // ── GET /api/upload/fix-bucket ── one-shot manual trigger (same fix the boot does)
  router.get('/upload/fix-bucket', auth, async (req, res) => {
    repairBucket();
    // Give the async patch ~1s to fire, so a retry immediately after shows real status.
    setTimeout(() => {}, 50);
    res.json({ success: true, note: 'Bucket config patch dispatched; check /api/health/bucket in a few seconds.', allowed_mime_types: ALLOWED_MIME_TYPES, file_size_limit: MAX_FILE_SIZE });
  });

  router.get('/upload/library', auth, async (req, res) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).list('', {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) return res.status(500).json({ error: error.message });

      const files = (data || [])
        .filter(f => f.name && !f.name.endsWith('/')) // skip folder placeholders
        .map(f => ({
          filename: f.name,
          url: publicUrlFor(f.name),
          original_name: f.name,
          size: f.metadata?.size,
          created_at: f.created_at,
        }));

      res.json({ success: true, data: files });
    } catch (e) {
      console.error('upload/library error:', e);
      res.status(500).json({ error: e.message || 'Could not list images' });
    }
  });

  // ── DELETE /api/upload/image/:filename  (+ alias /api/upload/library/:filename)
  // Deletes the file from Storage, then clears every reference to its public
  // URL across products, site images, and the promo carousel — so nothing
  // in the admin ever points at a dead/deleted image again.
  async function cascadeDelete(req, res) {
    const filename = decodeURIComponent(req.params.filename);
    const url = publicUrlFor(filename);
    let clearedReferences = 0;

    // 1) Remove the physical file. Ignore "not found" — the caller may be
    //    cleaning up a reference to a file that's already gone, or to an
    //    external URL (e.g. an old pasted link) that was never in our bucket.
    try {
      await supabase.storage.from(BUCKET).remove([filename]);
    } catch (e) {
      console.warn('storage remove warning (continuing to clear references):', e.message);
    }
    // 3) Purge the Supabase CDN edge cache for this object. Without this,
    //    a deleted file can keep serving from edge nodes for minutes/hours,
    //    which is exactly the "deleted media still shows on the storefront"
    //    behaviour reported. The Storage CDN purge endpoint accepts the
    //    service role key and fails open (non-fatal) if unavailable.
    try {
      const purgeBody = Buffer.from(JSON.stringify({ paths: [filename] }));
      await new Promise((resolve) => {
        const preq = https.request({
          hostname: ref + '.supabase.co',
          path: '/storage/v1/cdn/' + BUCKET + '/*',
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + String(process.env.SUPABASE_SERVICE_KEY || ''),
            'Content-Type': 'application/json',
            'Content-Length': purgeBody.length,
          },
        }, (pres) => { pres.on('data', () => {}); pres.on('end', () => resolve()); });
        preq.on('error', () => resolve());
        preq.write(purgeBody);
        preq.end();
      });
    } catch (e) {
      console.warn('cdn purge skipped (non-fatal):', e.message);
    }

    // 2) Clear every product field that points at this exact URL.
    // seo_og_image / seo_twitter_image were in this list but do not exist on the
    // products table, so every delete fired two failing updates and logged them.
    // The `images` and `media` columns can also hold URLs; they are left to the
    // orphan sweep below, which scans whole rows instead of named columns.
    const productImageColumns = ['image', 'image2', 'image3', 'image4', 'image5'];
    for (const col of productImageColumns) {
      const { data, error } = await supabase
        .from('products')
        .update({ [col]: null })
        .eq(col, url)
        .select('id');
      if (error) console.error(`cascade clear products.${col} error:`, error.message);
      else clearedReferences += (data || []).length;
    }

    // 3) Clear a matching Site Images override, if any.
    {
      const { data, error } = await supabase
        .from('site_media')
        .delete()
        .eq('url', url)
        .select('key');
      if (error) console.error('cascade clear site_media error:', error.message);
      else clearedReferences += (data || []).length;
    }

    // 4) Clear a matching Promo Carousel card, if any.
    {
      const { data, error } = await supabase
        .from('promo_media')
        .delete()
        .eq('src', url)
        .select('id');
      if (error) console.error('cascade clear promo_media error:', error.message);
      else clearedReferences += (data || []).length;
    }

    res.json({ success: true, filename, clearedReferences });
  }

  router.delete('/upload/image/:filename', auth, cascadeDelete);
  router.delete('/upload/library/:filename', auth, cascadeDelete); // back-compat alias

  // ── Orphan sweep ──────────────────────────────────────────────────────
  // Deleting from the Image Library removes the file from Storage, but
  // REPLACING a product's image does not: the old file is simply no longer
  // pointed at, and sits in the bucket forever. That is how the bucket filled
  // up with images nothing on the site was using.
  //
  // Rather than deleting the previous file whenever an image changes — which
  // silently breaks the case where two products share one image — this finds
  // files that nothing anywhere refers to, and removes only those.

  // Files newer than this are never touched: an image can be uploaded to the
  // library minutes before anyone attaches it to a product, and deleting it in
  // that window would pull it out from under whoever is mid-edit.
  const ORPHAN_MIN_AGE_HOURS = 24;

  // Scan whole rows rather than a hand-listed set of columns. Image URLs turn
  // up in plain columns, in the CSV-ish `images` column, and inside the `media`
  // JSON blob — and a column list silently misses whatever gets added later.
  async function collectReferencedFilenames() {
    const refs = new Set();
    const pattern = new RegExp('/' + BUCKET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([^"\'\\s?,)\\]}]+)', 'g');

    const harvest = rows => {
      for (const row of rows || []) {
        const blob = JSON.stringify(row);
        let m;
        pattern.lastIndex = 0;
        while ((m = pattern.exec(blob))) {
          try { refs.add(decodeURIComponent(m[1])); } catch { refs.add(m[1]); }
        }
      }
    };

    // Deleted products count as references too — a soft-deleted product can be
    // restored, and it should not come back with a missing image.
    for (const table of ['products', 'site_media', 'promo_media']) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw new Error(`could not read ${table}: ${error.message}`);
      harvest(data);
    }
    return refs;
  }

  async function findOrphans() {
    const referenced = await collectReferencedFilenames();
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
    if (error) throw new Error(error.message);

    const cutoff = Date.now() - ORPHAN_MIN_AGE_HOURS * 3600 * 1000;
    const orphans = [];
    let keptRecent = 0;

    for (const f of data || []) {
      if (!f.name || f.name.endsWith('/')) continue;
      if (referenced.has(f.name)) continue;
      if (f.created_at && new Date(f.created_at).getTime() > cutoff) { keptRecent++; continue; }
      orphans.push({ filename: f.name, size: Number(f.metadata?.size || 0), created_at: f.created_at });
    }
    return { orphans, referencedCount: referenced.size, keptRecent, totalFiles: (data || []).length };
  }

  // GET /api/upload/orphans — report only, never deletes.
  router.get('/upload/orphans', auth, async (req, res) => {
    try {
      const r = await findOrphans();
      res.json({
        success: true,
        ...r,
        reclaimable_bytes: r.orphans.reduce((n, o) => n + o.size, 0),
        note: `Files younger than ${ORPHAN_MIN_AGE_HOURS}h are never listed.`,
      });
    } catch (e) {
      console.error('upload/orphans error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/upload/orphans?confirm=yes — deletes what the GET reports.
  // The confirm flag is required so a stray call can never empty the bucket.
  router.delete('/upload/orphans', auth, async (req, res) => {
    try {
      if (req.query.confirm !== 'yes') {
        const r = await findOrphans();
        return res.status(400).json({
          error: 'Add ?confirm=yes to actually delete.',
          would_delete: r.orphans.length,
          reclaimable_bytes: r.orphans.reduce((n, o) => n + o.size, 0),
        });
      }
      const { orphans } = await findOrphans();
      if (!orphans.length) return res.json({ success: true, deleted: 0, freed_bytes: 0 });

      const names = orphans.map(o => o.filename);
      const { error } = await supabase.storage.from(BUCKET).remove(names);
      if (error) return res.status(500).json({ error: error.message });

      const freed = orphans.reduce((n, o) => n + o.size, 0);
      console.log(`upload/orphans: deleted ${names.length} unreferenced files, freed ${Math.round(freed / 1024)} kB`);
      res.json({ success: true, deleted: names.length, freed_bytes: freed, files: names });
    } catch (e) {
      console.error('upload/orphans delete error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
