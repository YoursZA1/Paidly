/**
 * Admin affiliate mutations (service role): approve (email + affiliates row) and decline (reject application).
 * Mounted at POST /api/admin/approve, POST /api/admin/decline and legacy POST /api/affiliates/approve.
 */
import { Resend } from "resend";
import {
  buildAffiliateSignupShareUrl,
  resolvePublicAppOriginForShareLinks,
} from "./affiliateShareLink.js";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function buildReferralCode(name) {
  const base =
    String(name || "PAIDLY")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "PAIDLY";
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `PAIDLY-${base}-${suffix}`;
}

function escapeHtml(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toAffiliateRateFraction(maybePercent) {
  const n = Number(maybePercent);
  if (!Number.isFinite(n) || n <= 0) return 0.2;
  if (n <= 1) return n;
  return n / 100;
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
export async function handlePostAffiliateApplicationApprove(req, res, deps) {
  const { supabaseAdmin, getAdminFromRequest, logAdminApi } = deps;
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowTeamManagement: true });
    if (!adminUser) return;

    const resend = getResend();
    if (!resend) {
      logAdminApi(req.method, req.path, 503, "RESEND_API_KEY missing");
      return res.status(503).json({ error: "Email service not configured (RESEND_API_KEY)" });
    }

    const applicationId = req.body?.applicationId || req.body?.application_id || req.body?.id;
    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    const { data: appRow, error: appErr } = await supabaseAdmin
      .from("affiliate_applications")
      .select("id, email, full_name, status, user_id, created_at")
      .eq("id", applicationId)
      .maybeSingle();

    if (appErr || !appRow) {
      return res.status(404).json({ error: "Application not found" });
    }

    if (String(appRow.status).toLowerCase() !== "pending") {
      return res.status(400).json({ error: "Application is not pending" });
    }

    const email = String(appRow.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Application email missing" });

    let userId = appRow.user_id || null;
    if (!userId) {
      const { data: profileRow } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .ilike("email", email)
        .maybeSingle();
      userId = profileRow?.id || null;
    }

    if (!userId) {
      return res.status(409).json({
        error: "no_user_for_email",
        message: "No user account found for this email yet. Ask the applicant to sign up first.",
      });
    }

    let referralCode = buildReferralCode(appRow.full_name);
    let lastErr = null;
    for (let i = 0; i < 5; i += 1) {
      const { error: upErr } = await supabaseAdmin.from("affiliates").upsert(
        {
          user_id: userId,
          application_id: appRow.id,
          referral_code: referralCode,
          commission_rate: toAffiliateRateFraction(
            req.body?.commission_rate ?? req.body?.commissionRate ?? 20
          ),
          status: "approved",
        },
        { onConflict: "user_id" }
      );
      if (!upErr) {
        lastErr = null;
        break;
      }
      lastErr = upErr;
      referralCode = buildReferralCode(appRow.full_name);
    }

    if (lastErr) {
      logAdminApi(req.method, req.path, 500, lastErr.message);
      return res.status(500).json({ error: lastErr.message || "Could not approve affiliate" });
    }

    await supabaseAdmin
      .from("affiliate_applications")
      .update({ status: "approved", user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", appRow.id);

    const origin = resolvePublicAppOriginForShareLinks(req);
    const shareLink = buildAffiliateSignupShareUrl(origin, referralCode);
    if (!origin) {
      console.warn(
        "[affiliate/approve] Share link is relative (no absolute origin). Set PUBLIC_APP_ORIGIN or CLIENT_ORIGIN so email clients open the correct site."
      );
    }
    const fromAddress = process.env.RESEND_FROM || "Paidly <invoices@paidly.co.za>";

    const safeName = escapeHtml(appRow.full_name || "there");
    try {
      await resend.emails.send({
        from: fromAddress,
        to: [email],
        subject: "Your Paidly affiliate profile is approved",
        html: `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a;">
          <h2 style="margin:0 0 12px;">You are approved!</h2>
          <p>Hi ${safeName}, your Paidly affiliate account has been approved.</p>
          <p><strong>Your referral code:</strong> ${referralCode}</p>
          <p><strong>Your unique share link</strong> (bookmark or share this URL):<br/><a href="${shareLink}">${shareLink}</a></p>
          <p>Anyone who creates a Paidly account through that link is attributed to you; eligible paid plans can earn commissions per program terms.</p>
          <p style="font-size:13px;color:#64748b;">Didn&apos;t get this message? Check spam/junk, or contact Paidly support and ask to resend your affiliate link.</p>
          <p style="margin-top:14px;">Welcome to Paidly partners.</p>
        </div>
      `,
      });
    } catch (e) {
      logAdminApi(req.method, req.path, 200, `approved email_failed=${e?.message || e}`);
      return res.status(200).json({
        ok: true,
        referral_code: referralCode,
        referral_link: shareLink,
        user_id: userId,
        email_sent: false,
        email_error: e?.message || String(e),
      });
    }

    logAdminApi(req.method, req.path, 200, "approved email_sent");
    return res.status(200).json({
      ok: true,
      referral_code: referralCode,
      referral_link: shareLink,
      user_id: userId,
      email_sent: true,
    });
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
    const adminUser = await getAdminFromRequest(req, res, { allowTeamManagement: true });
    if (!adminUser) return;

    const applicationId = req.body?.applicationId || req.body?.application_id || req.body?.id;
    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    const { data: appRow, error: appErr } = await supabaseAdmin
      .from("affiliate_applications")
      .select("id, status")
      .eq("id", applicationId)
      .maybeSingle();

    if (appErr || !appRow) {
      return res.status(404).json({ error: "Application not found" });
    }

    if (String(appRow.status).toLowerCase() !== "pending") {
      return res.status(400).json({ error: "Application is not pending" });
    }

    const { error: upErr } = await supabaseAdmin
      .from("affiliate_applications")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", applicationId);

    if (upErr) {
      logAdminApi(req.method, req.path, 500, upErr.message);
      return res.status(500).json({ error: upErr.message });
    }

    logAdminApi(req.method, req.path, 200, "declined");
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (res.headersSent) return;
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({ error: err?.message || "Failed to decline affiliate application" });
  }
}
