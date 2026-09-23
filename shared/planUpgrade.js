/**
 * Upgrade targets, always computed from the company's current package — never a hardcoded tier.
 *
 * The package decides access; trial status only decides how long that package lasts. So:
 *   - a package that already includes the feature never gets an upgrade prompt,
 *   - a lapsed package that includes the feature is told to renew that package,
 *   - otherwise the target is the lowest package ABOVE the current one that includes the feature.
 * A Business or Growth company is therefore never pointed at Starter.
 *
 * Upgrades only move along the self-serve path Starter → Business → Growth. Growth is the top:
 * it never gets an upgrade CTA (Enterprise is contact-sales, not an upgrade prompt).
 */

import { FAMILY_TIER_RANK, familyHasFeature, normalizePlanFamily } from "./planFeatures.js";

export const PLAN_FAMILY_LABEL = Object.freeze({
  starter: "Starter",
  business: "Business",
  growth: "Growth",
  enterprise: "Enterprise",
});

/** Self-serve upgrade path, lowest first. */
export const UPGRADE_PATH = Object.freeze(["starter", "business", "growth"]);

export const UPGRADE_ACTION = Object.freeze({
  /** Current package already grants the feature. */
  NONE: "none",
  /** Move up from the current package. */
  UPGRADE: "upgrade",
  /** Package includes the feature but its access lapsed (trial ended, expired, suspended…). */
  RENEW: "renew",
  /** No package on record. */
  SUBSCRIBE: "subscribe",
});

/**
 * Self-serve packages strictly above `family`, lowest first. Unknown/no family → the whole path.
 * @param {string | null | undefined} family
 */
export function familiesAbove(family) {
  const fam = normalizePlanFamily(family);
  const rank = fam ? FAMILY_TIER_RANK[fam] : 0;
  return UPGRADE_PATH.filter((f) => FAMILY_TIER_RANK[f] > rank);
}

/**
 * Lowest package above `family` that includes `featureKey` (or the next package up when no
 * feature is given). Null when nothing above qualifies.
 * @param {string | null | undefined} family
 * @param {string | null} [featureKey]
 */
export function nextPlanFor(family, featureKey = null) {
  const above = familiesAbove(family);
  if (!featureKey) return above[0] || null;
  return above.find((f) => familyHasFeature(f, featureKey)) || null;
}

/**
 * @param {{
 *   currentPlan?: string | null,   // subscribed package, even when access has lapsed
 *   accessGranted?: boolean | null,
 *   featureKey?: string | null,
 * }} input
 * @returns {{ action: string, plan: string | null, planLabel: string | null, label: string }}
 */
export function resolveUpgradeTarget({ currentPlan = null, accessGranted = false, featureKey = null } = {}) {
  const current = normalizePlanFamily(currentPlan);
  const includes = (fam) => (featureKey ? familyHasFeature(fam, featureKey) : true);
  const out = (action, plan, label) => ({
    action,
    plan,
    planLabel: plan ? PLAN_FAMILY_LABEL[plan] : null,
    label,
  });

  if (current && includes(current)) {
    if (accessGranted) return out(UPGRADE_ACTION.NONE, current, "");
    return out(UPGRADE_ACTION.RENEW, current, `Renew ${PLAN_FAMILY_LABEL[current]}`);
  }

  if (!current) {
    const lowest = UPGRADE_PATH.find((f) => includes(f)) || null;
    return out(
      UPGRADE_ACTION.SUBSCRIBE,
      lowest,
      lowest ? `Subscribe to ${PLAN_FAMILY_LABEL[lowest]}` : "Choose a plan"
    );
  }

  const next = nextPlanFor(current, featureKey);
  // Top of the path (Growth), or only Enterprise has it: no upgrade CTA.
  if (!next) return out(UPGRADE_ACTION.NONE, current, "");
  return out(UPGRADE_ACTION.UPGRADE, next, `Upgrade to ${PLAN_FAMILY_LABEL[next]}`);
}

/**
 * Packages a company may be offered in an upgrade/renew picker, lowest first.
 * With access: only packages above the current one. Lapsed: the current package (renew) and above.
 * Optional feature filter keeps only packages that include it.
 * @param {{ currentPlan?: string | null, accessGranted?: boolean | null, featureKey?: string | null }} input
 * @param {readonly string[]} [candidates] families to choose from (e.g. the self-serve catalog)
 */
export function offerablePlans({ currentPlan = null, accessGranted = false, featureKey = null } = {}, candidates = UPGRADE_PATH) {
  const current = normalizePlanFamily(currentPlan);
  const floor = current ? FAMILY_TIER_RANK[current] : 0;
  return candidates.filter((f) => {
    const fam = normalizePlanFamily(f);
    if (!fam) return false;
    const rank = FAMILY_TIER_RANK[fam];
    if (current && (accessGranted ? rank <= floor : rank < floor)) return false;
    return featureKey ? familyHasFeature(fam, featureKey) : true;
  });
}
