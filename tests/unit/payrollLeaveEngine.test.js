import { describe, it, expect } from "vitest";
import { calculatePayroll, selectStatutoryRules, applyStatutoryRule } from "@shared/payroll/calculatePayroll.js";
import { buildPayslipNumber, buildEmployeeNumber, nextEmployeeSequence } from "@shared/payroll/payslipNumber.js";
import { countWorkingDays, computeLeaveBalance, accrueLeaveDays } from "@shared/leave/leaveMath.js";
import { validateLeaveApplication } from "@shared/leave/validateLeave.js";
import { isLeapYear, daysInMonth, eachIsoDateInclusive, johannesburgYmd } from "@shared/payroll/dates.js";
import { resolvePayrollRoute } from "../../server/src/payroll/payrollRoutes.js";
import { resolveLeaveRoute } from "../../server/src/leave/leaveRoutes.js";

const payeTemplate = {
  code: "PAYE",
  name: "PAYE",
  calculation_type: "tax_brackets",
  employee_portion: true,
  value: {
    periods_per_year: 12,
    rebate: 17235,
    brackets: [
      { min: 0, max: 237100, rate: 0.18, base: 0 },
      { min: 237101, max: 370500, rate: 0.26, base: 42678 },
    ],
  },
};

const uifTemplate = {
  code: "UIF",
  name: "UIF",
  calculation_type: "capped_percent",
  employee_portion: true,
  value: { rate: 0.01, cap: 177.12, base: "gross" },
};

describe("calculatePayroll", () => {
  it("computes gross, statutory, and net from profile + rules", () => {
    const result = calculatePayroll({
      profile: { base_salary: 25000, pay_frequency: "monthly", pay_type: "monthly_salary" },
      earnings: [{ name: "Allowance", amount: 2000, type: "allowance" }],
      statutoryRules: [payeTemplate, uifTemplate],
      overtimeHours: 10,
      overtimeRate: 150,
    });
    expect(result.basic).toBe(25000);
    expect(result.overtime_pay).toBe(1500);
    expect(result.gross_pay).toBe(28500);
    expect(result.uif_deduction).toBe(177.12);
    expect(result.tax_deduction).toBeGreaterThan(0);
    expect(result.net_pay).toBe(result.gross_pay - result.total_deductions);
    expect(result.warnings).toEqual([]);
  });

  it("does not invent statutory amounts when no rules are provided", () => {
    const result = calculatePayroll({
      profile: { base_salary: 10000, pay_frequency: "monthly" },
    });
    expect(result.tax_deduction).toBe(0);
    expect(result.uif_deduction).toBe(0);
    expect(result.warnings[0]).toMatch(/No statutory rules/);
  });

  it("supports hourly pay type", () => {
    const result = calculatePayroll({
      profile: { pay_type: "hourly", hourly_rate: 100 },
      extras: { hours: 80 },
    });
    expect(result.basic).toBe(8000);
    expect(result.gross_pay).toBe(8000);
  });
});

describe("selectStatutoryRules", () => {
  it("prefers org rules over platform defaults for the same code", () => {
    const selected = selectStatutoryRules(
      [
        { code: "UIF", org_id: null, effective_from: "2000-01-01", value: { rate: 0.01 } },
        { code: "UIF", org_id: "org-1", effective_from: "2026-01-01", value: { rate: 0.02 } },
      ],
      "2026-09-01"
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].org_id).toBe("org-1");
  });

  it("ignores rules outside the effective window", () => {
    const selected = selectStatutoryRules(
      [{ code: "UIF", org_id: null, effective_from: "2027-01-01", value: {} }],
      "2026-09-01"
    );
    expect(selected).toHaveLength(0);
  });
});

describe("applyStatutoryRule", () => {
  it("caps percent deductions", () => {
    const applied = applyStatutoryRule(uifTemplate, { gross: 30000, basic: 30000, taxableIncome: 360000, pension: 0, medical: 0 });
    expect(applied.amount).toBe(177.12);
  });
});

