import { supabaseAdmin } from "../supabaseAdmin.js";
import { getUserFromRequest } from "../supabaseAuth.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { resolvePublicAppOrigin } from "../companyInviteAppUrl.js";
import { logSecurity } from "../securityMiddleware.js";
import { buildWelcomeEmail } from "./paidlyAuthEmails.js";
import { applyApiCors } from "./applyApiCors.js";

/**
 * Send the Paidly welcome email to a verified business owner — at most once, ever.
 *
 * Idempotency is a database claim, not client state: profiles.welcome_email_sent_at is set with
 * `WHERE welcome_email_sent_at IS NULL`, so of any number of concurrent/repeated calls exactly one
 * wins and sends. A failed send releases only its own claim so a later call can retry.
 * The recipient is always the authenticated user's own verified address — nothing from the request
 * body is used, so it cannot be aimed at another account.
 *
 * @param {{ id: string, email?: string | null, email_confirmed_at?: string | null, user_metadata?: Record<string, any> }} user
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function sendWelcomeEmailOnce(user, { transport = sendHtmlEmail, appOrigin = null } = {}) {
  if (!user?.id || !user.email) return { sent: false, reason: "no_user" };
  if (!user.email_confirmed_at) return { sent: false, reason: "email_not_verified" };

  // Business owners only. Invited employees and POS staff join someone else's workspace; a
  // "set up your business" email would be wrong for them.
  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) return { sent: false, reason: "not_business_owner" };

  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("profiles")
    .update({ welcome_email_sent_at: claimedAt })
    .eq("id", user.id)
    .is("welcome_email_sent_at", null)
    .select("id, full_name")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) {
    const { data: exists } = await supabaseAdmin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    return { sent: false, reason: exists ? "already_sent" : "no_profile" };
  }

  const mail = buildWelcomeEmail({
    appOrigin: appOrigin || resolvePublicAppOrigin(),
    name: claimed.full_name || user.user_metadata?.full_name || null,
  });
  let result;
  try {
    result = await transport(user.email, mail.subject, mail.html, "Paidly", {
      text: mail.text,
      tags: [{ name: "category", value: "welcome" }],
    });
  } catch (err) {
    result = { success: false, error: err?.message };
  }
  if (!result || result.success === false) {
    await supabaseAdmin
      .from("profiles")
      .update({ welcome_email_sent_at: null })
      .eq("id", user.id)
      .eq("welcome_email_sent_at", claimedAt);
    return { sent: false, reason: "send_failed" };
  }
  return { sent: true };
}

/**
 * POST /api/auth/welcome — called by /auth/verified after verification (and after sign-in as a
 * fallback). Requires a verified session; takes no parameters.
 */
export default async function authWelcomeEmailHandler(req, res) {
  applyApiCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { user } = await getUserFromRequest(req); // rejects unverified accounts
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await sendWelcomeEmailOnce(user);
    if (result.reason === "send_failed") {
      logSecurity("warn", "welcome_email_send_failed", { userId: user.id });
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logSecurity("error", "welcome_email_exception", { userId: user.id, message: err?.message || "unknown" });
    return res.status(500).json({ error: "Could not send the welcome email" });
  }
}
