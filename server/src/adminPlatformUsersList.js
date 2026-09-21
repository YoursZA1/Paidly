/**
 * Auth admin list + profile merge for GET /api/admin/platform-users (Express + Vercel).
 */

/** @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin */
export async function listAllAuthUsersAdmin(supabaseAdmin) {
  const perPage = 200;
  let page = 1;
  const authUsers = [];
  while (true) {
    const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listError) {
      const m = String(listError.message || listError || "");
      if (/user not allowed/i.test(m)) {
        throw new Error(
          `${m} Server must call Auth Admin with the real service_role secret for the same project as SUPABASE_URL (Vercel: Project Settings → Environment Variables; local: server/.env).`
        );
      }
      throw new Error(m);
    }
    const batch = data?.users || [];
    authUsers.push(...batch);
    if (batch.length < perPage) {
      break;
    }
    page += 1;
  }
  return authUsers;
}

export function dedupeAuthUsersByEmail(authUsers) {
  const sorted = [...authUsers].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  const byEmail = new Map();
  const withoutEmail = [];
  for (const u of sorted) {
    const key = String(u.email || "").trim().toLowerCase();
    if (!key) {
      withoutEmail.push(u);
      continue;
    }
    if (!byEmail.has(key)) {
      byEmail.set(key, u);
    }
  }
  return [...byEmail.values(), ...withoutEmail];
}

export function authEmailVerificationFields(authUser) {
  const at = authUser?.email_confirmed_at || authUser?.confirmed_at;
  return {
    email_verified: Boolean(at),
    email_confirmed_at: at || null,
  };
}

/** Live subscription = paid access right now (same rule as the entitlement layer). */
function subscriptionIsLive(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  if (status === "active") return true;
  if (status === "trialing") return !row?.trial_ends_at || new Date(row.trial_ends_at).getTime() > Date.now();
  if (status === "past_due") return Boolean(row?.grace_ends_at) && new Date(row.grace_ends_at).getTime() > Date.now();
  return false;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {number} limit
 */
export async function fetchMergedPlatformUsersForAdmin(supabaseAdmin, limit) {
  let authUsers = await listAllAuthUsersAdmin(supabaseAdmin);
  authUsers = dedupeAuthUsersByEmail(authUsers);
  authUsers.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  authUsers = authUsers.slice(0, limit);

  const userIds = authUsers.map((u) => u.id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabaseAdmin.from("profiles").select("*").in("id", userIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  // Billing truth is the subscriptions table. profiles.plan is a mirror that can lag
  // (or be stale from an abandoned checkout), so admin must not present it as the plan.
  const subscriptionMap = new Map();
  if (userIds.length) {
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, status, plan_slug, plan_family, plan, amount, trial_ends_at, grace_ends_at, updated_at")
      .in("user_id", userIds)
      .order("updated_at", { ascending: false });
    for (const row of subs || []) {
      const key = String(row.user_id);
      const current = subscriptionMap.get(key);
      const live = subscriptionIsLive(row);
      // Prefer a live agreement, else the most recently updated row.
      if (!current || (live && !current.live)) {
        subscriptionMap.set(key, { ...row, live });
      }
    }
  }
  const nowMs = Date.now();
  const ONLINE_WINDOW_MS = 2 * 60 * 1000;
  const users = authUsers.map((authUser) => {
    const profile = profileMap.get(authUser.id) || null;
    const ev = authEmailVerificationFields(authUser);
    /** Supabase Auth primary email (signup / login identity) when present; else profiles.email. */
    const email = String(authUser.email || profile?.email || "").trim();
    const full_name = String(
      profile?.full_name ||
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        ""
    ).trim();
    const subscription = subscriptionMap.get(String(authUser.id)) || null;
    /** Plan shown in Admin comes from the subscription; the profile mirror is only a fallback label. */
    const plan =
      subscription?.plan_family ||
      subscription?.plan_slug ||
      subscription?.plan ||
      profile?.subscription_plan ||
      "free";
    const status = profile?.status ?? "active";
    const role = String(
      authUser.app_metadata?.role ||
        profile?.role ||
        profile?.user_role ||
        "user"
    ).toLowerCase();
    const um = authUser.user_metadata || {};
    const invitedByRaw = um.invited_by;
    const invited_by =
      typeof invitedByRaw === "string" && invitedByRaw.trim()
        ? invitedByRaw.trim().toLowerCase()
        : null;
    const lastActiveAt = profile?.last_active_at || null;
    const lastActiveMs = lastActiveAt ? Date.parse(lastActiveAt) : NaN;
    const isOnline =
      Number.isFinite(lastActiveMs) && nowMs - lastActiveMs >= 0 && nowMs - lastActiveMs <= ONLINE_WINDOW_MS;
    return {
      id: authUser.id,
      email,
      full_name: full_name || email || "—",
      role,
      invited_by,
      email_verified: ev.email_verified,
      email_confirmed_at: ev.email_confirmed_at,
      app_metadata: authUser.app_metadata || {},
      user_metadata: authUser.user_metadata || {},
      created_at: authUser.created_at,
      created_date: authUser.created_at,
      last_sign_in_at: authUser.last_sign_in_at || null,
      profile,
      plan,
      status,
      company_name: profile?.company_name || "",
      company: profile?.company_name || "",
      subscription_plan: plan,
      profile_plan: profile?.subscription_plan || profile?.plan || null,
      subscription_status: subscription?.status || null,
      subscription_is_live: Boolean(subscription?.live),
      subscription_amount: subscription?.amount ?? null,
      plan_matches_profile:
        subscription == null
          ? null
          : String(plan || "").toLowerCase() ===
            String(profile?.subscription_plan || profile?.plan || "").toLowerCase(),
      invoices_sent: Number(profile?.invoices_sent ?? profile?.invoices_count ?? 0),
      updated_at: profile?.updated_at || null,
      last_active_at: lastActiveAt,
      last_active_path: profile?.last_active_path || null,
      is_online: isOnline,
    };
  });

  return { users };
}
