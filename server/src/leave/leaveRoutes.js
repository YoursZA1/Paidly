import { normalizeRequestBody } from "../validateBody.js";
import { jsonError, requirePayrollPermission, PERMISSIONS } from "../payroll/payrollGate.js";
import { membershipHasPermission } from "../companyRouteAccess.js";
import { parseLeaveListFilters, mapLeaveDbError } from "../../../shared/leave/leaveIds.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import {
  myLeave,
  applyForLeave,
  listLeaveRequests,
  decideLeaveRequest,
  cancelLeaveRequest,
  adjustLeaveBalance,
  leaveCalendar,
  upsertLeaveType,
  listLeaveTypes,
  listLeaveEmployees,
} from "./leaveService.js";

async function handle(res, fn) {
  try {
    const data = await fn();
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    const mapped = mapLeaveDbError(err);
    const status = Number(mapped?.status) || 500;
    return jsonError(res, status, mapped?.message || "Leave request failed", { details: mapped?.details });
  }
}

export async function handleLeaveRoute(req, res, resolved) {
  const route = resolved?.route;
  const id = resolved?.id || null;
  const body = normalizeRequestBody(req);

  if (route === "types") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.VIEW_OWN_LEAVE, {
      feature: "leave_management",
    });
    if (!gate.ok) return gate.response;
    if (req.method === "GET") {
      return handle(res, () => listLeaveTypes(gate.membership.companyId));
    }
    if (req.method === "POST" || req.method === "PATCH") {
      const admin = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_LEAVE, {
        feature: "leave_management",
      });
      if (!admin.ok) return admin.response;
      return handle(res, () => upsertLeaveType(admin.membership.companyId, body));
    }
    return jsonError(res, 405, "Method not allowed");
  }

  if (route === "me") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.VIEW_OWN_LEAVE, {
      feature: "leave_management",
    });
    if (!gate.ok) return gate.response;
    if (req.method !== "GET") return jsonError(res, 405, "Method not allowed");
    return handle(res, () => myLeave(gate.membership.companyId, gate.user.id));
  }

  if (route === "apply") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.VIEW_OWN_LEAVE, {
      feature: "leave_management",
    });
    if (!gate.ok) return gate.response;
    if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");
    return handle(res, () => applyForLeave(gate.membership.companyId, gate.user.id, body));
  }

  if (route === "employees") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.VIEW_TEAM_LEAVE, {
      feature: "leave_management",
    });
    if (!gate.ok) return gate.response;
    if (req.method !== "GET") return jsonError(res, 405, "Method not allowed");
    return handle(res, () => listLeaveEmployees(gate.membership.companyId));
  }

  if (route === "requests") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.VIEW_TEAM_LEAVE, {
      feature: "leave_management",
    });
    if (!gate.ok) return gate.response;
    if (req.method !== "GET") return jsonError(res, 405, "Method not allowed");
    const filters = parseLeaveListFilters(req.query);
    const canFilterTeam = membershipHasPermission(gate.membership, PERMISSIONS.VIEW_TEAM_LEAVE);
    return handle(res, () =>
      listLeaveRequests(gate.membership.companyId, {
        ...filters,
        payroll_profile_id: canFilterTeam ? filters.payroll_profile_id : undefined,
        employee_id: canFilterTeam ? filters.employee_id : undefined,
        user_id: canFilterTeam ? filters.user_id : undefined,
      })
    );
  }

  if (route === "approve" || route === "reject") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.APPROVE_LEAVE, {
      feature: "leave_management",
    });
    if (!gate.ok) return gate.response;
    if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");
    const requestId = parseUuid(id);
    if (!requestId) return jsonError(res, 400, "Invalid leave request id.");
    return handle(res, () =>
      decideLeaveRequest(gate.membership.companyId, gate.user.id, requestId, {
        approve: route === "approve",
        reason: body.reason,
      })
    );
  }

  if (route === "cancel") {
    const own = await requirePayrollPermission(req, res, PERMISSIONS.VIEW_OWN_LEAVE, {
      feature: "leave_management",
    });
    if (!own.ok) return own.response;
    if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");
    const requestId = parseUuid(id);
    if (!requestId) return jsonError(res, 400, "Invalid leave request id.");
    const asAdmin = own.membership.companyRole === "admin" || own.membership.companyRole === "manager";
    return handle(res, () =>
      cancelLeaveRequest(own.membership.companyId, own.user.id, requestId, { asAdmin })
    );
  }

  if (route === "adjust") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.MANAGE_LEAVE, {
      feature: "leave_management",
    });
    if (!gate.ok) return gate.response;
    if (req.method !== "POST") return jsonError(res, 405, "Method not allowed");
    return handle(res, () => adjustLeaveBalance(gate.membership.companyId, gate.user.id, body));
  }

  if (route === "calendar") {
    const gate = await requirePayrollPermission(req, res, PERMISSIONS.VIEW_TEAM_LEAVE, {
      feature: "leave_management",
    });
    if (!gate.ok) return gate.response;
    if (req.method !== "GET") return jsonError(res, 405, "Method not allowed");
    return handle(res, () =>
      leaveCalendar(gate.membership.companyId, { start: req.query?.start, end: req.query?.end })
    );
  }

  return jsonError(res, 404, "Not found");
}

export function resolveLeaveRoute(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const joined = parts.join("/").replace(/^\/+|\/+$/g, "");
  const urlPath = String(req.url || "").split("?")[0] || "";
  const fromUrl = urlPath.replace(/^\/api\/leave\/?/, "").replace(/^\//, "");
  const path = joined || fromUrl.split("?")[0];
  const segs = path.split("/").filter(Boolean);

  if (segs[0] === "types") return { route: "types" };
  if (segs[0] === "me") return { route: "me" };
  if (segs[0] === "apply") return { route: "apply" };
  if (segs[0] === "employees") return { route: "employees" };
  if (segs[0] === "calendar") return { route: "calendar" };
  if (segs[0] === "adjust") return { route: "adjust" };
  if (segs[0] === "requests" && segs[1] && segs[2] === "approve") return { route: "approve", id: segs[1] };
  if (segs[0] === "requests" && segs[1] && segs[2] === "reject") return { route: "reject", id: segs[1] };
  if (segs[0] === "requests" && segs[1] && segs[2] === "cancel") return { route: "cancel", id: segs[1] };
  if (segs[0] === "requests") return { route: "requests" };
  if (segs[0] === "approve") return { route: "approve", id: req.query?.id || segs[1] };
  if (segs[0] === "reject") return { route: "reject", id: req.query?.id || segs[1] };
  if (segs[0] === "cancel") return { route: "cancel", id: req.query?.id || segs[1] };

  if (req.query?.__leave) {
    return resolveLeaveRoute({
      ...req,
      query: { ...req.query, path: String(req.query.__leave).split("/"), __leave: undefined },
    });
  }
  return null;
}
