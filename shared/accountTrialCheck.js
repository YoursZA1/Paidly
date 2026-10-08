/**
 * Trial clock from the account creation timestamp.
 * Duration is TRIAL_DURATION_DAYS. Subscribed, free-access, suspended, and admin-managed
 * rows are left alone. Status stays the existing subscriptions.status (expired), which the
 * lifecycle already reports as TRIAL_EXPIRED. No second status column.
 */

import { isAdminManaged, trialEndFromStart } from "./subscriptionAccess.js";
import { hasFreeAccess } from "./trialLifecycle.js";
import { coerceSubscriptionStatus, SUBSCRIPTION_STATUS } from "./subscriptionStatuses.js";

/**
 * @param {object | null | undefined} row subscription row plus accountCreatedAt
 * @param {Date} [now]
 * @returns {{ action: "skip" | "unchanged" | "anchor" | "expire", reason?: string, phase?: "TRIAL_ACTIVE" | "TRIAL_EXPIRED", trialEndsAt?: string, setStartedAt?: string }}
 */
export function decideAccountTrial(row, now = new Date()) {
  if (!row) return { action: "skip", reason: "missing" };
  const status = coerceSubscriptionStatus(row.status);
  if (status === SUBSCRIPTION_STATUS.ACTIVE) return { action: "skip", reason: "active" };
  if (status === SUBSCRIPTION_STATUS.SUSPENDED) return { action: "skip", reason: "suspended" };
  if (status === SUBSCRIPTION_STATUS.PAST_DUE || status === SUBSCRIPTION_STATUS.CANCELLED) {
    return { action: "skip", reason: "billing" };
  }
  if (hasFreeAccess(row, now)) return { action: "skip", reason: "free_access" };
  if (row.payfast_token) return { action: "skip", reason: "payfast" };
  if (row.migration_excluded === true) return { action: "skip", reason: "excluded" };
  // An administrator's end date, or an open-ended admin grant, is not replaced by account age.
  if (isAdminManaged(row)) return { action: "skip", reason: "admin" };
  if (status !== SUBSCRIPTION_STATUS.TRIALING && status !== SUBSCRIPTION_STATUS.EXPIRED) {
    return { action: "skip", reason: "not_trial" };
  }

  const createdAt = row.accountCreatedAt || row.account_created_at || null;
  const end = trialEndFromStart(createdAt);
  if (!end) return { action: "skip", reason: "no_created_at" };

  const endMs = new Date(end).getTime();
  const expired = endMs <= now.getTime();
  const phase = expired ? "TRIAL_EXPIRED" : "TRIAL_ACTIVE";
  const storedMs = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : NaN;
  const hasStored = Number.isFinite(storedMs);
  const setStartedAt = row.trial_started_at ? undefined : new Date(createdAt).toISOString();

  if (!expired) {
    // A sooner stored end is the one the account already has. Do not lengthen it.
    if (hasStored && storedMs <= endMs) return { action: "unchanged", phase, trialEndsAt: row.trial_ends_at };
    return { action: "anchor", phase, trialEndsAt: end, setStartedAt };
  }

  if (status === SUBSCRIPTION_STATUS.EXPIRED && hasStored && storedMs <= now.getTime()) {
    return { action: "unchanged", phase, trialEndsAt: row.trial_ends_at };
  }
  // Already overdue on the stored date: expire the status and keep that date so the
  // once-only email key does not move.
  if (hasStored && storedMs <= now.getTime()) {
    return { action: "expire", phase, trialEndsAt: new Date(storedMs).toISOString() };
  }
  return { action: "expire", phase, trialEndsAt: end, setStartedAt };
}
