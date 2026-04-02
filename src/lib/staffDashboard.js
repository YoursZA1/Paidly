import { ROLES, STAFF_ROLES } from '@/lib/permissions';

/** Roles that use the staff dashboard shell (`/admin-v2` and merged nav). */
export const DASHBOARD_STAFF_ROLES = [ROLES.ADMIN, ...STAFF_ROLES];

export function normalizeRoleString(role) {
  return String(role || '').trim().toLowerCase();
}

export function isStaffDashboardRole(role) {
  return DASHBOARD_STAFF_ROLES.includes(normalizeRoleString(role));
}

/** Invited / internal roles we persist on `profiles.role` and accept from JWT metadata. */
export const KNOWN_STAFF_ROLES = ['admin', 'management', 'sales', 'support'];

export function isKnownStaffRole(role) {
  return KNOWN_STAFF_ROLES.includes(normalizeRoleString(role));
}

/**
 * Effective app role: prefer `profiles.role` when it is a known staff role (invite + trigger),
 * else Supabase `app_metadata.role`, then `user_metadata.role` (invite payload).
 */
export function resolveUserRoleFromSessionAndProfile(supabaseUser, profileRow = {}) {
  if (!supabaseUser) return 'user';
  const pr = normalizeRoleString(profileRow.role || profileRow.user_role);
  if (isKnownStaffRole(pr)) return pr;
  const app = normalizeRoleString(supabaseUser.app_metadata?.role);
  if (isKnownStaffRole(app)) return app;
  const meta = normalizeRoleString(supabaseUser.user_metadata?.role);
  if (isKnownStaffRole(meta)) return meta;
  if (app) return app;
  return 'user';
}

export function staffDashboardHomePath() {
  return '/admin-v2';
}
