import { hasFeature } from "./subscriptionPlans.js";

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
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId
 * @param {string} feature
 */
export async function assertUserHasFeature(supabaseAdmin, userId, feature) {
  const slug = await fetchProfilePlanSlug(supabaseAdmin, userId);
  assertHasFeatureForPlan(slug, feature);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId
 * @param {string[]} features
 */
export async function assertUserHasAnyFeature(supabaseAdmin, userId, features) {
  const slug = await fetchProfilePlanSlug(supabaseAdmin, userId);
  const plan = slug || "free";
  const ok = features.some((f) => hasFeature(plan, f));
  if (!ok) {
    throw new UpgradeRequiredError(features[0] || "unknown");
  }
}
