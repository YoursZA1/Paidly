/**
 * Deterministic referral attribution (service role). One referred_user_id → at most one referral row.
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ referralCode: string, userId: string }} params
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function createReferralAttributionForUser(supabase, { referralCode, userId }) {
  const raw = referralCode != null ? String(referralCode).trim() : "";
  if (raw.length < 2) {
    return { ok: false, error: "invalid_code" };
  }
  if (!userId || typeof userId !== "string") {
    return { ok: false, error: "invalid_user" };
  }

  const { data: affiliate, error: affErr } = await supabase
    .from("affiliates")
    .select("id, user_id, commission_rate, status")
    .eq("status", "approved")
    .ilike("referral_code", raw)
    .maybeSingle();

  if (affErr) {
    return { ok: false, error: affErr.message };
  }
  if (!affiliate) {
    return { ok: false, error: "invalid_affiliate" };
  }
  if (affiliate.user_id === userId) {
    return { ok: false, error: "self_referral" };
  }

  const { error: insErr } = await supabase.from("referrals").insert({
    affiliate_id: affiliate.id,
    referred_user_id: userId,
    status: "signed_up",
  });

  if (insErr) {
    if (insErr.code === "23505") {
      return { ok: true, idempotent: true };
    }
    return { ok: false, error: insErr.message };
  }

  return { ok: true };
}