describe("payslip numbers", () => {
  it("builds PS-YYYY-MM-EMP codes", () => {
    expect(buildPayslipNumber({ periodStart: "2026-09-01", employeeNumber: "EMP-001" })).toBe("PS-2026-09-EMP-001");
  });
  it("increments employee sequence", () => {
    expect(nextEmployeeSequence(["EMP-001", "EMP-012"])).toBe(13);
    expect(buildEmployeeNumber(1)).toBe("EMP-001");
  });
});

describe("leave math", () => {
  it("counts weekdays inclusive and skips weekends", () => {
    expect(countWorkingDays("2026-09-01", "2026-09-03")).toBe(3);
    expect(countWorkingDays("2026-09-04", "2026-09-07")).toBe(2);
  });

  it("supports half-day same-day requests", () => {
    expect(countWorkingDays("2026-09-01", "2026-09-01", { halfDay: true })).toBe(0.5);
  });

  it("handles leap-year February", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(eachIsoDateInclusive("2024-02-28", "2024-03-01")).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
  });

  it("computes available = accrued - used - pending", () => {
    expect(computeLeaveBalance({ accrued: 12, used: 4, pending: 2, entitled: 15 })).toEqual({
      entitled: 15,
      accrued: 12,
      used: 4,
      pending: 2,
      available: 6,
    });
  });

  it("accrues monthly as days_per_year / 12", () => {
    expect(accrueLeaveDays({ daysPerYear: 21, method: "monthly", asOfIso: "2026-09-01" })).toBe(1.75);
  });

  it("blocks overlapping and insufficient balance", () => {
    const overlap = validateLeaveApplication({
      employeeActive: true,
      leaveTypeActive: true,
      startIso: "2026-09-01",
      endIso: "2026-09-03",
      balance: { accrued: 10, used: 0, pending: 0 },
      overlapping: [{ start_date: "2026-09-02", end_date: "2026-09-02", status: "approved" }],
    });
    expect(overlap.ok).toBe(false);
    expect(overlap.errors[0]).toMatch(/overlap/i);

    const short = validateLeaveApplication({
      employeeActive: true,
      leaveTypeActive: true,
      startIso: "2026-09-01",
      endIso: "2026-09-05",
      balance: { accrued: 2, used: 0, pending: 0 },
    });
    expect(short.ok).toBe(false);
    expect(short.errors[0]).toMatch(/Insufficient/);
  });

  it("allows unpaid leave beyond balance", () => {
    const result = validateLeaveApplication({
      employeeActive: true,
      leaveTypeActive: true,
      startIso: "2026-09-01",
      endIso: "2026-09-03",
      unpaid: true,
      balance: { accrued: 0, used: 0, pending: 0 },
    });
    expect(result.ok).toBe(true);
    expect(result.workingDays).toBe(3);
  });
});

describe("johannesburg calendar", () => {
  it("formats a known UTC instant in Africa/Johannesburg", () => {
    const ymd = johannesburgYmd("2026-09-01T22:00:00.000Z");
    expect(ymd.iso).toBe("2026-09-02");
  });
});

describe("Hobby payroll/leave rewrites onto /api/company", () => {
  it("resolves payroll overview from __payroll", () => {
    expect(
      resolvePayrollRoute({
        url: "/api/company/payroll",
        query: { path: "payroll", __payroll: "overview" },
      })
    ).toEqual({ route: "overview" });
  });

  it("resolves nested pay-run calculate from __payroll path", () => {
    expect(
      resolvePayrollRoute({
        url: "/api/company/payroll",
        query: { path: "payroll", __payroll: "runs/abc/calculate" },
      })
    ).toEqual({ route: "run-calculate", id: "abc" });
  });

  it("resolves leave approve from __leave path", () => {
    expect(
      resolveLeaveRoute({
        url: "/api/company/leave",
        query: { path: "leave", __leave: "requests/abc/approve" },
      })
    ).toEqual({ route: "approve", id: "abc" });
  });
});
