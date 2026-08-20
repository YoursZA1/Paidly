/**
 * Canonical SaaS subscription access + trial rules.
 * Server/database timestamps only — never the browser clock for SoR decisions.
 *
 * Admin grant is status=active + subscription_source=admin + admin_override
 * (CHECK constraint does not allow admin_granted / admin_suspended as statuses).
 */

import { coerceSubscriptionStatus, SUBSCRIPTION_STATUS } from "./subscriptionStatuses.js";

export const TRIAL_DURATION_DAYS = 7;

/** New Paidly payment/revenue reporting epoch (UTC). Do not use the client timezone. */
export const PAYMENT_REPORTING_START_ISO = "2026-08-20T00:00:00.000Z";

export const SUBSCRIPTION_SOURCE = Object.freeze({
  SYSTEM_TRIAL: "system_trial",
  PAYFAST: "payfast",
  ADMIN: "admin",
});

/**
 * @param {string | Date | number | null | undefined} start
 * @param {number} days
 * @returns {string | null}
 */
export function addCalendarDaysIso(start, days) {
  const d = start instanceof Date ? new Date(start.getTime()) : new Date(start);
  if (!Number.isFinite(d.getTime())) return null;
  const n = Number(days);
  if (!Number.isFinite(n)) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

/**
 * @param {string | Date} accountCreatedAt
 */
export function trialEndFromStart(accountCreatedAt) {
  return addCalendarDaysIso(accountCreatedAt, TRIAL_DURATION_DAYS);
}

/**
 * @param {object | null | undefined} sub
 */
export function isAdminManaged(sub) {
  if (!sub || typeof sub !== "object") return false;
  if (sub.admin_override === true || sub.admin_override === "true" || sub.admin_override === 1) {
    return true;
  }
  return String(sub.subscription_source || "").trim().toLowerCase() === SUBSCRIPTION_SOURCE.ADMIN;
}

/**
 * @param {string | Date | null | undefined} iso
 * @param {Date} [now]
 */
export function isTimestampInFuture(iso, now = new Date()) {
  if (iso == null || iso === "") return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

/**
 * Trialing with a future trial_ends_at. Unset trial_ends_at is treated as still valid
 * only for legacy rows (do not invent an end date on the client).
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function isTrialCurrentlyValid(sub, now = new Date()) {
  if (!sub) return false;
  const st = coerceSubscriptionStatus(sub.status);
  if (st !== SUBSCRIPTION_STATUS.TRIALING) return false;
  if (isAdminManaged(sub)) return true;
  const raw = sub.trial_ends_at;
  if (raw == null || raw === "") return true;
  return isTimestampInFuture(raw, now);
}

/**
 * True when automation may flip trialing → expired. Never expires admin-managed rows.
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function shouldExpireTrialRow(sub, now = new Date()) {
  if (!sub) return false;
  if (isAdminManaged(sub)) return false;
  const st = coerceSubscriptionStatus(sub.status);
  if (st !== SUBSCRIPTION_STATUS.TRIALING) return false;
  const raw = sub.trial_ends_at;
  if (raw == null || raw === "") return false;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/**
 * Central access check: isSubscriptionActive(account).
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function hasSubscriptionAccess(sub, now = new Date()) {
  if (!sub) return false;
  const st = coerceSubscriptionStatus(sub.status);
  if (!st) return false;

  if (st === SUBSCRIPTION_STATUS.SUSPENDED) return false;
  if (st === SUBSCRIPTION_STATUS.EXPIRED) return false;
  if (st === SUBSCRIPTION_STATUS.FAILED) return false;
  if (st === SUBSCRIPTION_STATUS.PENDING || st === SUBSCRIPTION_STATUS.PROCESSING) return false;

  if (st === SUBSCRIPTION_STATUS.ACTIVE) return true;

  if (st === SUBSCRIPTION_STATUS.TRIALING) {
    return isTrialCurrentlyValid(sub, now);
  }

  if (st === SUBSCRIPTION_STATUS.PAST_DUE) {
    return isTimestampInFuture(sub.grace_ends_at, now);
  }

  if (st === SUBSCRIPTION_STATUS.CANCELLED) {
    const periodEnd = sub.current_period_end || sub.expires_at || sub.next_billing_date;
    return isTimestampInFuture(periodEnd, now);
  }

  return false;
}

/**
 * Prefer a live agreement over a newer pending checkout row.
 * @param {object[]} rows
 * @param {Date} [now]
 */
export function pickAccessSubscriptionRow(rows, now = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const score = (s) => {
    const st = coerceSubscriptionStatus(s?.status);
    const access = hasSubscriptionAccess(s, now);
    if (access && st === SUBSCRIPTION_STATUS.ACTIVE) return 100;
    if (access && st === SUBSCRIPTION_STATUS.TRIALING) return 90;
    if (access && st === SUBSCRIPTION_STATUS.PAST_DUE) return 80;
    if (access && st === SUBSCRIPTION_STATUS.CANCELLED) return 70;
    if (st === SUBSCRIPTION_STATUS.PENDING || st === SUBSCRIPTION_STATUS.PROCESSING) return 20;
    if (st === SUBSCRIPTION_STATUS.EXPIRED) return 10;
    return 0;
  };
  return [...rows].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    return tb - ta;
  })[0];
}

