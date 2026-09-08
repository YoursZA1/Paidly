import { getUserFromRequest } from "../supabaseAuth.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  loadCompanyMembership,
  membershipHasPermission,
} from "../companyRouteAccess.js";
import { isPosOnlyStaff } from "../../../shared/posStaffInvite.js";
import { parseUuid } from "../../../shared/ids/uuid.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

/**
 * Session org + permission. Client org/role/employee ids are ignored.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {string} permission
 */
export async function requireWorkforcePermission(req, res, permission) {
  try {
    const { user, error: authErr } = await getUserFromRequest(req);
    if (!user) return { ok: false, response: jsonError(res, 401, authErr || "Unauthorized") };
    const membership = await loadCompanyMembership(supabaseAdmin, user.id);
    if (!membership) return { ok: false, response: jsonError(res, 403, "No company membership") };
    if (isPosOnlyStaff(membership)) {
      return { ok: false, response: jsonError(res, 403, "POS staff cannot access workforce", { code: "POS_SCOPE" }) };
    }
    if (!membershipHasPermission(membership, permission)) {
      return { ok: false, response: jsonError(res, 403, "Forbidden", { code: "FORBIDDEN", permission }) };
    }
    return { ok: true, user, membership };
  } catch (err) {
    return { ok: false, response: jsonError(res, 500, err?.message || "Could not verify access") };
  }
}

/**
 * Resource org must match the session org. Never trust body.org_id.
 * @param {{ companyId?: string, orgId?: string }} membership
 * @param {{ org_id?: string } | null | undefined} record
 */
export function assertSameOrg(membership, record) {
  const sessionOrg = membership?.companyId || membership?.orgId;
  const recordOrg = record?.org_id;
  if (!sessionOrg || !recordOrg || recordOrg !== sessionOrg) {
    const err = new Error("Not authorized for this company");
    err.status = 403;
    err.code = "ORG_MISMATCH";
    throw err;
  }
  return true;
}

/**
 * Employee id is the membership UUID from the loaded row, never the request body.
 * @param {{ userId?: string, id?: string }} actor
 * @param {{ id?: string, user_id?: string }} employee
 * @param {{ canViewTeam?: boolean }} [opts]
 */
export function assertOwnEmployee(actor, employee, { canViewTeam = false } = {}) {
  if (!employee?.id) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }
  if (canViewTeam) return true;
  const actorUserId = actor?.userId || actor?.id;
  if (employee.user_id && actorUserId && employee.user_id === actorUserId) return true;
  const actorMembershipId = parseUuid(actor?.id);
  if (actorMembershipId && actorMembershipId === employee.id) return true;
  const err = new Error("Not authorized for this employee");
  err.status = 403;
  err.code = "EMPLOYEE_IDOR";
  throw err;
}
