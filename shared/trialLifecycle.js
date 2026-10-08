/**
 * Trial lifecycle — one place for phase, countdown, and which conversion email is due.
 * Access still comes from hasSubscriptionAccess. This module does not grant access by itself.
 */

import {
  SUBSCRIPTION_SOURCE,
  hasSubscriptionAccess,
  isAdminManaged,
  trialRemainingBreakdown,
} from "./subscriptionAccess.js";
import { coerceSubscriptionStatus, SUBSCRIPTION_STATUS } from "./subscriptionStatuses.js";

export const ENDING_SOON_DAYS = 3;
export const FOLLOWUP_AFTER_DAYS = 3;

/** Default lengths an admin can assign. Custom is an explicit end date or a 1–365 day count. */
export const TRIAL_DURATION_OPTIONS = Object.freeze([
  { id: "7", days: 7, label: "7 days" },
  { id: "14", days: 14, label: "14 days" },
  { id: "30", days: 30, label: "30 days" },
  { id: "custom", days: null, label: "Custom" },
]);

export const TRIAL_EXTEND_DAY_OPTIONS = Object.freeze([3, 7, 14, 30]);
export const FREE_ACCESS_DAY_OPTIONS = Object.freeze([7, 30, 90]);

export const TRIAL_PHASE = Object.freeze({
  TRIAL_ACTIVE: "TRIAL_ACTIVE",
  TRIAL_ENDING_SOON: "TRIAL_ENDING_SOON",
  TRIAL_EXPIRED: "TRIAL_EXPIRED",
  SUBSCRIPTION_ACTIVE: "SUBSCRIPTION_ACTIVE",
  FREE_ACCESS: "FREE_ACCESS",
  SUSPENDED: "SUSPENDED",
  PAST_DUE: "PAST_DUE",
  NONE: "NONE",
});

export const TRIAL_PHASE_LABEL = Object.freeze({
  [TRIAL_PHASE.TRIAL_ACTIVE]: "Trial Active",
  [TRIAL_PHASE.TRIAL_ENDING_SOON]: "Ending Soon",
  [TRIAL_PHASE.TRIAL_EXPIRED]: "Expired",
  [TRIAL_PHASE.SUBSCRIPTION_ACTIVE]: "Subscribed",
  [TRIAL_PHASE.FREE_ACCESS]: "Free Access",
  [TRIAL_PHASE.SUSPENDED]: "Suspended",
  [TRIAL_PHASE.PAST_DUE]: "Past due",
  [TRIAL_PHASE.NONE]: "—",
});

export const TRIAL_NOTIFY = Object.freeze({
  ENDING: "TRIAL_ENDING_3_DAYS",
  EXPIRED: "TRIAL_EXPIRED",
  FOLLOWUP: "TRIAL_EXPIRED_FOLLOWUP",
  REACTIVATION: "TRIAL_REACTIVATION",
  EXTENDED: "TRIAL_EXTENDED",
  CONFIRMED: "SUBSCRIPTION_CONFIRMED",
});

const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Timed or indefinite complimentary access on the subscription row.
 * Suspended always wins. A null free_access_until with the flag set is indefinite.
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function hasFreeAccess(sub, now = new Date()) {
  if (!sub || sub.free_access !== true) return false;
  const status = coerceSubscriptionStatus(sub.status);
  if (status === SUBSCRIPTION_STATUS.SUSPENDED) return false;
  if (sub.free_access_until == null || sub.free_access_until === "") return true;
  const until = new Date(sub.free_access_until).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

function daysSince(iso, now) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / MS_DAY);
}

