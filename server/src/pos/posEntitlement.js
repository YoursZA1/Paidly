import { entitlementsEnforceEnabled, requireFeature, resolveEntitlementForCompany } from "../billing/entitlements.js";
import { getBillingSupabaseAdmin } from "../billing/supabaseAdmin.js";
import { familyHasFeature } from "../subscriptionPlans.js";
import { POS_PLAN_FEATURE } from "../../../shared/planFeatures.js";

export { POS_PLAN_FEATURE };

/**
 * Plan entitlement for the native till. Same path as invoices/inventory:
 * subscriptions family → FAMILY_FEATURES → requireFeature.
 * Do not special-case user ids or org ids.
 *
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 */
export async function requirePosPlan(req, res) {
  return requireFeature(req, res, POS_PLAN_FEATURE);
}

/**
 * POS access-pass has no Paidly Auth JWT. Check the org subscription instead.
 * @param {import("http").ServerResponse} res
 * @param {string} orgId
 */
export async function requirePosPlanForOrg(res, orgId) {
  if (!entitlementsEnforceEnabled()) return true;
  const supabase = getBillingSupabaseAdmin();
  if (!supabase || !orgId) {
    res.status(503).json({ error: "Server configuration error (Supabase)" });
    return false;
  }
  const ent = await resolveEntitlementForCompany(supabase, orgId);
  if (!ent.access) {
    res.status(402).json({ error: "Active subscription required", code: "SUBSCRIPTION_REQUIRED" });
    return false;
  }
  if (!familyHasFeature(ent.family, POS_PLAN_FEATURE)) {
    res.status(403).json({
      error: "Plan upgrade required",
      code: "PLAN_UPGRADE_REQUIRED",
      requiredFeature: POS_PLAN_FEATURE,
    });
    return false;
  }
  return true;
}
