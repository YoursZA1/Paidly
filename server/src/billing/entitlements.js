/**
 * Server-side subscription entitlements (SoR = subscriptions table, never profiles).
 *
 * PAIDLY_ENTITLEMENTS_ENFORCE=false → report-only (log, never block).
 * Default: enforce on write paths that call requireActiveBilling / requireFeature.
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
import { PAID_ACCESS_STATUSES, coerceSubscriptionStatus } from "../../../shared/subscriptionStatuses.js";

function entitlementsEnforceEnabled() {
  // Default report-only until PAIDLY_ENTITLEMENTS_ENFORCE=true is set after migrations + soak.
  const raw = String(process.env.PAIDLY_ENTITLEMENTS_ENFORCE || "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "enforce";
}

/**
 * @param {{ status?: string, grace_ends_at?: string | null }} sub
 */
export function hasPaidAccessIncludingGrace(sub) {
  if (!sub) return false;
  const st = coerceSubscriptionStatus(sub.status);
  if (!st) return false;
  if (PAID_ACCESS_STATUSES.includes(st)) return true;
  if (st === "past_due" && sub.grace_ends_at) {
    const end = new Date(sub.grace_ends_at).getTime();
    return Number.isFinite(end) && end > Date.now();
  }
  return false;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 */
export async function resolveEntitlement(supabase, userId) {
  const companyId = await resolveUserCompanyId(supabase, userId);
  let query = supabase
    .from("subscriptions")
    .select(
      "id, status, plan_slug, plan_id, plan_family, company_id, grace_ends_at, amount, billing_cycle, next_billing_date, current_period_end"
    )
    .order("updated_at", { ascending: false })
    .limit(1);
  query = companyId ? query.eq("company_id", companyId) : query.eq("user_id", userId);
  const { data: rows } = await query;
  const sub = rows?.[0] || null;

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
