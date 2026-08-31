import { requireFeature } from "../billing/entitlements.js";
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
