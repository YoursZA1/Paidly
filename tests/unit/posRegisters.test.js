import { describe, expect, it } from "vitest";
import {
  normalizeRegisterWrite,
  publicRegisterView,
  POS_REGISTER_STATUSES,
  findConflictingRegister,
} from "../../server/src/pos/posRegisterMath.js";
import { pickActiveRegister } from "@/lib/pos/posRegisterStorage";

describe("POS registers", () => {
  it("accepts name, status, assigned staff, and opening balance", () => {
    const parsed = normalizeRegisterWrite({
      name: "  Front till  ",
      status: "active",
      company_id: "brand-1",
      assigned_staff_id: "user-1",
      opening_balance: 250.5,
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toMatchObject({
      name: "Front till",
      status: "active",
      company_id: "brand-1",
      assigned_staff_id: "user-1",
      opening_balance: 250.5,
    });
    expect(POS_REGISTER_STATUSES).toContain("disabled");
  });

  it("rejects a blank name and a negative float", () => {
    expect(normalizeRegisterWrite({ name: "  " }).ok).toBe(false);
    expect(normalizeRegisterWrite({ name: "Till", opening_balance: -1 }).ok).toBe(false);
  });

  it("picks the stored active register and skips disabled tills", () => {
    const rows = [
      { id: "a", status: "disabled", name: "Old" },
      { id: "b", status: "active", name: "Front" },
      { id: "c", status: "active", name: "Back" },
    ];
    expect(pickActiveRegister(rows, "c").id).toBe("c");
    expect(pickActiveRegister(rows, "a").id).toBe("b");
  });

  it("treats register names as unique per brand, not org-wide", () => {
    const rows = [
      { id: "a", name: "Main till", company_id: "brand-1" },
      { id: "b", name: "Main till", company_id: "brand-2" },
    ];
    expect(
      findConflictingRegister(rows, { name: "Main Till", companyId: "brand-1" })?.id
    ).toBe("a");
    expect(findConflictingRegister(rows, { name: "Main Till", companyId: "brand-2" })?.id).toBe("b");
    expect(findConflictingRegister(rows, { name: "Main Till", companyId: "brand-3" })).toBeNull();
    expect(
      findConflictingRegister(rows, { name: "Main Till", companyId: "brand-1", excludeId: "a" })
    ).toBeNull();
  });

  it("exposes opening balance on the public view", () => {
    const view = publicRegisterView(
      {
        id: "r1",
        org_id: "o1",
        company_id: "b1",
        name: "Main till",
        status: "active",
        assigned_staff_id: "u1",
        opening_balance: 100,
      },
      { company_name: "Harbour", assigned_staff_name: "Ada" }
    );
    expect(view.opening_balance).toBe(100);
    expect(view.company_name).toBe("Harbour");
    expect(view.assigned_staff_name).toBe("Ada");
  });
});
