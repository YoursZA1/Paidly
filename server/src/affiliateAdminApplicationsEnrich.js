/**
 * Merge `affiliate_applications` rows with `affiliates` partner rows and live referral / commission stats
 * for the admin Affiliates dashboard.
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {Record<string, unknown>[]} applications
 * @param {Record<string, unknown>[]} partners rows from `affiliates`
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function mergeAffiliateApplicationsWithPartnersAndStats(supabaseAdmin, applications, partners) {
  const apps = applications || [];
  const pals = partners || [];

  const partnerByAppId = new Map();
  for (const p of pals) {
    if (p?.application_id != null) partnerByAppId.set(String(p.application_id), p);
  }

  const affiliateIds = [...new Set(pals.map((p) => p.id).filter(Boolean))];

  if (affiliateIds.length === 0) {
    return apps.map((a) => ({
      ...a,
      affiliate_partner_id: null,
      referrals_count: 0,
      referrals_subscribed_count: 0,
      referrals_paid_count: 0,
      earnings: 0,
    }));
  }

  const [refRes, commRes] = await Promise.all([
    supabaseAdmin.from("referrals").select("affiliate_id, status").in("affiliate_id", affiliateIds),
    supabaseAdmin.from("commissions").select("affiliate_id, amount, status").in("affiliate_id", affiliateIds),
  ]);

  if (refRes.error) {
    console.error("[affiliateAdminApplicationsEnrich] referrals:", refRes.error.message);
  }
  if (commRes.error) {
    console.error("[affiliateAdminApplicationsEnrich] commissions:", commRes.error.message);
  }

  const referrals = refRes.error ? [] : refRes.data || [];
  const commissions = commRes.error ? [] : commRes.data || [];

  /** @type {Map<string, { total: number, subscribed: number, paid: number }>} */
  const refStats = new Map();
  for (const aid of affiliateIds) {
    refStats.set(String(aid), { total: 0, subscribed: 0, paid: 0 });
  }
  for (const r of referrals) {
    const aid = r?.affiliate_id != null ? String(r.affiliate_id) : "";
    const s = refStats.get(aid);
    if (!s) continue;
    const st = String(r.status || "").toLowerCase();
    s.total += 1;
    if (st === "subscribed" || st === "paid") s.subscribed += 1;
    if (st === "paid") s.paid += 1;
  }

  /** @type {Map<string, number>} */
  const earningsByAff = new Map();
  for (const c of commissions) {
    const st = String(c.status || "").toLowerCase();
    if (st !== "pending" && st !== "approved" && st !== "paid") continue;
    const aid = c?.affiliate_id != null ? String(c.affiliate_id) : "";
    if (!aid) continue;
    const add = Number(c.amount || 0);
    earningsByAff.set(aid, (earningsByAff.get(aid) || 0) + add);
  }

  return apps.map((a) => {
    const partner = partnerByAppId.get(String(a.id)) || null;
    const pid = partner?.id != null ? String(partner.id) : null;
    const stats = pid ? refStats.get(pid) : { total: 0, subscribed: 0, paid: 0 };
    const earnings = pid ? earningsByAff.get(pid) || 0 : 0;
    return {
      ...a,
      affiliate_partner_id: partner?.id ?? null,
      referral_code: a.referral_code || partner?.referral_code || null,
      referrals_count: stats?.total ?? 0,
      referrals_subscribed_count: stats?.subscribed ?? 0,
      referrals_paid_count: stats?.paid ?? 0,
      earnings,
    };
  });
}
