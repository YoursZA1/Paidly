import { describe, it, expect } from "vitest";
import {
  attachReportContext,
  buildEmployeePayrollHistory,
  buildNetPayRegister,
  buildPayeReportRows,
  buildUifReportRows,
  filterReportItems,
  payrollReportFilename,
  payrollReportToCsv,
  buildPayrollReport,
} from "@shared/payroll/payrollReports.js";
import {
  RECONCILIATION_STATUS,
  reconcilePayrollPayment,
  salaryExpenseCandidates,
} from "@shared/payroll/payrollReconciliation.js";
import { buildEmployeePayslipSnapshot, maskIdentifier } from "@shared/payroll/employeeSnapshot.js";
import {
  DEFAULT_PEOPLE_REMINDER_LEAD_DAYS,
  buildEmployerSnapshot,
  mergeEmployerPayrollSettings,
  normalizeEmployerPayrollSettings,
  resolvePayslipEmployerDisplay,
} from "@shared/payroll/employerSnapshot.js";
import { buildPeopleCalendarEvents, selectDuePeopleReminders } from "@shared/workforce/peopleCalendar.js";
import { buildOrganogramTree } from "@shared/workforce/organogram.js";
import { applyStatutoryRule } from "@shared/payroll/calculatePayroll.js";
import { resolvePayrollRoute } from "../../server/src/payroll/payrollRoutes.js";
import { membershipRowHasPermission, PERMISSIONS } from "../../server/src/companyRouteAccess.js";

const JAN = { id: "run-jan", period_label: "January 2026", period_start: "2026-01-01", period_end: "2026-01-31", pay_date: "2026-01-25", status: "paid" };
const MAR = { id: "run-mar", period_label: "March 2026", period_start: "2026-03-01", period_end: "2026-03-31", pay_date: "2026-03-25", status: "paid" };

function item(overrides) {
  return {
    membership_id: "m-1",
    employee_number: "EMP-001",
    employee_name: "Amanda",
    gross_pay: 40000,
    net_pay: 31000,
    total_deductions: 9000,
    statutory_deductions: [
      { code: "PAYE", amount: 8000 },
      { code: "UIF", amount: 177.12, base_amount: 40000 },
      { code: "UIF_EMPLOYER", amount: 0, employer_amount: 177.12, employee_portion: false },
    ],
    other_deductions: [{ name: "Pension", amount: 822.88 }],
    calculation: { profile_snapshot: { department: "Finance", job_title: "Accountant" } },
    ...overrides,
  };
}

