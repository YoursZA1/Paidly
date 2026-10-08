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
/**
 * The standard "trial has ended" email is only for a trial that ended recently. An account whose
 * trial ended long ago is an existing account: it gets the migration emails, never this one.
 */
export const STANDARD_EXPIRY_WINDOW_DAYS = 7;
export const STANDARD_FOLLOWUP_WINDOW_DAYS = 14;

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
  EXISTING_EXPIRED: "EXISTING_USER_TRIAL_EXPIRED",
  EXISTING_FOLLOWUP: "EXISTING_USER_TRIAL_FOLLOWUP",
});

const MIGRATION_TYPES = new Set([TRIAL_NOTIFY.EXISTING_EXPIRED, TRIAL_NOTIFY.EXISTING_FOLLOWUP]);

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

/**
 * Access from the agreement itself, ignoring a migration grace period or exclusion. Used to tell
 * "subscribed" from "in grace", so a grace period never reads as a subscription.
 */
export function accessWithoutMigration(sub, now = new Date()) {
  if (!sub) return false;
  return hasSubscriptionAccess({ ...sub, migration_grace_ends_at: null, migration_excluded: false }, now);
}

/**
 * An existing account the migration classified as expired, whose trial ended before the migration.
 * An admin trial extension after the migration puts the row back on the normal trial path.
 */
export function isMigratedExpiredRow(sub) {
  if (!sub || sub.trial_migration_status !== "MIGRATED_EXPIRED" || !sub.migration_grace_started_at) return false;
  const end = new Date(sub.trial_ends_at || "").getTime();
  const migratedAt = new Date(sub.trial_migration_at || sub.migration_grace_started_at).getTime();
  return !(Number.isFinite(end) && Number.isFinite(migratedAt) && end > migratedAt);
}

