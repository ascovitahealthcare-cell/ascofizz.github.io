/**
 * PROMO_MEDIA.js — Ascovita Healthcare
 * ─────────────────────────────────────────────────────────────────
 * Upload your promo images to https://ascovita.imgbb.com/
 * Then paste the direct image links into the `src` fields below.
 *
 * ⚠️ PERFORMANCE — READ BEFORE UPLOADING (important, unlike your
 * product images) ⚠️
 * Your product photos are hosted on Wix, which auto-generates
 * compressed AVIF versions on the fly (that's what "enc_avif,quality_auto"
 * in those URLs does). imgbb does NOT do this — whatever file you
 * upload here is served byte-for-byte as-is, full resolution, to
 * every mobile visitor. These 19 cards are one of the heaviest asset
 * groups on the site if uploaded as raw phone-camera JPG/PNG.
 *
 * BEFORE uploading each image to imgbb:
 *   1. Resize it to roughly the display size — these cards render at
 *      185px wide (desktop) / ~50vw (mobile), max ~260px tall. A
 *      1200px+ source image is pure waste at this size.
 *   2. Run it through a WebP converter at ~80% quality:
 *        - Squoosh.app (drag & drop, no install), or
 *        - `cwebp -q 80 input.jpg -o output.webp` locally
 *   3. Upload the resulting .webp file to imgbb — it hosts and
 *      direct-links .webp exactly like .jpg/.png.
 *   4. Paste that link into `src` below.
 *
 * The on-page card container already has a fixed height via CSS
 * (.pm-card-media), so image weight — not layout shift — is the
 * only thing to worry about here.
 *
 * HOW TO UPDATE:
 *   1. Go to https://ascovita.imgbb.com/ and upload your (pre-compressed,
 *      WebP) image.
 *   2. Copy the "Direct link" (ends in .jpg / .png / .webp).
 *   3. Paste it into the `src` field of the card you want to update.
 *   4. Commit & push this file to GitHub — changes go live instantly.
 *
 * FIELDS PER CARD:
 *   src      — Direct image URL from imgbb  (required for image)
 *   type     — "image" | "video"            (default: "image")
 *   poster   — Thumbnail URL for videos     (optional)
 *   ctaPage  — Page to open on click        (default: "shop")
 *              Options: "shop", "home", "about", "contact"
 * ─────────────────────────────────────────────────────────────────
 */

var PROMO_MEDIA = [

  {
    src:     'https://i.ibb.co/k2GdH7L2/Whats-App-Image-2026-06-09-at-3-50-09-PM-1.jpg',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/BVBz7zTN/Whats-App-Image-2026-06-09-at-3-50-09-PM.jpg',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/GfbN8yhB/Whats-App-Image-2026-06-09-at-3-50-10-PM.jpg',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/0p953MkV/Whats-App-Image-2026-06-09-at-3-50-09-PM-4.jpg',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/b5v1Pk48/Whats-App-Image-2026-06-09-at-3-50-09-PM-3.jpg',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/Q3pqYnp8/Whats-App-Image-2026-06-09-at-3-50-09-PM-2.jpg',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/Z1WZTgDK/ascovita-post-3.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/b0nGcrx/ascovita-post-4.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/0yQXZVQ5/ascovita-post-5.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/Ngkczkb0/ascovita-b2b-insta-3.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/XZs7pPxy/ascovita-b2b-insta-1.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/cc9y9XfC/ascovita-b2b-insta-2.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/mVxKFNQG/post4-family.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/sv2kTr3f/post5-gym.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/bjCJ21t2/post6-nutrition.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/x8R0ryxd/post7-service.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/W4WSG7Pp/post9-standards.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/cSyLT5NM/multidiata-poster.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/KpwzhdMk/glutathione-poster.png',
    type:    'image',
    ctaPage: 'shop'
  },

  {
    src:     'https://i.ibb.co/MxxNxXV3/magnesium-poster.png',
    type:    'image',
    ctaPage: 'shop'
  }

];
