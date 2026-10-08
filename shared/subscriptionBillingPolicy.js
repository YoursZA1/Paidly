/**
 * Paidly's own subscription grace and payment-health policy.
 *
 * PayFast collects the recurring charge and reports the result on the ITN.
 * This module does not schedule PayFast retries. A missed billing date is not
 * treated as a failed payment until PayFast says so.
 *
 * Ledger statuses stay on payment_history (pending | completed | failed |
 * cancelled | refunded). "SUCCESS" / "PAID" in product language map to
 * payment_history.payment_status = completed and subscriptions.status = active.
 */

import {
  PAST_DUE_GRACE_DAYS,
  addCalendarDaysIso,
  isTimestampInFuture,
} from "./subscriptionAccess.js";
import { coerceSubscriptionStatus, SUBSCRIPTION_STATUS } from "./subscriptionStatuses.js";

export { PAST_DUE_GRACE_DAYS };

/** From this many days after the failure, the customer sees a stronger warning. Access continues. */
export const GRACE_WARNING_AFTER_DAYS = 3;

/** PayFast may still be retrying. Paidly does not invent the next attempt date. */
export const BILLING_SILENCE_DAYS = 2;

export const PAYMENT_HEALTH = Object.freeze({
  GOOD: "GOOD",
  PAST_DUE: "PAST_DUE",
  GRACE_PERIOD: "GRACE_PERIOD",
  SUSPENDED: "SUSPENDED",
});

export const BILLING_NOTIFY = Object.freeze({
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_FAILED_REMINDER: "PAYMENT_FAILED_REMINDER",
});

const HEALTH_LABEL = Object.freeze({
  GOOD: "Good",
  PAST_DUE: "Past due",
  GRACE_PERIOD: "Grace period",
  SUSPENDED: "Suspended",
});

/**
 * @param {string | null | undefined} health
 */
export function paymentHealthLabel(health) {
  return HEALTH_LABEL[health] || HEALTH_LABEL.GOOD;
}

/**
 * @param {object | null | undefined} sub
 */
export function paymentFailedAt(sub) {
  if (!sub) return null;
  return sub.past_due_at || sub.pastDueAt || sub.last_payment_failure_at || sub.payment_failed_at || null;
}

/**
 * @param {object | null | undefined} sub
 */
export function graceEndsAt(sub) {
  if (!sub) return null;
  return sub.grace_ends_at || sub.graceEndsAt || null;
}

/**
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 * @returns {'GOOD'|'PAST_DUE'|'GRACE_PERIOD'|'SUSPENDED'}
 */
export function paymentHealthFor(sub, now = new Date()) {
  if (!sub) return PAYMENT_HEALTH.GOOD;
  const st = coerceSubscriptionStatus(sub.status || sub.subscription_status || sub.currentStatus);
  if (st === SUBSCRIPTION_STATUS.SUSPENDED) return PAYMENT_HEALTH.SUSPENDED;
  if (st !== SUBSCRIPTION_STATUS.PAST_DUE) return PAYMENT_HEALTH.GOOD;

  const end = graceEndsAt(sub);
  if (!end || !isTimestampInFuture(end, now)) return PAYMENT_HEALTH.SUSPENDED;

  const failed = paymentFailedAt(sub);
  const warningAt = failed ? addCalendarDaysIso(failed, GRACE_WARNING_AFTER_DAYS) : null;
  if (warningAt && new Date(warningAt).getTime() <= now.getTime()) return PAYMENT_HEALTH.GRACE_PERIOD;
  return PAYMENT_HEALTH.PAST_DUE;
}

/**
 * Whole days left in the grace window. 0 when the window has elapsed. Null when there is no date.
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function graceDaysRemaining(sub, now = new Date()) {
  const end = graceEndsAt(sub);
  if (!end) return null;
  const ms = new Date(end).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Informational only. The billing date on the subscription row is the source of truth.
 * @param {string | Date | null | undefined} nextBilling
 * @param {Date} [now]
 */