describe("historical payroll reports", () => {
  // January (R40k) and March (R45k) finalised items for the same employee.
  const items = attachReportContext(
    [
      item({ id: "i1", pay_run_id: "run-jan" }),
      item({
        id: "i2",
        pay_run_id: "run-mar",
        gross_pay: 45000,
        net_pay: 34500,
        total_deductions: 10500,
        statutory_deductions: [
          { code: "PAYE", amount: 9322.88 },
          { code: "UIF", amount: 177.12 },
          { code: "UIF_EMPLOYER", amount: 0, employer_amount: 177.12, employee_portion: false },
        ],
      }),
      item({
        id: "i3",
        pay_run_id: "run-mar",
        membership_id: "m-2",
        employee_number: "EMP-002",
        employee_name: "Rosh",
        calculation: {},
        payslip_id: "slip-rosh",
      }),
    ],
    {
      runsById: new Map([
        ["run-jan", JAN],
        ["run-mar", MAR],
      ]),
      payslipsById: new Map([["slip-rosh", { department: "Sales", status: "paid", payslip_number: "PS-9" }]]),
    }
  );

  it("attaches frozen period and department context", () => {
    expect(items[0].period_label).toBe("January 2026");
    expect(items[0].department).toBe("Finance");
    // No calculation snapshot → falls back to the issued payslip, never the live profile.
    expect(items[2].department).toBe("Sales");
    expect(items[2].payslip_status).toBe("paid");
  });

  it("keeps each period's own amounts (January stays R40k after a raise)", () => {
    const history = buildEmployeePayrollHistory(filterReportItems(items, { membership_id: "m-1" }));
    expect(history.rows.map((r) => r.gross_pay)).toEqual([45000, 40000]);
    expect(history.rows[1].period_label).toBe("January 2026");
    expect(history.totals.net_pay).toBe(65500);
  });

  it("UIF report uses stored base, falling back to gross for older runs, with monthly totals", () => {
    const uif = buildUifReportRows(items);
    const jan = uif.rows.find((r) => r.pay_run_id === "run-jan");
    const marAmanda = uif.rows.find((r) => r.pay_run_id === "run-mar" && r.membership_id === "m-1");
    expect(jan.uif_base).toBe(40000);
    expect(marAmanda.uif_base).toBe(45000);
    expect(uif.totals.total).toBe(Math.round(177.12 * 6 * 100) / 100);
    expect(uif.by_period).toHaveLength(2);
    expect(uif.by_period[0].period_label).toBe("March 2026");
    expect(uif.by_period[0].totals.total).toBe(708.48);
  });

  it("PAYE report shows gross, PAYE and other deductions with a collective total", () => {
    const paye = buildPayeReportRows(filterReportItems(items, { department: "finance" }));
    expect(paye.rows).toHaveLength(2);
    expect(paye.totals.paye_deducted).toBe(17322.88);
    expect(paye.rows[0].other_deductions).toBe(822.88);
  });

  it("net pay register lists everyone with a collective total and status", () => {
    const register = buildNetPayRegister(items.filter((i) => i.pay_run_id === "run-mar"));
    expect(register.rows).toHaveLength(2);
    expect(register.totals.net_pay).toBe(65500);
    expect(register.rows.find((r) => r.employee_name === "Rosh").status).toBe("paid");
  });

  it("exports a self-describing CSV", () => {
    const report = buildPayrollReport("net_pay", items.filter((i) => i.pay_run_id === "run-mar"));
    const csv = payrollReportToCsv(report, {
      companyName: "Acme (Pty) Ltd",
      periodLabel: "March 2026",
      generatedAt: "2026-04-01T08:00:00.000Z",
    });
    expect(csv).toContain("Report,Net Pay Register");
    expect(csv).toContain("Company,Acme (Pty) Ltd");
    expect(csv).toContain("Payroll period,March 2026");
    expect(csv).toContain("Generated,2026-04-01T08:00:00.000Z");
    expect(csv).toContain("TOTAL NET PAY,,,,85000.00,19500.00,65500.00,");
    expect(payrollReportFilename("uif", "March 2026")).toBe("uif-report-march-2026.csv");
  });

  it("records the rule base on statutory lines (not for bracket tax)", () => {
    const uif = applyStatutoryRule(
      { code: "UIF", calculation_type: "capped_percent", value: { rate: 0.01, cap: 177.12, base: "gross" } },
      { gross: 20000, basic: 20000, taxableIncome: 240000, pension: 0, medical: 0 }
    );
    expect(uif.amount).toBe(177.12);
    expect(uif.base_amount).toBe(20000);
    const paye = applyStatutoryRule(
      { code: "PAYE", calculation_type: "tax_brackets", value: { brackets: [{ min: 0, max: null, rate: 0.18 }] } },
      { gross: 20000, basic: 20000, taxableIncome: 240000, pension: 0, medical: 0 }
    );
    expect(paye.base_amount).toBeNull();
  });
});

