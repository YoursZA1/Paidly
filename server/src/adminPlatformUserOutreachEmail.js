/**
 * Deliver admin → platform user notices to the email on the Supabase Auth account (signup / login identity).
 * Uses the same Resend path as /api/send-email (RESEND_API_KEY, RESEND_FROM).
 */

import { sendHtmlEmail } from "./sendInvoice.js";
import { sanitizeOneLine, isValidEmail } from "./inputValidation.js";
import { ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT } from "./adminPlatformUserMessages.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Primary email from Auth (not profiles.email), i.e. the address used to sign up / receive auth emails.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} userId — same as profiles.id / auth.users.id
 * @returns {Promise<{ email: string | null, error: string | null }>}
 */
export async function getAuthSignupEmail(supabaseAdmin, userId) {
  const admin = supabaseAdmin.auth?.admin;
  if (!admin?.getUserById) {
    return { email: null, error: "Auth admin API unavailable" };
  }
  const { data, error } = await admin.getUserById(userId);
  if (error) {
    return { email: null, error: error.message || "Auth lookup failed" };
  }
  const raw = String(data?.user?.email || "").trim();
  if (!raw) {
    return { email: null, error: "No signup email on account" };
  }
  return { email: raw, error: null };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ recipientId: string, subject: string, plainBody: string }} opts
 * @returns {Promise<{ status: "sent" | "skipped" | "failed", reason?: string }>}
 */
export async function sendAdminPlatformMessageToSignupEmail(supabaseAdmin, opts) {
  const recipientId = String(opts.recipientId || "").trim();
  const subject = String(opts.subject || "");
  const plainBody = String(opts.plainBody || "");

  const { email, error: lookupErr } = await getAuthSignupEmail(supabaseAdmin, recipientId);
  if (!email) {
    return { status: "skipped", reason: lookupErr || "no_email" };
  }
  if (!isValidEmail(email)) {
    return { status: "skipped", reason: "invalid_signup_email" };
  }

  if (!process.env.RESEND_API_KEY) {
    return { status: "skipped", reason: "resend_not_configured" };
  }

  const sub =
    sanitizeOneLine(subject || "Message from Paidly", ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT) ||
    "Message from Paidly";
  const safeBody = escapeHtml(plainBody).replace(/\n/g, "<br/>");
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="font-size:18px;">Update from Paidly</h2>
      <div style="font-size: 15px; line-height: 1.5; color: #333;">${safeBody}</div>
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
      <p style="color: #666; font-size: 13px;">Sign in to Paidly for more details.</p>
    </div>
  `;

  const result = await sendHtmlEmail(email, sub, html, "Paidly");
  if (!result.success) {
    return { status: "failed", reason: result.error || "send_failed" };
  }
  return { status: "sent" };
}
