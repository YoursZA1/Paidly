import { describe, it, expect } from "vitest";
import { calculatePayroll, selectStatutoryRules, applyStatutoryRule } from "@shared/payroll/calculatePayroll.js";
import { unpaidLeaveDaysInPeriod } from "@shared/payroll/unpaidLeaveImpact.js";
import { buildPayslipNumber, buildEmployeeNumber, nextEmployeeSequence } from "@shared/payroll/payslipNumber.js";
import { countWorkingDays, computeLeaveBalance, accrueLeaveDays } from "@shared/leave/leaveMath.js";
import { validateLeaveApplication } from "@shared/leave/validateLeave.js";
import {
  bceaLeavePosition,
  estimateDaysWorked,
  FAMILY_RESPONSIBILITY_BLOCKED,
  monthsEmployed,
  presentLeaveBalance,
} from "@shared/leave/leaveEligibility.js";
import { calculateLeaveAccrual, leaveCycleContaining } from "@shared/leave/leaveAccrual.js";
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

  it("reduces gross for unpaid leave in the period without changing contractual basic", () => {
    const result = calculatePayroll({
      profile: { base_salary: 21000, pay_frequency: "monthly", pay_type: "monthly_salary" },
      statutoryRules: [uifTemplate],
      extras: { unpaid_leave_days: 2, working_days_in_period: 21 },
    });
    expect(result.basic).toBe(21000);
    expect(result.unpaid_leave_days).toBe(2);
    expect(result.unpaid_leave_amount).toBe(2000);
    expect(result.earnings.find((line) => line.code === "UNPAID")?.amount).toBe(-2000);
    expect(result.gross_pay).toBe(19000);
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

  it("uses the new version after the previous window is closed", () => {
    const selected = selectStatutoryRules(
      [
        {
          code: "UIF",
          org_id: "org-1",
          effective_from: "2025-01-01",
          effective_to: "2026-08-31",
          value: { rate: 0.01 },
        },
        {
          code: "UIF",
          org_id: "org-1",
          effective_from: "2026-09-01",
          effective_to: null,
          value: { rate: 0.02 },
        },
      ],
      "2026-09-15"
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].value.rate).toBe(0.02);
    const prior = selectStatutoryRules(
      [
        {
          code: "UIF",
          org_id: "org-1",
          effective_from: "2025-01-01",
          effective_to: "2026-08-31",
          value: { rate: 0.01 },
        },
        {
          code: "UIF",
          org_id: "org-1",
          effective_from: "2026-09-01",
          effective_to: null,
          value: { rate: 0.02 },
        },
      ],
      "2026-08-31"
    );
    expect(prior[0].value.rate).toBe(0.01);
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

  it("counts only unpaid leave that overlaps the payroll period", () => {
    const days = unpaidLeaveDaysInPeriod({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      requests: [
        {
          status: "approved",
          start_date: "2026-09-28",
          end_date: "2026-10-02",
          leave_types: { paid: false, exclude_weekends: true },
        },
        {
          status: "approved",
          start_date: "2026-09-10",
          end_date: "2026-09-11",
          leave_types: { paid: true, exclude_weekends: true },
        },
      ],
    });
    expect(days).toBe(3);
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

  it("applies BCEA rules for the first months of employment", () => {
    expect(monthsEmployed("2026-09-01", "2026-10-15")).toBe(1);
    expect(monthsEmployed("2026-09-01", "2027-01-01")).toBe(4);

    const annual = bceaLeavePosition({
      code: "ANNUAL",
      daysPerYear: 21,
      method: "monthly",
      employmentStartIso: "2026-01-01",
      yearStartIso: "2026-01-01",
      asOfIso: "2026-02-01",
    });
    expect(annual.blocked).toBe(false);
    expect(annual.accrued).toBeGreaterThan(0);
    expect(annual.accrued).toBeLessThan(21);

    const familyEarly = bceaLeavePosition({
      code: "FAMILY",
      daysPerYear: 3,
      method: "annual",
      employmentStartIso: "2026-09-01",
      yearStartIso: "2026-01-01",
      asOfIso: "2026-10-15",
      storedAccrued: 3,
    });
    expect(familyEarly.blocked).toBe(true);
    expect(familyEarly.accrued).toBe(0);
    expect(familyEarly.message).toBe(FAMILY_RESPONSIBILITY_BLOCKED);

    const familyLater = bceaLeavePosition({
      code: "FAMILY",
      employmentStartIso: "2026-09-01",
      asOfIso: "2027-01-01",
      storedAccrued: 3,
    });
    expect(familyLater.blocked).toBe(false);
    expect(familyLater.accrued).toBe(3);

    const partTime = bceaLeavePosition({
      code: "FAMILY",
      employmentStartIso: "2026-09-01",
      asOfIso: "2027-01-01",
      daysPerWeek: 3,
      storedAccrued: 3,
    });
    expect(partTime.blocked).toBe(true);

    const worked = estimateDaysWorked("2026-09-01", "2026-10-15");
    const sick = bceaLeavePosition({
      code: "SICK",
      employmentStartIso: "2026-09-01",
      asOfIso: "2026-10-15",
      storedAccrued: 10,
    });
    expect(sick.accrued).toBe(Math.round((worked / 26) * 100) / 100);
    expect(sick.accrued).toBeLessThan(10);

    const sickLater = bceaLeavePosition({
      code: "SICK",
      employmentStartIso: "2026-01-01",
      asOfIso: "2026-08-01",
      storedAccrued: 10,
    });
    expect(sickLater.accrued).toBe(10);

    const blocked = validateLeaveApplication({
      employeeActive: true,
      leaveTypeActive: true,
      startIso: "2026-10-15",
      endIso: "2026-10-15",
      balance: { accrued: 0, used: 0, pending: 0 },
      blockedReason: FAMILY_RESPONSIBILITY_BLOCKED,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]).toBe(FAMILY_RESPONSIBILITY_BLOCKED);
  });

  it("accrues annual leave from the start date across the employment cycle", () => {
    const startedToday = calculateLeaveAccrual({ employmentStartIso: "2026-10-07", annualEntitlement: 15 }, "2026-10-07");
    const startedYesterday = calculateLeaveAccrual({ employmentStartIso: "2026-10-06", annualEntitlement: 15 }, "2026-10-07");
    const started15DaysAgo = calculateLeaveAccrual({ employmentStartIso: "2026-09-22", annualEntitlement: 15 }, "2026-10-07");
    expect(startedToday.accrued).toBeGreaterThan(0);
    expect(startedToday.accrued).toBeLessThan(15);
    expect(startedYesterday.accrued).toBeGreaterThan(startedToday.accrued);
    expect(started15DaysAgo.accrued).toBeGreaterThan(startedYesterday.accrued);
    expect(startedToday.cycleStart).toBe("2026-10-07");
    expect(startedToday.cycleEnd).toBe("2027-10-06");

    const midMonth = calculateLeaveAccrual({ employmentStartIso: "2026-10-16", annualEntitlement: 15 }, "2026-10-16");
    expect(midMonth.accrued).toBeGreaterThan(0);
    expect(midMonth.accrued).toBeLessThan(1);

    const oneMonth = calculateLeaveAccrual({ employmentStartIso: "2026-10-01", annualEntitlement: 15 }, "2026-11-01");
    const twoMonths = calculateLeaveAccrual({ employmentStartIso: "2026-10-01", annualEntitlement: 15 }, "2026-12-01");
    const sixMonths = calculateLeaveAccrual({ employmentStartIso: "2026-10-01", annualEntitlement: 15 }, "2027-04-01");
    expect(oneMonth.accrued).toBeGreaterThan(1);
    expect(oneMonth.accrued).toBeLessThan(2);
    expect(twoMonths.accrued).toBeGreaterThan(oneMonth.accrued);
    expect(sixMonths.accrued).toBeGreaterThan(twoMonths.accrued);
    expect(sixMonths.accrued).toBeLessThan(15);

    const cycleEnd = calculateLeaveAccrual({ employmentStartIso: "2026-03-15", annualEntitlement: 15 }, "2027-03-14");
    const nextCycle = calculateLeaveAccrual({ employmentStartIso: "2026-03-15", annualEntitlement: 15 }, "2027-03-15");
    expect(cycleEnd.accrued).toBe(15);
    expect(cycleEnd.cycleLabel).toContain("15 Mar 2026");
    expect(nextCycle.cycleStart).toBe("2027-03-15");
    expect(nextCycle.cycleEnd).toBe("2028-03-14");
    expect(nextCycle.accrued).toBeLessThan(1);

    const open = calculateLeaveAccrual({ employmentStartIso: "2026-01-01", annualEntitlement: 15 }, "2026-07-01");
    const taken = calculateLeaveAccrual({ employmentStartIso: "2026-01-01", annualEntitlement: 15, used: 1 }, "2026-07-01");
    expect(taken.available).toBeCloseTo(open.available - 1, 2);
    const reversed = presentLeaveBalance({
      code: "ANNUAL",
      leaveTypeId: "annual",
      daysPerYear: 15,
      employmentStartIso: "2026-01-01",
      asOfIso: "2026-07-01",
      requests: [{ status: "cancelled", start_date: "2026-02-02", working_days: 1, leave_type_id: "annual" }],
    });
    const approved = presentLeaveBalance({
      code: "ANNUAL",
      leaveTypeId: "annual",
      daysPerYear: 15,
      employmentStartIso: "2026-01-01",
      asOfIso: "2026-07-01",
      requests: [{ status: "approved", start_date: "2026-02-02", working_days: 1, leave_type_id: "annual" }],
    });
    expect(reversed.available).toBeCloseTo(open.available, 2);
    expect(approved.available).toBeCloseTo(open.available - 1, 2);

    const movedEarlier = calculateLeaveAccrual({ employmentStartIso: "2026-08-01", annualEntitlement: 15 }, "2026-10-07");
    const movedLater = calculateLeaveAccrual({ employmentStartIso: "2026-09-01", annualEntitlement: 15 }, "2026-10-07");
    expect(movedEarlier.accrued).toBeGreaterThan(movedLater.accrued);

    const terminated = calculateLeaveAccrual({
      employmentStartIso: "2026-01-01",
      employmentEndIso: "2026-02-01",
      employmentStatus: "terminated",
      annualEntitlement: 15,
    }, "2026-10-07");
    const atEnd = calculateLeaveAccrual({ employmentStartIso: "2026-01-01", annualEntitlement: 15 }, "2026-02-01");
    expect(terminated.accrued).toBe(atEnd.accrued);

    const rehired = presentLeaveBalance({
      code: "ANNUAL",
      leaveTypeId: "annual",
      daysPerYear: 15,
      employmentStartIso: "2026-06-01",
      asOfIso: "2026-07-01",
      requests: [{ status: "approved", start_date: "2026-02-02", working_days: 3, leave_type_id: "annual" }],
    });
    expect(rehired.used).toBe(0);

    expect(calculateLeaveAccrual({ employmentStartIso: "2026-01-01", annualEntitlement: 0 }, "2026-06-01").accrued).toBe(0);
    const richer = calculateLeaveAccrual({ employmentStartIso: "2026-01-01", annualEntitlement: 20 }, "2026-07-01");
    expect(richer.accrued).toBeGreaterThan(open.accrued);
    const fourDayWeek = calculateLeaveAccrual({
      employmentStartIso: "2026-01-01",
      annualEntitlement: 15,
      daysPerWeek: 4,
    }, "2026-07-01");
    expect(fourDayWeek.accrued).toBeCloseTo(open.accrued * 0.8, 2);

    const leap = leaveCycleContaining("2024-02-29", "2024-06-01");
    expect(leap.cycleStart).toBe("2024-02-29");
    expect(leap.cycleEnd).toBe("2025-02-27");
    expect(leap.cycleDays).toBeGreaterThan(360);

    const acrossYearEnd = calculateLeaveAccrual({ employmentStartIso: "2026-10-01", annualEntitlement: 15 }, "2027-01-15");
    expect(acrossYearEnd.cycleStart).toBe("2026-10-01");
    expect(acrossYearEnd.accrued).toBeGreaterThan(oneMonth.accrued);
    expect(acrossYearEnd.accrued).toBeLessThan(15);

    const ignoresStoredPot = presentLeaveBalance({
      code: "ANNUAL",
      daysPerYear: 15,
      employmentStartIso: "2026-10-07",
      asOfIso: "2026-10-07",
      storedAccrued: 15,
      used: 0,
      pending: 0,
    });
    expect(ignoresStoredPot.accrued).toBe(startedToday.accrued);
    expect(ignoresStoredPot.available).toBeLessThan(1);

    const sick = presentLeaveBalance({
      code: "SICK",
      daysPerYear: 10,
      employmentStartIso: "2026-10-01",
      asOfIso: "2026-10-15",
      storedAccrued: 10,
      used: 0,
      pending: 0,
    });
    expect(sick.cycleLabel).toBe("");
    expect(sick.accrued).toBeLessThan(10);
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

  it("resolves nested pay-run employee refresh from __payroll path", () => {
    expect(
      resolvePayrollRoute({
        url: "/api/company/payroll",
        query: { path: "payroll", __payroll: "runs/abc/refresh" },
      })
    ).toEqual({ route: "run-refresh", id: "abc" });
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
