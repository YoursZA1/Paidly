/**
 * Definitions behind the admin Subscriptions summary cards.
 *
 * The server counts rows with these exact status sets (buildSubscriptionOverview /
 * buildBillingReporting) and the table filters rows with the same sets, so a card's number and the
 * rows you get when you click it always mean the same thing.
 */

import { SUBSCRIPTION_STATUS } from "./subscriptionStatuses.js";

/** Status buckets shown as the "Active / Pending / Expired / …" cards. */
export const SUBSCRIPTION_OVERVIEW_BUCKETS = Object.freeze([
  { key: "active", label: "Active", statuses: [SUBSCRIPTION_STATUS.ACTIVE] },
  {
    key: "pending",
    label: "Pending",
    statuses: [SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PROCESSING],
  },
  { key: "expired", label: "Expired", statuses: [SUBSCRIPTION_STATUS.EXPIRED] },
  {
    key: "cancelled",
    label: "Cancelled",
    statuses: [SUBSCRIPTION_STATUS.CANCELLED, "canceled"],
  },
  { key: "trial", label: "Trial", statuses: [SUBSCRIPTION_STATUS.TRIALING, "trial"] },
  { key: "pastDue", label: "Past Due", statuses: [SUBSCRIPTION_STATUS.PAST_DUE] },
  { key: "failed", label: "Failed", statuses: [SUBSCRIPTION_STATUS.FAILED] },
]);

/** Status statuses counted as a trial row (the DB has both spellings). */
export const TRIAL_STATUSES = Object.freeze([SUBSCRIPTION_STATUS.TRIALING, "trial"]);

/** Values the Subscriptions table status filter accepts. */
export const SUBSCRIPTION_STATUS_FILTER = Object.freeze({
  ALL: "all",
  ACTIVE: "active",
  PENDING: "pending",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  TRIAL: "trialing",
  PAST_DUE: "past_due",
  FAILED: "failed",
  SUSPENDED: "suspended",
  ADMIN_GRANTED: "admin_granted",
  /** Rows the table synthesises for users with no subscription at all. */
  NONE: "none",
  /** "Trial Users" card: trialing and not past trial_ends_at. */
  LIVE_TRIAL: "live_trial",
  /** "Expired Trials" card: expired rows + trials past their end date. */
  EXPIRED_TRIALS: "expired_trials",
});

/** Bucket key (server payload) → status filter value used by the table + dropdown. */
export const BUCKET_FILTER_BY_KEY = Object.freeze({
  active: SUBSCRIPTION_STATUS_FILTER.ACTIVE,
  pending: SUBSCRIPTION_STATUS_FILTER.PENDING,
  expired: SUBSCRIPTION_STATUS_FILTER.EXPIRED,
  cancelled: SUBSCRIPTION_STATUS_FILTER.CANCELLED,
  trial: SUBSCRIPTION_STATUS_FILTER.TRIAL,
  pastDue: SUBSCRIPTION_STATUS_FILTER.PAST_DUE,
  failed: SUBSCRIPTION_STATUS_FILTER.FAILED,
});

const norm = (v) => String(v ?? "").trim().toLowerCase();

function bucketStatuses(key) {
  const bucket = SUBSCRIPTION_OVERVIEW_BUCKETS.find((b) => b.key === key);
  return bucket ? bucket.statuses : null;
}

/** Trial that has not run out yet — the "Trial Users" card. */
export function isLiveTrialRow(row, now = new Date()) {
  if (!TRIAL_STATUSES.includes(norm(row?.status))) return false;
  const endsAt = row?.trial_ends_at;
  if (endsAt == null || endsAt === "") return true;
  const t = new Date(endsAt).getTime();
  return !Number.isFinite(t) || t > now.getTime();
}

/**
 * The "Expired Trials" card: subscriptions that expired, plus trial rows past their end date that
 * the cron has not flipped yet (admin-managed trials are excluded, exactly as the server counts).
 */
export function isExpiredTrialRow(row, now = new Date()) {
  const status = norm(row?.status);
  if (status === SUBSCRIPTION_STATUS.EXPIRED) return true;
  if (!TRIAL_STATUSES.includes(status)) return false;
  if (row?.admin_override === true) return false;
  const endsAt = row?.trial_ends_at;
  if (endsAt == null || endsAt === "") return false;
  const t = new Date(endsAt).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/**
 * Does a table row belong under this status filter?
 * @param {object} row subscription row (or a synthetic "no subscription" row)
 * @param {string} filter one of SUBSCRIPTION_STATUS_FILTER
 * @param {Date} [now]
 */
export function subscriptionMatchesStatusFilter(row, filter, now = new Date()) {
  const key = norm(filter) || SUBSCRIPTION_STATUS_FILTER.ALL;
  if (key === SUBSCRIPTION_STATUS_FILTER.ALL) return true;

  const status = norm(row?.status);
  if (key === SUBSCRIPTION_STATUS_FILTER.ADMIN_GRANTED) {
    return norm(row?.subscription_source) === "admin" && status === SUBSCRIPTION_STATUS.ACTIVE;
  }
  if (key === SUBSCRIPTION_STATUS_FILTER.LIVE_TRIAL) return isLiveTrialRow(row, now);
  if (key === SUBSCRIPTION_STATUS_FILTER.EXPIRED_TRIALS) return isExpiredTrialRow(row, now);

  // Bucket keys cover every spelling the database holds (trialing/trial, cancelled/canceled,
  // pending/processing), so the table matches the card's count.
  const viaBucket =
    bucketStatuses(
      Object.keys(BUCKET_FILTER_BY_KEY).find((b) => BUCKET_FILTER_BY_KEY[b] === key)
    ) || null;
  if (viaBucket) return viaBucket.map(norm).includes(status);

  return status === key;
}
