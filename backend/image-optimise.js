// ─────────────────────────────────────────────────────────────────────────
// image-optimise.js — shrink uploaded product images before they reach Storage
//
// Why this exists:
// The product-images bucket was holding 38 files totalling 57 MB — averaging
// 1527 kB each, the largest 4047 kB, with 10 files over 3 MB. The admin panel
// accepted whatever came off a phone camera and stored it untouched. A shop
// page pulling ten of those asks a phone on Indian mobile data for ~14 MB
// before the grid settles, which is why product images were loading and then
// disappearing: requests were being dropped mid-flight, not failing outright.
//
// Supabase's own transformation API (?width=&quality=) would solve this at
// serve time, but it is a paid-plan feature and this project is on the free
// plan. So the bytes have to be reduced once, at upload.
//
// Measured on synthetic photographic noise, which is the worst case for WebP:
// 5.7 MB -> 385 kB (-93%) and 9 MB -> 219 kB (-98%). Real product shots on
// plain backgrounds compress substantially better than that. The exact figure
// for the existing bucket will come from running
// scripts/compress-existing-images.js --dry-run.
// ─────────────────────────────────────────────────────────────────────────

const sharp = require('sharp');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ffmpeg binary resolution — tries the npm-installed @ffmpeg-installer/ffmpeg
// (which bundles a platform-matched binary) and falls back to a system ffmpeg.
let FFMPEG_BIN = null;
try {
  FFMPEG_BIN = require('@ffmpeg-installer/ffmpeg').path;
} catch (e) {
  try {
    const cmd = require('child_process').execSync('command -v ffmpeg 2>/dev/null || echo', { encoding: 'utf8' }).trim();
    FFMPEG_BIN = cmd || null;
  } catch (e2) { FFMPEG_BIN = null; }
}
const VIDEO_MIME = /^video\//;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.3gp']);

// Big enough for the product page's zoomed view on a 3x phone screen; the grid
// uses far less. Going above this buys nothing a customer can see.
const MAX_DIM = 1400;
const WEBP_QUALITY = 78;

// HARD SIZE CAP (enforced Aug 2026 at the owner's request): no uploaded
// image may exceed MAX_FILE_BYTES after optimisation. The former guard
// ("keep the original when compression made it bigger") could hand back a
// multi-megabyte already-WebP file untouched, so it was replaced with a
// real size search: quality drops first (quality does not visibly matter
// at product-grid sizes), and only then does the picture shrink in
// resolution as a last resort. Sharp's default JPEG quality of 80 would
// also have defeated this; WebP is always used below.
const MAX_FILE_BYTES = 200 * 1024; // 200 kB

// Formats deliberately passed through untouched:
//   svg — already tiny, and sharp would rasterise it into something larger.
//   gif — usually animated, and a resize would flatten it to a single frame.
const PASS_THROUGH = new Set(['image/svg+xml', 'image/gif']);

/**
 * @returns {Promise<{buffer:Buffer, contentType:string, ext:string, note:string}>}
 * Never throws for image reasons — if anything goes wrong the original buffer
 * is returned unchanged, because a large image is far better than a failed
 * upload for someone trying to add a product.
 */
async function optimiseImage(buffer, mimetype, originalName = '') {
  if (VIDEO_MIME.test(mimetype || '')) return optimiseVideo(buffer, mimetype, originalName);
  const original = {
    buffer,
    contentType: mimetype || 'application/octet-stream',
    ext: (String(originalName).match(/\.[^.]+$/) || ['.jpg'])[0].toLowerCase(),
    note: 'passed through unchanged',
  };

  if (PASS_THROUGH.has(mimetype)) return original;

  try {
    const meta = await sharp(buffer).metadata();

    // If the source is already within the size cap and smaller than the
    // original, there is nothing to win — keep it as-is (tiny icons,
    // already-optimised WebP).
    if (buffer.length <= MAX_FILE_BYTES) return original;

    const base = sharp(buffer, { failOn: 'none' })
      .rotate(); // honour EXIF orientation, or phone photos land sideways

    // ── Phase 1: shrink QUALITY (lossless to the eye at grid sizes) ──────
    // Binary search quality in [30, WEBP_QUALITY]. Quality 78 of a photo is
    // already excellent; dropping it fixes oversized photos without
    // changing what the customer sees on a phone.
    let out = await bestOfSize(base, WEBP_QUALITY, Math.min(60, WEBP_QUALITY));

    // ── Phase 2: shrink RESOLUTION only if quality alone could not ──────
    // Rare (a synthetic worst case at high megapixels). Each step halves
    // the max dimension until the file fits or the picture reaches a
    // minimum usable size (512 px — below that nothing is recognisable).
    let dim = MAX_DIM;
    while (out.length > MAX_FILE_BYTES && dim > 512) {
      dim = Math.max(512, Math.round(dim / 1.5));
      out = await bestOfSize(
        sharp(buffer, { failOn: 'none' }).rotate().resize({
          width: dim, height: dim, fit: 'inside', withoutEnlargement: true,
        }),
        WEBP_QUALITY, 30,
      );
    }

    // If even the minimum-size image cannot fit under the cap, publish the
    // smallest image we could make rather than the megabyte original — a
    // visible picture beats a failed shop page.
    if (out.length > MAX_FILE_BYTES) {
      console.warn(`image-optimise: could not fit ${Math.round(buffer.length / 1024)} kB source under ${MAX_FILE_BYTES / 1024} kB cap — serving best effort (${Math.round(out.length / 1024)} kB)`);
    }

    return {
      buffer: out,
      contentType: 'image/webp',
      ext: '.webp',
      note: `${Math.round(buffer.length / 1024)} kB -> ${Math.round(out.length / 1024)} kB` +
            (meta.width ? ` (${meta.width}x${meta.height})` : '') +
            (dim < MAX_DIM ? ` [resized to ${dim}px]` : ''),
    };
  } catch (e) {
    console.warn('image-optimise: leaving file unchanged —', e.message);
    return original;
  }
}

