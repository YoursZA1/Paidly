/**
 * Customer-facing dashboard / settings subscription copy.
 * Display-only. Access control stays on the server (`hasSubscriptionAccess`).
 *
 * Dates come from `trial_ends_at` / `trialEndsAt` returned by GET /api/subscriptions/current.
 * Never invent an end date as account-created + 7 days.
 */

import { coerceSubscriptionStatus, SUBSCRIPTION_STATUS } from "./subscriptionStatuses.js";
import { isAdminManaged, trialRemainingBreakdown } from "./subscriptionAccess.js";

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;

export const DASHBOARD_BANNER_KIND = Object.freeze({
  TRIALING: "trialing",
  ACTIVE: "active",
  ADMIN_GRANTED: "admin_granted",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  SUSPENDED: "suspended",
  PAST_DUE: "past_due",
  PENDING: "pending",
  NONE: "none",
});

/**
 * @param {string | Date | null | undefined} iso
 * @returns {string | null}
 */
export function formatTrialEndDate(iso) {
  if (iso == null || iso === "") return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function firstPresent(obj, keys) {
  for (const key of keys) {
    if (obj[key] != null && obj[key] !== "") return obj[key];
  }
  return null;
}

function planLabel(src) {
  const name = firstPresent(src, ["planName", "currentPlanName", "plan_name"]);
  if (name) return String(name);
  const slug = String(firstPresent(src, ["plan", "currentPlan", "plan_slug", "subscription_plan"]) || "")
    .trim()
    .toLowerCase();
  if (!slug || slug === "none" || slug === "free" || slug === "trial") return null;
  const family = slug.replace(/_monthly$|_annual$|_yearly$/, "");
  if (family === "starter" || family === "individual") return "Starter";
  if (family === "business" || family === "sme" || family === "professional") return "Business";
  if (family === "growth" || family === "corporate") return "Growth";
  if (family === "enterprise" || family === "enterprise_custom") return "Enterprise";
  return name || null;
}

function countdownLabel({ expired, remainingMs, daysRemaining, hoursRemaining }) {
  if (expired) return null;
  if (remainingMs == null) return null;
  if (remainingMs < MS_HOUR) return "Less than 1 hour remaining";
  if (remainingMs < MS_DAY) {
    const hours = hoursRemaining == null ? Math.max(1, Math.ceil(remainingMs / MS_HOUR)) : hoursRemaining;
    return `${hours} hour${hours === 1 ? "" : "s"} remaining`;
  }
  const days = daysRemaining == null ? Math.ceil(remainingMs / MS_DAY) : daysRemaining;
  if (days <= 0) return null;
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

function trialUrgency({ remainingMs, daysRemaining }) {
  if (remainingMs == null) {
    return {
      heading: "You're on a 7-day free trial",
      supportingPrefix: null,
    };
  }
  if (remainingMs < MS_DAY) {
    return {
      heading: "Your free trial ends soon",
      supportingPrefix: null,
    };
  }
  if (daysRemaining === 1) {
    return {
      heading: "Your free trial ends tomorrow",
      supportingPrefix: "Subscribe now to keep uninterrupted access.",
    };
  }
  if (daysRemaining === 2) {
    return {
      heading: "Your free trial ends soon",
      supportingPrefix: null,
    };
  }
  return {
    heading: daysRemaining != null && daysRemaining > 7 ? "You're on a free trial" : "You're on a 7-day free trial",
    supportingPrefix: null,
  };
}

function banner({
  kind,
  heading,
  supporting = null,
  countdown = null,
  ctaLabel = null,
  ctaTo = "subscription",
  tone = "neutral",
  planName = null,
}) {
  return { kind, heading, supporting, countdown, ctaLabel, ctaTo, tone, planName };
}

/**
 * @param {object | null | undefined} src GET /api/subscriptions/current payload or a subscriptions/profile row
 * @param {Date} [now] server clock when called from the API; display-only on the client
 */
export function describeDashboardSubscriptionBanner(src, now = new Date()) {
  if (!src || typeof src !== "object") {
    return banner({
      kind: DASHBOARD_BANNER_KIND.NONE,
      heading: "Choose a Paidly plan",
      supporting: "Select a plan to start billing from the live catalog.",
      ctaLabel: "Choose a plan",
      tone: "neutral",
    });
  }

  const status = coerceSubscriptionStatus(
    src.status || src.currentStatus || src.subscription_status
  );
  const admin = Boolean(src.managedByAdministrator) || isAdminManaged(src);
  const trialEnd = firstPresent(src, [
    "trialEndAt",
    "trialEndsAt",
    "trial_ends_at",
    "trial_end_at",
  ]);
  const nextBilling = firstPresent(src, [
    "nextBillingDate",
    "renewDate",
    "renewAt",
    "next_billing_date",
  ]);
  const name = planLabel(src);

  const computed = trialRemainingBreakdown(trialEnd, now);
  const remainingMs =
    src.remainingMs != null && Number.isFinite(Number(src.remainingMs))
      ? Number(src.remainingMs)
      : computed.remainingMs;
  const daysRemaining =
    src.daysRemaining != null && Number.isFinite(Number(src.daysRemaining))
      ? Number(src.daysRemaining)
      : computed.daysRemaining;
  const hoursRemaining =
    src.hoursRemaining != null && Number.isFinite(Number(src.hoursRemaining))
      ? Number(src.hoursRemaining)
      : computed.hoursRemaining;
  const expiredByTime = remainingMs != null ? remainingMs <= 0 : computed.expired;

  if (admin && (status === SUBSCRIPTION_STATUS.ACTIVE || status === "active")) {
    return banner({
      kind: DASHBOARD_BANNER_KIND.ADMIN_GRANTED,
      heading: "Your Paidly access is active",
      supporting: "Your account is currently managed by an administrator.",
      ctaLabel: "Manage subscription",
      ctaTo: "billing",
      tone: "positive",
      planName: name,
    });
  }

  if (status === SUBSCRIPTION_STATUS.ACTIVE) {
    const endDate = formatTrialEndDate(nextBilling);
    const bits = [];
    if (name) bits.push(`You're currently on the ${name} plan.`);
    if (endDate) bits.push(`Next billing date: ${endDate}.`);
    return banner({
      kind: DASHBOARD_BANNER_KIND.ACTIVE,
      heading: "Your Paidly subscription is active",
      supporting: bits.join(" ") || "Your subscription is active.",
      ctaLabel: "Manage subscription",
      ctaTo: "billing",
      tone: "positive",
      planName: name,
    });
  }

  if (admin && (status === SUBSCRIPTION_STATUS.TRIALING || status === "trial")) {
    const dateLabel = formatTrialEndDate(trialEnd);
    const stillOpen = remainingMs == null || remainingMs > 0;
    const urgency = stillOpen
      ? trialUrgency({ remainingMs, daysRemaining })
      : { heading: "You're on a free trial", supportingPrefix: null };
    return banner({
      kind: DASHBOARD_BANNER_KIND.TRIALING,
      heading: urgency.heading,
      supporting: dateLabel ? `Your trial ends on ${dateLabel}.` : urgency.supportingPrefix,
      countdown: stillOpen
        ? countdownLabel({
            expired: false,
            remainingMs,
            daysRemaining,
            hoursRemaining,
          })
        : null,
      ctaLabel: daysRemaining === 1 || (remainingMs != null && remainingMs < MS_DAY && remainingMs > 0) ? "Subscribe now" : "Choose a plan",
      tone: "neutral",
      planName: name,
    });
  }

  if (status === SUBSCRIPTION_STATUS.CANCELLED) {
    return banner({
      kind: DASHBOARD_BANNER_KIND.CANCELLED,
      heading: "Your Paidly subscription has ended",
      supporting: "Choose a plan if you want to continue using Paidly.",
      ctaLabel: "Choose a plan",
      tone: "warning",
    });
  }

  if (status === SUBSCRIPTION_STATUS.SUSPENDED) {
    return banner({
      kind: DASHBOARD_BANNER_KIND.SUSPENDED,
      heading: "Your Paidly access is paused",
      supporting: "Contact support or choose a plan to restore access.",
      ctaLabel: "Choose a plan",
      tone: "warning",
    });
  }

  if (status === SUBSCRIPTION_STATUS.PAST_DUE) {
    return banner({
      kind: DASHBOARD_BANNER_KIND.PAST_DUE,
      heading: "Your Paidly payment is past due",
      supporting: name ? `You're on the ${name} plan. Update billing to stay on Paidly.` : "Update billing to stay on Paidly.",
      ctaLabel: "Manage subscription",
      ctaTo: "billing",
      tone: "warning",
      planName: name,
    });
  }

  const trialStatus =
    status === SUBSCRIPTION_STATUS.TRIALING ||
    status === "trial" ||
    String(src.subscription_status || "").toLowerCase() === "trial";

  if (status === SUBSCRIPTION_STATUS.EXPIRED || (trialStatus && expiredByTime)) {
    return banner({
      kind: DASHBOARD_BANNER_KIND.EXPIRED,
      heading: "Your free trial has ended",
      supporting: "Choose a Paidly plan to continue using your account.",
      ctaLabel: "Choose a plan",
      tone: "warning",
    });
  }

  if (trialStatus) {
    const dateLabel = formatTrialEndDate(trialEnd);
    const urgency = trialUrgency({ remainingMs, daysRemaining });
    const supportingParts = [];
    if (dateLabel) supportingParts.push(`Your trial ends on ${dateLabel}.`);
    if (urgency.supportingPrefix) supportingParts.push(urgency.supportingPrefix);
    const underADay = remainingMs != null && remainingMs < MS_DAY;
    return banner({
      kind: DASHBOARD_BANNER_KIND.TRIALING,
      heading: urgency.heading,
      supporting: supportingParts.join(" ") || null,
      countdown: countdownLabel({
        expired: false,
        remainingMs,
        daysRemaining,
        hoursRemaining,
      }),
      ctaLabel: daysRemaining === 1 || underADay ? "Subscribe now" : "Choose a plan",
      tone: underADay || daysRemaining === 1 || daysRemaining === 2 ? "warning" : "neutral",
      planName: name,
    });
  }

  if (status === SUBSCRIPTION_STATUS.PENDING || status === SUBSCRIPTION_STATUS.PROCESSING) {
    return banner({
      kind: DASHBOARD_BANNER_KIND.PENDING,
      heading: "Waiting for payment confirmation",
      supporting: "Paidly activates your plan after PayFast confirms the payment. This page will update automatically.",
      ctaLabel: "View billing",
      ctaTo: "billing",
      tone: "neutral",
    });
  }

  if (status === SUBSCRIPTION_STATUS.FAILED) {
    return banner({
      kind: DASHBOARD_BANNER_KIND.EXPIRED,
      heading: "Payment did not go through",
      supporting: "Choose a plan to try again. Your clients, invoices, and documents are still saved.",
      ctaLabel: "Choose a plan",
      tone: "warning",
    });
  }

  return banner({
    kind: DASHBOARD_BANNER_KIND.NONE,
    heading: "Choose a Paidly plan",
    supporting: "Select a plan that fits your business.",
    ctaLabel: "Choose a plan",
    tone: "neutral",
  });
}