describe("payroll bank reconciliation", () => {
  it("reconciles exact payments", () => {
    expect(reconcilePayrollPayment({ expected: 152450, actual: 152450 })).toMatchObject({
      status: RECONCILIATION_STATUS.RECONCILED,
      difference: 0,
    });
  });

  it("flags variances with a signed difference", () => {
    expect(reconcilePayrollPayment({ expected: 152450, actual: 150450 })).toMatchObject({
      status: RECONCILIATION_STATUS.VARIANCE,
      difference: -2000,
    });
  });

  it("waits for payment or finalisation", () => {
    expect(reconcilePayrollPayment({ expected: 100, actual: null }).status).toBe(RECONCILIATION_STATUS.AWAITING_PAYMENT);
    expect(reconcilePayrollPayment({ expected: 100, actual: 100, finalised: false }).status).toBe(
      RECONCILIATION_STATUS.NOT_FINALISED
    );
  });

  it("suggests unmatched salary expenses in the pay window only", () => {
    const run = { period_start: "2026-09-01", period_end: "2026-09-30", pay_date: "2026-09-25" };
    const candidates = salaryExpenseCandidates(
      [
        { id: "a", category: "salary", date: "2026-09-25", amount: 100000 },
        { id: "b", category: "salary", date: "2026-10-03", amount: 52450 },
        { id: "c", category: "office", date: "2026-09-25", amount: 99 },
        { id: "d", category: "salary", date: "2026-08-25", amount: 1 },
        { id: "e", category: "salary", date: "2026-09-26", amount: 5 },
      ],
      run,
      { excludeIds: new Set(["e"]) }
    );
    expect(candidates.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("payslip snapshots", () => {
  it("masks ID and bank numbers", () => {
    expect(maskIdentifier("8001015009087")).toBe("••••••9087");
    const snap = buildEmployeePayslipSnapshot({
      employee_number: "EMP-7",
      employment_start_date: "2022-10-14",
      tax_identifiers: { tax_number: "0123456789", id_number: "8001015009087", uif_number: "U-1" },
      banking: { bank_name: "FNB", account_number: "62123456789" },
    });
    expect(snap.tax_number).toBe("0123456789");
    expect(snap.id_number_masked).toBe("••••••9087");
    expect(snap.bank_account_masked).toBe("••••••6789");
    expect(JSON.stringify(snap)).not.toContain("8001015009087");
    expect(JSON.stringify(snap)).not.toContain("62123456789");
  });

  it("snapshots employer logo and trading name; display prefers snapshot over the viewer", () => {
    const snap = buildEmployerSnapshot(
      { name: "Acme (Pty) Ltd", payroll_settings: { trading_name: "Acme Coffee" } },
      { company_name: "Acme", logo_url: "owner-logo.png" }
    );
    expect(snap.trading_name).toBe("Acme Coffee");
    expect(snap.logo_url).toBe("owner-logo.png");
    const display = resolvePayslipEmployerDisplay({ employer_snapshot: snap }, { logo_url: "employee-avatar.png" });
    expect(display.logo_url).toBe("owner-logo.png");
  });

  it("stores the people reminder lead time without wiping other settings", () => {
    expect(normalizeEmployerPayrollSettings({}).people_reminder_lead_days).toBe(DEFAULT_PEOPLE_REMINDER_LEAD_DAYS);
    const merged = mergeEmployerPayrollSettings({ paye_reference: "P" }, { people_reminder_lead_days: "500" });
    expect(merged.people_reminder_lead_days).toBe(90);
    expect(merged.paye_reference).toBe("P");
  });
});

describe("people reminders", () => {
  const employees = [
    { id: "a", full_name: "Rosh", date_of_birth: "1990-10-19", employment_start_date: "2022-10-14" },
    { id: "b", full_name: "Amanda", date_of_birth: "1985-09-19" },
  ];

  it("computes work anniversaries from the existing start date", () => {
    const cal = buildPeopleCalendarEvents(employees, { todayIso: "2026-09-19", daysAhead: 30 });
    const anniversary = cal.events.find((e) => e.kind === "work_anniversary");
    expect(anniversary).toMatchObject({ membership_id: "a", event_date: "2026-10-14", years: 4 });
  });

  it("fires at the lead time and on the day only", () => {
    const cal = buildPeopleCalendarEvents(employees, { todayIso: "2026-09-19", daysAhead: 30 });
    const due = selectDuePeopleReminders(cal.events, { todayIso: "2026-09-19", leadDays: 30 });
    expect(due.map((e) => `${e.membership_id}:${e.kind}:${e.stage}`)).toEqual(["b:birthday:today", "a:birthday:lead"]);
    const quiet = selectDuePeopleReminders(cal.events, { todayIso: "2026-09-20", leadDays: 30 });
    expect(quiet).toEqual([]);
  });
});

describe("organogram departments", () => {
  it("groups by department and derives managers from reporting lines", () => {
    const tree = buildOrganogramTree([
      { id: "ceo", full_name: "Owner" },
      { id: "fm", full_name: "Fin Manager", department: "Finance", manager_membership_id: "ceo" },
      { id: "f1", full_name: "Clerk", department: "Finance", manager_membership_id: "fm" },
      { id: "s1", full_name: "Rep", department: "Sales", manager_membership_id: "ceo" },
    ]);
    const finance = tree.departments.find((d) => d.name === "Finance");
    expect(finance.headcount).toBe(2);
    expect(finance.managers.map((m) => m.id)).toEqual(["fm"]);
    expect(tree.departments.at(-1).name).toBe("Unassigned");
    expect(tree.roots.map((r) => r.id)).toEqual(["ceo"]);
  });
});

describe("payroll RBAC for fan-out and routes", () => {
  it("maps raw membership rows onto the role matrix", () => {
    const owner = { user_id: "u-owner", role: "employee" };
    expect(membershipRowHasPermission(owner, PERMISSIONS.MANAGE_PAYROLL, { ownerId: "u-owner" })).toBe(true);
    expect(membershipRowHasPermission({ user_id: "u1", role: "manager", job_function: "finance" }, PERMISSIONS.MANAGE_PAYROLL)).toBe(true);
    expect(membershipRowHasPermission({ user_id: "u2", role: "manager", job_function: "hr" }, PERMISSIONS.MANAGE_PAYROLL)).toBe(false);
    expect(membershipRowHasPermission({ user_id: "u2", role: "manager", job_function: "hr" }, PERMISSIONS.MANAGE_EMPLOYEES)).toBe(true);
    expect(membershipRowHasPermission({ user_id: "u3", role: "manager" }, PERMISSIONS.MANAGE_PAYROLL)).toBe(false);
    expect(membershipRowHasPermission({ user_id: "u4", role: "employee" }, PERMISSIONS.MANAGE_EMPLOYEES)).toBe(false);
  });

  it("resolves new payroll routes through the existing handler", () => {
    expect(resolvePayrollRoute({ url: "/api/payroll/dashboard", query: {} })).toEqual({ route: "dashboard" });
    expect(resolvePayrollRoute({ url: "/api/payroll/runs/abc/reconciliation", query: {} })).toEqual({
      route: "run-reconciliation",
      id: "abc",
    });
  });
});
