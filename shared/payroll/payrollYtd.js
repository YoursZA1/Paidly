// @ts-check
/**
 * Year-to-date payroll totals from finalized pay run items only.
 *
 * Counted: pay runs of the same company, finalized (finalized_at set), not cancelled, whose payment
 * date (pay_date, else period_end) falls inside the SARS tax year. Drafts, calculated-but-unfinalized
 * and cancelled runs never count. Pure: callers load rows; nothing here reads the database.
 */
import { ROUND_MONEY } from "./constants.js";
import { isWithinTaxYear, periodsPerTaxYear } from "./taxYear.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function statutory(item, code) {
  return (Array.isArray(item?.statutory_deductions) ? item.statutory_deductions : [])
    .filter((l) => String(l?.code || "").toUpperCase() === code)
    .reduce((s, l) => s + num(l.amount), 0);
}

export function runCountsForYtd(run, { orgId, taxYear, excludeRunId = null }) {
  if (!run) return false;
  if (orgId && String(run.org_id) !== String(orgId)) return false;
  if (excludeRunId && String(run.id) === String(excludeRunId)) return false;
  if (!run.finalized_at) return false;
  if (String(run.status || "").toLowerCase() === "cancelled") return false;
  return isWithinTaxYear(run.pay_date || run.period_end, taxYear);
}

/**
 * Period taxable remuneration of a stored item. New items carry calculation.period_taxable; older
 * items only stored the annualised taxable_income, which is divided back to one period.
 */
function itemTaxable(item, frequency) {
  const calc = item?.calculation && typeof item.calculation === "object" ? item.calculation : {};
  if (calc.period_taxable != null) {
    return {
      taxable: num(calc.period_taxable),
      regular: num(calc.regular_taxable ?? calc.period_taxable),
      irregular: num(calc.irregular_taxable),
      payeRegular: calc.paye?.regular_amount != null ? num(calc.paye.regular_amount) : statutory(item, "PAYE"),
    };
  }
  const taxable = num(item?.taxable_income) / periodsPerTaxYear(frequency);
  return { taxable, regular: taxable, irregular: 0, payeRegular: statutory(item, "PAYE") };
}

/**
 * @param {{
 *   items: Array<Record<string, any>>,          // pay_run_items of one employee (payroll profile)
 *   runs: Array<Record<string, any>>,           // their pay_runs
 *   orgId: string,
 *   profileId?: string | null,
 *   taxYear: { start: string, end: string, label?: string },
 *   excludeRunId?: string | null,               // the run being calculated
 *   frequency?: string,
 * }} input
 */
export function computePayrollYtd({ items = [], runs = [], orgId, profileId = null, taxYear, excludeRunId = null, frequency = "monthly" }) {
  const runById = new Map((runs || []).map((r) => [String(r.id), r]));
  const totals = {
    periods: 0,
    gross: 0,
    taxable: 0,
    regular_taxable: 0,
    irregular_taxable: 0,
    paye: 0,
    paye_regular: 0,
    uif: 0,
    other_deductions: 0,
    total_deductions: 0,
    net: 0,
  };
  const periodKeys = new Set();
  for (const item of items || []) {
    if (orgId && String(item.org_id) !== String(orgId)) continue;
    if (profileId && String(item.payroll_profile_id) !== String(profileId)) continue;
    const run = runById.get(String(item.pay_run_id));
    if (!runCountsForYtd(run, { orgId, taxYear, excludeRunId })) continue;
    const paye = statutory(item, "PAYE");
    const uif = statutory(item, "UIF");
    const tx = itemTaxable(item, frequency);
    totals.gross += num(item.gross_pay);
    totals.taxable += tx.taxable;
    totals.regular_taxable += tx.regular;
    totals.irregular_taxable += tx.irregular;
    totals.paye += paye;
    totals.paye_regular += tx.payeRegular;
    totals.uif += uif;
    totals.total_deductions += num(item.total_deductions);
    totals.other_deductions += num(item.total_deductions) - paye - uif;
    totals.net += num(item.net_pay);
    // Adjustment runs correct a period; they are not an extra period of employment.
    if (String(run.run_type || "regular") !== "adjustment") periodKeys.add(String(run.period_start));
  }
  totals.periods = periodKeys.size;
  for (const k of Object.keys(totals)) {
    if (k !== "periods") totals[k] = ROUND_MONEY(totals[k]);
  }
  return totals;
}

/** YTD shown on a payslip: prior finalized history plus the item being finalized. */
export function payslipYtd(prior, item, frequency = "monthly") {
  const paye = statutory(item, "PAYE");
  const uif = statutory(item, "UIF");
  const tx = itemTaxable(item, frequency);
  return {
    gross: ROUND_MONEY(num(prior?.gross) + num(item?.gross_pay)),
    taxable: ROUND_MONEY(num(prior?.taxable) + tx.taxable),
    paye: ROUND_MONEY(num(prior?.paye) + paye),
    uif: ROUND_MONEY(num(prior?.uif) + uif),
    other_deductions: ROUND_MONEY(num(prior?.other_deductions) + num(item?.total_deductions) - paye - uif),
    net: ROUND_MONEY(num(prior?.net) + num(item?.net_pay)),
  };
}
