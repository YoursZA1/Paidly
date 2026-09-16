/**
 * Server-side subscription entitlements (SoR = subscriptions table, never profiles).
 *
 * PAIDLY_ENTITLEMENTS_ENFORCE:
 *   true / 1 / on / enforce → block on requireFeature / requireActiveBilling
 *   false / 0 / off / report → report-only (log, never block) for those helpers
 *   unset → enforce on preview/development/test; report-only on production
 *             (set explicitly true on staging; soak before production true)
 */

import { getBillingSupabaseAdmin } from "./supabaseAdmin.js";
import { resolveUserCompanyId, requireBearerUser } from "./httpAuth.js";
import {
  FAMILY_FEATURES,
  FAMILY_LIMITS,
  FAMILY_TIER_RANK,
  familyHasFeature,
  normalizePlanFamily,
  familyForSlug,
} from "../subscriptionPlans.js";
import { coerceSubscriptionStatus } from "../../../shared/subscriptionStatuses.js";
import {
  hasSubscriptionAccess,
  pickAccessSubscriptionRow,
  shouldExpireTrialRow,
} from "../../../shared/subscriptionAccess.js";

let entitlementsProductionUnsetWarned = false;

function entitlementsEnforceEnabled() {
  const raw = String(process.env.PAIDLY_ENTITLEMENTS_ENFORCE ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "report") return false;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "enforce") return true;

  // Unset: enforce on preview/development/test; production requires explicit true after soak
  // (escape hatch: PAIDLY_ENTITLEMENTS_ENFORCE=false). Prefer setting the var on Vercel Production.
  const vercelEnv = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnv === "production") {
    if (!entitlementsProductionUnsetWarned) {
      entitlementsProductionUnsetWarned = true;
      console.warn(
        "[entitlements] PAIDLY_ENTITLEMENTS_ENFORCE unset on production — report-only. Set true on Vercel Production after soak (docs/ENTITLEMENTS_ENFORCEMENT.md)."
      );
    }
    return false;
  }
  if (vercelEnv === "preview" || vercelEnv === "development") return true;

  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnv === "production") return false;
  return true;
}

/**
 * Access is decided from the subscriptions row (status + trial_ends_at + grace + admin_override).
 * Trialing past trial_ends_at is not access, even if cron has not flipped the row yet.
 * @param {{ status?: string, grace_ends_at?: string | null, trial_ends_at?: string | null, admin_override?: boolean, subscription_source?: string }} sub
 * @param {Date} [now]
 */
