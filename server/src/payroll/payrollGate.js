import { getUserFromRequest } from "../supabaseAuth.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  loadCompanyMembership,
  membershipHasPermission,
  PERMISSIONS,
} from "../companyRouteAccess.js";
import { isPosOnlyStaff } from "../../../shared/posStaffInvite.js";
import { assertUserHasFeature, UpgradeRequiredError } from "../featureGate.js";

export { PERMISSIONS, supabaseAdmin };

export function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {string} permission
 * @param {{ feature?: string }} [opts]
 */
export async function requirePayrollPermission(req, res, permission, opts = {}) {
  try {
    const { user, error: authErr } = await getUserFromRequest(req);
    if (!user) return { ok: false, response: jsonError(res, 401, authErr || "Unauthorized") };

    const membership = await loadCompanyMembership(supabaseAdmin, user.id);
    if (!membership) {
      return { ok: false, response: jsonError(res, 403, "No company membership") };
    }
    if (isPosOnlyStaff(membership)) {
      return {
        ok: false,
        response: jsonError(res, 403, "POS staff cannot access payroll or leave administration", {
          code: "POS_SCOPE",
        }),
      };
    }
    if (!membershipHasPermission(membership, permission)) {
      return { ok: false, response: jsonError(res, 403, "Forbidden", { code: "FORBIDDEN" }) };
    }

    const feature = opts.feature;
    if (feature) {
      try {
        await assertUserHasFeature(supabaseAdmin, user.id, feature);
      } catch (err) {
        if (err instanceof UpgradeRequiredError) {
          return {
            ok: false,
            response: jsonError(res, 403, "Upgrade required", {
              code: "UPGRADE_REQUIRED",
              feature: err.feature,
            }),
          };
        }
        throw err;
      }
    }

    return { ok: true, user, membership };
  } catch (err) {
    return {
      ok: false,
      response: jsonError(res, 500, err?.message || "Could not verify access"),
    };
  }
}

export async function writePayrollAudit({ orgId, actorId, action, recordType, recordId, metadata }) {
  try {
    await supabaseAdmin.from("payroll_audit_logs").insert({
      org_id: orgId,
      actor_id: actorId || null,
      action,
      record_type: recordType || null,
      record_id: recordId || null,
      metadata: metadata || {},
    });
  } catch (err) {
    console.warn("[payroll] audit insert failed:", err?.message || err);
  }
}

export async function notifyUser(userId, message) {
  if (!userId || !message) return;
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      message,
      read: false,
    });
  } catch (err) {
    console.warn("[payroll] notification insert failed:", err?.message || err);
  }
}
