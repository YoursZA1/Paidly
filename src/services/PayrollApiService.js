import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";

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
  saveType: (payload) => payrollRequest("/api/leave/types", { method: "POST", body: payload }),
  employees: () => payrollRequest("/api/leave/employees"),
  me: () => payrollRequest("/api/leave/me"),
  apply: (payload) => payrollRequest("/api/leave/apply", { method: "POST", body: payload }),
  requests: (params = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.user_id) q.set("user_id", params.user_id);
    if (params.leave_type_id) q.set("leave_type_id", params.leave_type_id);
    if (params.department) q.set("department", params.department);
    const qs = q.toString();
    return payrollRequest(`/api/leave/requests${qs ? `?${qs}` : ""}`);
  },
  approve: (id) => payrollRequest(`/api/leave/requests/${id}/approve`, { method: "POST", body: {} }),
  reject: (id, reason) =>
    payrollRequest(`/api/leave/requests/${id}/reject`, { method: "POST", body: { reason } }),
  cancel: (id) => payrollRequest(`/api/leave/requests/${id}/cancel`, { method: "POST", body: {} }),
  adjust: (payload) => payrollRequest("/api/leave/adjust", { method: "POST", body: payload }),
  calendar: (start, end) =>
    payrollRequest(`/api/leave/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
};
