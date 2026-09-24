/**
 * Server-side subscription entitlements (SoR = subscriptions table, never profiles).
 *
 * PAIDLY_ENTITLEMENTS_ENFORCE:
 *   unset / true / 1 / on / enforce → block (default everywhere, same as the database guard)
 *   false / 0 / off / report → report-only (log, never block) — emergency rollback only
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

/**
 * One switch for every entitlement gate (server helpers here, the payroll/seat limits, and — via
 * app.paidly_entitlements_enforce — the database guard). Default: enforce everywhere, matching the
 * database guard. PAIDLY_ENTITLEMENTS_ENFORCE=false (or 0/off/report) is the emergency log-only
 * rollback; set app.paidly_entitlements_enforce = 'off' on the database at the same time.
 */
function entitlementsEnforceEnabled() {
  const raw = String(process.env.PAIDLY_ENTITLEMENTS_ENFORCE ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "report") return false;
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
  "id, status, plan, current_plan, plan_slug, plan_id, plan_family, company_id, grace_ends_at, amount, billing_cycle, next_billing_date, current_period_end, expires_at, cancelled_at, trial_ends_at, trial_started_at, admin_override, subscription_source, updated_at, created_at";
const ENTITLEMENT_SELECT_LEAN =
  "id, status, plan, current_plan, plan_slug, plan_id, plan_family, company_id, grace_ends_at, amount, billing_cycle, next_billing_date, current_period_end, updated_at, created_at";

export async function resolveEntitlementForCompany(supabase, companyId) {
  return resolveEntitlement(supabase, null, companyId);
}

/**
 * Every subscription row that belongs to a company: rows stamped with the company, plus rows the
 * company's owner (or the caller) holds with no company_id — PayFast ITN rows written without a
 * company hint, and pre-company rows. Without the second set such a company resolves to "no
 * package" and every gated screen reads as locked, while the admin list still shows its package.
 * With no company, the user's own rows.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ companyId?: string | null, userId?: string | null, columns?: string, limit?: number }} opts
 * @returns {Promise<{ data: object[] | null, error: any }>}
 */
export async function loadCompanySubscriptionRows(supabase, { companyId = null, userId = null, columns = "*", limit = 20 } = {}) {
  const base = () =>
    supabase.from("subscriptions").select(columns).order("updated_at", { ascending: false }).limit(limit);

  if (!companyId) {
    if (!userId) return { data: [], error: null };
    return await base().eq("user_id", userId);
  }

  const { data: companyRows, error } = await base().eq("company_id", companyId);
  if (error) return { data: null, error };

  const { data: org } = await supabase.from("organizations").select("owner_id").eq("id", companyId).maybeSingle();
  const holders = [...new Set([org?.owner_id, userId].filter(Boolean).map(String))];
  let orphanRows = [];
  if (holders.length) {
    // At most two holders (owner, caller); filter company_id in JS.
    for (const holder of holders) {
      const { data: held, error: heldErr } = await base().eq("user_id", holder);
      if (!heldErr) orphanRows.push(...(held || []).filter((r) => r.company_id == null));
    }
  }

  const byId = new Map([...(companyRows || []), ...orphanRows].map((r) => [r.id, r]));
  return { data: [...byId.values()], error: null };
}

export async function resolveEntitlement(supabase, userId, knownCompanyId = null) {
  const companyId = knownCompanyId || (userId ? await resolveUserCompanyId(supabase, userId) : null);
  const now = new Date();

  const run = (cols) => loadCompanySubscriptionRows(supabase, { companyId, userId, columns: cols, limit: 10 });

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
        // Finite admin trials expire too (shouldExpireTrialRow already excluded indefinite ones).
        .not("trial_ends_at", "is", null)
        .select(ENTITLEMENT_SELECT_LEAN)
        .maybeSingle();
      sub = expiredRow ? { ...sub, ...expiredRow, status: "expired" } : { ...sub, status: "expired" };
    } catch (e) {
      console.warn("[entitlements] trial expire write", e?.message || e);
      sub = { ...sub, status: "expired" };
    }
  }

  // The package is the catalog slug; plan_family is its cached family (used for slugs the shared
  // catalog doesn't know). Slug first, so a row whose plan_family lagged behind a PayFast payment
  // (trial row updated to business_monthly, family still "starter") resolves to what was paid for.
  // No "starter" default and no trial/free/none alias: a missing package is no package.
  const family =
    familyForSlug(sub?.plan_slug) ||
    normalizePlanFamily(sub?.plan_family) ||
    familyForSlug(sub?.plan) ||
    familyForSlug(sub?.current_plan) ||
    null;
  const tierRank = family ? FAMILY_TIER_RANK[family] : 0;
  const limits = family ? FAMILY_LIMITS[family] : { seats: 1, companies: 1, payslipEmployees: 0 };
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
    payslipEmployees: limits.payslipEmployees,
    features,
    subscription: sub,
  };
}

const FAMILY_LABEL = Object.freeze({
  starter: "Starter",
  business: "Business",
  growth: "Growth",
  enterprise: "Enterprise",
});

/**
 * The single access result the UI consumes (GET /api/subscriptions/current → `entitlement`).
 * Built from resolveEntitlement(), so nav, badges, plan page and server gates cannot disagree.
 * `plan` is the subscribed package even without access (e.g. an expired Growth trial), so the UI can
 * say "Growth — trial expired"; `features` is empty whenever access is not granted.
 * @param {Awaited<ReturnType<typeof resolveEntitlement>>} ent
 * @param {Date} [now]
 */
export function buildEntitlementSnapshot(ent, now = new Date()) {
  const sub = ent?.subscription || null;
  const plan = ent?.family || null;
  const access = Boolean(ent?.access);
  const limits = plan ? FAMILY_LIMITS[plan] : { seats: null, companies: null, payslipEmployees: null };
  const status = coerceSubscriptionStatus(sub?.status) || null;
  const trialEndsAt = sub?.trial_ends_at || null;
  const trialing = status === "trialing" && access;
  let trialDaysRemaining = null;
  if (trialing && trialEndsAt) {
    const ms = new Date(trialEndsAt).getTime() - now.getTime();
    trialDaysRemaining = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : null;
  }
  return {
    plan,
    planName: plan ? FAMILY_LABEL[plan] : null,
    tierRank: plan ? FAMILY_TIER_RANK[plan] : 0,
    status,
    accessGranted: access,
    inGrace: Boolean(ent?.inGrace),
    trialing,
    trialEndsAt,
    trialDaysRemaining,
    companyId: ent?.companyId || null,
    subscriptionId: ent?.subscriptionId || null,
    features: access && plan ? [...FAMILY_FEATURES[plan]] : [],
    limits: {
      seats: access ? limits.seats : 0,
      companies: access ? limits.companies : 0,
      // null = unlimited (Growth). Employees active on payroll that pay runs may include.
      payslipEmployees: access ? limits.payslipEmployees : 0,
    },
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
