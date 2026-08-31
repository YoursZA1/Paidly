import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/companyPermissions";
import {
  applyPosNavVisibility,
  canShowPosNav,
  isPosTerminalPage,
  matchesPosNavQuery,
} from "@/lib/posNavAccess";
import {
  COMPANY_WORKSPACE_NAV,
  filterCompanyWorkspaceNav,
  getCompanyWorkspaceSections,
} from "@/lib/companyDashboardNav";
import { filterNavigationForCompanyRole } from "@/lib/companyNavFilter";

describe("canShowPosNav", () => {
  it("treats POS as a dedicated till page name", () => {
    expect(isPosTerminalPage("POS")).toBe(true);
    expect(isPosTerminalPage("Dashboard")).toBe(false);
  });

  it("hides POS when the org did not opt into a till", () => {
    expect(
      canShowPosNav({
        hasPosCapability: false,
        hasPosEntitlement: true,
        hasPosAccess: true,
        isOrgOwner: true,
      })
    ).toBe(false);
  });

  it("hides POS when the plan does not include pos", () => {
    expect(
      canShowPosNav({
        hasPosCapability: true,
        hasPosEntitlement: false,
        hasPosAccess: true,
        isOrgOwner: true,
      })
    ).toBe(false);
  });

  it("hides POS for company members without pos_access", () => {
    expect(
      canShowPosNav({
        hasPosCapability: true,
        hasPosEntitlement: true,
        hasPosAccess: false,
        isOrgOwner: false,
        isCompanyMember: true,
      })
    ).toBe(false);
  });

  it("shows POS for owners and solo users with pos entitlement and POS opted in", () => {
    expect(
      canShowPosNav({
        hasPosCapability: true,
        hasPosEntitlement: true,
        hasPosAccess: false,
        isOrgOwner: true,
        isCompanyMember: false,
      })
    ).toBe(true);
    expect(
      canShowPosNav({
        hasPosCapability: true,
        hasPosEntitlement: true,
        hasPosAccess: false,
        isOrgOwner: false,
        isCompanyMember: false,
      })
    ).toBe(true);
  });

  it("shows POS for members with pos entitlement, capability, and pos_access", () => {
    expect(
      canShowPosNav({
        hasPosCapability: true,
        hasPosEntitlement: true,
        hasPosAccess: true,
        isOrgOwner: false,
        isCompanyMember: true,
      })
    ).toBe(true);
  });
});

describe("applyPosNavVisibility", () => {
  const items = [
    { id: "nav-dashboard", title: "Dashboard" },
    { id: "nav-pos", title: "POS" },
    { id: "nav-invoices", title: "Invoices" },
  ];

  it("keeps the POS item when access is allowed", () => {
    const next = applyPosNavVisibility(items, {
      hasPosCapability: true,
      hasPosEntitlement: true,
      hasPosAccess: true,
      isCompanyMember: true,
    });
    expect(next.map((row) => row.id)).toContain("nav-pos");
  });

  it("drops the POS item when pos entitlement is off (no upgrade teaser)", () => {
    const next = applyPosNavVisibility(items, {
      hasPosEntitlement: false,
      hasPosAccess: true,
      isOrgOwner: true,
    });
    expect(next.map((row) => row.id)).not.toContain("nav-pos");
  });
});

describe("matchesPosNavQuery", () => {
  it("matches till shortcuts from two characters", () => {
    expect(matchesPosNavQuery("po")).toBe(true);
    expect(matchesPosNavQuery("POS")).toBe(true);
    expect(matchesPosNavQuery("till")).toBe(true);
    expect(matchesPosNavQuery("checkout")).toBe(true);
  });

  it("does not match unrelated queries", () => {
    expect(matchesPosNavQuery("p")).toBe(false);
    expect(matchesPosNavQuery("invoice")).toBe(false);
    expect(matchesPosNavQuery("")).toBe(false);
  });
});

describe("company workspace POS entry", () => {
  const allow = (permission) => permission === PERMISSIONS.POS_ACCESS || permission.startsWith("view_own");

  it("includes POS when the member has pos_access and pos entitlement", () => {
    const items = filterCompanyWorkspaceNav(allow, { hasFeature: () => true });
    expect(items.map((row) => row.id)).toContain("company-nav-pos");
    const sections = getCompanyWorkspaceSections(allow, { hasFeature: () => true });
    const me = sections.find((group) => group.section === "Me");
    expect(me.items[0].id).toBe("company-nav-pos");
  });

  it("omits POS when pos is not on the plan", () => {
    const items = filterCompanyWorkspaceNav(allow, { hasFeature: () => false });
    expect(items.map((row) => row.id)).not.toContain("company-nav-pos");
  });

  it("keeps POS in the workspace catalog", () => {
    expect(COMPANY_WORKSPACE_NAV.some((item) => item.id === "company-nav-pos")).toBe(true);
  });
});

describe("role filter then plan visibility", () => {
  it("lets employees keep nav-pos from RBAC, then plan gate can hide it", () => {
    const items = [
      { id: "nav-dashboard", title: "Dashboard" },
      { id: "nav-pos", title: "POS" },
      { id: "nav-invoices", title: "Invoices" },
    ];
    const employee = filterNavigationForCompanyRole(items, {
      companyRole: "employee",
      userId: "u1",
      companyId: "o1",
    });
    expect(employee.map((row) => row.id)).toContain("nav-pos");
    const hidden = applyPosNavVisibility(employee, {
      hasPosEntitlement: false,
      hasPosAccess: true,
      isCompanyMember: true,
    });
    expect(hidden.map((row) => row.id)).not.toContain("nav-pos");
  });
});