/** The once-only key: the trial end for trial emails, the grace start for migration emails. */
export function notificationCycleKey(sub, type) {
  return MIGRATION_TYPES.has(type) ? sub?.migration_grace_started_at || null : sub?.trial_ends_at || null;
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
  if (status === SUBSCRIPTION_STATUS.PAST_DUE && accessWithoutMigration(sub, now)) {
    return { phase: TRIAL_PHASE.PAST_DUE, daysRemaining: null, daysSinceExpiry: null };
  }
  if (status === SUBSCRIPTION_STATUS.CANCELLED && accessWithoutMigration(sub, now)) {
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
    if (!remaining.expired && (status === SUBSCRIPTION_STATUS.TRIALING || accessWithoutMigration(sub, now))) {
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
  // An admin excluded this company from the migration: no automatic trial or migration mail.
  if (list.some((row) => row.migration_excluded === true)) return true;
  return list.some((row) => {
    if (hasFreeAccess(row, now)) return true;
    const status = coerceSubscriptionStatus(row.status);
    if (status === SUBSCRIPTION_STATUS.ACTIVE) return true;
    if (
      (status === SUBSCRIPTION_STATUS.PAST_DUE || status === SUBSCRIPTION_STATUS.CANCELLED) &&
      accessWithoutMigration(row, now)
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
  if (!sub || sub.migration_excluded === true) return [];
  const status = coerceSubscriptionStatus(sub.status);
  if (status === SUBSCRIPTION_STATUS.SUSPENDED) return [];
  if (hasFreeAccess(sub, now)) return [];
  if (isMigratedExpiredRow(sub)) {
    // Existing account: the migration emails, never the standard ones. Its grace does not count as access.
    if (accessWithoutMigration(sub, now)) return [];
    return [TRIAL_NOTIFY.EXISTING_EXPIRED, TRIAL_NOTIFY.EXISTING_FOLLOWUP];
  }
  if (!sub.trial_ends_at) return [];
  if (status === SUBSCRIPTION_STATUS.ACTIVE) return [];
  if (accessWithoutMigration(sub, now) && status !== SUBSCRIPTION_STATUS.TRIALING) return [];
  const end = new Date(sub.trial_ends_at).getTime();
  if (!Number.isFinite(end)) return [];
  const ms = end - now.getTime();
  const out = [];
  if (ms > 0) {
    const daysLeft = Math.ceil(ms / MS_DAY);
    if (daysLeft > 0 && daysLeft <= ENDING_SOON_DAYS) out.push(TRIAL_NOTIFY.ENDING);
    return out;
  }
  const since = now.getTime() - end;
  if (since <= STANDARD_EXPIRY_WINDOW_DAYS * MS_DAY) out.push(TRIAL_NOTIFY.EXPIRED);
  if (since >= FOLLOWUP_AFTER_DAYS * MS_DAY && since <= STANDARD_FOLLOWUP_WINDOW_DAYS * MS_DAY) {
    out.push(TRIAL_NOTIFY.FOLLOWUP);
  }
  return out;
}

/**
 * A failed send does not count. Matching is the subscription, the type, and the same trial end.
 * @param {object[]} history
 * @param {object} sub
 * @param {string} type
 */
export function notificationAlreadySent(history, sub, type) {
  return Boolean(findSentNotification(history, sub, type));
}

/**
 * The successful automatic send of this type for the row's current cycle, if any.
 * @param {object[]} history
 * @param {object} sub
 * @param {string} type
 */
export function findSentNotification(history, sub, type) {
  const end = new Date(notificationCycleKey(sub, type) || "").getTime();
  if (!Number.isFinite(end)) return null;
  return (Array.isArray(history) ? history : []).find((row) => {
    if (String(row?.status || "") !== "sent") return false;
    // An admin's manual send does not use up the automatic email for this trial.
    if (row?.source && row.source !== "system") return false;
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
  if (type === TRIAL_NOTIFY.EXISTING_EXPIRED) {
    return {
      type,
      subject: "Your Paidly trial has ended",
      heading: "Your Paidly trial has ended",
      paragraphs: [
        hi,
        "We wanted to let you know that your Paidly trial period has ended.",
        "Your Paidly account and business information are still available.",
        "To continue using Paidly's business management tools, choose a plan that works for your business.",
      ],
      ctaLabel: "View Paidly Plans",
      note: "Thank you for using Paidly. The Paidly Team",
    };
  }
  if (type === TRIAL_NOTIFY.EXISTING_FOLLOWUP) {
    return {
      type,
      subject: "Ready to continue with Paidly?",
      heading: "Ready to continue with Paidly?",
      paragraphs: [
        hi,
        "Your Paidly account is still available.",
        "Choose a Paidly plan to continue managing your business with invoicing, quotes, expenses, POS and more.",
      ],
      ctaLabel: "Choose a Plan",
      note: "We're ready when you are. The Paidly Team",
    };
  }
  if (type === TRIAL_NOTIFY.FOLLOWUP || type === TRIAL_NOTIFY.REACTIVATION) {
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

/** A follow-up only goes after its first email, and the migration follow-up 3 days after it. */
function prerequisiteMet(history, sub, type, now) {
  if (type === TRIAL_NOTIFY.FOLLOWUP) return notificationAlreadySent(history, sub, TRIAL_NOTIFY.EXPIRED);
  if (type === TRIAL_NOTIFY.EXISTING_FOLLOWUP) {
    const first = findSentNotification(history, sub, TRIAL_NOTIFY.EXISTING_EXPIRED);
    const at = new Date(first?.sent_at || first?.created_at || "").getTime();
    return Number.isFinite(at) && now.getTime() - at >= FOLLOWUP_AFTER_DAYS * MS_DAY;
  }
  return true;
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
    const sub = rows.find(isMigratedExpiredRow) || pickNotifiableTrialRow(rows);
    if (!sub) continue;
    const due = trialNotificationCandidates(sub, now).find(
      (type) => !notificationAlreadySent(history, sub, type) && prerequisiteMet(history, sub, type, now)
    );
    if (!due) continue;
    planned.push({ subscription: sub, type: due });
  }
  return planned;
}

/**
 * Which email an admin's manual "Send trial reminder" / "Send subscription prompt" sends.
 * The copy follows the company's phase. A subscribed, free-access, past-due, or suspended
 * company gets no trial mail.
 * @param {object[]} rows the company's subscription rows (the target row first is fine)
 * @param {object} sub the row the admin acted on
 * @param {"send_trial_reminder" | "send_subscription_prompt"} action
 * @param {Date} [now]
 * @returns {{ type: string } | { error: string }}
 */
export function adminTrialNotificationType(rows, sub, action, now = new Date()) {
  const list = Array.isArray(rows) && rows.length ? rows : [sub];
  const phase = deriveTrialPhase(sub, now).phase;
  if (phase === TRIAL_PHASE.SUSPENDED) {
    return { error: "This account is suspended. Reactivate it before sending trial mail." };
  }
  const covered = list.some((row) => {
    const p = deriveTrialPhase(row, now).phase;
    return p === TRIAL_PHASE.SUBSCRIPTION_ACTIVE || p === TRIAL_PHASE.FREE_ACCESS || p === TRIAL_PHASE.PAST_DUE;
  });
  if (covered) {
    return { error: "This company is subscribed or has free access, so no trial mail was sent." };
  }
  if (isMigratedExpiredRow(sub)) {
    return { type: action === "send_subscription_prompt" ? TRIAL_NOTIFY.EXISTING_FOLLOWUP : TRIAL_NOTIFY.EXISTING_EXPIRED };
  }
  const trialOpen = phase === TRIAL_PHASE.TRIAL_ACTIVE || phase === TRIAL_PHASE.TRIAL_ENDING_SOON;
  if (action === "send_subscription_prompt") {
    return { type: trialOpen ? TRIAL_NOTIFY.ENDING : TRIAL_NOTIFY.REACTIVATION };
  }
  if (trialOpen) return { type: TRIAL_NOTIFY.ENDING };
  if (phase === TRIAL_PHASE.TRIAL_EXPIRED) return { type: TRIAL_NOTIFY.EXPIRED };
  return { error: "This account has no trial to remind them about. Send a subscription prompt instead." };
}
