/**
 * Referral status transitions when a referred user becomes a paying subscriber (before commission / payout).
 */

const PAID_PROFILE_PLANS = new Set(["starter", "professional", "enterprise"]);

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId referred user (auth user id)
 * @returns {Promise<{ ok: boolean, updated?: boolean }>}
 */
export async function markReferralSubscribedForUser(supabase, userId) {
  if (!userId || typeof userId !== "string") {
    return { ok: false };
  }

  const { data: ref, error } = await supabase
    .from("referrals")
    .select("id, status")
    .eq("referred_user_id", userId)
    .maybeSingle();

  if (error || !ref) {
    return { ok: true, updated: false };
  }

  if (String(ref.status).toLowerCase() !== "signed_up") {
    return { ok: true, updated: false };
  }

  const { error: upErr } = await supabase
    .from("referrals")
    .update({ status: "subscribed", updated_at: new Date().toISOString() })
    .eq("id", ref.id);

  if (upErr) {
    console.error("[affiliateReferralLifecycle] mark subscribed:", upErr.message);
    return { ok: false };
  }

  return { ok: true, updated: true };
}

/**
 * @param {string | undefined} plan profile.subscription_plan
 * @returns {boolean}
 */
export function isPaidSubscriptionPlan(plan) {
  const p = String(plan || "")
    .trim()
    .toLowerCase();
  return PAID_PROFILE_PLANS.has(p);
}

export { PAID_PROFILE_PLANS };
