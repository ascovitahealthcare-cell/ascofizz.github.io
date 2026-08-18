#!/usr/bin/env node
// Test harness for the 200 kB hard cap — run locally before committing
// changes to image-optimise.js:
//   node scripts/test-image-cap.js
// Generates synthetic images that are worst cases for compression
// (photos, already-WebP files, huge PNGs) and asserts every output is
// image/webp and <= MAX_FILE_BYTES. Exits non-zero on any failure.

const { optimiseImage, MAX_FILE_BYTES } = require('../image-optimise');
const sharp = require('sharp');

function buf(n, kind) {
  // n x n image: noisy RGB pixel data (worst case for WebP) or smooth
  // gradients (best case) — both must fit the cap.
  const pixels = [];
  for (let i = 0; i < n * n; i++) {
    if (kind === 'noise') {
      pixels.push(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256));
    } else {
      const v = (i * 7) % 256;
      pixels.push(v, Math.floor(v * 0.8), Math.floor(v * 1.2) % 256);
    }
  }
  return Buffer.from(pixels);
}

async function jpegBuffer(n) {
  return sharp(buf(n, 'noise'), { raw: { width: n, height: n, channels: 3 } })
    .jpeg({ quality: 95 }).toBuffer();
}
async function webpBuffer(n) {
  return sharp(buf(n, 'noise'), { raw: { width: n, height: n, channels: 3 } })
    .webp({ quality: 90 }).toBuffer();
}
async function pngBuffer(n) {
  return sharp(buf(n, 'gradient'), { raw: { width: n, height: n, channels: 3 } })
    .png().toBuffer();
}
async function tinyBuffer() {
  return sharp(buf(64, 'noise'), { raw: { width: 64, height: 64, channels: 3 } })
    .webp({ quality: 90 }).toBuffer();
}

async function check(label, buffer, mimetype, name) {
  const res = await optimiseImage(buffer, mimetype, name);
  const kb = Math.round(res.buffer.length / 1024);
  const fits = res.buffer.length <= MAX_FILE_BYTES;
  const isWebp = res.contentType === 'image/webp' || res.ext === '.webp' || res.note.includes('unchanged');
  console.log(`${fits ? 'PASS' : 'FAIL'}  ${label}: ${Math.round(buffer.length / 1024)} kB -> ${kb} kB | ${res.ext} | ${res.note.slice(0, 70)}`);
  if (!fits) process.exitCode = 1;
  if (mimetype !== 'image/svg+xml' && mimetype !== 'image/gif' && !isWebp) { process.exitCode = 1; console.log('      content-type mismatch!'); }
}

(async () => {
  console.log(`200 kB cap test — MAX_FILE_BYTES=${MAX_FILE_BYTES}`);
  await check('huge noisy JPEG (4000px)', await jpegBuffer(4000), 'image/jpeg', 'photo.jpg');
  await check('large noisy JPEG (2500px)', await jpegBuffer(2500), 'image/jpeg', 'photo.jpg');
  await check('large already-WebP (3000px, 90q)', await webpBuffer(3000), 'image/webp', 'photo.webp');
  await check('large PNG (2500px)', await pngBuffer(2500), 'image/png', 'photo.png');
  await check('tiny icon already < cap', await tinyBuffer(), 'image/webp', 'icon.webp');
  await check('SVG pass-through', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>'), 'image/svg+xml', 'logo.svg');
  await check('GIF pass-through', Buffer.from('GIF89a' + '\0'.repeat(100)), 'image/gif', 'anim.gif');
  if (process.exitCode) { console.error('\nFAILED — do not deploy'); process.exit(1); }
  console.log('\nAll tests passed.');
})();
