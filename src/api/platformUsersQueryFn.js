import { fetchAdminPlatformUsers } from '@/api/fetchAdminPlatformUsers';
import { paidly } from '@/api/paidlyClient';

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * React Query loader for `['platform-users']`: prefers Node/Vercel admin API; falls back to profiles list when API is missing or errors (not in VITE_SUPABASE_ONLY mode).
 */
/** @param {number} [limit] — server accepts up to 2000 for GET /api/admin/platform-users */
export async function platformUsersQueryFn(limit = 2000) {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) {
    return fetchAdminPlatformUsers(limit);
  }
  try {
    return await fetchAdminPlatformUsers(limit);
  } catch (e) {
    const msg = String(e?.message || e || "");
    // Do not mask auth/config failures with profile fallback; surface real problem to admins.
    if (
      /admin access required|session expired|not authenticated|server misconfigured|service_role|user not allowed/i.test(
        msg
      )
    ) {
      throw e;
    }
    console.warn(
      '[admin] platform-users API failed, using profiles list fallback:',
      msg
    );
    return paidly.entities.PlatformUser.list('-created_date', limit);
  }
}
