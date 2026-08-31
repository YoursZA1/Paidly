import { describe, expect, it } from "vitest";
import {
  appendPosInviteNext,
  isPosInviteDest,
  isPosOnlyStaff,
  POS_INVITE_NEXT,
  POS_JOB_FUNCTION,
} from "@shared/posStaffInvite.js";
import { normalizeJobFunction } from "@/lib/companyPermissions";
import { formatCompanyMemberRoleLabel } from "@/lib/companyJobFunctions";
import { filterNavigationForCompanyRole } from "@/lib/companyNavFilter";
import { normalizeJobFunction as serverNormalizeJobFunction } from "../../server/src/companyRouteAccess.js";

const NAV = [
  { id: "nav-dashboard", title: "Dashboard" },
  { id: "nav-pos", title: "POS" },
  { id: "nav-invoices", title: "Invoices" },
  { id: "nav-payslips", title: "Payslips" },
  { id: "nav-settings", title: "Settings" },
];

describe("POS-only staff invite", () => {
  it("normalizes cashier/till aliases to pos on client and server", () => {
    expect(normalizeJobFunction("pos")).toBe(POS_JOB_FUNCTION);
    expect(normalizeJobFunction("cashier")).toBe(POS_JOB_FUNCTION);
    expect(normalizeJobFunction("till")).toBe(POS_JOB_FUNCTION);
    expect(serverNormalizeJobFunction("cashier")).toBe(POS_JOB_FUNCTION);
    expect(normalizeJobFunction("sales")).toBe("sales");
  });

  it("treats employee + pos job function as till-only (not a second login)", () => {
    expect(
      isPosOnlyStaff({ companyRole: "employee", jobFunction: "pos", isOrgOwner: false })
    ).toBe(true);
    expect(
      isPosOnlyStaff({ companyRole: "employee", jobFunction: "cashier", isOrgOwner: false })
    ).toBe(true);
    expect(
      isPosOnlyStaff({ companyRole: "manager", jobFunction: "pos", isOrgOwner: false })
    ).toBe(false);
    expect(
      isPosOnlyStaff({ companyRole: "employee", jobFunction: "pos", isOrgOwner: true })
    ).toBe(false);
    expect(
      isPosOnlyStaff({ companyRole: "employee", jobFunction: "sales", isOrgOwner: false })
    ).toBe(false);
  });

  it("hides back-office nav for POS-only staff", () => {
    const filtered = filterNavigationForCompanyRole(NAV, {
      companyRole: "employee",
      jobFunction: "pos",
      userId: "u1",
      companyId: "o1",
    });
    expect(filtered.map((row) => row.id)).toEqual(["nav-pos"]);
  });

  it("keeps employee dashboard links when job function is not pos", () => {
    const filtered = filterNavigationForCompanyRole(NAV, {
      companyRole: "employee",
      jobFunction: "general",
      userId: "u1",
      companyId: "o1",
    });
    expect(filtered.map((row) => row.id)).toContain("nav-dashboard");
    expect(filtered.map((row) => row.id)).toContain("nav-pos");
    expect(filtered.map((row) => row.id)).not.toContain("nav-invoices");
  });

  it("builds a special /invite link with next=POS", () => {
    expect(isPosInviteDest("POS")).toBe(true);
    expect(isPosInviteDest("pos")).toBe(true);
    expect(appendPosInviteNext("https://www.paidly.co.za/invite?token=abc")).toBe(
      `https://www.paidly.co.za/invite?token=abc&next=${POS_INVITE_NEXT}`
    );
    expect(appendPosInviteNext("/invite?token=abc")).toBe(`/invite?token=abc&next=${POS_INVITE_NEXT}`);
  });

  it("labels POS employees as POS staff", () => {
    expect(formatCompanyMemberRoleLabel("employee", "pos")).toBe("POS staff");
    expect(formatCompanyMemberRoleLabel("employee", "sales")).toBe("Sales Employee");
  });
});