/**
 * Effective account state from the subscription row and the clock.
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 */
export function deriveTrialPhase(sub, now = new Date()) {
  if (!sub || typeof sub !== "object") {
    return { phase: TRIAL_PHASE.NONE, daysRemaining: null, daysSinceExpiry: null };
  }
  const status = coerceSubscriptionStatus(sub.status);
  if (status === SUBSCRIPTION_STATUS.SUSPENDED) {
    return { phase: TRIAL_PHASE.SUSPENDED, daysRemaining: null, daysSinceExpiry: null };
  }
  if (hasFreeAccess(sub, now)) {
    return { phase: TRIAL_PHASE.FREE_ACCESS, daysRemaining: null, daysSinceExpiry: null };
  }
  const source = String(sub.subscription_source || "");
  const indefiniteAdminTrial =
    status === SUBSCRIPTION_STATUS.TRIALING &&
    (sub.trial_ends_at == null || sub.trial_ends_at === "") &&
    isAdminManaged(sub);
  if (status === SUBSCRIPTION_STATUS.ACTIVE && (source === SUBSCRIPTION_SOURCE.ADMIN || indefiniteAdminTrial)) {
    return { phase: TRIAL_PHASE.FREE_ACCESS, daysRemaining: null, daysSinceExpiry: null };
  }
  if (indefiniteAdminTrial) {
    return { phase: TRIAL_PHASE.FREE_ACCESS, daysRemaining: null, daysSinceExpiry: null };
  }
  if (status === SUBSCRIPTION_STATUS.ACTIVE) {
    return { phase: TRIAL_PHASE.SUBSCRIPTION_ACTIVE, daysRemaining: null, daysSinceExpiry: null };
  }
  if (status === SUBSCRIPTION_STATUS.PAST_DUE && hasSubscriptionAccess(sub, now)) {
    return { phase: TRIAL_PHASE.PAST_DUE, daysRemaining: null, daysSinceExpiry: null };
  }
  if (status === SUBSCRIPTION_STATUS.CANCELLED && hasSubscriptionAccess(sub, now)) {
    return { phase: TRIAL_PHASE.SUBSCRIPTION_ACTIVE, daysRemaining: null, daysSinceExpiry: null };
  }

  const remaining = trialRemainingBreakdown(sub.trial_ends_at, now);
  const trialish =
    status === SUBSCRIPTION_STATUS.TRIALING ||
    status === SUBSCRIPTION_STATUS.EXPIRED ||
    Boolean(sub.trial_ends_at);
  if (trialish && sub.trial_ends_at && remaining.daysRemaining != null) {
    if (!remaining.expired && remaining.daysRemaining > 0 && remaining.daysRemaining <= ENDING_SOON_DAYS) {
      return {
        phase: TRIAL_PHASE.TRIAL_ENDING_SOON,
        daysRemaining: remaining.daysRemaining,
        daysSinceExpiry: null,
      };
    }
    if (!remaining.expired && (status === SUBSCRIPTION_STATUS.TRIALING || hasSubscriptionAccess(sub, now))) {
      return {
        phase: TRIAL_PHASE.TRIAL_ACTIVE,
        daysRemaining: remaining.daysRemaining,
        daysSinceExpiry: null,
      };
    }
    if (remaining.expired) {
      return {
        phase: TRIAL_PHASE.TRIAL_EXPIRED,
        daysRemaining: 0,
        daysSinceExpiry: daysSince(sub.trial_ends_at, now),
      };
    }
  }
  return { phase: TRIAL_PHASE.NONE, daysRemaining: null, daysSinceExpiry: null };
}

/**
 * Skip conversion mail when this company already has a paying, complimentary, or suspended agreement.
 * One business does not inherit another business's row: callers pass only that company's rows.
 * @param {object[]} rows
 * @param {Date} [now]
 */
export function companySkipsTrialNotifications(rows, now = new Date()) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.length === 0) return true;
  const newest = [...list].sort(
    (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
  )[0];
  if (coerceSubscriptionStatus(newest?.status) === SUBSCRIPTION_STATUS.SUSPENDED) return true;
  return list.some((row) => {
    if (hasFreeAccess(row, now)) return true;
    const status = coerceSubscriptionStatus(row.status);
    if (status === SUBSCRIPTION_STATUS.ACTIVE) return true;
    if (
      (status === SUBSCRIPTION_STATUS.PAST_DUE || status === SUBSCRIPTION_STATUS.CANCELLED) &&
      hasSubscriptionAccess(row, now)
    ) {
      return true;
    }
    const phase = deriveTrialPhase(row, now);
    return phase.phase === TRIAL_PHASE.FREE_ACCESS;
  });
}

/** The trial row this company should be mailed about: the latest trial end. */
export function pickNotifiableTrialRow(rows) {
  const eligible = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row?.trial_ends_at) return false;
    const status = coerceSubscriptionStatus(row.status);
    return status === SUBSCRIPTION_STATUS.TRIALING || status === SUBSCRIPTION_STATUS.EXPIRED;
  });
  eligible.sort(
    (a, b) => new Date(b.trial_ends_at).getTime() - new Date(a.trial_ends_at).getTime()
  );
  return eligible[0] || null;
}

/**
 * Emails whose window is open, in send order. The caller sends only the first one
 * that does not already have a successful row for this trial_ends_at.
 * @param {object | null | undefined} sub
 * @param {Date} [now]
 * @returns {string[]}
 */
