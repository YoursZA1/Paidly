import { describe, expect, it } from "vitest";
import { buildCompanyAccessContext, PERMISSIONS } from "@/lib/companyPermissions";
import { getWorkforceNavChildren } from "@/lib/workforceNav.js";
import { resolveWorkforceExperience } from "@/lib/workforceExperience.js";

function childrenFor(partial) {
  const ctx = buildCompanyAccessContext({
    userId: "u1",
    companyId: "o1",
    membershipId: "11111111-1111-4111-8111-111111111111",
    ...partial,
  });
  return getWorkforceNavChildren((permission) => ctx.permissions.has(permission), {
    experience: resolveWorkforceExperience(ctx),
    membershipId: ctx.membershipId,
    posEnabled: String(partial.jobFunction || "").toLowerCase() === "pos",
  });
}

function idsFor(partial) {
  return childrenFor(partial).map((row) => row.id);
}

describe("getWorkforceNavChildren", () => {
  it("does not give HR managers a payroll child", () => {
    const ids = idsFor({ companyRole: "manager", jobFunction: "hr" });
    expect(ids).toContain("nav-workforce-employees");
    expect(ids).toContain("nav-workforce-leave");
    expect(ids).not.toContain("nav-workforce-payroll");
    expect(ids).not.toContain("nav-workforce-team");
    expect(ids).not.toContain("nav-workforce-settings");
    const payslips = childrenFor({ companyRole: "manager", jobFunction: "hr" }).find(
      (row) => row.id === "nav-workforce-payslips"
    );
    expect(payslips?.url).toBe("/MyPayroll");
  });

  it("gives finance managers payroll and team payslips without HR directory", () => {
    const ids = idsFor({ companyRole: "manager", jobFunction: "finance" });
    expect(ids).toContain("nav-workforce-payroll");
    expect(ids).toContain("nav-workforce-payslips");
    expect(ids).toContain("nav-workforce-reports");
    expect(ids).not.toContain("nav-workforce-employees");
    expect(ids).not.toContain("nav-workforce-leave");
    expect(ids).not.toContain("nav-workforce-team");
  });

  it("gives employees a self-service nav without HR children", () => {
    const ctx = buildCompanyAccessContext({
      userId: "u1",
      companyId: "o1",
      membershipId: "11111111-1111-4111-8111-111111111111",
      companyRole: "employee",
      jobFunction: "general",
    });
    const children = childrenFor({ companyRole: "employee", jobFunction: "general" });
    const ids = children.map((row) => row.id);
    expect(ids).toEqual([
      "nav-workforce-overview",
      "nav-workforce-leave",
      "nav-workforce-payslips",
      "nav-workforce-profile",
    ]);
    expect(ids).not.toContain("nav-workforce-employees");
    expect(ids).not.toContain("nav-workforce-payroll");
    expect(ids).not.toContain("nav-workforce-settings");
    expect(ids).not.toContain("nav-workforce-attendance");
    expect(ids).not.toContain("nav-workforce-reports");
    const leave = children.find((row) => row.id === "nav-workforce-leave");
    expect(leave?.url).toContain("MyPayroll");
    const payslips = children.find((row) => row.id === "nav-workforce-payslips");
    expect(payslips?.url).toContain("MyPayroll");
    expect(ctx.permissions.has(PERMISSIONS.MANAGE_PAYROLL)).toBe(false);
  });

  it("gives line managers a portal-only nav", () => {
    const ids = idsFor({ companyRole: "manager", jobFunction: "general" });
    expect(ids).toEqual([
      "nav-workforce-overview",
      "nav-workforce-team",
      "nav-workforce-leave",
      "nav-workforce-calendar",
      "nav-workforce-me",
    ]);
    expect(ids).not.toContain("nav-workforce-employees");
    expect(ids).not.toContain("nav-workforce-payroll");
    expect(ids).not.toContain("nav-workforce-settings");
    expect(ids).not.toContain("nav-workforce-attendance");
    expect(ids).not.toContain("nav-workforce-reports");
  });

  it("gives POS staff the employee portal plus a POS child", () => {
    const ids = idsFor({ companyRole: "employee", jobFunction: "pos" });
    expect(ids).toEqual([
      "nav-workforce-overview",
      "nav-workforce-leave",
      "nav-workforce-payslips",
      "nav-workforce-profile",
      "nav-workforce-pos",
    ]);
  });

  it("keeps company Settings on the main sidebar, not nested under Workforce", () => {
    const ids = idsFor({ companyRole: "admin" });
    expect(ids).toContain("nav-workforce-employees");
    expect(ids).not.toContain("nav-workforce-settings");
  });
});
