import { normalizeRequestBody } from "../validateBody.js";
import { membershipHasPermission, PERMISSIONS } from "../companyRouteAccess.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { sanitizeEmployeeWritePayload } from "../../../shared/workforce/employeeWrite.js";
import { createEmployee, getEmployee, getEmployeeProfile, listEmployees, listEligibleManagers, reassignManagerReports, updateEmployee, workforceSummary } from "./employeeService.js";
import { requireWorkforcePermission } from "./workforceAuth.js";
import { canSeeOrgWorkforce } from "../leave/leaveAuthz.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function managerScope(membership) {
  return canSeeOrgWorkforce(membership) ? null : membership.id;
}

export async function handleWorkforceEmployees(req, res) {
  const body = sanitizeEmployeeWritePayload(normalizeRequestBody(req));
  const employeeId = parseUuid(req.query?.id || body.id);
  const resolved = resolveWorkforceRoute(req);

  if (resolved?.route === "workforce-summary") {
    const gate = await requireWorkforcePermission(req, res, PERMISSIONS.VIEW_TEAM_MEMBERS);
    if (!gate.ok) return gate.response;
    if (req.method !== "GET") return jsonError(res, 405, "Method not allowed");
    try {
      const data = await workforceSummary(gate.membership.companyId, {
        managerScopeId: managerScope(gate.membership),
        includePendingInvites: membershipHasPermission(gate.membership, PERMISSIONS.MANAGE_EMPLOYEES),
      });
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  if (req.method === "GET" && employeeId) {
    const gate = await requireWorkforcePermission(req, res, PERMISSIONS.VIEW_OWN_PROFILE);
    if (!gate.ok) return gate.response;
    const canViewTeam = membershipHasPermission(gate.membership, PERMISSIONS.VIEW_TEAM_MEMBERS);
    try {
      const access = {
        actorUserId: gate.user.id,
        actorMembershipId: gate.membership.id,
        canViewTeam,
        canManagePayroll: membershipHasPermission(gate.membership, PERMISSIONS.MANAGE_PAYROLL),
      };
      const includeProfile =
        String(req.query?.include || "").toLowerCase() === "profile" ||
        String(req.query?.timeline || "") === "1";
      const sections = String(req.query?.sections || req.query?.include || "").toLowerCase();
      const data = includeProfile || (sections && sections !== "profile")
        ? await getEmployeeProfile(gate.membership.companyId, employeeId, access, {
            sections: includeProfile ? "profile" : sections,
          })
        : await getEmployee(gate.membership.companyId, employeeId, access);
      const profileEmployee = data?.employee || data;
      if (
        managerScope(gate.membership) &&
        profileEmployee.id !== gate.membership.id &&
        profileEmployee.manager_membership_id !== gate.membership.id
      ) {
        return jsonError(res, 403, "Not authorized for this employee", { code: "EMPLOYEE_IDOR" });
      }
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
    }
  }

  if (req.method === "GET") {
    const gate = await requireWorkforcePermission(req, res, PERMISSIONS.VIEW_TEAM_MEMBERS);
    if (!gate.ok) return gate.response;
    try {
      if (String(req.query?.eligible_managers || "") === "1") {
        const data = await listEligibleManagers(gate.membership.companyId, {
          excludeId: parseUuid(req.query?.exclude_id) || null,
          managerScopeId: managerScope(gate.membership),
        });
        return res.status(200).json({ ok: true, data });
      }
      const data = await listEmployees(gate.membership.companyId, {
        actorMembershipId: gate.membership.id,
        canManagePayroll: membershipHasPermission(gate.membership, PERMISSIONS.MANAGE_PAYROLL),
        managerScopeId: managerScope(gate.membership),
        q: req.query?.q || req.query?.search || "",
        department: req.query?.department || "",
        status: req.query?.status || "",
        managerId: req.query?.manager_id || req.query?.managerId || "",
        jobTitle: req.query?.job_title || req.query?.jobTitle || "",
        leaveStatus: req.query?.leave_status || req.query?.leaveStatus || "",
        attention: req.query?.attention === "1" || req.query?.attention === "true",
        sort: req.query?.sort || "name",
        limit: req.query?.limit,
        offset: req.query?.offset,
        includeAttendance: req.query?.include === "attendance" || String(req.query?.include || "").includes("attendance"),
        includeLeaveStatus: req.query?.include !== "none",
      });
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
    const action = String(body.action || "").trim().toLowerCase();
    if (action === "reassign_reports") {
      try {
        const data = await reassignManagerReports(gate.membership.companyId, gate.membership, body);
        return res.status(200).json({ ok: true, data });
      } catch (err) {
        return jsonError(res, Number(err.status) || 500, err.message, { code: err.code });
      }
    }
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
  if (head === "workforce-summary") return { route: "workforce-summary" };
  const urlPath = String(req.url || "").split("?")[0] || "";
  if (/\/employees\/?$/i.test(urlPath)) return { route: "employees" };
  if (/\/workforce-summary\/?$/i.test(urlPath)) return { route: "workforce-summary" };
  return null;
}
