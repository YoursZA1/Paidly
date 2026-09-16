/**
 * Client entitlement snapshot — mirrors GET /api/subscriptions/current.
 * UX / EntityManager only. Server assertUserHasFeature / requireFeature remain SoR.
 */
import { familyForSlug, hasFeature } from "@/lib/plans";

/** @type {{ ready: boolean, accessGranted: boolean | null, planSlug: string | null, planFamily: string | null, source: string }} */
let snapshot = {
  ready: false,
  accessGranted: null,
  planSlug: null,
  planFamily: null,
  source: "unset",
};

/**
 * @param {{
 *   ready?: boolean,
 *   accessGranted?: boolean | null,
 *   planSlug?: string | null,
 *   planFamily?: string | null,
 *   source?: string,
 * }} next
 */
export function publishClientEntitlement(next) {
  snapshot = {
    ready: Boolean(next?.ready),
    accessGranted: next?.accessGranted ?? null,
    planSlug: next?.planSlug != null ? String(next.planSlug).trim() || null : null,
    planFamily: next?.planFamily != null ? String(next.planFamily).trim() || null : null,
    source: String(next?.source || "subscription"),
  };
}

export function getClientEntitlementSnapshot() {
  return snapshot;
}

export function resetClientEntitlementForTests() {
  snapshot = {
    ready: false,
    accessGranted: null,
    planSlug: null,
    planFamily: null,
    source: "unset",
  };
}

/**
 * Derive UI/write entitlement from /api/subscriptions/current payload.
 * @param {object | null | undefined} data
 * @param {{ profileSlug?: string | null }} [opts]
 */
export function deriveEntitlementFromSubscriptionCurrent(data, opts = {}) {
  const profileSlug = String(opts.profileSlug || "").trim() || null;

  if (!data || typeof data !== "object") {
    return {
      ready: false,
      accessGranted: null,
      planSlug: profileSlug,
      planFamily: profileSlug ? familyForSlug(profileSlug) : null,
      source: "profile_provisional",
    };
  }

  const accessGranted = data.accessGranted === true;
  const planSlug = accessGranted
    ? String(data.currentPlan || data.plan || data.planFamily || "").trim() || null
    : null;
  const planFamily = accessGranted
    ? String(data.planFamily || familyForSlug(planSlug) || "").trim() || null
    : null;

  return {
    ready: true,
    accessGranted,
    planSlug,
    planFamily,
    source: "subscription",
  };
}

/**
 * Same rule as server assertUserHasFeature once SoR is ready:
 * no access → deny; with access → family/slug features.
 * While provisional (not ready), use profile slug via hasFeature (boot UX only).
 * @param {string} feature
 * @param {{ snapshot?: typeof snapshot }} [opts]
 */
export function clientHasFeature(feature, opts = {}) {
  const s = opts.snapshot || snapshot;
  const key = String(feature || "").trim();
  if (!key) return false;

  if (!s.ready) {
    if (!s.planSlug) return true;
    return hasFeature(s.planSlug, key);
  }

  if (!s.accessGranted) return false;
  const slug = s.planSlug || s.planFamily;
  if (!slug) return false;
  return hasFeature(slug, key);
}

/**
 * Plan string for FeatureGate / nav labels once SoR is ready.
 * Without access → "none" (hasFeature maps none→starter for catalog math, but
 * callers must use clientHasFeature which denies when !accessGranted).
 */
export function clientPlanSlugForDisplay(opts = {}) {
  const s = opts.snapshot || snapshot;
  if (!s.ready) return s.planSlug || "none";
  if (!s.accessGranted) return "none";
  return s.planSlug || s.planFamily || "none";
}