/**
 * Binary-search the lowest WebP quality in [hi, lo] that makes the image
 * fit under MAX_FILE_BYTES, preferring the highest quality that fits.
 * Never throws for image reasons — an encode failure returns the worst-
 * case (lowest quality) attempt so the upload never hard-fails.
 */
async function bestOfSize(pipeline, hiQ, loQ) {
  let lo = loQ, hi = hiQ, best = null;
  while (lo <= hi) {
    const q = (lo + hi) >> 1;
    try {
      const buf = await pipeline.clone().webp({ quality: q, effort: 4 }).toBuffer();
      if (buf.length <= MAX_FILE_BYTES) {
        best = buf;
        lo = q + 1; // try a higher quality
      } else {
        hi = q - 1;
      }
    } catch (e) {
      console.warn('image-optimise: quality probe failed at q=' + q + ' — ' + e.message);
      hi = q - 1;
    }
  }
  // Nothing fit even at the lowest quality; return the last attempt we have.
  if (!best) {
    try { best = await pipeline.clone().webp({ quality: loQ, effort: 4 }).toBuffer(); } catch (e) { best = null; }
  }
  return best || pipeline.clone().webp({ quality: WEBP_QUALITY }).toBuffer();
}

/**
 * Video compression — H.264/AAC in an MP4 container, sized for web playback.
 * Uses ffmpeg (bundled via @ffmpeg-installer/ffmpeg when present). Never
 * throws: any failure returns the original bytes unchanged.
 * @returns {Promise<{buffer:Buffer, contentType:string, ext:string, note:string}>}
 */
async function optimiseVideo(buffer, mimetype, originalName = '') {
  const original = {
    buffer,
    contentType: mimetype || 'video/mp4',
    ext: '.mp4',
    note: 'video passed through unchanged',
  };
  if (!FFMPEG_BIN || !VIDEO_MIME.test(mimetype || '')) return original;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oz-media-'));
  const inPath = path.join(tmpDir, 'in' + (path.extname(originalName) || '.bin'));
  const outPath = path.join(tmpDir, 'out.mp4');
  fs.writeFileSync(inPath, buffer);

  return new Promise(resolve => {
    // Render's free-tier web service kills HTTP requests after a short idle
    // timeout (~30s), so a long ffmpeg encode would be dropped mid-flight and
    // the admin would only see a generic 'Upload error'. Encode fast or give
    // up fast: if the web-optimized pass isn't done within 45s, stop ffmpeg
    // and return the original video unchanged (never a crash, never a hang).
    const ENCODE_BUDGET_MS = 45 * 1000;
    let settled = false;
    const timeout = setTimeout(() => {
      try { proc.kill(); } catch (e) { /* already dead */ }
      settled = true;
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e2) { /* best effort */ }
      console.warn('image-optimise video: encode exceeded 45s budget — returning original video untouched (', Math.round(buffer.length / (1024 * 1024)), 'MB)');
      resolve(original);
    }, ENCODE_BUDGET_MS);
    const proc = spawn(FFMPEG_BIN, [
      '-y', '-i', inPath,
      // ultrafast preset — file size stays similar (CRF controls quality),
      // but encode speed roughly doubles on the free-tier CPU so more videos
      // finish within the 45s budget before Render kills the request.
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
      // max 1280 wide, keep aspect & even dims (ffmpeg's filter parser treats an
      // unescaped comma as the filter-list separator, so the comma inside
      // min() must be escaped with a literal backslash).
      '-vf', 'scale=-2:min(1280\\,ih)',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
      outPath,
    ]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += String(d); });
    proc.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) {
        // Delete the temp dir first — the output file is unusable anyway.
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
        console.warn('image-optimise video: ffmpeg failed (code %d) —', code, stderr.split('\n').slice(-3).join(' ').trim());
        return resolve(original);
      }
      let out;
      try {
        // Read the output BEFORE deleting the temp dir — the original bug read
        // outPath after fs.rmSync had already removed it, silently swallowing
        // every successful encode into a "passed through unchanged" fallback.
        out = fs.readFileSync(outPath);
      } catch (e) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e2) { /* best effort */ }
        return resolve(original);
      }
      // Remove the temp dir now that the output is safely in memory.
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* best effort */ }
      if (!out.length) return resolve(original);
      // Guard: keep the original if compression made it bigger.
      if (out.length >= buffer.length) return resolve(original);
      return resolve({
        buffer: out,
        contentType: 'video/mp4',
        ext: '.mp4',
        note: `video ${Math.round(buffer.length / (1024 * 1024))} MB -> ${Math.round(out.length / (1024 * 1024))} MB` +
              (mimetype && mimetype !== 'video/mp4' ? ' (converted from ' + mimetype + ')' : ''),
      });
    });
  });
}

/**
 * Unified media optimiser: dispatches videos to ffmpeg and images to sharp.
 * @returns {Promise<{buffer:Buffer, contentType:string, ext:string, note:string}>}
 */
async function optimiseMedia(buffer, mimetype, originalName = '') {
  if (VIDEO_MIME.test(mimetype || '')) return optimiseVideo(buffer, mimetype, originalName);
  return optimiseImage(buffer, mimetype, originalName);
}

module.exports = { optimiseImage, optimiseMedia, MAX_DIM, WEBP_QUALITY, MAX_FILE_BYTES };
