/**
 * Full admin user list for GET /api/admin/sync-users (Express + Vercel).
 * Shape matches legacy Dashboard admin UI: profile + memberships + organizations.
 */

import { authEmailVerificationFields, listAllAuthUsersAdmin } from "./adminPlatformUsersList.js";

/** @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin */
export async function fetchSyncUsersForAdmin(supabaseAdmin) {
  const authUsers = await listAllAuthUsersAdmin(supabaseAdmin);
  const userIds = authUsers.map((u) => u.id);
  if (userIds.length === 0) {
    return { users: [] };
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, avatar_url, logo_url, subscription_plan")
    .in("id", userIds);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from("memberships")
    .select("user_id, role, org_id")
    .in("user_id", userIds);

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const orgIds = Array.from(new Set((memberships || []).map((m) => m.org_id).filter(Boolean)));
  const { data: organizations, error: orgsError } = orgIds.length
    ? await supabaseAdmin.from("organizations").select("id, name, owner_id").in("id", orgIds)
    : { data: [], error: null };

  if (orgsError) {
    throw new Error(orgsError.message);
  }

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const orgMap = new Map((organizations || []).map((org) => [org.id, org]));
  const membershipsByUser = (memberships || []).reduce((acc, membership) => {
    const list = acc[membership.user_id] || [];
    list.push({
      ...membership,
      organization: orgMap.get(membership.org_id) || null,
    });
    acc[membership.user_id] = list;
    return acc;
  }, {});

  const users = authUsers.map((authUser) => {
    const ev = authEmailVerificationFields(authUser);
    return {
      id: authUser.id,
      email: authUser.email,
      app_metadata: authUser.app_metadata || {},
      user_metadata: authUser.user_metadata || {},
      created_at: authUser.created_at,
      email_verified: ev.email_verified,
      email_confirmed_at: ev.email_confirmed_at,
      profile: profileMap.get(authUser.id) || null,
      memberships: membershipsByUser[authUser.id] || [],
    };
  });

  return { users };
}