export function trialNotificationCandidates(sub, now = new Date()) {
  if (!sub?.trial_ends_at) return [];
  const status = coerceSubscriptionStatus(sub.status);
  if (status === SUBSCRIPTION_STATUS.SUSPENDED || status === SUBSCRIPTION_STATUS.ACTIVE) return [];
  if (hasFreeAccess(sub, now)) return [];
  if (hasSubscriptionAccess(sub, now) && status !== SUBSCRIPTION_STATUS.TRIALING) return [];
  const end = new Date(sub.trial_ends_at).getTime();
  if (!Number.isFinite(end)) return [];
  const ms = end - now.getTime();
  const out = [];
  if (ms > 0) {
    const daysLeft = Math.ceil(ms / MS_DAY);
    if (daysLeft > 0 && daysLeft <= ENDING_SOON_DAYS) out.push(TRIAL_NOTIFY.ENDING);
    return out;
  }
  out.push(TRIAL_NOTIFY.EXPIRED);
  if (now.getTime() - end >= FOLLOWUP_AFTER_DAYS * MS_DAY) out.push(TRIAL_NOTIFY.FOLLOWUP);
  return out;
}

/**
 * A failed send does not count. Matching is the subscription, the type, and the same trial end.
 * @param {object[]} history
 * @param {object} sub
 * @param {string} type
 */
export function notificationAlreadySent(history, sub, type) {
  const end = new Date(sub?.trial_ends_at || "").getTime();
  if (!Number.isFinite(end)) return false;
  return (Array.isArray(history) ? history : []).some((row) => {
    if (String(row?.status || "") !== "sent") return false;
    if (String(row?.notification_type || "") !== type) return false;
    if (sub?.id && row.subscription_id && row.subscription_id !== sub.id) return false;
    return new Date(row.trial_ends_at || "").getTime() === end;
  });
}

function firstName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "there";
  return raw.split(/\s+/)[0];
}

/**
 * Exact conversion copy. The CTA is a button, not a sentence.
 * @param {string} type
 * @param {{ name?: string | null }} [opts]
 */
export function buildTrialEmail(type, opts = {}) {
  const hi = `Hi ${firstName(opts.name)},`;
  if (type === TRIAL_NOTIFY.ENDING) {
    return {
      type,
      subject: "Your Paidly trial is ending soon",
      heading: "Your Paidly trial is ending soon",
      paragraphs: [
        hi,
        "Your Paidly trial is ending soon.",
        "Keep managing your business with Paidly — from invoices and quotes to expenses, POS and business management.",
        "Choose a Paidly plan before your trial ends to keep your account active.",
      ],
      ctaLabel: "Choose a Plan",
      note: "If you have any questions, we're here to help. The Paidly Team",
    };
  }
  if (type === TRIAL_NOTIFY.EXPIRED) {
    return {
      type,
      subject: "Your Paidly trial has ended",
      heading: "Your Paidly trial has ended",
      paragraphs: [
        hi,
        "Your Paidly trial has ended.",
        "Your business data is still available, but your account is currently restricted.",
        "Subscribe to Paidly to continue creating invoices, managing quotes, tracking expenses, using POS and running your business from one place.",
      ],
      ctaLabel: "Subscribe to Paidly",
      note: "We're ready when you are. The Paidly Team",
    };
  }
  if (type === TRIAL_NOTIFY.FOLLOWUP) {
    return {
      type,
      subject: "Ready to get back to business?",
      heading: "Ready to get back to business?",
      paragraphs: [
        hi,
        "Your Paidly account is still waiting for you.",
        "Choose a Paidly plan and get back to managing your business without the admin chaos.",
        "Your existing business information is still available.",
      ],
      ctaLabel: "Reactivate Paidly",
      note: "The Paidly Team",
    };
  }
  return null;
}

/**
 * Decide the next email for each company group. Does not send.
 * @param {object[][]} groups
 * @param {object[]} history
 * @param {Date} [now]
 */
export function planTrialNotifications(groups, history, now = new Date()) {
  const planned = [];
  for (const rows of groups || []) {
    if (companySkipsTrialNotifications(rows, now)) continue;
    const sub = pickNotifiableTrialRow(rows);
    if (!sub) continue;
    const due = trialNotificationCandidates(sub, now).find(
      (type) => !notificationAlreadySent(history, sub, type)
    );
    if (!due) continue;
    planned.push({ subscription: sub, type: due });
  }
  return planned;
}
