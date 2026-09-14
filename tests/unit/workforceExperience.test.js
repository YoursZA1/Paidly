import { describe, expect, it } from "vitest";
import { buildCompanyAccessContext, PERMISSIONS } from "@/lib/companyPermissions";
import {
  WORKFORCE_EXPERIENCES,
  isWorkforceGenericHomePath,
  resolveWorkforceExperience,
  resolveWorkforceHomePath,
} from "@/lib/workforceExperience.js";
import { resolveCompanyHomePath, resolvePostLoginPath } from "@/lib/postAuthNavigation.js";
import { createPageUrl } from "@/utils";

function ctx(partial) {
  return buildCompanyAccessContext({
    userId: "u1",
    companyId: "o1",
    ...partial,
  });
}

describe("resolveWorkforceExperience", () => {
  it("sends POS-only staff to the till experience", () => {
    expect(
      resolveWorkforceExperience(ctx({ companyRole: "employee", jobFunction: "pos" }))
    ).toBe(WORKFORCE_EXPERIENCES.POS_ONLY);
    expect(
      resolveWorkforceHomePath(ctx({ companyRole: "employee", jobFunction: "pos" }))
    ).toBe(createPageUrl("POS"));
  });

  it("keeps org owners on the business dashboard", () => {
    const owner = ctx({ companyRole: "owner", membershipRole: "owner" });
    expect(owner.isOrgOwner).toBe(true);
    expect(resolveWorkforceExperience(owner)).toBe(WORKFORCE_EXPERIENCES.OWNER);
    expect(resolveWorkforceHomePath(owner)).toBe(createPageUrl("Dashboard"));
  });

  it("sends company admin and HR managers to Workforce, not payroll by default", () => {
    expect(resolveWorkforceExperience(ctx({ companyRole: "admin" }))).toBe(WORKFORCE_EXPERIENCES.HR);
    expect(
      resolveWorkforceExperience(ctx({ companyRole: "manager", jobFunction: "hr" }))
    ).toBe(WORKFORCE_EXPERIENCES.HR);
    expect(resolveWorkforceHomePath(ctx({ companyRole: "admin" }))).toBe(createPageUrl("Workforce"));
    expect(
      ctx({ companyRole: "manager", jobFunction: "hr" }).permissions.has(PERMISSIONS.MANAGE_PAYROLL)
    ).toBe(false);
  });

  it("sends finance managers to payroll home", () => {
    const finance = ctx({ companyRole: "manager", jobFunction: "finance" });
    expect(resolveWorkforceExperience(finance)).toBe(WORKFORCE_EXPERIENCES.FINANCE);
    expect(resolveWorkforceHomePath(finance)).toBe(createPageUrl("Workforce/payroll"));
    expect(finance.permissions.has(PERMISSIONS.MANAGE_PAYROLL)).toBe(true);
  });

  it("sends line managers to the manager portal, not the owner dashboard", () => {
    const manager = ctx({ companyRole: "manager", jobFunction: "general" });
    expect(resolveWorkforceExperience(manager)).toBe(WORKFORCE_EXPERIENCES.MANAGER);
    expect(resolveWorkforceHomePath(manager)).toBe(createPageUrl("Workforce/manager"));
    expect(resolveCompanyHomePath(manager)).not.toBe(createPageUrl("Dashboard"));
  });

  it("sends employees to the Workforce portal", () => {
    const employee = ctx({ companyRole: "employee", jobFunction: "general" });
    expect(resolveWorkforceExperience(employee)).toBe(WORKFORCE_EXPERIENCES.EMPLOYEE);
    expect(resolveWorkforceHomePath(employee)).toBe(createPageUrl("Workforce"));
    expect(resolveCompanyHomePath(employee)).toBe(createPageUrl("Workforce"));
  });

  it("uses companyCtx after login so managers do not land on the owner dashboard", () => {
    const manager = ctx({ companyRole: "manager", jobFunction: "general" });
    const hr = ctx({ companyRole: "manager", jobFunction: "hr" });
    const finance = ctx({ companyRole: "manager", jobFunction: "finance" });
    expect(resolvePostLoginPath({}, "/Dashboard", manager)).toBe(createPageUrl("Workforce/manager"));
    expect(resolvePostLoginPath({}, "/Dashboard", hr)).toBe(createPageUrl("Workforce"));
    expect(resolvePostLoginPath({}, "/Dashboard", finance)).toBe(createPageUrl("Workforce/payroll"));
  });
});

describe("isWorkforceGenericHomePath", () => {
  it("treats dashboard aliases as bounce-from homes", () => {
    expect(isWorkforceGenericHomePath("/Dashboard")).toBe(true);
    expect(isWorkforceGenericHomePath("/employee-dashboard")).toBe(true);
    expect(isWorkforceGenericHomePath("/Invoices")).toBe(false);
  });
});
