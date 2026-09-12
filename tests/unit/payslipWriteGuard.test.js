import { describe, expect, it } from "vitest";
import { requirePayslipMembershipId } from "../../shared/payroll/payslipWriteGuard.js";

const MEMBERSHIP_ID = "11111111-1111-4111-8111-111111111111";

describe("payslip write guard", () => {
  it("accepts a membership UUID", () => {
    expect(requirePayslipMembershipId({ membership_id: MEMBERSHIP_ID })).toBe(MEMBERSHIP_ID);
  });

  it("rejects missing, display, and employee-number values", () => {
    const bad = [
      {},
      { membership_id: "" },
      { membership_id: "EMP-002" },
      { membership_id: "Armando Mavelele (EMP-002)" },
      { membership_id: "1.25" },
    ];
    for (const payload of bad) {
      try {
        requirePayslipMembershipId(payload);
        throw new Error("expected requirePayslipMembershipId to throw");
      } catch (err) {
        expect(err.status).toBe(400);
        expect(String(err.message)).toMatch(/membership_id/i);
      }
    }
  });
});
