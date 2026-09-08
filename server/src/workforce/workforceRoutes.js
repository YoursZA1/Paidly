import { normalizeRequestBody } from "../validateBody.js";
import { membershipHasPermission, PERMISSIONS } from "../companyRouteAccess.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { sanitizeEmployeeWritePayload } from "../../../shared/workforce/employeeWrite.js";
import { createEmployee, getEmployee, listEmployees, updateEmployee } from "./employeeService.js";
import { requireWorkforcePermission } from "./workforceAuth.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

export async function handleWorkforceEmployees(req, res) {
  const body = sanitizeEmployeeWritePayload(normalizeRequestBody(req));
  const employeeId = parseUuid(req.query?.id || body.id);

  if (req.method === "GET" && employeeId) {
    const gate = await requireWorkforcePermission(req, res, PERMISSIONS.VIEW_OWN_PROFILE);
    if (!gate.ok) return gate.response;
    const canViewTeam = membershipHasPermission(gate.membership, PERMISSIONS.VIEW_TEAM_MEMBERS);
    try {
      const data = await getEmployee(gate.membership.companyId, employeeId, {
        actorUserId: gate.user.id,
        actorMembershipId: gate.membership.id,
        canViewTeam,
      });
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  if (req.method === "GET") {
    const gate = await requireWorkforcePermission(req, res, PERMISSIONS.VIEW_TEAM_MEMBERS);
    if (!gate.ok) return gate.response;
    try {
      const data = await listEmployees(gate.membership.companyId);
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  if (req.method === "POST") {
    const gate = await requireWorkforcePermission(req, res, PERMISSIONS.MANAGE_EMPLOYEES);
    if (!gate.ok) return gate.response;
    try {
      const data = await createEmployee(gate.membership.companyId, gate.membership, body);
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  if (req.method === "PATCH" || req.method === "PUT") {
    const gate = await requireWorkforcePermission(req, res, PERMISSIONS.MANAGE_EMPLOYEES);
    if (!gate.ok) return gate.response;
    if (!employeeId) return jsonError(res, 400, "Employee id is required");
    try {
      const data = await updateEmployee(gate.membership.companyId, gate.membership, employeeId, body);
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH, PUT");
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
