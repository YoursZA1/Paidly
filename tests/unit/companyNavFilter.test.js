import { describe, expect, it } from "vitest";
import { filterNavigationForCompanyRole } from "@/lib/companyNavFilter.js";

const NAV = [
  { type: "section", title: "Main", id: "nav-section-main" },
  { id: "nav-dashboard", title: "Dashboard" },
  { id: "nav-invoices", title: "Invoices" },
  { id: "nav-pos", title: "POS" },
  { type: "section", title: "People", id: "nav-section-people" },
  {
    id: "nav-workforce",
    title: "Workforce",
    children: [
      { id: "nav-workforce-overview", title: "Overview" },
      { id: "nav-workforce-payroll", title: "Payroll" },
    ],
  },
  { id: "nav-documents", title: "Documents" },
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

  it("gives employees Workforce children without Settings, POS, or invoices", () => {
    const filtered = filterNavigationForCompanyRole(NAV, {
      companyRole: "employee",
      userId: "u1",
      companyId: "o1",
    });
    const ids = filtered.map((row) => row.id);
    expect(ids).toContain("nav-dashboard");
    expect(ids).toContain("nav-workforce");
    expect(ids).toContain("nav-documents");
    expect(ids).not.toContain("nav-settings");
    expect(ids).not.toContain("nav-pos");
    expect(ids).not.toContain("nav-invoices");
    expect(ids).not.toContain("nav-reports");
    expect(filtered.find((row) => row.id === "nav-workforce")?.children?.map((row) => row.id)).toEqual([
      "nav-workforce-overview",
      "nav-workforce-payroll",
    ]);
  });

  it("does not give line managers invoice Reports", () => {
    const filtered = filterNavigationForCompanyRole(NAV, {
      companyRole: "manager",
      jobFunction: "general",
      userId: "u1",
      companyId: "o1",
    });
    expect(filtered.map((row) => row.id)).not.toContain("nav-reports");
    expect(filtered.map((row) => row.id)).not.toContain("nav-settings");
  });
});
