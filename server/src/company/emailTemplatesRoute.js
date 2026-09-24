/**
 * GET/PUT /api/company/email-templates — company email templates (plan feature `email_templates`).
 *
 * GET: any company member (templates prefill the send-email dialog). Returns the saved templates
 *      only when the plan includes the feature, plus `allowed` so the UI can lock the editor.
 * PUT: manage_company_settings (RBAC) + email_templates (plan). The DB also guards direct writes.
 */
import { getUserFromRequest } from "../supabaseAuth.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { loadCompanyMembership, membershipHasPermission, PERMISSIONS } from "../companyRouteAccess.js";
import { assertUserHasFeature, UpgradeRequiredError } from "../featureGate.js";
import { normalizeEmailTemplates } from "../../../shared/emailTemplates.js";

async function planAllows(userId, companyId) {
  try {
    await assertUserHasFeature(supabaseAdmin, userId, "email_templates", { companyId });
    return true;
  } catch (err) {
    if (err instanceof UpgradeRequiredError) return false;
    throw err;
  }
}

export async function handleCompanyEmailTemplates(req, res) {
  try {
    const { user, error: authErr } = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: authErr || "Unauthorized" });
    const membership = await loadCompanyMembership(supabaseAdmin, user.id);
    if (!membership) return res.status(403).json({ error: "No company membership" });
    const companyId = membership.companyId;
    const allowed = await planAllows(user.id, companyId);

    if (req.method === "GET") {
      if (!allowed) return res.status(200).json({ templates: {}, allowed: false });
      const { data, error } = await supabaseAdmin
        .from("organizations")
        .select("email_templates")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ templates: data?.email_templates || {}, allowed: true });
    }

    if (req.method === "PUT") {
      if (!membershipHasPermission(membership, PERMISSIONS.MANAGE_COMPANY_SETTINGS)) {
        return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      }
      if (!allowed) {
        return res.status(403).json({
          error: "Email templates are available on Business and Growth.",
          code: "UPGRADE_REQUIRED",
          feature: "email_templates",
        });
      }
      let templates;
      try {
        templates = normalizeEmailTemplates(req.body?.templates);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      const { error } = await supabaseAdmin
        .from("organizations")
        .update({ email_templates: templates })
        .eq("id", companyId);
      if (error) throw error;
      return res.status(200).json({ templates, allowed: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[company/email-templates]", err?.message || err);
    return res.status(500).json({ error: "Could not load email templates" });
  }
}
