/**
 * Affiliate dashboard payload (stats + commissions) — used by GET /affiliate/dashboard and GET /api/affiliate/dashboard.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 */
export async function buildAffiliateDashboardPayload(supabase, userId) {
  if (!userId) {
    return { ok: false, error: "no_user" };
  }

  const { data: affiliate, error: affErr } = await supabase
    .from("affiliates")
    .select("id, referral_code, commission_rate, status, created_at")
    .eq("user_id", userId)
    .eq("status", "approved")
    .maybeSingle();

  if (affErr) {
    return { ok: false, error: affErr.message };
  }

  if (!affiliate) {
    return {
      ok: true,
      affiliate: null,
      stats: {
        clicks: 0,
        signups: 0,
        subscribed: 0,
        paidUsers: 0,
        earningsPending: 0,
        earningsPaid: 0,
      },
      summary: { signups: 0, paid_users: 0, earnings: 0 },
      recentCommissions: [],
      recentReferrals: [],
    };
  }

  const aid = affiliate.id;

  const [clicksRes, referralsRes, recentReferralsRes, commissionsRes] = await Promise.all([
    supabase.from("affiliate_clicks").select("id", { count: "exact", head: true }).eq("affiliate_id", aid),
    supabase.from("referrals").select("id, status").eq("affiliate_id", aid),
    supabase
      .from("referrals")
      .select("id, referred_user_id, status, created_at")
      .eq("affiliate_id", aid)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("commissions")
      .select("id, amount, status, created_at")
      .eq("affiliate_id", aid)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const referrals = referralsRes.data || [];
  const signups = referrals.filter(
    (r) => r.status === "signed_up" || r.status === "subscribed" || r.status === "paid"
  ).length;
  const subscribed = referrals.filter((r) => r.status === "subscribed" || r.status === "paid").length;
  const paidUsers = referrals.filter((r) => r.status === "paid").length;

  const commissions = commissionsRes.data || [];
  const earningsPending = commissions
    .filter((c) => c.status === "pending" || c.status === "approved")
    .reduce((s, c) => s + Number(c.amount || 0), 0);
  const earningsPaid = commissions
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  const earningsTotal = earningsPending + earningsPaid;

  return {
    ok: true,
    affiliate,
    stats: {
      clicks: clicksRes.count ?? 0,
      signups,
      subscribed,
      paidUsers,
      earningsPending,
      earningsPaid,
    },
    /** Flat snapshot (snake_case) for integrations / quick checks */
    summary: {
      signups,
      paid_users: paidUsers,
      earnings: earningsTotal,
    },
    recentCommissions: commissions,
    recentReferrals: recentReferralsRes.data || [],
    referralsError: referralsRes.error?.message,
  };
}
