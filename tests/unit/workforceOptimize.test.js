import { describe, expect, it } from "vitest";
import { hasCompletePayRate, incompletePayRateReason, livePayRate, payrollSetupPath } from "../../shared/payroll/payRate.js";
import { validatePayRunItem } from "../../shared/payroll/payRunValidation.js";
import { displayPayslipStatus, payslipStatusLabel } from "../../shared/payroll/payslipStatus.js";
import { annualLeaveEligibility } from "../../shared/leave/leaveEligibility.js";
import { accrueLeaveDays } from "../../shared/leave/leaveMath.js";

describe("live pay rate", () => {
  it("does not treat a default zero salary as complete", () => {
    expect(hasCompletePayRate({ id: "p1", pay_type: "monthly_salary", base_salary: 0 })).toBe(false);
    expect(incompletePayRateReason({ pay_type: "monthly_salary" })).toMatch(/zero/i);
    expect(payrollSetupPath("emp-1")).toBe("/employees/emp-1?tab=payroll");
  });

  it("accepts hourly or daily rates when base salary is zero", () => {
    expect(livePayRate({ pay_type: "hourly", base_salary: 0, hourly_rate: 120 })).toBe(120);
    expect(hasCompletePayRate({ pay_type: "hourly", hourly_rate: 120 })).toBe(true);
    expect(hasCompletePayRate({ pay_type: "daily", daily_rate: 900 })).toBe(true);
  });
});

describe("pay-run validation uses live profile rates", () => {
  it("does not fail when the snapshot is zero but the live salary is set", () => {
    const issue = validatePayRunItem(
      { membership_id: "m1", employee_name: "Thabo", base_pay: 0, pay_type: "monthly_salary" },
      { membership_id: "m1", base_salary: 18000, pay_type: "monthly_salary", payroll_status: "active", employment_status: "active" }
    );
    expect(issue).toBeNull();
  });

  it("blocks when the live salary is still zero and points to payroll setup", () => {
    const issue = validatePayRunItem(
      { membership_id: "m1", full_name: "Thabo", pay_type: "monthly_salary" },
      { membership_id: "m1", base_salary: 0, pay_type: "monthly_salary", payroll_status: "active", employment_status: "active" }
    );
    expect(issue?.blocking).toBe(true);
    expect(issue?.setup_path).toBe("/employees/m1?tab=payroll");
  });
});

describe("payslip display status", () => {
  it("maps locked draft payslips to published without rewriting history", () => {
    expect(displayPayslipStatus({ status: "draft", locked: true })).toBe("published");
    expect(displayPayslipStatus({ status: "draft", pay_run_id: "run-1" })).toBe("published");
    expect(payslipStatusLabel({ status: "draft", locked: true })).toBe("Published");
    expect(displayPayslipStatus({ status: "sent", locked: true })).toBe("sent");
    expect(displayPayslipStatus({ status: "draft" })).toBe("draft");
  });
});

describe("SA leave eligibility", () => {
  it("accrues from the employment start date with no 3-month wait", () => {
    const fromMath = accrueLeaveDays({
      daysPerYear: 21,
      employmentStartIso: "2026-01-15",
      asOfIso: "2026-04-15",
      method: "monthly",
    });
    expect(fromMath).toBeGreaterThan(0);
    const eligibility = annualLeaveEligibility({
      employment_start_date: "2026-01-15",
      todayIso: "2026-04-15",
    });
    expect(eligibility.waiting_period_applies).toBe(false);
    expect(eligibility.waiting_period_days).toBe(0);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.year_to_date_accrual).toBeGreaterThan(0);
  });
});
