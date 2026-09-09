import {
  membershipHasPermission,
  PERMISSIONS,
  COMPANY_ROLES,
  normalizeCompanyRole,
  normalizeJobFunction,
} from "../companyRouteAccess.js";

/**
 * Map a memberships row (`role`, `job_function`) onto the permission shape.
 * @param {object | null | undefined} row
 */
export function toLeaveActorMembership(row) {
  if (!row?.id) return null;
  return {
    ...row,
    companyRole: normalizeCompanyRole(row.companyRole || row.role || row.membershipRole),
    jobFunction: normalizeJobFunction(row.jobFunction || row.job_function),
  };
}

/**
 * Assigned manager, HR, or admin may decide. Nobody may approve their own leave.
 *
 * @param {object} actorMembership
 * @param {{ id?: string, manager_membership_id?: string, user_id?: string }} employeeMembership
 */
export function canDecideLeave(actorMembership, employeeMembership) {
  const actor = toLeaveActorMembership(actorMembership);
  if (!actor?.id || !employeeMembership?.id) {
    return { ok: false, code: "NOT_THIS_MANAGER", message: "Not authorized to decide this leave request." };
  }
  if (actor.id === employeeMembership.id) {
    return { ok: false, code: "SELF_APPROVAL", message: "You cannot approve or decline your own leave request." };
  }
  if (employeeMembership.manager_membership_id && employeeMembership.manager_membership_id === actor.id) {
    return { ok: true, role: "assigned_manager" };
  }
  if (membershipHasPermission(actor, PERMISSIONS.MANAGE_LEAVE)) {
    return { ok: true, role: "hr" };
  }
  if (actor.companyRole === COMPANY_ROLES.ADMIN) {
    return { ok: true, role: "admin" };
  }
  return { ok: false, code: "NOT_THIS_MANAGER", message: "Only the assigned manager or HR can decide this request." };
}

export function canSeeOrgWorkforce(membership) {
  const actor = toLeaveActorMembership(membership) || membership;
  return (
    membershipHasPermission(actor, PERMISSIONS.MANAGE_EMPLOYEES) ||
    membershipHasPermission(actor, PERMISSIONS.MANAGE_PAYROLL) ||
    membershipHasPermission(actor, PERMISSIONS.MANAGE_LEAVE) ||
    actor?.companyRole === COMPANY_ROLES.ADMIN
  );
}

export function canOverrideLeave(membership) {
  const actor = toLeaveActorMembership(membership) || membership;
  return (
    membershipHasPermission(actor, PERMISSIONS.MANAGE_LEAVE) ||
    actor?.companyRole === COMPANY_ROLES.ADMIN
  );
}
