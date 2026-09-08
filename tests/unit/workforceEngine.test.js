import { describe, it, expect } from "vitest";
import { membershipHasPermission, PERMISSIONS, assertCompanyRecordAccess } from "../../server/src/companyRouteAccess.js";
import { membershipGrantsPermission } from "../../shared/posStaffInvite.js";
import {
  jobFunctionExtraPermissions,
  membershipCreatedIdempotencyKey,
  resolvePermissionAlias,
  WORKFORCE_EVENT_TYPES,
} from "../../shared/workforcePermissions.js";
import { resolveWorkforceRoute } from "../../server/src/workforce/workforceRoutes.js";
import {
  sanitizeEmployeeWritePayload,
  scopedEmployeeListFilters,
} from "../../shared/workforce/employeeWrite.js";
import { scopedLeaveListFilters } from "../../shared/leave/leaveIds.js";
import { assertOwnEmployee, assertSameOrg } from "../../server/src/workforce/workforceAuth.js";
import { invitePublicErrorMessage } from "../../shared/companyInviteMessages.js";

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

  it("covers the role matrix for employees, managers, and admins", () => {
    const employee = { companyRole: "employee", jobFunction: "general" };
    const manager = { companyRole: "manager", jobFunction: "general" };
    const admin = { companyRole: "admin", jobFunction: "general" };
    expect(membershipHasPermission(employee, PERMISSIONS.VIEW_OWN_LEAVE)).toBe(true);
    expect(membershipHasPermission(employee, PERMISSIONS.VIEW_TEAM_LEAVE)).toBe(false);
    expect(membershipHasPermission(manager, PERMISSIONS.VIEW_TEAM_LEAVE)).toBe(true);
    expect(membershipHasPermission(manager, PERMISSIONS.MANAGE_PAYROLL)).toBe(false);
    expect(membershipHasPermission(admin, PERMISSIONS.MANAGE_PAYROLL)).toBe(true);
    expect(membershipHasPermission(admin, PERMISSIONS.MANAGE_EMPLOYEES)).toBe(true);
    expect(membershipHasPermission(admin, PERMISSIONS.VIEW_AUDIT_LOGS)).toBe(true);
  });
});

describe("workforce events", () => {
  it("uses a stable idempotency key per membership", () => {
    expect(membershipCreatedIdempotencyKey("abc")).toBe("membership:abc:created");
    expect(WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED).toBe("employee.created");
    expect(WORKFORCE_EVENT_TYPES.PAYROLL_PROCESSED).toBe("payroll.processed");
    expect(WORKFORCE_EVENT_TYPES.LEAVE_APPLIED).toBe("leave.applied");
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

describe("workforce write sanitization and IDOR", () => {
  it("strips client org, user, and permission fields", () => {
    expect(
      sanitizeEmployeeWritePayload({
        email: "a@b.co",
        org_id: "forged-org",
        company_id: "forged-company",
        user_id: "forged-user",
        permissions: ["manage_payroll"],
        department: "Ops",
      })
    ).toEqual({ email: "a@b.co", department: "Ops" });
  });

  it("ignores teammate identifiers unless the actor can view the team", () => {
    const filters = {
      user_id: "11111111-1111-4111-8111-111111111111",
      membership_id: "22222222-2222-4222-8222-222222222222",
      employee_id: "33333333-3333-4333-8333-333333333333",
    };
    expect(scopedEmployeeListFilters(filters, false).user_id).toBeUndefined();
    expect(scopedEmployeeListFilters(filters, true).user_id).toBe(filters.user_id);
    expect(scopedLeaveListFilters({ user_id: filters.user_id, status: "pending" }, false).user_id).toBeUndefined();
    expect(scopedLeaveListFilters({ user_id: filters.user_id, status: "pending" }, true).user_id).toBe(filters.user_id);
  });

  it("rejects cross-org and cross-employee access", () => {
    expect(() => assertSameOrg({ companyId: "org-a" }, { org_id: "org-b" })).toThrow(/company/i);
    expect(() =>
      assertOwnEmployee({ userId: "user-a", id: "mem-a" }, { id: "mem-b", user_id: "user-b" }, { canViewTeam: false })
    ).toThrow(/not authorized/i);
    expect(
      assertOwnEmployee({ userId: "user-a", id: "mem-a" }, { id: "mem-a", user_id: "user-a" }, { canViewTeam: false })
    ).toBe(true);
    const admin = { companyId: "org-a", userId: "admin", companyRole: "admin" };
    expect(assertCompanyRecordAccess(admin, { org_id: "org-a", user_id: "other" }, { selfOnly: true })).toBe(true);
    const employee = { companyId: "org-a", userId: "user-a", companyRole: "employee", id: "mem-a" };
    expect(() =>
      assertCompanyRecordAccess(employee, { org_id: "org-a", user_id: "user-b", membership_id: "mem-b" }, { selfOnly: true })
    ).toThrow(/not authorized/i);
    expect(assertCompanyRecordAccess(employee, { org_id: "org-a", membership_id: "mem-a" }, { selfOnly: true })).toBe(true);
  });
});

describe("workforce invite security copy", () => {
  it("rejects expired, reused, revoked, and wrong-org style accept errors", () => {
    expect(invitePublicErrorMessage("expired")).toMatch(/expired/i);
    expect(invitePublicErrorMessage("revoked")).toMatch(/revoked/i);
    expect(invitePublicErrorMessage("not_pending", "accepted")).toMatch(/already been accepted/i);
    expect(invitePublicErrorMessage("email_mismatch")).toMatch(/email/i);
  });
});
