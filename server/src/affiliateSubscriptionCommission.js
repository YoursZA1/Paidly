/**
 * Subscription payment → commission row + referral marked paid (deterministic, idempotent per referral per UTC day).
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ userId: string, grossAmountZar: number, source?: string }} params
 */
export async function recordSubscriptionPaymentCommission(supabase, { userId, grossAmountZar, source }) {
  if (!userId || typeof grossAmountZar !== "number" || !Number.isFinite(grossAmountZar) || grossAmountZar <= 0) {
    return { ok: false, reason: "bad_input" };
  }

  const { data: referral, error: refErr } = await supabase
    .from("referrals")
    .select("id, affiliate_id, status")
    .eq("referred_user_id", userId)
    .maybeSingle();

  if (refErr || !referral) {
    return { ok: false, reason: "no_referral" };
  }

  const { data: affiliate, error: affErr } = await supabase
    .from("affiliates")
    .select("id, commission_rate, status")
    .eq("id", referral.affiliate_id)
    .maybeSingle();

  if (affErr || !affiliate || affiliate.status !== "approved") {
    return { ok: false, reason: "no_affiliate" };
  }

  const rate = Number(affiliate.commission_rate ?? 0.2);
  const amount = Math.round(grossAmountZar * rate * 100) / 100;

  const { error: insErr } = await supabase.from("commissions").insert({
    affiliate_id: affiliate.id,
    referral_id: referral.id,
    amount,
    status: "pending",
    currency: "ZAR",
    source: source || "subscription",
  });

  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: true, duplicate: true };
    }
    throw insErr;
  }

  await supabase
    .from("referrals")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", referral.id);

  return { ok: true, amount };
}
