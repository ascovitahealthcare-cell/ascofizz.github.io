/* ═══ ASCOFIZZ · REVIEWS — Supabase-backed, real reviews only (preserved) ═══ */
// REAL REVIEW SYSTEM — backed directly by Supabase (SQL), no Render
// backend in the loop. No hardcoded/fake reviews anywhere on the site.
// Every product starts with an empty review list until real customers
// submit one; submitted reviews are inserted straight into the
// Supabase `reviews` table (see SQL schema in the setup notes) so
// they persist across reloads and index.html redeploys.
// ═══════════════════════════════════════════════════════════════
const REVIEWS = {};          // productId -> array of real reviews fetched from SQL
const REVIEWS_LOADED = {};   // productId -> true once a fetch has completed (success or fail)

async function loadProductReviews(productId) {
  try {
    const { data, error } = await sb
      .from('reviews')
      .select('id, user_name, rating, review_text, created_at, verified')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    REVIEWS[productId] = (data || []).map(r => ({
      id: r.id, user: r.user_name, rating: r.rating, text: r.review_text,
      date: r.created_at, verified: r.verified
    }));
  } catch (e) {
    console.error('[loadProductReviews] Supabase error:', JSON.stringify(e, Object.getOwnPropertyNames(e||{})), e);
    // Supabase not reachable / table not set up yet — show an honest
    // "no reviews yet" state rather than fake filler text.
    REVIEWS[productId] = REVIEWS[productId] || [];
  } finally {
    REVIEWS_LOADED[productId] = true;
    // If the shopper is currently looking at this exact product, refresh the tab in place.
    if (currentProduct && currentProduct.id === productId) {
      try { buildProductPage(currentProduct); } catch(e) {}
    }
  }
}

async function submitReview() {
  const user = getCurrentUser();
  if (!user) { openAuth('login'); return; }
  const name = (user.name || 'Ascofizz Customer').trim();
  const text = document.getElementById('rvText')?.value.trim();
  if (!text || !selectedRating) { showToast('Please write your experience and select a rating!','error'); return; }
  if (!currentProduct) return;

  const btn = document.querySelector('#rvSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

  try {
    // Persist straight to Supabase (SQL) — no Render backend in the
    // loop, so no cold-start timeout to worry about.
    const { error } = await sb.from('reviews').insert({
      product_id: currentProduct.id,
      product_name: currentProduct.name || '',
      user_name: name,
      rating: selectedRating,
      review_text: text
    });
    if (error) throw error;

    // Re-fetch the authoritative list from Supabase rather than
    // trusting our own optimistic copy — guarantees what's shown
    // matches what's actually stored in SQL.
    REVIEWS_LOADED[currentProduct.id] = false;
    await loadProductReviews(currentProduct.id);
    showToast('Review submitted — thank you', 'success');
    const rvTextEl = document.getElementById('rvText'); if (rvTextEl) rvTextEl.value = '';
    selectedRating = 0;
    /* Redesigned PDP has no tab strip — buildProductPage() redraws the
       reviews block itself once loadProductReviews() resolves. */
  } catch (e) {
    console.error('[submitReview] Supabase error:', JSON.stringify(e, Object.getOwnPropertyNames(e||{})), e);
    const detail = e?.message || e?.error_description || e?.details || '';
    showToast(detail ? `Couldn't submit review: ${detail}` : "Couldn't submit your review — please try again in a moment.", 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Post review'; }
  }
}
