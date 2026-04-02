import { fetchAdminPlatformUsers } from '@/api/fetchAdminPlatformUsers';

/**
 * React Query loader for `['platform-users']`: Node API only (no Supabase list fallback on admin surfaces).
 */
export async function platformUsersQueryFn(limit = 500) {
  return fetchAdminPlatformUsers(limit);
}
