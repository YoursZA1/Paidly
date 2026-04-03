/**
 * Vercel serverless handler: POST /api/affiliates/approve
 *
 * Approves an affiliate application in one call:
 * - Resolve applicant user (by application.user_id or profiles.email match)
 * - Generate a unique referral_code (if not already approved)
 * - Upsert affiliates row (status=approved)
 * - Update affiliate_applications status=approved + user_id
 * - Send approval email with share link
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (and optional RESEND_FROM).
 */
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { applyPaidlyServerlessCors } from "../../server/src/vercelPaidlyCors.js";
import {
  buildAffiliateSignupShareUrl,
  resolvePublicAppOriginForShareLinks,
} from "../../server/src/affiliateShareLink.js";
import { canMutateAffiliateApplication } from "../../server/src/adminRouteAccess.js";

function cors(res, req) {
  applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function buildReferralCode(name) {
  const base = String(name || "PAIDLY")
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

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured (Supabase)" });
  }

  const resend = getResend();
  if (!resend) {
    return res.status(503).json({ error: "Email service not configured (RESEND_API_KEY)" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (!(await canMutateAffiliateApplication(supabase, authData.user))) {
    return res.status(403).json({ error: "Access restricted" });
  }

  const applicationId = req.body?.applicationId || req.body?.application_id || req.body?.id;
  if (!applicationId) {
    return res.status(400).json({ error: "Missing applicationId" });
  }

  const { data: appRow, error: appErr } = await supabase
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
    const { data: profileRow } = await supabase
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

  // Ensure we have (or generate) a unique referral code.
  let referralCode = buildReferralCode(appRow.full_name);
  let lastErr = null;
  for (let i = 0; i < 5; i += 1) {
    const { error: upErr } = await supabase.from("affiliates").upsert(
      {
        user_id: userId,
        application_id: appRow.id,
        referral_code: referralCode,
        commission_rate: toAffiliateRateFraction(req.body?.commission_rate ?? req.body?.commissionRate ?? 20),
        status: "approved",
      },
      { onConflict: "user_id" }
    );
    if (!upErr) {
      lastErr = null;
      break;
    }
    lastErr = upErr;
    // Retry a new code if uniqueness violated.
    referralCode = buildReferralCode(appRow.full_name);
  }

  if (lastErr) {
    return res.status(500).json({ error: lastErr.message || "Could not approve affiliate" });
  }

  await supabase
    .from("affiliate_applications")
    .update({ status: "approved", user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", appRow.id);

  const origin = resolvePublicAppOriginForShareLinks(req);
  const shareLink = buildAffiliateSignupShareUrl(origin, referralCode);
  if (!origin) {
    console.warn(
      "[affiliates/approve] Share link has no absolute origin; set PUBLIC_APP_ORIGIN or CLIENT_ORIGIN so email links work."
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
    // Approval is done; email is best-effort.
    return res.status(200).json({
      ok: true,
      referral_code: referralCode,
      referral_link: shareLink,
      user_id: userId,
      email_sent: false,
      email_error: e?.message || String(e),
    });
  }

  return res.status(200).json({
    ok: true,
    referral_code: referralCode,
    referral_link: shareLink,
    user_id: userId,
    email_sent: true,
  });
}

