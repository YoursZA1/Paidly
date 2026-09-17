import { describe, expect, it } from "vitest";
import { filterNavigationForCompanyRole } from "@/lib/companyNavFilter.js";

const NAV = [
  { type: "section", title: "Main", id: "nav-section-main" },
  { id: "nav-dashboard", title: "Dashboard" },
  { id: "nav-invoices", title: "Invoices" },
  { id: "nav-pos", title: "POS" },
  { type: "section", title: "Workforce", id: "nav-section-workforce" },
  { id: "nav-workforce-overview", title: "Overview" },
  { id: "nav-workforce-payroll", title: "Payroll" },
  { id: "nav-documents", title: "Documents" },
  { id: "nav-calendar", title: "Calendar" },
  { id: "nav-messages", title: "Messages" },
  { type: "section", title: "Finance", id: "nav-section-finance" },
  { id: "nav-reports", title: "Reports" },
  { type: "section", title: "Settings", id: "nav-section-settings" },
  { id: "nav-settings", title: "Settings" },
];

describe("filterNavigationForCompanyRole", () => {
  it("keeps org owners on the full nav", () => {
    const filtered = filterNavigationForCompanyRole(NAV, {
      companyRole: "admin",
      isOrgOwner: true,
      userId: "u1",
      companyId: "o1",
    });
    expect(filtered).toEqual(NAV);
  });

  it("gives employees Workforce only", () => {
    const filtered = filterNavigationForCompanyRole(NAV, {
      companyRole: "employee",
      userId: "u1",
      companyId: "o1",
    });
    const ids = filtered.map((row) => row.id);
    expect(ids).toContain("nav-section-workforce");
    expect(ids).toContain("nav-workforce-overview");
    expect(ids).toContain("nav-workforce-payroll");
    expect(ids).not.toContain("nav-dashboard");
    expect(ids).not.toContain("nav-documents");
    expect(ids).not.toContain("nav-settings");
    expect(ids).not.toContain("nav-pos");
    expect(ids).not.toContain("nav-invoices");
    expect(ids).not.toContain("nav-reports");
  });

  it("gives line managers Workforce only, without calendar or messages", () => {
    const filtered = filterNavigationForCompanyRole(NAV, {
      companyRole: "manager",
      jobFunction: "general",
      userId: "u1",
      companyId: "o1",
    });
    const ids = filtered.map((row) => row.id);
    expect(ids).toContain("nav-section-workforce");
    expect(ids).toContain("nav-workforce-overview");
    expect(ids).not.toContain("nav-dashboard");
    expect(ids).not.toContain("nav-documents");
    expect(ids).not.toContain("nav-calendar");
    expect(ids).not.toContain("nav-messages");
    expect(ids).not.toContain("nav-reports");
    expect(ids).not.toContain("nav-settings");
  });

  it("gives HR admins Workforce and Settings", () => {
    const filtered = filterNavigationForCompanyRole(NAV, {
      companyRole: "admin",
      isOrgOwner: false,
      userId: "u1",
      companyId: "o1",
    });
    const ids = filtered.map((row) => row.id);
    expect(ids).toContain("nav-section-workforce");
    expect(ids).toContain("nav-workforce-overview");
    expect(ids).toContain("nav-settings");
    expect(ids).not.toContain("nav-invoices");
    expect(ids).not.toContain("nav-dashboard");
  });
});
