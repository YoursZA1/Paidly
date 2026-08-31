import { describe, expect, it } from "vitest";
import {
  appendPosInviteNext,
  isPosInviteDest,
  isPosInviteUrl,
  isPosOnlyStaff,
  POS_INVITE_NEXT,
  POS_JOB_FUNCTION,
  posInvitePath,
  POS_ONLY_PERMISSIONS,
} from "@shared/posStaffInvite.js";
import { membershipHasPermission, normalizeJobFunction, PERMISSIONS } from "@/lib/companyPermissions";
import { formatCompanyMemberRoleLabel } from "@/lib/companyJobFunctions";
import { filterNavigationForCompanyRole } from "@/lib/companyNavFilter";
import { resolveCompanyHomePath } from "@/lib/postAuthNavigation.js";
import { createPageUrl } from "@/utils";
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

  it("builds a dedicated /pos/invite/:token link", () => {
    expect(isPosInviteDest("POS")).toBe(true);
    expect(isPosInviteUrl("/pos/invite/abc")).toBe(true);
    expect(isPosInviteUrl("/pos/invite/7K4M-X92Q")).toBe(true);
    expect(appendPosInviteNext("https://www.paidly.co.za/invite?token=abc")).toBe(
      "https://www.paidly.co.za/pos/invite/abc"
    );
    expect(appendPosInviteNext("/invite?token=abc")).toBe("/pos/invite/abc");
    expect(posInvitePath("tok", "https://www.paidly.co.za")).toBe(
      "https://www.paidly.co.za/pos/invite/tok"
    );
    expect(posInvitePath("7K4M-X92Q", "https://www.paidly.co.za")).toBe(
      "https://www.paidly.co.za/pos/invite/7K4M-X92Q"
    );
  });

  it("labels POS employees as POS staff", () => {
    expect(formatCompanyMemberRoleLabel("employee", "pos")).toBe("POS staff");
    expect(formatCompanyMemberRoleLabel("employee", "sales")).toBe("Sales Employee");
  });

  it("does not grant back-office permissions to POS-only staff", () => {
    const cashier = { companyRole: "employee", jobFunction: "pos", isOrgOwner: false };
    expect(membershipHasPermission(cashier, PERMISSIONS.POS_ACCESS)).toBe(true);
    expect(membershipHasPermission(cashier, PERMISSIONS.POS_SELL)).toBe(true);
    expect(membershipHasPermission(cashier, PERMISSIONS.POS_CLOSE_REGISTER)).toBe(true);
    expect(membershipHasPermission(cashier, PERMISSIONS.VIEW_OWN_PAYSLIPS)).toBe(false);
    expect(membershipHasPermission(cashier, PERMISSIONS.MANAGE_COMPANY_SETTINGS)).toBe(false);
    expect(membershipHasPermission(cashier, PERMISSIONS.VIEW_COMPANY_REPORTS)).toBe(false);
    expect(POS_ONLY_PERMISSIONS).toContain("pos_close_register");
    expect(POS_INVITE_NEXT).toBe("POS");
  });

  it("sends POS-only staff to the till, not the dashboard", () => {
    expect(
      resolveCompanyHomePath({
        companyId: "o1",
        companyRole: "employee",
        jobFunction: "pos",
        isOrgOwner: false,
      })
    ).toBe(createPageUrl("POS"));
    expect(
      resolveCompanyHomePath({
        companyId: "o1",
        companyRole: "admin",
        jobFunction: "pos",
        isOrgOwner: false,
      })
    ).toBe(createPageUrl("Dashboard"));
  });
});
