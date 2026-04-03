/**
 * Express: POST /api/admin/approve, POST /api/admin/decline, legacy POST /api/affiliates/approve.
 * Business logic lives in affiliateModerationCore.js (shared with Vercel).
 */
import {
  createResendClient,
  parseAffiliateApplicationId,
  parseCommissionFractionFromBody,
  runAffiliateApplicationApprove,
  runAffiliateApplicationDecline,
} from "./affiliateModerationCore.js";

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{
 *   supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
 *   getAdminFromRequest: (req: any, res: any, opts?: object) => Promise<any>,
 *   logAdminApi: (method: string, path: string, status: number, detail?: string) => void,
 * }} deps
 */
export async function handlePostAffiliateApplicationApprove(req, res, deps) {
  const { supabaseAdmin, getAdminFromRequest, logAdminApi } = deps;
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowAffiliateModeration: true });
    if (!adminUser) return;

    const resend = createResendClient();
    if (!resend) {
      logAdminApi(req.method, req.path, 503, "RESEND_API_KEY missing");
      return res.status(503).json({ error: "Email service not configured (RESEND_API_KEY)" });
    }

    const applicationId = parseAffiliateApplicationId(req.body || {});
    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    const commissionFraction = parseCommissionFractionFromBody(req.body || {});
    const result = await runAffiliateApplicationApprove(supabaseAdmin, resend, {
      applicationId,
      commissionFraction,
      httpRequest: req,
    });

    if (!result.ok) {
      if (result.status >= 500) {
        logAdminApi(req.method, req.path, result.status, String(result.body?.error || ""));
      }
      return res.status(result.status).json(result.body);
    }

    const emailSent = result.payload.email_sent === true;
    logAdminApi(
      req.method,
      req.path,
      200,
      emailSent ? "approved email_sent" : `approved email_failed=${result.payload.email_error || ""}`
    );
    return res.status(200).json(result.payload);
  } catch (err) {
    if (res.headersSent) return;
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({ error: err?.message || "Failed to approve affiliate" });
  }
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{
 *   supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
 *   getAdminFromRequest: (req: any, res: any, opts?: object) => Promise<any>,
 *   logAdminApi: (method: string, path: string, status: number, detail?: string) => void,
 * }} deps
 */
export async function handlePostAffiliateApplicationDecline(req, res, deps) {
  const { supabaseAdmin, getAdminFromRequest, logAdminApi } = deps;
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowAffiliateModeration: true });
    if (!adminUser) return;

    const applicationId = parseAffiliateApplicationId(req.body || {});
    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    const result = await runAffiliateApplicationDecline(supabaseAdmin, applicationId);
    if (!result.ok) {
      if (result.status >= 500) {
        logAdminApi(req.method, req.path, result.status, String(result.body?.error || ""));
      }
      return res.status(result.status).json(result.body);
    }

    logAdminApi(req.method, req.path, 200, "declined");
    return res.status(200).json(result.payload);
  } catch (err) {
    if (res.headersSent) return;
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({ error: err?.message || "Failed to decline affiliate application" });
  }
}
