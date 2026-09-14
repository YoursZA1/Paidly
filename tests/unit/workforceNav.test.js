import { describe, expect, it } from "vitest";
import { buildCompanyAccessContext, PERMISSIONS } from "@/lib/companyPermissions";
import { getWorkforceNavChildren } from "@/lib/workforceNav.js";

function idsFor(partial) {
  const ctx = buildCompanyAccessContext({
    userId: "u1",
    companyId: "o1",
    ...partial,
  });
  return getWorkforceNavChildren((permission) => ctx.permissions.has(permission)).map((row) => row.id);
}

describe("getWorkforceNavChildren", () => {
  it("does not give HR managers a payroll child", () => {
    const ids = idsFor({ companyRole: "manager", jobFunction: "hr" });
    expect(ids).toContain("nav-workforce-employees");
    expect(ids).toContain("nav-workforce-leave");
    expect(ids).not.toContain("nav-workforce-payroll");
    expect(ids).not.toContain("nav-workforce-team");
    const payslips = getWorkforceNavChildren((permission) =>
      buildCompanyAccessContext({
        userId: "u1",
        companyId: "o1",
        companyRole: "manager",
        jobFunction: "hr",
      }).permissions.has(permission)
    ).find((row) => row.id === "nav-workforce-payslips");
    expect(payslips?.url).toBe("/MyPayroll");
  });

  it("gives finance managers payroll and team payslips", () => {
    const ids = idsFor({ companyRole: "manager", jobFunction: "finance" });
    expect(ids).toContain("nav-workforce-payroll");
    expect(ids).toContain("nav-workforce-payslips");
    expect(ids).not.toContain("nav-workforce-employees");
    expect(ids).not.toContain("nav-workforce-team");
  });

  it("gives employees own leave/payslips and no employees directory", () => {
    const ctx = buildCompanyAccessContext({
      userId: "u1",
      companyId: "o1",
      companyRole: "employee",
      jobFunction: "general",
    });
    const children = getWorkforceNavChildren((permission) => ctx.permissions.has(permission));
    const ids = children.map((row) => row.id);
    expect(ids).not.toContain("nav-workforce-employees");
    expect(ids).not.toContain("nav-workforce-payroll");
    expect(ids).not.toContain("nav-workforce-settings");
    const leave = children.find((row) => row.id === "nav-workforce-leave");
    expect(leave?.url).toContain("MyPayroll");
    const payslips = children.find((row) => row.id === "nav-workforce-payslips");
    expect(payslips?.url).toBe("/MyPayroll");
    expect(ctx.permissions.has(PERMISSIONS.MANAGE_PAYROLL)).toBe(false);
  });

  it("gives line managers a My team child, not payroll or the HR directory", () => {
    const ids = idsFor({ companyRole: "manager", jobFunction: "general" });
    expect(ids).toContain("nav-workforce-team");
    expect(ids).not.toContain("nav-workforce-employees");
    expect(ids).not.toContain("nav-workforce-payroll");
  });
});
