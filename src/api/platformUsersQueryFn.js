import { fetchAdminPlatformUsers } from '@/api/fetchAdminPlatformUsers';
import { paidly } from '@/api/paidlyClient';

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * React Query loader for `['platform-users']`: prefers Node/Vercel admin API; falls back to profiles list when API is missing or errors (not in VITE_SUPABASE_ONLY mode).
 */
export async function platformUsersQueryFn(limit = 500) {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) {
    return fetchAdminPlatformUsers(limit);
  }
  try {
    return await fetchAdminPlatformUsers(limit);
  } catch (e) {
    console.warn(
      '[admin] platform-users API failed, using profiles list fallback:',
      e?.message || e
    );
    return paidly.entities.PlatformUser.list('-created_date', limit);
  }
}
