// ============================================================
// OZYLIX — PRODUCT IMAGES
// ============================================================

const PRODUCT_IMAGES = {

  // —— id: 1 — L-Glutathione Effervescent – Orange Flavour ——
  // (older flavour-based SKU — distinct from the new id 38 "Glutathione
  // Effervescent Tablet"; the processed-*.webp shoot was for the new line, see below)
  1: { images: [
    "",
  ]},

  // —— id: 8 — Multidiata – Ozylix Premium Multivitamin ——
  // (general/unisex flagship — men's & women's versions are separate ids 32/33)
  8: { images: [
    "",
  ]},

  // —— id: 10 — VitaPlus B12 + D3 Vegan – with Certified Organic Spirulina ——
  // FIX: was keyed as "6" (wrong) — product id is 10. Caused VitaPlus to show
  //      a generic fallback image instead of its real product photo.
  10: { images: [
    "",
  ]},

  // —— id: 11 — MG+++ Magnesium – B12 + D3 with Magnesium ——
  11: { images: [
    "",
  ]},

  // —— id: 12 — CS++ + Iron++ – Calcium + Iron with B12+D3 ——
  12: { images: [
    "",
  ]},

  // —— id: 20 — Moringa Tablets ——
  20: { images: [
    "",
  ]},

  // —— id: 22 — Power Pro Tablets ——
  22: { images: [] },

  // ============================================================
  // NEW EFFERVESCENT LINE (ids 30–39) — matched from the 10-image shoot
  // ============================================================

  // —— id: 30 — Green Tea Effervescent Tablet ——
  30: { images: [
    "https://i.ibb.co/fdcN0Hdp/processed-4.webp",
  ]},

  // —— id: 31 — Ashwagandha Effervescent Tablet ——
  31: { images: [
    "https://i.ibb.co/YBCbb3TJ/processed-5.webp",
  ]},

  // —— id: 32 — Men's Multivitamin Effervescent Tablet ——
  32: { images: [
    "https://i.ibb.co/0ysjq102/processed-8.webp",
  ]},

  // —— id: 33 — Women's Multivitamin Effervescent Tablet ——
  33: { images: [
    "https://i.ibb.co/9k5Bf8Kq/processed-9.webp",
  ]},

  // —— id: 34 — Apple Cider Vinegar Effervescent Tablet ——
  34: { images: [
    "https://i.ibb.co/0jQd1M5g/processed-7.webp",
  ]},

  // —— id: 35 — Complete Bone Health Effervescent Tablet ——
  35: { images: [
    "https://i.ibb.co/Mynq6Z2J/processed-3.webp",
  ]},

  // —— id: 36 — Rehydration Effervescent Tablet ——
  36: { images: [
    "https://i.ibb.co/PzDW5jLs/processed-2.webp",
  ]},

  // —— id: 37 — Natural Vitamin C + Amla Effervescent Tablet ——
  37: { images: [
    "https://i.ibb.co/Rm9FRCn/processed-10.webp",
  ]},

  // —— id: 38 — Glutathione Effervescent Tablet ——
  38: { images: [
    "https://i.ibb.co/2Y50ZmrK/processed-6.webp",
  ]},

  // —— id: 39 — L-Carnitine L-Tartrate Effervescent Tablet ——
  39: { images: [
    "https://i.ibb.co/RTLtqjTK/processed-1.webp",
  ]},

};

// ================================================================
// RESPONSIVE IMAGE HELPER
// Wix media URLs embed their own resize params (w_XXX,h_XXX). Swapping
// that segment gives us a smaller variant of the same image for free —
// no extra uploads, no extra CDN. Used to serve small thumbnails to
// grid/cart/related-product cards instead of the full 600-1100px asset.
// ================================================================
function wixResize(url, size) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/w_\d+,h_\d+/, 'w_' + size + ',h_' + size);
}

// ================================================================
// AUTO-APPLY IMAGES TO PRODUCTS ARRAY
// This runs after PRODUCTS is defined and injects the real images
// ================================================================
(function applyProductImages() {
  if (typeof PRODUCTS === 'undefined') {
    // Retry after a short delay if PRODUCTS not ready yet
    setTimeout(applyProductImages, 100);
    return;
  }

  PRODUCTS.forEach(function(p) {
    var imgData = PRODUCT_IMAGES[p.id];
    if (!imgData || !imgData.images || !imgData.images.length) return;

    var imgs = imgData.images;

    // Set primary image (full size — product page / lightbox)
    p.image  = imgs[0] || p.image;
    p.image2 = imgs[1] || '';
    p.image3 = imgs[2] || '';
    p.image4 = imgs[3] || '';
    p.image5 = imgs[4] || '';

    // Set allImages array for gallery
    p.allImages = imgs;

    // Build media array for the 10-image gallery system.
    // thumb is now a real small variant (300px) instead of the full image,
    // so the gallery thumbnail strip doesn't download full-res images 5x over.
    p.media = imgs.map(function(url) {
      return { url: url, type: 'image', thumb: wixResize(url, 300) };
    });

    // NEW — small (400px) variant for product-card grids, cart rows,
    // related/upsell tiles. These never need the full 600-1100px asset.
    p.thumb400 = wixResize(imgs[0] || p.image || '', 400);
  });

  console.log('[Ozylix] ✅ Product images applied from PRODUCT_IMAGES map');
})();

// Export for Node.js / bundlers
if (typeof module !== "undefined") module.exports = { PRODUCT_IMAGES: PRODUCT_IMAGES, wixResize: wixResize };
