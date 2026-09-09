import { payrollRequest } from "./PayrollApiService";
import { parseUuid, requireUuid } from "@shared/ids/uuid.js";

export const workforceApi = {
  list: () => payrollRequest("/api/company/employees"),
  get: (id) =>
    payrollRequest(`/api/company/employees?id=${encodeURIComponent(requireUuid(id, "employee id"))}`),
  profile: (id) =>
    payrollRequest(
      `/api/company/employees?id=${encodeURIComponent(requireUuid(id, "employee id"))}&include=profile`
    ),
  summary: () => payrollRequest("/api/company/workforce-summary"),
  update: (id, payload) =>
    payrollRequest("/api/company/employees", {
      method: "PATCH",
      body: { ...payload, id: requireUuid(id, "employee id") },
    }),
};

export function employeeProfilePath(id) {
  const uuid = parseUuid(id);
  return uuid ? `/employees/${uuid}` : "/Employees";
}
