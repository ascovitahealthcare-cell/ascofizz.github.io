// ═══════════════════════════════════════════════════════════════════
// ORDER DISCOUNT BREAKDOWN — shared helpers (2026-08)
//
// Two jobs, both called after computeServerSideTotal() returns:
//
//   1. persistBreakdown(orderData, recalculated, pricingLines)
//      Writes each discount component to its own orders column:
//        tier_discount       — MRP-vs-tier-price saving on the packs bought
//        mix_match_discount  — the Mix & Match free-unit saving
//        coupon_discount     — what the promo code took off (with coupon_code)
//        vita_points_discount / vita_points_used — points redeemed in ₹ + count
//      The aggregate `discount` column stays the sum of all of these,
//      exactly as assertOrderFoots requires — nothing about invoicing or
//      the money math changes, the row just gains the per-line detail the
//      invoice and My Account panels print.
//
//   2. saveCustomerProfile(supabase, orderData)
//      First-order and every-order auto-save: the contact details a
//      customer types at checkout are written to their `customers` row,
//      so the next checkout pre-fills everything (name, phone, address,
//      city, state, pin). JWT-bound in the callers — the email here is
//      the caller's own verified account email, never the request body.
//      A customer can only ever enrich their OWN profile row.
// ═══════════════════════════════════════════════════════════════════

// Component-by-component persistence. `recalculated` is the object
// computeServerSideTotal() returns; `orderData` is the row being saved.
function persistBreakdown(orderData, recalculated) {
  // Coupon: the named component. If no code was applied this stays 0 and
  // the coupon_code column carries nothing — nothing to list on the invoice.
  orderData.coupon_discount = Number(recalculated.discount || 0);

  // Mix & Match: the lowest-priced free units. Already part of the
  // aggregate `discount`, now also on its own line.
  orderData.mix_match_discount = Number(recalculated.mixMatchDiscount || 0);

  // VitaPoints redemption in rupees, plus the point count. The count was
  // already stored in vita_points_redeemed — keep both so the ledger and
  // the invoice foot against each other.
  orderData.vita_points_discount = Number(recalculated.vitaDiscount || 0);

  // Pack / tier savings: what the chosen multi-tab pack saved versus
  // buying the same tabs at the single-unit MRP. Computed from the
  // server-repriced lines so a client can never inflate it.
  let tierSaving = 0;
  const lines = recalculated.pricingLines || [];
  for (const line of lines) {
    const base = Number(line.base || 0);
    const charged = Number(line.charged || 0);
    tierSaving += Math.max(0, base - charged);
  }
  // tierDiscount must not overlap mix-match/coupon/vita, which are applied
  // AFTER the per-line price — so only the pure pack-price saving counts,
  // and it must never exceed the written discount.
  const others = (orderData.coupon_discount || 0) + (orderData.mix_match_discount || 0) + (orderData.vita_points_discount || 0);
  tierSaving = Math.min(tierSaving, Math.max(0, Number(orderData.discount || 0) - others));
  orderData.tier_discount = Number(tierSaving.toFixed(2));
  orderData.vita_points_used = Number(orderData.vita_points_redeemed || 0);
}

// Auto-save the checkout contact details into the customer's profile row.
// Idempotent upsert keyed on the account email — a repeat order just
// refreshes the same row. Failures are logged, never thrown: a profile
// write must never block an order that already passed the money checks.
async function saveCustomerProfile(supabase, orderData, log) {
  const email = String((orderData.customer_email || '')).toLowerCase().trim();
  if (!email) return;
  try {
    const profile = {
      name: String(orderData.customer_name || ''),
      phone: String(orderData.customer_phone || ''),
      email: email,
      city: String(orderData.city || ''),
      state: String(orderData.state || ''),
      pincode: String(orderData.pincode || ''),
    };
    // Compose a one-line address from the structured fields the checkout
    // form always provides; keep it simple — the same shape the profile
    // page and the checkout prefill both already use.
    const addr1 = String(orderData.address_line1 || orderData.address || '');
    const addr2 = String(orderData.address_line2 || '');
    if (addr1) profile.address = [addr1, addr2].filter(Boolean).join(', ');

    const { data: existing } = await supabase
      .from('customers').select('id').eq('email', email).maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('customers')
        .update({ ...profile, updated_at: new Date().toISOString() })
        .eq('email', email);
      if (error) console.error(`[${log}] profile update failed for ${email}:`, error.message);
      else console.log(`[${log}] ✅ profile refreshed for ${email}`);
    } else {
      // A first-time buyer with no customer row yet (checkout created the
      // account, but the orders table existed first). Seed one so the next
      // checkout pre-fills — total_orders/total_spent are maintained by the
      // caller afterwards, same as the pre-existing flow.
      const { error } = await supabase.from('customers').insert({
        ...profile,
        total_orders: 0,
        total_spent: 0,
        vita_points: 0,
        tier: 'Bronze',
      });
      if (error) console.error(`[${log}] profile insert failed for ${email}:`, error.message);
      else console.log(`[${log}] ✅ profile created for ${email}`);
    }
  } catch (e) {
    console.error(`[${log}] saveCustomerProfile threw:`, e.message);
  }
}

module.exports = { persistBreakdown, saveCustomerProfile };
