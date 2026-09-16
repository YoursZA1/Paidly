/**
 * Server feature authorization — Subscriptions SoR only.
 * Never use profiles.plan / profiles.subscription_plan for access decisions.
 */
import { resolveEntitlement } from "./billing/entitlements.js";
import { familyHasFeature, hasFeature } from "./subscriptionPlans.js";

export class UpgradeRequiredError extends Error {
  /**
   * @param {string} [feature]
   */
  constructor(feature) {
    super("Upgrade required");
    this.name = "UpgradeRequiredError";
    this.code = "UPGRADE_REQUIRED";
    this.feature = feature ?? null;
  }
}

/**
 * Pure slug check (catalog math only). Prefer assertUserHasFeature for live authz.
 * @param {string} planSlug
 * @param {string} feature
 */
export function assertHasFeatureForPlan(planSlug, feature) {
  const plan = String(planSlug || "").trim() || "free";
  if (!hasFeature(plan, feature)) {
    throw new UpgradeRequiredError(feature);
  }
}

/**
 * @deprecated Display / migration helpers only — NOT for authorization.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId
 */
export async function fetchProfilePlanSlug(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("plan, subscription_plan")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return String(data?.plan || data?.subscription_plan || "").trim();
}

/**
 * Authoritative feature check: subscriptions row → access + plan family features.
 * profiles.plan is ignored even when it claims a higher plan.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId
 * @param {string} feature
 * @param {{ companyId?: string | null }} [opts]
 */
export async function assertUserHasFeature(supabaseAdmin, userId, feature, opts = {}) {
  const companyId = opts.companyId != null ? String(opts.companyId).trim() || null : null;
  const ent = await resolveEntitlement(supabaseAdmin, userId, companyId);
  if (!ent.access) {
    throw new UpgradeRequiredError(feature);
  }
  if (!familyHasFeature(ent.family, feature)) {
    throw new UpgradeRequiredError(feature);
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId
 * @param {string[]} features
 * @param {{ companyId?: string | null }} [opts]
 */
export async function assertUserHasAnyFeature(supabaseAdmin, userId, features, opts = {}) {
  const companyId = opts.companyId != null ? String(opts.companyId).trim() || null : null;
  const ent = await resolveEntitlement(supabaseAdmin, userId, companyId);
  if (!ent.access) {
    throw new UpgradeRequiredError(features?.[0] || "unknown");
  }
  const list = Array.isArray(features) ? features : [];
  const ok = list.some((f) => familyHasFeature(ent.family, f));
  if (!ok) {
    throw new UpgradeRequiredError(list[0] || "unknown");
  }
}
