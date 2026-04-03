/**
 * Shared affiliate application approve / decline (service-role Supabase client).
 * Used by Express and Vercel serverless — single behavior, same JSON shapes.
 */

import { Resend } from "resend";
import {
  buildAffiliateSignupShareUrl,
  resolvePublicAppOriginForShareLinks,
} from "./affiliateShareLink.js";

export function parseAffiliateApplicationId(body) {
  const raw = body?.applicationId ?? body?.application_id ?? body?.id;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
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

export function parseCommissionFractionFromBody(body) {
  return toAffiliateRateFraction(body?.commission_rate ?? body?.commissionRate ?? 20);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {import("resend").Resend} resend
 * @param {{
 *   applicationId: string,
 *   commissionFraction: number,
 *   httpRequest: import("http").IncomingMessage | { headers?: Record<string, string | string[] | undefined> },
 * }} input
 * @returns {Promise<
 *   | { ok: true; payload: Record<string, unknown> }
 *   | { ok: false; status: number; body: Record<string, unknown> }
 * >}
 */
export async function runAffiliateApplicationApprove(supabaseAdmin, resend, input) {
  const { applicationId, commissionFraction, httpRequest } = input;

  const { data: appRow, error: appErr } = await supabaseAdmin
    .from("affiliate_applications")
    .select("id, email, full_name, status, user_id, created_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !appRow) {
    return { ok: false, status: 404, body: { error: "Application not found" } };
  }

  if (String(appRow.status).toLowerCase() !== "pending") {
    return { ok: false, status: 400, body: { error: "Application is not pending" } };
  }

  const email = String(appRow.email || "").trim().toLowerCase();
  if (!email) {
    return { ok: false, status: 400, body: { error: "Application email missing" } };
  }

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
    return {
      ok: false,
      status: 409,
      body: {
        error: "no_user_for_email",
        message: "No user account found for this email yet. Ask the applicant to sign up first.",
      },
    };
  }

  let referralCode = buildReferralCode(appRow.full_name);
  let lastErr = null;
  for (let i = 0; i < 5; i += 1) {
    const { error: upErr } = await supabaseAdmin.from("affiliates").upsert(
      {
        user_id: userId,
        application_id: appRow.id,
        referral_code: referralCode,
        commission_rate: commissionFraction,
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
    return {
      ok: false,
      status: 500,
      body: { error: lastErr.message || "Could not approve affiliate" },
    };
  }

  const commissionPercent = Number((commissionFraction * 100).toFixed(4));

  await supabaseAdmin
    .from("affiliate_applications")
    .update({
      status: "approved",
      user_id: userId,
      updated_at: new Date().toISOString(),
      commission_rate: commissionPercent,
    })
    .eq("id", appRow.id);

  const origin = resolvePublicAppOriginForShareLinks(httpRequest);
  const shareLink = buildAffiliateSignupShareUrl(origin, referralCode);
  if (!origin) {
    console.warn(
      "[affiliateModerationCore] No absolute origin for share link; set PUBLIC_APP_ORIGIN or CLIENT_ORIGIN."
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
    return {
      ok: true,
      payload: {
        ok: true,
        referral_code: referralCode,
        referral_link: shareLink,
        user_id: userId,
        email_sent: true,
      },
    };
  } catch (e) {
    return {
      ok: true,
      payload: {
        ok: true,
        referral_code: referralCode,
        referral_link: shareLink,
        user_id: userId,
        email_sent: false,
        email_error: e?.message || String(e),
      },
    };
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} applicationId
 * @returns {Promise<
 *   | { ok: true; payload: { ok: true } }
 *   | { ok: false; status: number; body: Record<string, unknown> }
 * >}
 */
export async function runAffiliateApplicationDecline(supabaseAdmin, applicationId) {
  const { data: appRow, error: appErr } = await supabaseAdmin
    .from("affiliate_applications")
    .select("id, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !appRow) {
    return { ok: false, status: 404, body: { error: "Application not found" } };
  }

  if (String(appRow.status).toLowerCase() !== "pending") {
    return { ok: false, status: 400, body: { error: "Application is not pending" } };
  }

  const { error: upErr } = await supabaseAdmin
    .from("affiliate_applications")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (upErr) {
    return { ok: false, status: 500, body: { error: upErr.message } };
  }

  return { ok: true, payload: { ok: true } };
}

/** @returns {Resend | null} */
export function createResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}