export function nextPaymentCountdownDays(nextBilling, now = new Date()) {
  if (nextBilling == null || nextBilling === "") return null;
  const ms = new Date(nextBilling).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * @param {string | Date | null | undefined} iso
 */
export function formatBillingDate(iso) {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(d);
}

/**
 * @param {number | null | undefined} days
 */
export function nextPaymentCountdownLabel(days) {
  if (days == null || days <= 0) return null;
  return `Next payment in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * A failed renewal keeps the agreement. Repeat ITNs during an open grace do not
 * restart the clock and do not cancel. PayFast sends another ITN if it retries.
 *
 * @param {object | null | undefined} existing
 * @param {Date} [now]
 * @param {string | null} [failureReason]
 */
export function failedRenewalPatch(existing, now = new Date(), failureReason = null) {
  const nowIso = now.toISOString();
  const st = coerceSubscriptionStatus(existing?.status);
  const reasonText = String(failureReason || "").trim() || null;
  // Only an agreement that was paying (active / past_due / suspended) can be past due. A failed
  // first payment (pending checkout, trial, lapsed row) never starts a grace period, because
  // past_due grants access during grace: the customer would get paid features without paying.
  if (!isPaidAgreementStatus(st)) {
    return {
      status: st === SUBSCRIPTION_STATUS.PENDING || st === SUBSCRIPTION_STATUS.PROCESSING
        ? SUBSCRIPTION_STATUS.FAILED
        : st || SUBSCRIPTION_STATUS.FAILED,
      past_due_at: existing?.past_due_at || null,
      grace_ends_at: existing?.grace_ends_at || null,
      last_payment_failure_at: nowIso,
      last_payment_failure_reason: reasonText,
      next_retry_at: null,
      failure_count: Number(existing?.failure_count || 0) + 1,
      dunning_stage: Number(existing?.dunning_stage || 0),
      graceStarted: false,
      initialFailure: true,
    };
  }
  if (st === SUBSCRIPTION_STATUS.SUSPENDED) {
    return {
      status: SUBSCRIPTION_STATUS.SUSPENDED,
      past_due_at: existing.past_due_at || existing.last_payment_failure_at || nowIso,
      grace_ends_at: existing.grace_ends_at || null,
      last_payment_failure_at: nowIso,
      last_payment_failure_reason: String(failureReason || "").trim() || null,
      next_retry_at: null,
      failure_count: Number(existing?.failure_count || 0) + 1,
      dunning_stage: Number(existing?.dunning_stage || 0) + 1,
      graceStarted: false,
    };
  }
  const openGrace =
    st === SUBSCRIPTION_STATUS.PAST_DUE && isTimestampInFuture(existing?.grace_ends_at, now);
  const failedAt = openGrace
    ? existing.past_due_at || existing.last_payment_failure_at || nowIso
    : nowIso;
  const grace = openGrace ? existing.grace_ends_at : addCalendarDaysIso(nowIso, PAST_DUE_GRACE_DAYS);
  const reason = String(failureReason || "").trim() || null;
  return {
    status: SUBSCRIPTION_STATUS.PAST_DUE,
    past_due_at: failedAt,
    grace_ends_at: grace,
    last_payment_failure_at: nowIso,
    last_payment_failure_reason: reason,
    next_retry_at: null,
    failure_count: Number(existing?.failure_count || 0) + 1,
    dunning_stage: Number(existing?.dunning_stage || 0) + 1,
    graceStarted: !openGrace,
  };
}

/** Statuses of an agreement that has been paying. Only these can go past due. */
export function isPaidAgreementStatus(status) {
  const st = coerceSubscriptionStatus(status);
  return (
    st === SUBSCRIPTION_STATUS.ACTIVE ||
    st === SUBSCRIPTION_STATUS.PAST_DUE ||
    st === SUBSCRIPTION_STATUS.SUSPENDED
  );
}

function addMonthsUtc(iso, months) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/**
 * Next charge date after a successful PayFast payment. Always after `now`.
 *
 * PayFast bills on the subscription's billing date and every cycle after it. The ITN's date
 * (`next_run` when present, otherwise `billing_date`) is used only as that anchor: a date
 * that is not in the future is rolled forward whole cycles from the anchor (no drift on
 * month-end anchors). Without any date, one cycle from now.
 *
 * @param {string | null | undefined} anchorIso ISO date from the ITN, or null
 * @param {number} cycleMonths 1 monthly, 3, 6, 12 annual
 * @param {Date} [now]
 */
export function nextBillingAfterPayment(anchorIso, cycleMonths = 1, now = new Date()) {
  const months = Math.max(1, Math.floor(Number(cycleMonths) || 1));
  const nowMs = now.getTime();
  const anchorMs = anchorIso ? new Date(anchorIso).getTime() : NaN;
  if (!Number.isFinite(anchorMs)) return addMonthsUtc(now.toISOString(), months);
  if (anchorMs > nowMs) return new Date(anchorMs).toISOString();
  for (let k = 1; k <= 1200; k += 1) {
    const next = addMonthsUtc(new Date(anchorMs).toISOString(), k * months);
    if (next && new Date(next).getTime() > nowMs) return next;
  }
  return addMonthsUtc(now.toISOString(), months);
}

/**
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function shouldSuspendExpiredGrace(sub, now = new Date()) {
  const st = coerceSubscriptionStatus(sub?.status);
  if (st !== SUBSCRIPTION_STATUS.PAST_DUE) return false;
  const end = graceEndsAt(sub);
  if (!end) return false;
  const t = new Date(end).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/**
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function shouldFinishCancelAtPeriodEnd(sub, now = new Date()) {
  if (sub?.cancel_at_period_end !== true) return false;
  const st = coerceSubscriptionStatus(sub.status);
  if (st !== SUBSCRIPTION_STATUS.ACTIVE && st !== SUBSCRIPTION_STATUS.PAST_DUE) return false;
  const end = sub.current_period_end || sub.expires_at;
  if (!end) return false;
  const t = new Date(end).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/**
 * Customer cancel stops future PayFast charges and keeps access until the paid period ends.
 * No new status: cancel_at_period_end stays on the current row until the period elapses.
 *
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function customerCancelPatch(sub, now = new Date()) {
  const nowIso = now.toISOString();
  const st = coerceSubscriptionStatus(sub?.status);
  const periodEnd = sub?.current_period_end || sub?.expires_at || null;
  const periodOpen = Boolean(periodEnd) && isTimestampInFuture(periodEnd, now);
  const keepUntilEnd =
    periodOpen && (st === SUBSCRIPTION_STATUS.ACTIVE || st === SUBSCRIPTION_STATUS.PAST_DUE);

  if (keepUntilEnd) {
    return {
      cancelAtPeriodEnd: true,
      patch: {
        cancel_at_period_end: true,
        next_billing_date: null,
        next_retry_at: null,
        updated_at: nowIso,
      },
    };
  }

  return {
    cancelAtPeriodEnd: false,
    patch: {
      status: SUBSCRIPTION_STATUS.CANCELLED,
      cancelled_at: nowIso,
      canceled_at: nowIso,
      cancel_at_period_end: false,
      next_billing_date: null,
      next_retry_at: null,
      grace_ends_at: null,
      updated_at: nowIso,
    },
  };
}

/**
 * @param {object} payload PayFast ITN body
 */
export function payfastFailureReason(payload) {
  const src = payload && typeof payload === "object" ? payload : {};
  const raw = src.reason || src.error || src.pf_error || src.failure_reason || "";
  const text = String(raw).replace(/\s+/g, " ").trim().slice(0, 500);
  if (text) return text;
  return "PayFast could not collect this subscription payment";
}
