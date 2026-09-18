import { describe, it, expect } from "vitest";
import {
  statutoryAmounts,
  buildUifReportRows,
  buildPayeReportRows,
  buildPayrollSummary,
  buildNetPayRegister,
  buildPayrollReport,
} from "@shared/payroll/payrollReports.js";
import {
  buildEmployerSnapshot,
  mergeEmployerPayrollSettings,
  resolvePayslipEmployerDisplay,
} from "@shared/payroll/employerSnapshot.js";
import { resolvePayrollRoute } from "../../server/src/payroll/payrollRoutes.js";

const sampleItems = [
  {
    membership_id: "a",
    employee_number: "EMP-001",
    employee_name: "Amanda",
    gross_pay: 60000,
    net_pay: 50000,
    total_deductions: 10000,
    statutory_deductions: [
      { code: "PAYE", amount: 8000, employer_amount: 0, employee_portion: true },
      { code: "UIF", amount: 177.12, employer_amount: 0, employee_portion: true },
      { code: "UIF_EMPLOYER", amount: 0, employer_amount: 177.12, employee_portion: false },
    ],
    other_deductions: [{ name: "Pension", amount: 1822.88 }],
  },
  {
    membership_id: "b",
    employee_number: "EMP-002",
    employee_name: "Rosh",
    gross_pay: 50000,
    net_pay: 42500,
    total_deductions: 7500,
    statutory_deductions: [
      { code: "PAYE", amount: 5500, employer_amount: 0 },
      { code: "UIF", amount: 177.12, employer_amount: 0 },
      { code: "UIF_EMPLOYER", amount: 0, employer_amount: 177.12, employee_portion: false },
    ],
    other_deductions: [{ name: "Medical", amount: 1822.88 }],
  },
];

describe("payrollReports aggregators", () => {
  it("extracts PAYE and UIF employee/employer amounts", () => {
    const s = statutoryAmounts(sampleItems[0].statutory_deductions);
    expect(s.paye).toBe(8000);
    expect(s.uif_employee).toBe(177.12);
    expect(s.uif_employer).toBe(177.12);
  });

  it("builds UIF report with monthly totals", () => {
    const report = buildUifReportRows(sampleItems);
    expect(report.rows).toHaveLength(2);
    expect(report.totals.employee_contribution).toBe(354.24);
    expect(report.totals.employer_contribution).toBe(354.24);
    expect(report.totals.total).toBe(708.48);
  });

  it("builds PAYE report", () => {
    const report = buildPayeReportRows(sampleItems);
    expect(report.totals.paye_deducted).toBe(13500);
  });

  it("builds payroll summary with employer cost = gross + employer statutory", () => {
    const summary = buildPayrollSummary(sampleItems);
    expect(summary.gross_payroll).toBe(110000);
    expect(summary.net_payroll).toBe(92500);
    expect(summary.paye).toBe(13500);
    expect(summary.uif_total).toBe(708.48);
    expect(summary.total_employer_cost).toBe(110000 + 354.24);
  });

  it("builds net pay register total", () => {
    const register = buildNetPayRegister(sampleItems);
    expect(register.totals.net_pay).toBe(92500);
    expect(register.rows[0].employee_name).toBe("Amanda");
  });

  it("rejects unknown report types", () => {
    expect(() => buildPayrollReport("foo", [])).toThrow(/Unknown payroll report type/);
  });
});

describe("employerSnapshot", () => {
  it("builds snapshot from org payroll_settings", () => {
    const snap = buildEmployerSnapshot({
      name: "Acme (Pty) Ltd",
      registration_number: "2020/1/07",
      address: "1 Main Rd",
      company_email: "hr@acme.test",
      phone: "021",
      payroll_settings: { paye_reference: "PAYE-1", uif_reference: "UIF-1" },
    });
    expect(snap.company_name).toBe("Acme (Pty) Ltd");
    expect(snap.paye_reference).toBe("PAYE-1");
    expect(snap.uif_reference).toBe("UIF-1");
  });

  it("prefers issued snapshot over live user profile", () => {
    const display = resolvePayslipEmployerDisplay(
      { employer_snapshot: { company_name: "Frozen Co", paye_reference: "OLD" } },
      { company_name: "Live Co" }
    );
    expect(display.company_name).toBe("Frozen Co");
    expect(display.paye_reference).toBe("OLD");
  });

  it("merges employer refs without wiping unrelated payroll_settings keys", () => {
    const merged = mergeEmployerPayrollSettings(
      { paye_reference: "A", custom_flag: true },
      { paye_reference: "B", uif_reference: "U" }
    );
    expect(merged.paye_reference).toBe("B");
    expect(merged.uif_reference).toBe("U");
    expect(merged.custom_flag).toBe(true);
  });
});

describe("resolvePayrollRoute reports", () => {
  it("resolves /api/payroll/reports", () => {
    expect(resolvePayrollRoute({ url: "/api/payroll/reports", query: {} })).toEqual({ route: "reports" });
    expect(resolvePayrollRoute({ url: "/api/payroll/employer-settings", query: {} })).toEqual({
      route: "employer-settings",
    });
  });
});
