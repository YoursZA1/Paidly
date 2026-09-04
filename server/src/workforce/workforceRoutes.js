import { normalizeRequestBody } from "../validateBody.js";
import { getUserFromRequest } from "../supabaseAuth.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  loadCompanyMembership,
  membershipHasPermission,
  PERMISSIONS,
} from "../companyRouteAccess.js";
import { isPosOnlyStaff } from "../../../shared/posStaffInvite.js";
import { createEmployee, getEmployee, listEmployees } from "./employeeService.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

async function requireWorkforce(req, res, permission) {
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

export async function handleWorkforceEmployees(req, res) {
  const body = normalizeRequestBody(req);
  const employeeId = String(req.query?.id || body.id || "").trim() || null;

  if (req.method === "GET" && employeeId) {
    const gate = await requireWorkforce(req, res, PERMISSIONS.VIEW_OWN_PROFILE);
    if (!gate.ok) return gate.response;
    const canViewTeam = membershipHasPermission(gate.membership, PERMISSIONS.VIEW_TEAM_MEMBERS);
    try {
      const data = await getEmployee(gate.membership.companyId, employeeId, {
        actorUserId: gate.user.id,
        canViewTeam,
      });
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  if (req.method === "GET") {
    const gate = await requireWorkforce(req, res, PERMISSIONS.VIEW_TEAM_MEMBERS);
    if (!gate.ok) return gate.response;
    try {
      const data = await listEmployees(gate.membership.companyId);
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  if (req.method === "POST") {
    const gate = await requireWorkforce(req, res, PERMISSIONS.MANAGE_EMPLOYEES);
    if (!gate.ok) return gate.response;
    try {
      const data = await createEmployee(gate.membership.companyId, gate.membership, body);
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return jsonError(res, 405, "Method not allowed");
}

export function resolveWorkforceRoute(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const head = parts[0] || "";
  if (head === "employees") return { route: "employees" };
  const urlPath = String(req.url || "").split("?")[0] || "";
  if (/\/employees\/?$/i.test(urlPath)) return { route: "employees" };
  return null;
}
