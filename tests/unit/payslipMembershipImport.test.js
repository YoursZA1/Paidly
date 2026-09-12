import { describe, expect, it } from "vitest";
import {
  attachPayslipMembership,
  csvRowToPayslipPayload,
} from "../../src/utils/payslipCsvMapping.js";

const EMPLOYEE_UUID = "11111111-1111-4111-8111-111111111111";

const roster = [
  {
    id: EMPLOYEE_UUID,
    membership_id: EMPLOYEE_UUID,
    employee_number: "EMP-002",
    email: "armando@example.com",
    full_name: "Armando Mavelele",
  },
];

describe("payslip CSV membership attach", () => {
  it("keeps an explicit membership_id and printed employee number", () => {
    const payload = csvRowToPayslipPayload(
      ["employee_name", "employee_id", "membership_id", "employee_email"],
      ["Armando Mavelele", "EMP-002", EMPLOYEE_UUID, "armando@example.com"]
    );
    expect(payload.employee_id).toBe("EMP-002");
    expect(payload.membership_id).toBe(EMPLOYEE_UUID);
    const attached = attachPayslipMembership(payload, roster);
    expect(attached.ok).toBe(true);
    expect(attached.payload.membership_id).toBe(EMPLOYEE_UUID);
    expect(attached.payload.employee_id).toBe("EMP-002");
  });

  it("resolves membership from the printed employee number", () => {
    const attached = attachPayslipMembership(
      { employee_name: "Armando Mavelele", employee_id: "EMP-002" },
      roster
    );
    expect(attached.ok).toBe(true);
    expect(attached.payload.membership_id).toBe(EMPLOYEE_UUID);
  });

  it("rejects a display label as a UUID and skips unmatched rows", () => {
    const payload = csvRowToPayslipPayload(
      ["employee_name", "employee_id", "membership_id"],
      ["Armando Mavelele", "Armando Mavelele (EMP-002)", "Armando Mavelele (EMP-002)"]
    );
    expect(payload.membership_id).toBeUndefined();
    expect(payload.employee_id).toBe("EMP-002");
    const unmatched = attachPayslipMembership(
      { employee_name: "Unknown", employee_id: "EMP-999" },
      roster
    );
    expect(unmatched.ok).toBe(false);
  });
});
