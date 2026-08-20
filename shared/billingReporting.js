/**
 * Verified PayFast payment reporting.
 * Revenue = completed payment_history rows on/after PAYMENT_REPORTING_START_ISO (UTC).
 * Never count trials, admin grants, pending/failed/invalid, or pre-cutoff history.
 */

import { PAYMENT_HISTORY_STATUS, coercePaymentHistoryStatus } from "./paymentHistoryStatuses.js";
import { PAYMENT_REPORTING_START_ISO } from "./subscriptionAccess.js";

export { PAYMENT_REPORTING_START_ISO };

/** Admin payment table labels (reporting UI). Ledger status remains payment_history vocabulary. */
export const REPORTING_PAYMENT_LABEL = Object.freeze({
  SUCCESSFUL: "SUCCESSFUL",
  PENDING: "PENDING",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  INVALID: "INVALID",
  REFUNDED: "REFUNDED",
});

/**
 * @param {object | null | undefined} row
 * @returns {Date | null}
 */
export function paymentEffectiveAt(row) {
  const raw = row?.transaction_date || row?.paid_at || row?.successful_at || row?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Map ledger status → reporting label. Only SUCCESSFUL counts toward revenue.
 * @param {object | string | null | undefined} rowOrStatus
 */
export function reportingPaymentLabel(rowOrStatus) {
  const raw =
    rowOrStatus && typeof rowOrStatus === "object"
      ? rowOrStatus.payment_status || rowOrStatus.status
      : rowOrStatus;
  const st = coercePaymentHistoryStatus(raw);
  if (st === PAYMENT_HISTORY_STATUS.COMPLETED) return REPORTING_PAYMENT_LABEL.SUCCESSFUL;
  if (st === PAYMENT_HISTORY_STATUS.PENDING) return REPORTING_PAYMENT_LABEL.PENDING;
  if (st === PAYMENT_HISTORY_STATUS.FAILED) return REPORTING_PAYMENT_LABEL.FAILED;
  if (st === PAYMENT_HISTORY_STATUS.CANCELLED) return REPORTING_PAYMENT_LABEL.CANCELLED;
  if (st === PAYMENT_HISTORY_STATUS.REFUNDED) return REPORTING_PAYMENT_LABEL.REFUNDED;
  return REPORTING_PAYMENT_LABEL.INVALID;
}

/**
 * @param {object | null | undefined} row
 * @param {string} [startIso]
 */
export function paymentCountsTowardRevenue(row, startIso = PAYMENT_REPORTING_START_ISO) {
  if (!row) return false;
  if (reportingPaymentLabel(row) !== REPORTING_PAYMENT_LABEL.SUCCESSFUL) return false;
  const at = paymentEffectiveAt(row);
  if (!at) return false;
  const start = new Date(startIso);
  if (!Number.isFinite(start.getTime())) return false;
  return at.getTime() >= start.getTime();
}

/**
 * @param {object[]} rows
 * @param {string} [startIso]
 */
export function getSuccessfulPaymentsSince(rows, startIso = PAYMENT_REPORTING_START_ISO) {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((row) => paymentCountsTowardRevenue(row, startIso));
}

/**
 * @param {object[]} rows
 * @param {string} [startIso]
 * @returns {{ count: number, amount: number, currency: string }}
 */
export function getRevenueSince(rows, startIso = PAYMENT_REPORTING_START_ISO) {
  const ok = getSuccessfulPaymentsSince(rows, startIso);
  let amount = 0;
  for (const row of ok) {
    const n = Number(row.amount || 0);
    if (Number.isFinite(n)) amount += n;
  }
  return {
    count: ok.length,
    amount: Math.round(amount * 100) / 100,
    currency: "ZAR",
    startDate: startIso,
  };
}
