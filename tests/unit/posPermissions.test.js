import { describe, expect, it } from "vitest";
import {
  PERMISSIONS as clientPerms,
  POS_PERMISSIONS as clientPosPerms,
  companyRoleHasPermission as clientHas,
} from "@/lib/companyPermissions";
import {
  PERMISSIONS as serverPerms,
  POS_PERMISSIONS as serverPosPerms,
  companyRoleHasPermission as serverHas,
} from "../../server/src/companyRouteAccess.js";
import { filterNavigationForCompanyRole } from "@/lib/companyNavFilter";

const ROLES = ["employee", "manager", "admin", "owner"];

describe("POS staff permissions", () => {
  it("uses the same six grants on client and server", () => {
    expect([...clientPosPerms]).toEqual([...serverPosPerms]);
    expect(clientPosPerms).toEqual([
      "pos_access",
      "pos_sell",
      "pos_discount",
      "pos_refund",
      "pos_close_register",
      "pos_view_reports",
    ]);
  });

  it("maps till grants onto existing company roles (not a second login)", () => {
    const matrix = {
      employee: {
        pos_access: true,
        pos_sell: true,
        pos_discount: false,
        pos_refund: false,
        pos_close_register: false,
        pos_view_reports: false,
      },
      manager: {
        pos_access: true,
        pos_sell: true,
        pos_discount: true,
        pos_refund: true,
        pos_close_register: true,
        pos_view_reports: true,
      },
      admin: {
        pos_access: true,
        pos_sell: true,
        pos_discount: true,
        pos_refund: true,
        pos_close_register: true,
        pos_view_reports: true,
      },
      owner: {
        pos_access: true,
        pos_sell: true,
        pos_discount: true,
        pos_refund: true,
        pos_close_register: true,
        pos_view_reports: true,
      },
    };

    for (const role of ROLES) {
      for (const permission of clientPosPerms) {
        const expected = matrix[role][permission];
        expect(clientHas(role, permission)).toBe(expected);
        expect(serverHas(role, permission)).toBe(expected);
        expect(clientHas(role, clientPerms.POS_ACCESS) === serverHas(role, serverPerms.POS_ACCESS)).toBe(true);
      }
    }
  });

  it("shows the POS nav item only when the member has pos_access", () => {
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
    expect(employee.map((row) => row.id)).not.toContain("nav-invoices");
  });
});
