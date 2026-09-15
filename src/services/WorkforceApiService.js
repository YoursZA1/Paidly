import { payrollRequest } from "./PayrollApiService";
import { parseUuid, requireUuid } from "@shared/ids/uuid.js";
import { normalizeEmployeeList } from "@shared/workforce/directory.js";

export { normalizeEmployeeList };

function listQuery(params = {}) {
  const q = new URLSearchParams();
  const entries = {
    q: params.q || params.search,
    department: params.department,
    status: params.status,
    manager_id: params.managerId || params.manager_id,
    job_title: params.jobTitle || params.job_title,
    leave_status: params.leaveStatus || params.leave_status,
    attention: params.attention ? "1" : "",
    sort: params.sort,
    limit: params.limit,
    offset: params.offset,
    include: params.include,
    page_all: params.pageAll ? "1" : "",
    eligible_managers: params.eligibleManagers ? "1" : "",
    exclude_id: params.excludeId,
  };
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null || value === "") continue;
    q.set(key, String(value));
  }
  const qs = q.toString();
  return qs ? `/api/company/employees?${qs}` : "/api/company/employees";
}

export const workforceApi = {
  list: async (params) => normalizeEmployeeList(await payrollRequest(listQuery(params))),
  managers: (opts = {}) =>
    payrollRequest(listQuery({ eligibleManagers: true, excludeId: opts.excludeId })),
  get: (id) =>
    payrollRequest(`/api/company/employees?id=${encodeURIComponent(requireUuid(id, "employee id"))}`),
  profile: (id) =>
    payrollRequest(
      `/api/company/employees?id=${encodeURIComponent(requireUuid(id, "employee id"))}&include=profile`
    ),
  sections: (id, sections) =>
    payrollRequest(
      `/api/company/employees?id=${encodeURIComponent(requireUuid(id, "employee id"))}&sections=${encodeURIComponent(sections)}`
    ),
  summary: () => payrollRequest("/api/company/workforce-summary"),
  update: (id, payload) =>
    payrollRequest("/api/company/employees", {
      method: "PATCH",
      body: { ...payload, id: requireUuid(id, "employee id") },
    }),
  activate: (id) =>
    payrollRequest("/api/company/employees", {
      method: "PATCH",
      body: { id: requireUuid(id, "employee id"), action: "activate" },
    }),
  deactivate: (id) =>
    payrollRequest("/api/company/employees", {
      method: "PATCH",
      body: { id: requireUuid(id, "employee id"), action: "deactivate" },
    }),
  reassignReports: (fromManagerId, toManagerId) =>
    payrollRequest("/api/company/employees", {
      method: "PATCH",
      body: {
        action: "reassign_reports",
        from_manager_id: requireUuid(fromManagerId, "from manager id"),
        manager_membership_id: requireUuid(toManagerId, "manager id"),
      },
    }),
};

export function employeeProfilePath(id, tab) {
  const uuid = parseUuid(id);
  if (!uuid) return "/Employees";
  return tab ? `/employees/${uuid}?tab=${encodeURIComponent(tab)}` : `/employees/${uuid}`;
}
