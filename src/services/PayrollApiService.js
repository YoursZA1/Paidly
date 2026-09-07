import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { looksLikeEmployeeDisplayLabel, parseUuid } from "@shared/ids/uuid.js";

function requireRecordUuid(value, fieldName) {
  const id = parseUuid(value);
  if (id) return id;
  if (looksLikeEmployeeDisplayLabel(value)) {
    throw new Error(`${fieldName} must be a UUID, not a display name or employee number.`);
  }
  throw new Error(`Invalid ${fieldName}.`);
}

async function authHeaders() {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function apiBase() {
  return import.meta.env.DEV ? "" : getBackendBaseUrl();
}

async function payrollRequest(path, { method = "GET", body } = {}) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text().catch(() => "");
  let json = {};
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = {};
    }
  }
  if (!res.ok) {
    const err = new Error(json.error || json.message || res.statusText || "Request failed");
    err.status = res.status;
    err.details = json.details;
    throw err;
  }
  return json.data;
}

export const payrollApi = {
  overview: () => payrollRequest("/api/payroll/overview"),
  profiles: () => payrollRequest("/api/payroll/profiles"),
  saveProfile: (payload) => payrollRequest("/api/payroll/profiles", { method: "POST", body: payload }),
  preview: (payload) => payrollRequest("/api/payroll/preview", { method: "POST", body: payload }),
  runs: () => payrollRequest("/api/payroll/runs"),
  createRun: (payload) => payrollRequest("/api/payroll/runs", { method: "POST", body: payload }),
  getRun: (id) => payrollRequest(`/api/payroll/runs/${id}`),
  calculateRun: (id, payload) =>
    payrollRequest(`/api/payroll/runs/${id}/calculate`, { method: "POST", body: payload || {} }),
  submitRun: (id) => payrollRequest(`/api/payroll/runs/${id}/submit`, { method: "POST", body: {} }),
  approveRun: (id) => payrollRequest(`/api/payroll/runs/${id}/approve`, { method: "POST", body: {} }),
  finalizeRun: (id) => payrollRequest(`/api/payroll/runs/${id}/finalize`, { method: "POST", body: {} }),
  markPaid: (id) => payrollRequest(`/api/payroll/runs/${id}/paid`, { method: "POST", body: {} }),
  cancelRun: (id) => payrollRequest(`/api/payroll/runs/${id}/cancel`, { method: "POST", body: {} }),
  sendPayslips: (id) => payrollRequest(`/api/payroll/runs/${id}/send`, { method: "POST", body: {} }),
  statutory: () => payrollRequest("/api/payroll/statutory"),
  saveStatutory: (payload) => payrollRequest("/api/payroll/statutory", { method: "POST", body: payload }),
  me: () => payrollRequest("/api/payroll/me"),
};

export const leaveApi = {
  types: () => payrollRequest("/api/leave/types"),
  saveType: (payload) =>
    payrollRequest("/api/leave/types", {
      method: "POST",
      body: {
        ...payload,
        id: payload?.id ? requireRecordUuid(payload.id, "leave type id") : undefined,
      },
    }),
  employees: () => payrollRequest("/api/leave/employees"),
  me: () => payrollRequest("/api/leave/me"),
  apply: (payload) =>
    payrollRequest("/api/leave/apply", {
      method: "POST",
      body: {
        ...payload,
        leave_type_id: requireRecordUuid(payload?.leave_type_id, "leave type id"),
      },
    }),
  requests: (params = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    const employeeId = parseUuid(params.employee_id);
    if (employeeId) q.set("employee_id", employeeId);
    const profileId = parseUuid(params.payroll_profile_id);
    if (profileId) q.set("payroll_profile_id", profileId);
    const userId = parseUuid(params.user_id);
    if (userId) q.set("user_id", userId);
    const leaveTypeId = parseUuid(params.leave_type_id);
    if (leaveTypeId) q.set("leave_type_id", leaveTypeId);
    if (params.department) q.set("department", params.department);
    const qs = q.toString();
    return payrollRequest(`/api/leave/requests${qs ? `?${qs}` : ""}`);
  },
  approve: (id) =>
    payrollRequest(`/api/leave/requests/${requireRecordUuid(id, "leave request id")}/approve`, {
      method: "POST",
      body: {},
    }),
  reject: (id, reason) =>
    payrollRequest(`/api/leave/requests/${requireRecordUuid(id, "leave request id")}/reject`, {
      method: "POST",
      body: { reason },
    }),
  cancel: (id) =>
    payrollRequest(`/api/leave/requests/${requireRecordUuid(id, "leave request id")}/cancel`, {
      method: "POST",
      body: {},
    }),
  adjust: (payload) => {
    const employeeId = parseUuid(payload?.employee_id);
    const profileId = parseUuid(payload?.payroll_profile_id);
    if (!employeeId && !profileId) {
      throw new Error("employee id must be a UUID, not a display name or employee number.");
    }
    return payrollRequest("/api/leave/adjust", {
      method: "POST",
      body: {
        ...payload,
        employee_id: employeeId || undefined,
        payroll_profile_id: profileId || undefined,
        leave_type_id: requireRecordUuid(payload?.leave_type_id, "leave type id"),
      },
    });
  },
  calendar: (start, end) =>
    payrollRequest(`/api/leave/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
};
