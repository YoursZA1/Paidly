/**
 * Payroll service wiring (server/src/payroll/payrollService.js) with the real engine and the shipped
 * SARS rules, against an in-memory database:
 *   - rules are selected by the run's PAYMENT date; the item stores tax year + every input
 *   - YTD comes only from finalized, non-cancelled runs of the same company in the tax year
 *   - recurring components apply on the first calculation; recalculation never doubles pay
 *   - hourly units entered on the run are used and kept
 *   - finalisation copies the item to the payslip (no recalculation) with frozen YTD / tax year /
 *     employer contributions; a finalized run cannot be recalculated
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { shippedRules } from "./fixtures/shippedPayrollRules.js";

const { memory, tables } = vi.hoisted(() => {
  const tables = {};
  const cmp = (a, b) => String(a ?? "").localeCompare(String(b ?? ""));
  const memory = {
    rpc: async () => ({ data: null, error: { message: "function does not exist" } }),
    from(table) {
      tables[table] ||= [];
      const st = { action: "select", payload: null, filters: [], select: "*", order: null, limit: null };
      const embedRuns = () => /pay_runs!inner/.test(st.select);
      const run = () => {
        if (st.action === "insert") {
          const rows = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({ id: randomUUID(), ...p }));
          tables[table].push(...rows);
          return rows;
        }
        let rows = tables[table].filter((r) => st.filters.every((f) => f(r)));
        if (st.action === "update") {
          rows.forEach((r) => Object.assign(r, st.payload));
          return rows;
        }
        if (embedRuns()) {
          rows = rows
            .map((r) => ({ ...r, pay_runs: (tables.pay_runs || []).find((p) => p.id === r.pay_run_id) || null }))
            .filter((r) => r.pay_runs);
        }
        if (st.order) rows = [...rows].sort((a, b) => cmp(a[st.order], b[st.order]));
        return st.limit != null ? rows.slice(0, st.limit) : rows;
      };
      const api = {
        select: (s = "*") => ((st.select = s), api),
        insert: (p) => ((st.action = "insert"), (st.payload = p), api),
        upsert: (p) => ((st.action = "insert"), (st.payload = p), api),
        update: (p) => ((st.action = "update"), (st.payload = p), api),
        eq: (c, v) => (st.filters.push((r) => String(r[c] ?? "") === String(v ?? "")), api),
        neq: (c, v) => (st.filters.push((r) => String(r[c] ?? "") !== String(v ?? "")), api),
        in: (c, v) => (st.filters.push((r) => (v || []).map(String).includes(String(r[c]))), api),
        is: (c, v) => (st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)), api),
        gte: (c, v) => (st.filters.push((r) => cmp(r[c], v) >= 0), api),
        lte: (c, v) => (st.filters.push((r) => cmp(r[c], v) <= 0), api),
        not: () => api,
        or: () => api,
        order: (c) => ((st.order = c), api),
        limit: (n) => ((st.limit = n), api),
        maybeSingle: async () => ({ data: run()[0] || null, error: null }),
        single: async () => {
          const r = run()[0];
          return r ? { data: r, error: null } : { data: null, error: { message: "no rows" } };
        },
        then: (res, rej) => Promise.resolve({ data: run(), error: null }).then(res, rej),
      };
      return api;
    },
  };
  return { memory, tables };
});

vi.mock("../../server/src/payroll/payrollGate.js", () => ({
  supabaseAdmin: memory,
  writePayrollAudit: async () => {},
  notifyUser: async () => {},
}));
vi.mock("../../server/src/payroll/payRunLockRpc.js", () => ({
  claimPayRunForCalculate: async () => ({ fallback: true }),
  commitPayRunCalculate: async () => ({ fallback: true }),
}));
vi.mock("../../server/src/payroll/payrollEmployeeLimit.js", () => ({
  assertPayrollEmployeeCapacity: async () => {},
  payrollEmployeeCapacity: async () => ({ allowed: true }),
}));
vi.mock("../../server/src/documents/documentSendAdapter.js", () => ({
  sendPayslipEmail: async () => ({ success: true }),
  recordPayslipCreatedEvent: async () => {},
}));
vi.mock("../../server/src/workforce/adjustmentSignals.js", () => ({
  loadOutstandingAdjustmentSignals: async () => ({ signals: [] }),
}));
vi.mock("../../server/src/workforce/workforceEvents.js", () => ({
  emitWorkforceEvent: async () => {},
  WORKFORCE_EVENT_TYPES: { PAYSLIP_GENERATED: "x", PAYROLL_PROCESSED: "y" },
}));

import {
  calculatePayRun,
  calculatePayRunOnce,
  finalizePayRun,
  getPayRun,
  previewCalculation,
} from "../../server/src/payroll/payrollService.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const M1 = "33333333-3333-4333-8333-333333333331";
const M2 = "33333333-3333-4333-8333-333333333332";

function seed() {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.payroll_statutory_rules = shippedRules();
  tables.organizations = [{ id: ORG, name: "Paidly Test (Pty) Ltd", payroll_settings: { paye_reference: "7000000000" } }];
  tables.memberships = [
    { id: M1, org_id: ORG, date_of_birth: "1990-05-01" },
    { id: M2, org_id: ORG, date_of_birth: null },
  ];
  tables.payroll_profiles = [
    { id: "p1", org_id: ORG, membership_id: M1, full_name: "Armando", employee_number: "EMP-001", pay_type: "monthly_salary", pay_frequency: "monthly", base_salary: 12000, job_title: "Developer" },
    { id: "p2", org_id: ORG, membership_id: M2, full_name: "Hourly Hana", employee_number: "EMP-002", pay_type: "hourly", pay_frequency: "monthly", hourly_rate: 100 },
  ];
  tables.payroll_component_types = [
    { org_id: ORG, kind: "earning", code: "TRAVEL", name: "Travel allowance", default_amount: 500, taxable: true, active: true, recurring: true },
  ];
  // History for p1: March–August 2026 finalized (R12 000, PAYE 675, UIF 120, net 11 205), plus runs
  // that must NOT count: February (previous tax year), an unfinalized draft, a cancelled run, and
  // another company's run carrying the same profile id.
  const hist = [
    ["mar", ORG, "paid", true, "2026-03-25"],
    ["apr", ORG, "paid", true, "2026-04-25"],
    ["may", ORG, "paid", true, "2026-05-25"],
    ["jun", ORG, "paid", true, "2026-06-25"],
    ["jul", ORG, "paid", true, "2026-07-25"],
    ["aug", ORG, "approved", true, "2026-08-25"],
    ["feb", ORG, "paid", true, "2026-02-25"],
    ["aug-draft", ORG, "calculated", false, "2026-08-26"],
    ["jun-cancelled", ORG, "cancelled", true, "2026-06-26"],
    ["other-org", OTHER, "paid", true, "2026-05-25"],
  ];
  tables.pay_runs = hist.map(([id, org, status, fin, pay]) => ({
    id,
    org_id: org,
    status,
    finalized_at: fin ? `${pay}T10:00:00Z` : null,
    pay_date: pay,
    period_start: `${pay.slice(0, 8)}01`,
    period_end: pay,
    run_type: "regular",
  }));
  tables.pay_run_items = hist.map(([id, org]) => ({
    id: `item-${id}`,
    org_id: org,
    pay_run_id: id,
    payroll_profile_id: "p1",
    gross_pay: 12000,
    taxable_income: 144000,
    statutory_deductions: [
      { code: "PAYE", amount: 675, employee_portion: true },
      { code: "UIF", amount: 120, employee_portion: true },
    ],
    total_deductions: 795,
    net_pay: 11205,
    calculation: { period_taxable: 12000, regular_taxable: 12000, irregular_taxable: 0, paye: { regular_amount: 675 } },
  }));
  // The September run being calculated.
  tables.pay_runs.push({
    id: "sep",
    org_id: ORG,
    status: "calculated",
    finalized_at: null,
    pay_date: "2026-09-25",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    period_label: "September 2026",
    run_type: "regular",
    employee_count: 2,
  });
  tables.pay_run_items.push(
    { id: "sep-1", org_id: ORG, pay_run_id: "sep", payroll_profile_id: "p1", membership_id: M1, employee_name: "Armando", employee_number: "EMP-001", earnings: [], deductions: [] },
    { id: "sep-2", org_id: ORG, pay_run_id: "sep", payroll_profile_id: "p2", membership_id: M2, employee_name: "Hourly Hana", employee_number: "EMP-002", earnings: [], deductions: [] }
  );
}

const item = (id) => tables.pay_run_items.find((i) => i.id === id);

beforeEach(() => {
  seed();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("calculate", () => {
  it("uses the 2026/27 table by payment date, applies recurring components, stores inputs and YTD", async () => {
    const run = await getPayRun(ORG, "sep");
    await calculatePayRunOnce(ORG, "actor", run, { items: [{ id: "sep-2", ordinary_hours: 160 }] }, { fallback: true });

    const a = item("sep-1");
    expect(a.gross_pay).toBe(12500); // 12 000 + recurring travel 500 (was never applied before)
    const paye = a.statutory_deductions.find((l) => l.code === "PAYE");
    expect(paye.amount).toBe(765); // (150 000 × 18% − 17 820) / 12
    expect(a.calculation.tax_year).toMatchObject({ label: "2026/27" });
    expect(a.calculation.inputs).toMatchObject({ pay_date: "2026-09-25", age_at_tax_year_end: 36, base_salary: 12000 });
    expect(a.calculation.inputs.statutory_rule_versions.find((v) => v.code === "PAYE")).toMatchObject({ effective_from: "2026-03-01", tax_year: 2027 });
    // YTD used = March–August only (not February, the draft, the cancelled run, or the other company).
    expect(a.calculation.inputs.ytd_used).toMatchObject({ periods: 6, gross: 72000, paye: 4050, net: 67230 });

    const b = item("sep-2");
    expect(b.base_pay).toBe(16000); // 160 h × R100
    expect(b.ordinary_hours).toBe(160); // kept for the next recalculation
    expect(b.warnings.join(" ")).toMatch(/Date of birth not captured/);
  });

  it("recalculating is idempotent (no doubled basic pay) and reuses the stored hours", async () => {
    await calculatePayRunOnce(ORG, "actor", await getPayRun(ORG, "sep"), { items: [{ id: "sep-2", ordinary_hours: 160 }] }, { fallback: true });
    const first = { a: item("sep-1").gross_pay, b: item("sep-2").gross_pay };
    await calculatePayRunOnce(ORG, "actor", await getPayRun(ORG, "sep"), {}, { fallback: true });
    await calculatePayRunOnce(ORG, "actor", await getPayRun(ORG, "sep"), {}, { fallback: true });
    expect({ a: item("sep-1").gross_pay, b: item("sep-2").gross_pay }).toEqual(first);
    expect(first).toEqual({ a: 12500, b: 16500 });
  });

  it("only this company's profiles are loaded", async () => {
    tables.payroll_profiles.push({ id: "p1", org_id: OTHER, membership_id: M1, pay_type: "monthly_salary", base_salary: 999999 });
    await calculatePayRunOnce(ORG, "actor", await getPayRun(ORG, "sep"), {}, { fallback: true });
    expect(item("sep-1").gross_pay).toBe(12500);
  });
});

describe("finalise → payslip", () => {
  it("copies the finalized item; YTD, tax year and employer contributions are frozen on the payslip", async () => {
    await calculatePayRunOnce(ORG, "actor", await getPayRun(ORG, "sep"), { items: [{ id: "sep-2", ordinary_hours: 160 }] }, { fallback: true });
    tables.pay_runs.find((r) => r.id === "sep").status = "approved";
    await finalizePayRun(ORG, "actor", "sep");

    const slip = tables.payslips.find((p) => p.pay_run_item_id === "sep-1");
    const it1 = item("sep-1");
    expect(slip).toMatchObject({
      gross_pay: it1.gross_pay,
      net_pay: it1.net_pay,
      total_deductions: it1.total_deductions,
      tax_deduction: 765,
      uif_deduction: 125,
      tax_year: "2026/27",
      locked: true,
    });
    expect(slip.ytd).toEqual({
      gross: 84500, // 6 × 12 000 + 12 500
      taxable: 84500,
      paye: 4815, // 6 × 675 + 765
      uif: 845,
      other_deductions: 0,
      net: 67230 + it1.net_pay,
    });
    expect(slip.employer_contributions).toMatchObject({ uif: 125, sdl: 125, total: 250 });
    expect(slip.calculation_breakdown.paye.paye).toBe(765);
    expect(tables.pay_runs.find((r) => r.id === "sep").finalized_at).toBeTruthy();
  });

  it("TEST 18 — a finalized run cannot be recalculated", async () => {
    tables.pay_runs.find((r) => r.id === "sep").finalized_at = "2026-09-25T12:00:00Z";
    await expect(calculatePayRun(ORG, "actor", "sep")).rejects.toMatchObject({ status: 409, message: /Create an adjustment run/ });
  });
});

describe("preview", () => {
  it("uses the pay date's tax year and the stored profile; unsaved pay fields are a flagged what-if", async () => {
    const saved = await previewCalculation(ORG, { membership_id: M1, pay_date: "2026-09-25", period_start: "2026-09-01", period_end: "2026-09-30" });
    expect(saved).toMatchObject({ source: "preview", what_if: false, tax_deduction: 675, tax_year: "2026/27" });
    const whatIf = await previewCalculation(ORG, { membership_id: M1, pay_date: "2026-09-25", profile: { base_salary: 25000 } });
    expect(whatIf).toMatchObject({ what_if: true, tax_deduction: 3381 });
    const feb = await previewCalculation(ORG, { membership_id: M1, pay_date: "2026-02-25" });
    expect(feb.tax_deduction).toBe(723.75); // 2025/26 table for a February 2026 payment
  });
});
