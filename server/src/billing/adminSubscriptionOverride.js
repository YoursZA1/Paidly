/**
 * Admin subscription overrides. Sets admin_override so trial-expiry automation cannot revert them.
 * Status vocabulary stays on the existing CHECK allow-list (grant → active, suspend → suspended).
 */

import { resolveCurrentCatalogAssignment } from "../subscriptionPlans.js";
import { SUBSCRIPTION_STATUS, coerceSubscriptionStatus } from "../../../shared/subscriptionStatuses.js";
import { addCalendarDaysIso, SUBSCRIPTION_SOURCE, TRIAL_DURATION_DAYS } from "../../../shared/subscriptionAccess.js";

export const ADMIN_SUBSCRIPTION_ACTIONS = Object.freeze([
  "extend_trial",
  "restart_trial",
  "end_trial",
  "grant",
  "suspend",
  "cancel",
  "activate",
  "change_plan",
  "set_trial_end",
  "set_end_date",
]);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseIso(raw, field) {
  if (raw == null || raw === "") return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw httpError(400, `invalid ${field || "date"}`);
  return d.toISOString();
}

function markAdmin(patch, actorId, reason, nowIso) {
  patch.admin_override = true;
  patch.subscription_source = SUBSCRIPTION_SOURCE.ADMIN;
  patch.admin_override_at = nowIso;
  if (actorId) patch.admin_override_by = actorId;
  if (reason) patch.admin_override_reason = String(reason).slice(0, 500);
  patch.updated_at = nowIso;
  return patch;
}

function humanAction(action, extra = {}) {
  switch (action) {
    case "extend_trial":
      return extra.days
        ? `Admin extended trial by ${extra.days} days`
        : "Admin extended trial";
    case "restart_trial":
      return "Admin started/restarted trial";
    case "end_trial":
      return "Admin ended trial immediately";
    case "grant":
      return "Admin granted access";
    case "suspend":
      return "Admin suspended subscription";
    case "cancel":
      return "Admin cancelled subscription";
    case "activate":
      return "Admin activated subscription";
    case "change_plan":
      return extra.from && extra.to
        ? `Admin changed plan from ${extra.from} to ${extra.to}`
        : "Admin changed plan";
    case "set_trial_end":
      return "Admin set trial end date";
    case "set_end_date":
      return "Admin set subscription end date";
    default:
      return "Admin updated subscription";
  }
}

/**
 * @param {object} existing
 * @param {object} body
 * @param {{ actorId?: string, now?: Date }} [opts]
 * @returns {{ patch: object, action: string, description: string }}
 */
export function buildAdminOverridePatch(existing, body, opts = {}) {
  const src = body && typeof body === "object" ? body : {};
  let action = String(src.action || "").trim().toLowerCase();
  if (action === "admin_granted") action = "grant";
  if (action === "admin_suspended") action = "suspend";

  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowIso = now.toISOString();
  const reason = String(src.reason || src.admin_reason || "").trim();
  const actorId = opts.actorId || null;

  if (!action) {
    return { patch: null, action: "update", description: humanAction("update") };
  }
  if (!ADMIN_SUBSCRIPTION_ACTIONS.includes(action)) {
    throw httpError(400, `unknown admin action "${action}"`);
  }

  const patch = {};
  const extra = {};

  if (action === "extend_trial") {
    const customEnd = parseIso(src.trial_end_at || src.trial_ends_at, "trial_end_at");
    let days = Number(src.days);
    if (!Number.isFinite(days) || days <= 0) days = TRIAL_DURATION_DAYS;
    if (![7, 14, 30].includes(days) && !customEnd) {
      if (days < 1 || days > 365) throw httpError(400, "days must be 7, 14, 30, or 1–365");
    }
    const baseRaw = existing?.trial_ends_at;
    const baseDate = baseRaw && new Date(baseRaw).getTime() > now.getTime() ? new Date(baseRaw) : now;
    const nextEnd = customEnd || addCalendarDaysIso(baseDate, days);
    patch.status = SUBSCRIPTION_STATUS.TRIALING;
    patch.trial_ends_at = nextEnd;
    if (!existing?.trial_started_at) patch.trial_started_at = nowIso;
    extra.days = customEnd ? null : days;
  } else if (action === "restart_trial") {
    const days = Number(src.days) > 0 ? Number(src.days) : TRIAL_DURATION_DAYS;
    patch.status = SUBSCRIPTION_STATUS.TRIALING;
    patch.trial_started_at = nowIso;
    patch.trial_ends_at = addCalendarDaysIso(now, days);
  } else if (action === "set_trial_end") {
    const end = parseIso(src.trial_end_at || src.trial_ends_at, "trial_end_at");
    if (!end) throw httpError(400, "trial_end_at required");
    patch.status = SUBSCRIPTION_STATUS.TRIALING;
    patch.trial_ends_at = end;
  } else if (action === "end_trial") {
    patch.status = SUBSCRIPTION_STATUS.EXPIRED;
  } else if (action === "grant" || action === "activate") {
    patch.status = SUBSCRIPTION_STATUS.ACTIVE;
    if (!existing?.activated_at) patch.activated_at = nowIso;
  } else if (action === "suspend") {
    patch.status = SUBSCRIPTION_STATUS.SUSPENDED;
  } else if (action === "cancel") {
    patch.status = SUBSCRIPTION_STATUS.CANCELLED;
    patch.cancelled_at = nowIso;
  } else if (action === "set_end_date") {
    const end = parseIso(src.expires_at || src.subscription_ends_at || src.end_date, "expires_at");
    if (!end) throw httpError(400, "expires_at required");
    patch.expires_at = end;
  } else if (action === "change_plan") {
    const planRaw = String(src.plan || src.current_plan || src.plan_slug || "")
      .trim()
      .toLowerCase();
    if (!planRaw) throw httpError(400, "plan is required");
    extra.from = existing?.plan || existing?.plan_slug || existing?.plan_family || "";
    extra.to = planRaw;
    const assignment = resolveCurrentCatalogAssignment({
      plan: planRaw,
      billing_cycle: src.billing_cycle || existing?.billing_cycle,
    });
    if (!assignment) {
      throw httpError(400, "plan must be a current Paidly catalog plan (Starter, Business, Growth, or Enterprise)");
    }
    patch.plan = assignment.family;
    patch.current_plan = assignment.family;
    patch.plan_slug = assignment.slug;
    patch.plan_family = assignment.family;
    patch.billing_cycle = assignment.billing_cycle;
    patch.amount = assignment.amount;
    extra.to = assignment.family;
  }

  markAdmin(patch, actorId, reason, nowIso);
  return {
    patch,
    action,
    description: reason || humanAction(action, extra),
  };
}

/**
 * Map legacy UI labels the CHECK constraint does not allow.
 * @param {string} raw
 */
export function coerceAdminRequestedStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "admin_granted") return SUBSCRIPTION_STATUS.ACTIVE;
  if (s === "admin_suspended") return SUBSCRIPTION_STATUS.SUSPENDED;
  return coerceSubscriptionStatus(raw);
}
