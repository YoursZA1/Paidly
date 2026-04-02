import { paidly } from '@/api/paidlyClient';
import { fetchAdminPlatformUsers } from '@/api/fetchAdminPlatformUsers';

/**
 * React Query loader for `['platform-users']`: Auth-backed directory when API is available.
 */
export async function platformUsersQueryFn(limit = 500) {
  try {
    return await fetchAdminPlatformUsers(limit);
  } catch (e) {
    console.warn('[admin] platform-users API failed, using profiles list', e?.message || e);
    return paidly.entities.PlatformUser.list('-created_date', limit);
  }
}
