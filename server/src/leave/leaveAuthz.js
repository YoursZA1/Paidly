import { membershipHasPermission, PERMISSIONS, COMPANY_ROLES } from "../companyRouteAccess.js";

/**
 * Assigned manager, HR, or admin may decide. Nobody may approve their own leave.
 *
 * @param {object} actorMembership
 * @param {{ id?: string, manager_membership_id?: string, user_id?: string }} employeeMembership
 */
export function canDecideLeave(actorMembership, employeeMembership) {
  if (!actorMembership?.id || !employeeMembership?.id) {
    return { ok: false, code: "NOT_THIS_MANAGER", message: "Not authorized to decide this leave request." };
  }
  if (actorMembership.id === employeeMembership.id) {
    return { ok: false, code: "SELF_APPROVAL", message: "You cannot approve or decline your own leave request." };
  }
  if (employeeMembership.manager_membership_id && employeeMembership.manager_membership_id === actorMembership.id) {
    return { ok: true, role: "assigned_manager" };
  }
  if (membershipHasPermission(actorMembership, PERMISSIONS.MANAGE_LEAVE)) {
    return { ok: true, role: "hr" };
  }
  if (actorMembership.companyRole === COMPANY_ROLES.ADMIN) {
    return { ok: true, role: "admin" };
  }
  return { ok: false, code: "NOT_THIS_MANAGER", message: "Only the assigned manager or HR can decide this request." };
}

export function canSeeOrgWorkforce(membership) {
  return (
    membershipHasPermission(membership, PERMISSIONS.MANAGE_EMPLOYEES) ||
    membershipHasPermission(membership, PERMISSIONS.MANAGE_PAYROLL) ||
    membershipHasPermission(membership, PERMISSIONS.MANAGE_LEAVE) ||
    membership?.companyRole === COMPANY_ROLES.ADMIN
  );
}

export function canOverrideLeave(membership) {
  return (
    membershipHasPermission(membership, PERMISSIONS.MANAGE_LEAVE) ||
    membership?.companyRole === COMPANY_ROLES.ADMIN
  );
}
