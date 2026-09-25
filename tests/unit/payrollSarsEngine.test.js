/**
 * Payroll engine against SARS rules (2026-09-25). Rule values are parsed from the shipped
 * migrations — not retyped here — so these tests prove the data that production will select:
 *   supabase/migrations/20260902120000_payroll_engine_and_leave_ledger.sql  (legacy seed, 2000-01-01)
 *   supabase/migrations/20260925140000_payroll_sars_tax_years_and_ytd.sql   (2025/26, 2026/27, UIF, SDL)
 * Numbers in comments are worked by hand from the SARS tables.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { shippedRules } from "./fixtures/shippedPayrollRules.js";
import {
  bracketTax,
  calculatePayroll,
  computePaye,
  inputEarningLines,
  selectStatutoryRules,
} from "@shared/payroll/calculatePayroll.js";
import { ageAtTaxYearEnd, dobFromSaIdNumber, monthIndexInTaxYear, taxYearForDate } from "@shared/payroll/taxYear.js";
import { computePayrollYtd, payslipYtd } from "@shared/payroll/payrollYtd.js";
import { unpaidLeaveDaysInPeriod } from "@shared/payroll/unpaidLeaveImpact.js";
import { buildPayslipView } from "@shared/payroll/payslipView.js";

const RULES = shippedRules();
const rulesOn = (iso) => selectStatutoryRules(RULES, iso);
const LEGACY_ONLY = RULES.filter((r) => r.effective_from === "2000-01-01").map((r) => ({ ...r, effective_to: null }));

function run({ salary = 12000, payDate = "2026-09-30", profile = {}, rules, ...rest } = {}) {
  return calculatePayroll({
    profile: { base_salary: salary, pay_frequency: "monthly", pay_type: "monthly_salary", ...profile },
    statutoryRules: rules || rulesOn(payDate),
    ...rest,
    context: { payDate, periodStart: `${payDate.slice(0, 8)}01`, periodEnd: payDate, ...(rest.context || {}) },
  });
}

describe("shipped statutory data", () => {
  it("parses the rule versions the migrations insert", () => {
    const codes = RULES.map((r) => `${r.code}@${r.effective_from}`).sort();
    expect(codes).toEqual(
      [
        "PAYE@2000-01-01",
        "PAYE@2025-03-01",
        "PAYE@2026-03-01",
        "SDL@2000-01-01",
        "SDL@2026-03-01",
        "UIF@2000-01-01",
        "UIF@2026-03-01",
        "UIF_EMPLOYER@2000-01-01",
        "UIF_EMPLOYER@2026-03-01",
      ].sort()
    );
    const y27 = RULES.find((r) => r.effective_from === "2026-03-01" && r.code === "PAYE").value;
    expect(y27.rebates).toEqual({ primary: 17820, secondary: 9765, tertiary: 3249 });
    expect(y27.brackets.map((b) => [b.above, b.base, b.rate])).toEqual([
      [0, 0, 0.18],
      [245100, 44118, 0.26],
      [383100, 79998, 0.31],
      [530200, 125599, 0.36],
      [695800, 185215, 0.39],
      [887000, 259783, 0.41],
      [1878600, 666339, 0.45],
    ]);
  });

  it("each bracket base equals the tax at its threshold (tables are internally consistent)", () => {
    for (const r of RULES.filter((x) => x.code === "PAYE" && x.value.tax_year)) {
      const b = r.value.brackets;
      for (let i = 1; i < b.length; i++) {
        expect(b[i - 1].base + (b[i].above - b[i - 1].above) * b[i - 1].rate).toBeCloseTo(b[i].base, 6);
      }
    }
  });
});

describe("TEST 1 / 16 — R12 000 monthly, September 2026 (the reported bug)", () => {
  it("before: the legacy open-ended rule (rebate R17 235) gives the R723.75 Paidly produced", () => {
    const before = run({ rules: LEGACY_ONLY });
    expect(before.tax_deduction).toBe(723.75); // (144 000 × 18% − 17 235) / 12
    expect(before.uif_deduction).toBe(120);
    expect(before.net_pay).toBe(11156.25);
  });

  it("after: September 2026 selects the 2026/27 table → PAYE R675.00, UIF R120.00, net R11 205.00", () => {
    const after = run();
    expect(after.tax_year).toBe("2026/27");
    expect(after.gross_pay).toBe(12000);
    expect(after.tax_deduction).toBe(675); // (144 000 × 18% − 17 820) / 12 = 8 100 / 12
    expect(after.uif_deduction).toBe(120);
    expect(after.net_pay).toBe(11205);
    expect(after.breakdown.paye).toMatchObject({ annual_equivalent: 144000, tax_before_rebates: 25920, annual_tax: 8100 });
    expect(after.breakdown.paye.rebates.primary).toBe(17820);
  });

  it("regression: the old R17 235 rebate can never be selected for a September 2026 payment", () => {
    const selected = rulesOn("2026-09-30").find((r) => r.code === "PAYE");
    expect(selected.value.tax_year).toBe(2027);
    expect(selected.value.rebates.primary).not.toBe(17235);
    expect(rulesOn("2026-09-30").some((r) => r.value?.rebate === 17235 || r.value?.rebates?.primary === 17235)).toBe(false);
  });
});

describe("TEST 2 — R25 000 monthly (Sage reference)", () => {
  it("PAYE R3 381.00, UIF R177.12 (ceiling), deductions R3 558.12, net R21 441.88", () => {
    const r = run({ salary: 25000 });
    // (44 118 + 26% × (300 000 − 245 100) − 17 820) / 12 = 40 572 / 12
    expect(r.tax_deduction).toBe(3381);
    expect(r.uif_deduction).toBe(177.12);
    expect(r.total_deductions).toBe(3558.12);
    expect(r.net_pay).toBe(21441.88);
    // Sage shows 3 381.01 / 21 441.87: a 1c difference from its own rounding (documented in the report).
    expect(Math.round(Math.abs(r.tax_deduction - 3381.01) * 100)).toBeLessThanOrEqual(1); // within 1 cent
  });
});

describe("TEST 3 / 20 — UIF ceiling and employer UIF", () => {
  it.each([
    [12000, 120],
    [17712, 177.12],
    [25000, 177.12],
    [60000, 177.12],
  ])("R%d → employee and employer UIF R%d", (salary, uif) => {
    const r = run({ salary });
    expect(r.uif_deduction).toBe(uif);
    expect(r.employer_contributions.uif).toBe(uif);
    expect(r.net_pay).toBe(Math.round((r.gross_pay - r.total_deductions) * 100) / 100);
  });

  it("the R17 712 ceiling is monthly: weekly pay is capped at 17 712 × 12 / 52", () => {
    const weekly = run({ salary: 6000, profile: { pay_frequency: "weekly" } });
    expect(weekly.uif_deduction).toBe(Math.round(((17712 * 12) / 52) * 0.01 * 100) / 100); // 40.87
  });
});

describe("TEST 4 / 5 — tax-year boundary and the 2025/26 → 2026/27 transition", () => {
  it("the payment date picks the tax year", () => {
    expect(taxYearForDate("2026-02-28")).toMatchObject({ label: "2025/26", start: "2025-03-01", end: "2026-02-28" });
    expect(taxYearForDate("2026-03-01")).toMatchObject({ label: "2026/27", start: "2026-03-01", end: "2027-02-28" });
    expect(taxYearForDate("2028-02-29").end).toBe("2028-02-29");
    expect(monthIndexInTaxYear("2026-03-31")).toBe(1);
    expect(monthIndexInTaxYear("2027-02-28")).toBe(12);
  });

  it("same R12 000 employee: February 2026 uses 2025/26 (R723.75), March 2026 uses 2026/27 (R675.00)", () => {
    expect(run({ payDate: "2026-02-25" }).tax_deduction).toBe(723.75);
    expect(run({ payDate: "2026-03-25" }).tax_deduction).toBe(675);
  });

  it("a February period paid in March is taxed in the new year (PAYE follows the payment date)", () => {
    const r = run({ payDate: "2026-03-02", context: { periodStart: "2026-02-01", periodEnd: "2026-02-28" } });
    expect(r.tax_year).toBe("2026/27");
    expect(r.tax_deduction).toBe(675);
  });

  it("no PAYE table for the payment date → PAYE not deducted, with a blocking-style warning", () => {
    const r = run({ payDate: "2027-03-31" });
    expect(r.tax_deduction).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/No PAYE tax table covers the 2027\/28 tax year/);
  });

  it("an org PAYE rule without a tax year is flagged, a wrong-year rule is flagged", () => {
    const stale = { code: "PAYE", org_id: "org-1", name: "Old", calculation_type: "tax_brackets", effective_from: "2024-03-01", value: LEGACY_ONLY[0].value };
    const r = run({ rules: selectStatutoryRules([...RULES, stale], "2026-09-30") });
    expect(r.warnings.join(" ")).toMatch(/does not state its tax year/);
    const wrongYear = { ...stale, value: { ...RULES.find((x) => x.value?.tax_year === 2026).value } };
    const r2 = run({ rules: selectStatutoryRules([...RULES, wrongYear], "2026-09-30") });
    expect(r2.warnings.join(" ")).toMatch(/is for the 2026 tax year, but this payment falls in 2026\/27/);
  });
});

describe("TEST 6 / 7 / 8 — age rebates (age on the last day of the tax year)", () => {
  // R25 000: annual tax before rebates 58 392.
  it("under 65: primary only → R3 381.00", () => {
    expect(run({ salary: 25000, context: { dateOfBirth: "1990-05-01" } }).tax_deduction).toBe(3381);
  });
  it("turns 65 during 2026/27 → primary + secondary: (58 392 − 17 820 − 9 765) / 12 = R2 567.25", () => {
    const r = run({ salary: 25000, context: { dateOfBirth: "1962-02-28" } });
    expect(r.breakdown.paye.age).toBe(65);
    expect(r.tax_deduction).toBe(2567.25);
  });
  it("75+ → all three rebates: (58 392 − 30 834) / 12 = R2 296.50", () => {
    const r = run({ salary: 25000, context: { dateOfBirth: "1951-06-01" } });
    expect(r.breakdown.paye.age).toBe(75);
    expect(r.tax_deduction).toBe(2296.5);
  });
  it("age boundary: born 1 March 1962 is still 64 on 28 Feb 2027", () => {
    expect(ageAtTaxYearEnd("1962-03-01", taxYearForDate("2026-09-30"))).toBe(64);
  });
  it("SA ID number is a fallback source for the date of birth", () => {
    expect(dobFromSaIdNumber("6202285009087", 2027)).toBe("1962-02-28");
    expect(dobFromSaIdNumber("0105015009087", 2027)).toBe("2001-05-01");
    expect(dobFromSaIdNumber("not-an-id")).toBeNull();
  });
  it("tax threshold: under 65 earning R99 000 a year pays no PAYE", () => {
    expect(run({ salary: 8250 }).tax_deduction).toBe(0); // 99 000 × 18% = 17 820 = rebate
  });
});

describe("TEST 9 / 10 — leave", () => {
  it("approved unpaid leave reduces salaried pay by basic × unpaid days / working days", () => {
    const r = run({ extras: { unpaid_leave_days: 2, working_days_in_period: 21 } });
    expect(r.unpaid_leave_amount).toBe(1142.86); // 12 000 × 2 / 21
    expect(r.gross_pay).toBe(10857.14);
    expect(r.breakdown.inputs.working_days).toBe(21);
  });
  it("paid leave, and unpaid leave that is not approved, never reach payroll", () => {
    const days = unpaidLeaveDaysInPeriod({
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      requests: [
        { status: "approved", start_date: "2026-09-07", end_date: "2026-09-08", leave_types: { paid: true } },
        { status: "pending", start_date: "2026-09-14", end_date: "2026-09-15", leave_types: { paid: false } },
        { status: "rejected", start_date: "2026-09-21", end_date: "2026-09-21", leave_types: { paid: false } },
        { status: "approved", start_date: "2026-09-28", end_date: "2026-09-28", leave_types: { paid: false } },
      ],
    });
    expect(days).toBe(1);
  });
});

describe("TEST 11 / 12 / 13 — overtime, bonus, commission", () => {
  it("overtime is regular remuneration: 12 000 + 10 h × R150 → PAYE on 13 500 × 12", () => {
    const r = run({ overtimeHours: 10, overtimeRate: 150 });
    expect(r.gross_pay).toBe(13500);
    expect(r.tax_deduction).toBe(Math.round(((162000 * 0.18 - 17820) / 12) * 100) / 100); // 945
  });

  it("a bonus is taxed on the annual-equivalent difference, not multiplied by 12", () => {
    const r = run({ earnings: [{ code: "BONUS", name: "Bonus", type: "bonus", amount: 10000 }] });
    // regular 675 + [tax(154 000) − tax(144 000)] = 675 + 1 800
    expect(r.tax_deduction).toBe(2475);
    expect(r.breakdown.paye.irregular_tax).toBe(1800);
    const naive = Math.round(((44118 + (264000 - 245100) * 0.26 - 17820) / 12) * 100) / 100; // 22 000 × 12
    expect(r.tax_deduction).not.toBe(naive);
  });

  it("a bonus earlier in the tax year is part of the base for the next bonus (YTD irregular)", () => {
    const r = run({
      earnings: [{ code: "BONUS", type: "bonus", amount: 10000 }],
      context: { ytd: { irregular_taxable: 200000 } },
    });
    // tax(144 000 + 210 000) − tax(144 000 + 200 000): both in the 26% band → 2 600
    expect(r.breakdown.paye.irregular_tax).toBe(2600);
  });

  it("commission is regular: 12 000 + 3 000 → PAYE on 180 000", () => {
    const r = run({ earnings: [{ code: "COMMISSION", type: "commission", amount: 3000 }] });
    expect(r.tax_deduction).toBe(1215); // (32 400 − 17 820) / 12
  });
});

describe("TEST 14 / 15 / 16 — pay types", () => {
  it("hourly: rate × captured ordinary hours; no hours → R0 with a warning", () => {
    const r = run({ profile: { pay_type: "hourly", hourly_rate: 100 }, extras: { hours: 160 } });
    expect(r.basic).toBe(16000);
    expect(r.breakdown.inputs).toMatchObject({ unit: "hours", units: 160, unit_rate: 100 });
    const none = run({ profile: { pay_type: "hourly", hourly_rate: 100 } });
    expect(none.basic).toBe(0);
    expect(none.warnings.join(" ")).toMatch(/no ordinary hours captured/);
  });

  it("daily: rate × days worked; default = working days less approved unpaid leave (no salary deduction line)", () => {
    const def = run({ profile: { pay_type: "daily", daily_rate: 600 }, extras: { working_days_in_period: 22, unpaid_leave_days: 1 } });
    expect(def.basic).toBe(12600);
    expect(def.unpaid_leave_amount).toBe(0);
    expect(def.earnings.some((l) => l.code === "UNPAID")).toBe(false);
    const captured = run({ profile: { pay_type: "daily", daily_rate: 600 }, extras: { days: 10, working_days_in_period: 22 } });
    expect(captured.basic).toBe(6000);
  });

  it("monthly salary ignores hours/days inputs", () => {
    expect(run({ extras: { hours: 5, days: 2 } }).basic).toBe(12000);
  });
});

describe("TEST 21 — SDL is an employer cost", () => {
  it("1% of leviable remuneration, never deducted from net pay", () => {
    const r = run();
    expect(r.employer_contributions).toMatchObject({ uif: 120, sdl: 120, total: 240 });
    expect(r.employer_cost).toBe(12240);
    expect(r.net_pay).toBe(11205);
    expect(r.statutory_deductions.find((l) => l.code === "SDL")).toMatchObject({ amount: 0, employer_amount: 120 });
  });
  it("an SDL-exempt employer pays no SDL", () => {
    const r = run({ context: { employer: { sdl_exempt: true } } });
    expect(r.employer_contributions.sdl).toBe(0);
    expect(r.statutory_deductions.find((l) => l.code === "SDL")).toMatchObject({ exempt: true, employer_amount: 0 });
  });
});

describe("medical credits and retirement deduction", () => {
  it("2 members on the scheme → R752/month credit (2026/27)", () => {
    const r = run({
      salary: 25000,
      deductions: [{ code: "MEDICAL", type: "medical", amount: 3000 }],
      context: { medicalSchemeMembers: 2 },
    });
    expect(r.breakdown.paye.medical_credit_annual).toBe(752 * 12);
    expect(r.tax_deduction).toBe(3381 - 752);
  });
  it("legacy annual medical_credit is no longer multiplied by 12", () => {
    const r = run({ salary: 25000, rules: LEGACY_ONLY, deductions: [{ code: "MEDICAL", type: "medical", amount: 3000 }] });
    expect(r.breakdown.paye.medical_credit_annual).toBe(8328);
  });
  it("retirement contributions reduce taxable income, capped at 27.5% of remuneration", () => {
    const r = run({ salary: 25000, deductions: [{ code: "PENSION", type: "pension", amount: 2000 }] });
    expect(r.breakdown.retirement_deductible).toBe(2000);
    expect(r.breakdown.paye.annual_equivalent).toBe(276000);
    const capped = run({ salary: 25000, deductions: [{ code: "PENSION", type: "pension", amount: 10000 }] });
    expect(capped.breakdown.retirement_deductible).toBe(6875); // 27.5% × 25 000
  });
});

describe("engine correctness fixes", () => {
  it("recalculation is idempotent: feeding a stored item's earnings back does not double basic pay", () => {
    const first = run({ overtimeHours: 2, overtimeRate: 100, extras: { unpaid_leave_days: 1, working_days_in_period: 21 } });
    const again = run({ overtimeHours: 2, overtimeRate: 100, extras: { unpaid_leave_days: 1, working_days_in_period: 21 }, earnings: first.earnings });
    expect(again.gross_pay).toBe(first.gross_pay);
    expect(inputEarningLines(first.earnings)).toEqual([]);
  });
  it("the legacy table's one-rand gaps no longer give R0 tax", () => {
    const legacy = LEGACY_ONLY.find((r) => r.code === "PAYE").value.brackets;
    expect(bracketTax(237100.5, legacy).tax).toBeCloseTo(42678 + 0.5 * 0.26, 6);
    expect(bracketTax(237101, legacy).tax).toBeCloseTo(42678.26, 6); // threshold is 237 100, not 237 101
  });
  it("run-to-date corrects earlier over-deduction (never below R0)", () => {
    const value = RULES.find((r) => r.value?.tax_year === 2027).value;
    // Six months at the old R723.75 (48.75 too much each); month 7 target = 675 × 7 = 4 725.
    const month7 = computePaye({ value, periodsPerYear: 12, age: 40, regularTaxable: 12000, irregularTaxable: 0, method: "run_to_date", ytd: { periods: 6, regular_taxable: 72000, paye_regular: 6 * 723.75 } });
    expect(month7.amount).toBe(382.5);
    const catchUp = computePaye({ value, periodsPerYear: 12, age: 40, regularTaxable: 1000, irregularTaxable: 0, method: "run_to_date", ytd: { periods: 6, regular_taxable: 72000, paye_regular: 6 * 900 } });
    expect(catchUp.amount).toBe(0);
    expect(catchUp.negative_adjustment).toBeLessThan(0);
  });
  it("taxable fringe benefits are taxed but not paid", () => {
    const r = run({ earnings: [{ code: "CAR", name: "Company car", type: "fringe_benefit", amount: 2000 }] });
    expect(r.gross_pay).toBe(12000);
    expect(r.fringe_benefits).toBe(2000);
    expect(r.tax_deduction).toBe(Math.round(((168000 * 0.18 - 17820) / 12) * 100) / 100);
  });
  it("snapshots every input and rule version used", () => {
    const r = run({ context: { dateOfBirth: "1990-01-01", medicalSchemeMembers: 0 } });
    expect(r.breakdown.inputs).toMatchObject({ pay_type: "monthly_salary", base_salary: 12000, pay_date: "2026-09-30", age_at_tax_year_end: 37 });
    expect(r.breakdown.inputs.statutory_rule_versions.find((v) => v.code === "PAYE")).toMatchObject({ effective_from: "2026-03-01", tax_year: 2027 });
  });
});

describe("TEST 17 / 19 / 23 / 24 / 25 — YTD from finalized payroll only", () => {
  const ORG = "org-a";
  const TY = taxYearForDate("2026-09-30");
  const runs = [
    { id: "feb", org_id: ORG, status: "paid", finalized_at: "x", pay_date: "2026-02-25", period_start: "2026-02-01" },
    { id: "mar", org_id: ORG, status: "paid", finalized_at: "x", pay_date: "2026-03-25", period_start: "2026-03-01" },
    { id: "apr", org_id: ORG, status: "approved", finalized_at: "x", pay_date: "2026-04-25", period_start: "2026-04-01" },
    { id: "apr-adj", org_id: ORG, status: "approved", finalized_at: "x", pay_date: "2026-04-28", period_start: "2026-04-01", run_type: "adjustment" },
    { id: "may-draft", org_id: ORG, status: "calculated", finalized_at: null, pay_date: "2026-05-25", period_start: "2026-05-01" },
    { id: "jun-cancel", org_id: ORG, status: "cancelled", finalized_at: "x", pay_date: "2026-06-25", period_start: "2026-06-01" },
    { id: "other", org_id: "org-b", status: "paid", finalized_at: "x", pay_date: "2026-03-25", period_start: "2026-03-01" },
    { id: "sep", org_id: ORG, status: "calculated", finalized_at: null, pay_date: "2026-09-30", period_start: "2026-09-01" },
  ];
  const item = (runId, orgId = ORG, extra = {}) => {
    const r = run();
    return {
      id: `i-${runId}`,
      org_id: orgId,
      pay_run_id: runId,
      payroll_profile_id: "p1",
      gross_pay: r.gross_pay,
      taxable_income: r.taxable_income,
      statutory_deductions: r.statutory_deductions,
      total_deductions: r.total_deductions,
      net_pay: r.net_pay,
      calculation: r.breakdown,
      ...extra,
    };
  };
  const items = [
    item("feb"),
    item("mar"),
    item("apr"),
    item("apr-adj", ORG, { gross_pay: 500, net_pay: 500, total_deductions: 0, statutory_deductions: [], calculation: { period_taxable: 500 } }),
    item("may-draft"),
    item("jun-cancel"),
    item("other", "org-b"),
    item("sep"),
  ];

  it("counts only finalized, non-cancelled runs of this company inside the tax year", () => {
    const ytd = computePayrollYtd({ items, runs, orgId: ORG, profileId: "p1", taxYear: TY, excludeRunId: "sep" });
    // mar + apr + adjustment (feb is 2025/26; draft, cancelled, other company, current run excluded)
    expect(ytd.gross).toBe(24500);
    expect(ytd.paye).toBe(1350);
    expect(ytd.uif).toBe(240);
    expect(ytd.net).toBe(22910);
    expect(ytd.periods).toBe(2); // the adjustment corrects April; it is not a third period
  });

  it("another company's payroll never contributes, even for the same profile id", () => {
    const leak = computePayrollYtd({ items, runs, orgId: "org-b", profileId: "p1", taxYear: TY });
    expect(leak.gross).toBe(12000);
    expect(leak.periods).toBe(1);
  });

  it("payslip YTD = prior finalized history + this item", () => {
    const prior = computePayrollYtd({ items, runs, orgId: ORG, profileId: "p1", taxYear: TY, excludeRunId: "sep" });
    const ytd = payslipYtd(prior, items.at(-1));
    expect(ytd).toEqual({ gross: 36500, taxable: 36500, paye: 2025, uif: 360, other_deductions: 0, net: 34115 });
  });

  it("legacy items (annualised taxable_income only) are divided back to one period", () => {
    const legacy = [{ ...items[1], calculation: {} }];
    expect(computePayrollYtd({ items: legacy, runs, orgId: ORG, taxYear: TY }).taxable).toBe(12000);
  });
});

describe("TEST 22 — multiple employees in one run are independent", () => {
  it("each employee uses their own profile, age and YTD", () => {
    const people = [
      { salary: 12000, dob: "1990-01-01", expect: 675 },
      { salary: 25000, dob: "1962-02-28", expect: 2567.25 },
      { salary: 25000, dob: "1951-06-01", expect: 2296.5 },
    ];
    const results = people.map((p) => run({ salary: p.salary, context: { dateOfBirth: p.dob } }));
    expect(results.map((r) => r.tax_deduction)).toEqual(people.map((p) => p.expect));
    expect(results.reduce((s, r) => s + r.net_pay, 0)).toBeCloseTo(11205 + (25000 - 2567.25 - 177.12) + (25000 - 2296.5 - 177.12), 2);
  });
});

describe("payslip presentation reads finalized values only", () => {
  const r = run({ overtimeHours: 10, overtimeRate: 150, deductions: [{ code: "PENSION", name: "Pension", type: "pension", amount: 1000 }] });
  const payslip = {
    basic_salary: r.basic,
    overtime_hours: 10,
    overtime_rate: 150,
    allowances: r.earnings.filter((e) => e.code !== "BASIC"),
    gross_pay: r.gross_pay,
    tax_deduction: r.tax_deduction,
    uif_deduction: r.uif_deduction,
    pension_deduction: 1000,
    other_deductions: r.other_deductions,
    total_deductions: r.total_deductions,
    net_pay: r.net_pay,
    calculation_breakdown: r.breakdown,
    employer_contributions: r.employer_contributions,
    tax_year: r.tax_year,
    ytd: { gross: 1, taxable: 2, paye: 3, uif: 4, other_deductions: 5, net: 6 },
  };

  it("lists each earning and deduction once, and they add up to the stored totals", () => {
    const view = buildPayslipView(payslip);
    expect(view.earnings.filter((l) => l.code === "OT")).toHaveLength(1);
    expect(view.deductions.filter((d) => /pension/i.test(d.label))).toHaveLength(1);
    expect(view.consistent).toBe(true);
    expect(view.netPay).toBe(r.net_pay);
    expect(view.taxYear).toBe("2026/27");
    expect(view.ytd.map((y) => y.amount)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(view.employerContributions.map((e) => e.amount)).toEqual([r.employer_contributions.uif, r.employer_contributions.sdl]);
  });

  it("shows stored amounts even if they disagree with a fresh calculation (it never recalculates)", () => {
    const view = buildPayslipView({ ...payslip, tax_deduction: 999.99 });
    expect(view.deductions.find((d) => d.code === "PAYE").amount).toBe(999.99);
  });

  it("static: the payslip document and PDF never import the payroll engine", () => {
    for (const f of ["src/components/payslips/PayslipDocument.jsx", "src/document-engine/pdf/payslip.jsx", "shared/payroll/payslipView.js"]) {
      const code = readFileSync(path.resolve(__dirname, "../..", f), "utf8");
      expect(code).not.toMatch(/calculatePayroll|computePaye|applyStatutoryRule/);
    }
  });
});
