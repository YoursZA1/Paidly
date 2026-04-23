/**
 * Deliver admin → platform user notices to the email on the Supabase Auth account (signup / login identity).
 * Uses the same Resend path as /api/send-email (RESEND_API_KEY, RESEND_FROM).
 */

import { sendHtmlEmail } from "./sendInvoice.js";
import { sanitizeOneLine, isValidEmail } from "./inputValidation.js";
import { ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT } from "./adminPlatformUserMessages.js";
import {
  buildAdminPlatformOutreachHtml,
  buildAdminPlatformOutreachPlainText,
} from "./adminPlatformMailerTemplate.js";

/** Reply-To: explicit env, else parse mailbox from RESEND_FROM. */
function outreachReplyToAddress() {
  const explicit = String(process.env.ADMIN_OUTREACH_REPLY_TO || "").trim();
  if (explicit && isValidEmail(explicit)) {
    return explicit;
  }
  const from = String(process.env.RESEND_FROM || "");
  const bracket = from.match(/<([^>]+)>/);
  if (bracket) {
    const inner = bracket[1].trim();
    if (isValidEmail(inner)) {
      return inner;
    }
  }
  const loose = from.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  if (loose && isValidEmail(loose[0])) {
    return loose[0];
  }
  return null;
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
 * @param {{ recipientId: string, subject: string, plainBody: string, messageId?: string }} opts
 * @returns {Promise<{ status: "sent" | "skipped" | "failed", reason?: string }>}
 */
export async function sendAdminPlatformMessageToSignupEmail(supabaseAdmin, opts) {
  const recipientId = String(opts.recipientId || "").trim();
  const subject = String(opts.subject || "");
  const plainBody = String(opts.plainBody || "");
  const messageId = opts.messageId != null ? String(opts.messageId).trim() : "";

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
    sanitizeOneLine(subject || "Message from the Paidly team", ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT) ||
    "Message from the Paidly team";
  const html = buildAdminPlatformOutreachHtml({ title: sub, plainBody });
  const text = buildAdminPlatformOutreachPlainText({ title: sub, plainBody, recipientEmail: email });

  // Omit Auto-Submitted: auto-generated — that value is for machine auto-replies (RFC 3834);
  // these are staff-initiated account notices and should not mimic vacation/list software.
  const headers = {
    "X-Auto-Response-Suppress": "OOF, AutoReply",
  };
  if (messageId) {
    headers["X-Entity-Ref-ID"] = `paidly-admin-msg-${messageId}`;
  }

  const replyTo = outreachReplyToAddress();
  const mailOpts = {
    text,
    headers,
    tags: [
      { name: "category", value: "transactional" },
      { name: "message_type", value: "admin_account_notice" },
    ],
  };
  if (replyTo) {
    mailOpts.reply_to = replyTo;
  }

  const result = await sendHtmlEmail(email, sub, html, "Paidly", mailOpts);
  if (!result.success) {
    return { status: "failed", reason: result.error || "send_failed" };
  }
  return { status: "sent" };
}

/**
 * Send outreach email when caller already has a trusted recipient email (skips Auth admin lookup).
 *
 * @param {{ email: string, subject: string, plainBody: string, messageId?: string }} opts
 * @returns {Promise<{ status: "sent" | "skipped" | "failed", reason?: string }>}
 */
export async function sendAdminPlatformMessageToKnownEmail(opts) {
  const email = String(opts.email || "").trim();
  const subject = String(opts.subject || "");
  const plainBody = String(opts.plainBody || "");
  const messageId = opts.messageId != null ? String(opts.messageId).trim() : "";

  if (!email) {
    return { status: "skipped", reason: "no_email" };
  }
  if (!isValidEmail(email)) {
    return { status: "skipped", reason: "invalid_signup_email" };
  }
  if (!process.env.RESEND_API_KEY) {
    return { status: "skipped", reason: "resend_not_configured" };
  }

  const sub =
    sanitizeOneLine(subject || "Message from the Paidly team", ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT) ||
    "Message from the Paidly team";
  const html = buildAdminPlatformOutreachHtml({ title: sub, plainBody });
  const text = buildAdminPlatformOutreachPlainText({ title: sub, plainBody, recipientEmail: email });

  const headers = {
    "X-Auto-Response-Suppress": "OOF, AutoReply",
  };
  if (messageId) {
    headers["X-Entity-Ref-ID"] = `paidly-admin-msg-${messageId}`;
  }

  const replyTo = outreachReplyToAddress();
  const mailOpts = {
    text,
    headers,
    tags: [
      { name: "category", value: "transactional" },
      { name: "message_type", value: "admin_account_notice" },
    ],
  };
  if (replyTo) {
    mailOpts.reply_to = replyTo;
  }

  const result = await sendHtmlEmail(email, sub, html, "Paidly", mailOpts);
  if (!result.success) {
    return { status: "failed", reason: result.error || "send_failed" };
  }
  return { status: "sent" };
}