export function hasPaidAccessIncludingGrace(sub, now = new Date()) {
  return hasSubscriptionAccess(sub, now);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 */
const ENTITLEMENT_SELECT_RICH =
  "id, status, plan_slug, plan_id, plan_family, company_id, grace_ends_at, amount, billing_cycle, next_billing_date, current_period_end, expires_at, cancelled_at, trial_ends_at, trial_started_at, admin_override, subscription_source, updated_at, created_at";
const ENTITLEMENT_SELECT_LEAN =
  "id, status, plan_slug, plan_id, plan_family, company_id, grace_ends_at, amount, billing_cycle, next_billing_date, current_period_end, updated_at, created_at";

export async function resolveEntitlementForCompany(supabase, companyId) {
  return resolveEntitlement(supabase, null, companyId);
}

export async function resolveEntitlement(supabase, userId, knownCompanyId = null) {
  const companyId = knownCompanyId || (userId ? await resolveUserCompanyId(supabase, userId) : null);
  const now = new Date();

  const run = (cols) => {
    let query = supabase
      .from("subscriptions")
      .select(cols)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (companyId) return query.eq("company_id", companyId);
    if (userId) return query.eq("user_id", userId);
    return query.eq("company_id", "00000000-0000-0000-0000-000000000000");
  };

  let { data: rows, error } = await run(ENTITLEMENT_SELECT_RICH);
  if (error) {
    ({ data: rows, error } = await run(ENTITLEMENT_SELECT_LEAN));
  }
  if (error) {
    console.warn("[entitlements] subscription lookup", error.message);
  }

  let sub = pickAccessSubscriptionRow(rows || [], now) || null;

  if (sub && shouldExpireTrialRow(sub, now) && sub.id) {
    try {
      const expiredAt = now.toISOString();
      const { data: expiredRow } = await supabase
        .from("subscriptions")
        .update({ status: "expired", updated_at: expiredAt })
        .eq("id", sub.id)
        .eq("status", "trialing")
        .eq("admin_override", false)
        .select(ENTITLEMENT_SELECT_LEAN)
        .maybeSingle();
      sub = expiredRow ? { ...sub, ...expiredRow, status: "expired" } : { ...sub, status: "expired" };
    } catch (e) {
      console.warn("[entitlements] trial expire write", e?.message || e);
      sub = { ...sub, status: "expired" };
    }
  }

  const family =
    normalizePlanFamily(sub?.plan_family) ||
    familyForSlug(sub?.plan_slug) ||
    null;
  const tierRank = family ? FAMILY_TIER_RANK[family] : 0;
  const limits = family ? FAMILY_LIMITS[family] : { seats: 1, companies: 1 };
  const features = family ? [...FAMILY_FEATURES[family]] : [];
  const access = hasPaidAccessIncludingGrace(sub);
  const inGrace =
    coerceSubscriptionStatus(sub?.status) === "past_due" &&
    Boolean(sub?.grace_ends_at) &&
    new Date(sub.grace_ends_at).getTime() > Date.now();

  return {
    companyId: companyId || sub?.company_id || null,
    subscriptionId: sub?.id || null,
    family,
    tierRank,
    status: sub?.status || null,
    access,
    inGrace,
    graceEndsAt: sub?.grace_ends_at || null,
    seats: limits.seats,
    features,
    subscription: sub,
  };
}

/**
 * @param {import('http').IncomingMessage & { __paidlyEntitlement?: object }} req
 * @param {import('http').ServerResponse} res
 * @param {string} featureKey
 */
export async function requireFeature(req, res, featureKey) {
  const ent = await ensureEntitlementOnRequest(req, res);
  if (!ent) return false;
  if (!ent.access) {
    return denyBilling(req, res, ent, "SUBSCRIPTION_REQUIRED", 402);
  }
  if (!familyHasFeature(ent.family, featureKey)) {
    return denyBilling(req, res, ent, "PLAN_UPGRADE_REQUIRED", 403, { requiredFeature: featureKey });
  }
  return true;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export async function requireActiveBilling(req, res) {
  const ent = await ensureEntitlementOnRequest(req, res);
  if (!ent) return false;
  if (!ent.access) {
    return denyBilling(req, res, ent, "SUBSCRIPTION_REQUIRED", 402);
  }
  return true;
}

async function ensureEntitlementOnRequest(req, res) {
  if (req.__paidlyEntitlement) return req.__paidlyEntitlement;
  const supabase = getBillingSupabaseAdmin();
  if (!supabase) {
    res.status(503).json({ error: "Server configuration error (Supabase)" });
    return null;
  }
  const auth = await requireBearerUser(req, supabase);
  if (auth.error) {
    res.status(auth.status).json({ error: auth.error });
    return null;
  }
  const ent = await resolveEntitlement(supabase, auth.user.id);
  ent.userId = auth.user.id;
  req.__paidlyEntitlement = ent;
  return ent;
}

function denyBilling(req, res, ent, code, status, extra = {}) {
  const payload = {
    error: code === "SUBSCRIPTION_REQUIRED" ? "Active subscription required" : "Plan upgrade required",
    code,
    family: ent.family,
    status: ent.status,
    ...extra,
  };
  if (!entitlementsEnforceEnabled()) {
    console.warn("[entitlements] report-only would block", {
      code,
      userId: ent.userId,
      path: req.url,
      ...payload,
    });
    return true;
  }
  res.status(status).json(payload);
  return false;
}

export { entitlementsEnforceEnabled, familyHasFeature };
