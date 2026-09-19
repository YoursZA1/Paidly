import { getUserFromRequest } from "../supabaseAuth.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  loadCompanyMembership,
  membershipHasPermission,
  membershipRowHasPermission,
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
      if (!membershipHasPermission(membership, permission)) {
        return {
          ok: false,
          response: jsonError(res, 403, "POS staff cannot access payroll or leave administration", {
            code: "POS_SCOPE",
          }),
        };
      }
    } else if (!membershipHasPermission(membership, permission)) {
      return { ok: false, response: jsonError(res, 403, "Forbidden", { code: "FORBIDDEN" }) };
    }

    const feature = opts.feature;
    if (feature) {
      try {
        await assertUserHasFeature(supabaseAdmin, user.id, feature, {
          companyId: membership.orgId,
        });
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

export async function listPayrollAdminRecipients(orgId) {
  if (!orgId) return [];
  const { data: members, error } = await supabaseAdmin
    .from("memberships")
    .select("id, org_id, user_id, role, job_function, employment_status")
    .eq("org_id", orgId);
  if (error) {
    console.warn("[payroll] admin recipient lookup failed:", error.message);
    return [];
  }
  const { data: org } = await supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
  // Raw rows carry `role`; the permission matrix reads `companyRole`, so map via the row helper.
  const eligible = (members || []).filter(
    (row) =>
      String(row.employment_status || "active") !== "inactive" &&
      membershipRowHasPermission(row, PERMISSIONS.MANAGE_PAYROLL, { ownerId: org?.owner_id || null }) &&
      row.user_id
  );
  const userIds = [...new Set(eligible.map((row) => row.user_id))];
  if (!userIds.length) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);
  const byId = new Map((profiles || []).map((row) => [row.id, row]));
  return eligible.map((row) => ({
    membershipId: row.id,
    userId: row.user_id,
    email: byId.get(row.user_id)?.email || null,
    name: byId.get(row.user_id)?.full_name || null,
  }));
}

export async function notifyPayrollAdmins(orgId, message, { emailSubject, emailHtml } = {}) {
  const recipients = await listPayrollAdminRecipients(orgId);
  const seen = new Set();
  for (const person of recipients) {
    if (!person.userId || seen.has(person.userId)) continue;
    seen.add(person.userId);
    await notifyUser(person.userId, message);
    if (emailSubject && emailHtml && person.email) {
      try {
        const { sendHtmlEmail } = await import("../sendInvoice.js");
        await sendHtmlEmail(person.email, emailSubject, emailHtml, "Paidly");
      } catch (err) {
        console.warn("[payroll] admin email failed:", err?.message || err);
      }
    }
  }
  return recipients.length;
}
