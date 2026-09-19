/**
 * Payroll → bank reconciliation.
 * Expected = finalised pay run net_total (locked). Actual = salary payment that
 * left the bank (entered on the pay run, or matched Cash Flow expenses imported
 * from a bank statement). Pure — no I/O.
 */

export const RECONCILIATION_STATUS = Object.freeze({
  NOT_FINALISED: "not_finalised",
  AWAITING_PAYMENT: "awaiting_payment",
  RECONCILED: "reconciled",
  VARIANCE: "variance",
});

/** Half a cent: amounts are stored to 2dp, so anything smaller is rounding noise. */
const TOLERANCE = 0.005;

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * @param {{ expected?: number|null, actual?: number|null, finalised?: boolean }} input
 */
export function reconcilePayrollPayment({ expected, actual, finalised = true } = {}) {
  const exp = money(expected);
  if (!finalised) {
    return { expected: exp, actual: null, difference: null, status: RECONCILIATION_STATUS.NOT_FINALISED };
  }
  if (actual === null || actual === undefined || actual === "") {
    return { expected: exp, actual: null, difference: null, status: RECONCILIATION_STATUS.AWAITING_PAYMENT };
  }
  const act = money(actual);
  const difference = money(act - exp);
  return {
    expected: exp,
    actual: act,
    difference,
    status: Math.abs(difference) < TOLERANCE ? RECONCILIATION_STATUS.RECONCILED : RECONCILIATION_STATUS.VARIANCE,
  };
}

/**
 * Cash Flow expenses that look like the salary payment for a run: category
 * `salary` dated within the pay window (period start → pay date + grace days).
 *
 * @param {Array<Record<string, unknown>>} expenses
 * @param {{ period_start?: string|null, period_end?: string|null, pay_date?: string|null }} run
 * @param {{ graceDays?: number, excludeIds?: Set<string> }} [opts]
 */
export function salaryExpenseCandidates(expenses, run, opts = {}) {
  const graceDays = Number.isFinite(Number(opts.graceDays)) ? Number(opts.graceDays) : 10;
  const exclude = opts.excludeIds || new Set();
  const from = String(run?.period_start || "").slice(0, 10);
  const anchor = String(run?.pay_date || run?.period_end || "").slice(0, 10);
  if (!from || !anchor) return [];
  const toDate = new Date(`${anchor}T00:00:00Z`);
  toDate.setUTCDate(toDate.getUTCDate() + graceDays);
  const to = toDate.toISOString().slice(0, 10);
  return (expenses || [])
    .filter((row) => {
      if (!row?.id || exclude.has(String(row.id))) return false;
      if (String(row.category || "").toLowerCase() !== "salary") return false;
      const d = String(row.date || "").slice(0, 10);
      return d >= from && d <= to;
    })
    .map((row) => ({
      id: row.id,
      date: String(row.date || "").slice(0, 10),
      amount: money(row.amount),
      description: row.description || row.vendor || null,
      vendor: row.vendor || null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * @param {Array<{ amount?: number }>} rows
 */
export function sumAmounts(rows) {
  return money((rows || []).reduce((sum, row) => sum + money(row?.amount), 0));
}