/**
 * Whole remaining calendar days from trial_ends_at (server timestamp), floored, min 0.
 * @param {string | Date | null | undefined} trialEndsAt
 * @param {Date} [now]
 */
export function trialDaysRemaining(trialEndsAt, now = new Date()) {
  if (trialEndsAt == null || trialEndsAt === "") return null;
  const end = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * User-facing billing copy. Does not expose admin_override internals.
 * @param {object | null | undefined} subOrProfile
 * @param {Date} [now]
 */
export function describeAccessFacingState(subOrProfile, now = new Date()) {
  if (!subOrProfile) {
    return { headline: "No subscription", detail: "", daysRemaining: null };
  }
  const st = coerceSubscriptionStatus(subOrProfile.status || subOrProfile.subscription_status);
  const trialEnd = subOrProfile.trial_ends_at;
  const days = trialDaysRemaining(trialEnd, now);
  const admin = isAdminManaged(subOrProfile);

  if (admin && st === SUBSCRIPTION_STATUS.ACTIVE) {
    return {
      headline: "Active",
      detail: "Managed by administrator",
      daysRemaining: null,
    };
  }
  if (st === SUBSCRIPTION_STATUS.TRIALING && isTrialCurrentlyValid(subOrProfile, now)) {
    const remaining = days == null ? null : days;
    return {
      headline: "Free Trial",
      detail: remaining == null ? "Trial active" : `${remaining} day${remaining === 1 ? "" : "s"} remaining`,
      daysRemaining: remaining,
    };
  }
  if (st === SUBSCRIPTION_STATUS.TRIALING || st === SUBSCRIPTION_STATUS.EXPIRED) {
    return {
      headline: "Trial expired",
      detail: "Subscribe to continue",
      daysRemaining: 0,
    };
  }
  if (st === SUBSCRIPTION_STATUS.ACTIVE) {
    const next = subOrProfile.next_billing_date;
    return {
      headline: "Active",
      detail: next ? `Next payment: ${next}` : "",
      daysRemaining: null,
    };
  }
  if (st === SUBSCRIPTION_STATUS.SUSPENDED) {
    return { headline: "Suspended", detail: "Access is restricted", daysRemaining: null };
  }
  if (st === SUBSCRIPTION_STATUS.CANCELLED) {
    return { headline: "Cancelled", detail: "", daysRemaining: null };
  }
  if (st === SUBSCRIPTION_STATUS.FAILED) {
    return { headline: "Payment failed", detail: "Subscribe to continue", daysRemaining: null };
  }
  return { headline: st || "Unknown", detail: "", daysRemaining: days };
}
