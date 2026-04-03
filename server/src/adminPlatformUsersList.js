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
  const users = authUsers.map((authUser) => {
    const profile = profileMap.get(authUser.id) || null;
    const ev = authEmailVerificationFields(authUser);
    const email = String(authUser.email || profile?.email || "").trim();
    const full_name = String(
      profile?.full_name ||
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        ""
    ).trim();
    const plan = profile?.subscription_plan || authUser.user_metadata?.plan || "free";
    const status = profile?.status ?? "active";
    const role = String(
      authUser.app_metadata?.role ||
        profile?.role ||
        profile?.user_role ||
        authUser.user_metadata?.role ||
        "user"
    ).toLowerCase();
    return {
      id: authUser.id,
      email,
      full_name: full_name || email || "—",
      role,
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
      subscription_plan: profile?.subscription_plan,
      invoices_sent: Number(profile?.invoices_sent ?? profile?.invoices_count ?? 0),
      updated_at: profile?.updated_at || null,
    };
  });

  return { users };
}
