/**
 * POST /api/admin/send-platform-message — Vercel entry (admin → platform user, stored + optional client email).
 */
import { createClient } from "@supabase/supabase-js";
import { assertCallerForAdminRoute } from "./adminRouteAccess.js";
import {
  insertAdminPlatformMessage,
  isAdminPlatformMessageClientError,
  isAdminPlatformMessagesSchemaMissingError,
} from "./adminPlatformUserMessages.js";
import { sendAdminPlatformMessageToSignupEmail } from "./adminPlatformUserOutreachEmail.js";
import { validateServiceRoleKey } from "./supabaseServiceRoleGuard.js";
import { applyPaidlyServerlessCors } from "./vercelPaidlyCors.js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { client: null, configError: "Server misconfigured (Supabase)." };
  }
  const roleCheck = validateServiceRoleKey(key);
  if (!roleCheck.ok) {
    return { client: null, configError: roleCheck.message };
  }
  return {
    client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }),
    configError: null,
  };
}

export async function handleVercelSendPlatformMessagePost(req, res) {
  applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { client: supabase, configError } = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowInternalTeam: true });
  if (deny) {
    return res.status(deny.status).json(deny.body);
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const recipient_id = String(body?.recipient_id ?? "").trim();
  const subject = body?.subject != null ? String(body.subject) : "";
  const content = String(body?.content ?? "").trim();
  const sendEmail = body?.send_email != null ? Boolean(body.send_email) : true;
  const sendInApp = body?.send_in_app != null ? Boolean(body.send_in_app) : false;

  if (!recipient_id) {
    return res.status(400).json({ error: "recipient_id is required" });
  }
  if (!sendEmail && !sendInApp) {
    return res.status(400).json({ error: "Select at least one delivery channel" });
  }

  try {
    const { message } = await insertAdminPlatformMessage(supabase, {
      recipientId: recipient_id,
      senderId: authData.user.id,
      subject,
      content,
      sendEmail,
      sendInApp,
      messageType: "direct",
      status: sendInApp ? "delivered" : "pending",
    });

    let email_delivery = { status: "skipped", reason: "send_email_disabled" };
    if (sendEmail) {
      email_delivery = await sendAdminPlatformMessageToSignupEmail(supabase, {
        recipientId: recipient_id,
        subject: message?.subject ?? subject,
        plainBody: content,
        messageId: message?.id,
      });
    }
    return res.status(200).json({ ok: true, message, email_delivery });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = isAdminPlatformMessageClientError(msg)
      ? 400
      : isAdminPlatformMessagesSchemaMissingError(msg)
        ? 503
        : 500;
    console.error("[POST /api/admin/send-platform-message]", msg);
    return res.status(status).json({ error: msg });
  }
}
