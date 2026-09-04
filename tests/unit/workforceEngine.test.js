import { describe, it, expect } from "vitest";
import { membershipHasPermission, PERMISSIONS } from "../../server/src/companyRouteAccess.js";
import { membershipGrantsPermission } from "../../shared/posStaffInvite.js";
import {
  jobFunctionExtraPermissions,
  membershipCreatedIdempotencyKey,
  resolvePermissionAlias,
  WORKFORCE_EVENT_TYPES,
} from "../../shared/workforcePermissions.js";
import { resolveWorkforceRoute } from "../../server/src/workforce/workforceRoutes.js";

describe("workforce permissions", () => {
  it("maps spec aliases onto the existing matrix", () => {
    expect(resolvePermissionAlias("employees.create")).toBe("manage_employees");
    expect(resolvePermissionAlias("leave.approve")).toBe("approve_leave");
    expect(resolvePermissionAlias("manage_payroll")).toBe("manage_payroll");
  });

  it("gives HR managers employee and leave admin grants", () => {
    expect(jobFunctionExtraPermissions("hr", "manager")).toEqual(
      expect.arrayContaining(["manage_employees", "manage_leave", "approve_leave"])
    );
    const hr = { companyRole: "manager", jobFunction: "hr" };
    expect(membershipHasPermission(hr, PERMISSIONS.MANAGE_EMPLOYEES)).toBe(true);
    expect(membershipHasPermission(hr, PERMISSIONS.MANAGE_PAYROLL)).toBe(false);
  });

  it("gives finance managers payroll grants", () => {
    const finance = { companyRole: "manager", jobFunction: "finance" };
    expect(membershipHasPermission(finance, PERMISSIONS.MANAGE_PAYROLL)).toBe(true);
    expect(membershipHasPermission(finance, PERMISSIONS.MANAGE_EMPLOYEES)).toBe(false);
  });

  it("does not let employees escalate via job_function", () => {
    const employeeHr = { companyRole: "employee", jobFunction: "hr" };
    expect(membershipHasPermission(employeeHr, PERMISSIONS.MANAGE_EMPLOYEES)).toBe(false);
    expect(membershipHasPermission(employeeHr, PERMISSIONS.VIEW_OWN_LEAVE)).toBe(true);
  });

  it("keeps POS-only staff off workforce permissions", () => {
    const cashier = { companyRole: "employee", jobFunction: "pos" };
    expect(membershipHasPermission(cashier, PERMISSIONS.MANAGE_EMPLOYEES)).toBe(false);
    expect(membershipHasPermission(cashier, PERMISSIONS.VIEW_OWN_PAYSLIPS)).toBe(false);
    expect(membershipGrantsPermission(cashier, "pos_sell", () => true)).toBe(true);
  });
});

describe("workforce events", () => {
  it("uses a stable idempotency key per membership", () => {
    expect(membershipCreatedIdempotencyKey("abc")).toBe("membership:abc:created");
    expect(WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED).toBe("employee.created");
  });
});

describe("workforce routes", () => {
  it("resolves /api/company/employees without a new Vercel function", () => {
    expect(resolveWorkforceRoute({ query: { path: ["employees"] }, url: "/api/company/employees" })).toEqual({
      route: "employees",
    });
    expect(resolveWorkforceRoute({ query: { path: ["invite"] }, url: "/api/company/invite" })).toBe(null);
  });
});
