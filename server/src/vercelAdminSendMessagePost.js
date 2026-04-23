import { createClient } from "@supabase/supabase-js";
import { assertCallerForAdminRoute } from "./adminRouteAccess.js";
import { insertAdminPlatformMessage } from "./adminPlatformUserMessages.js";
import { sendAdminPlatformMessageToSignupEmail } from "./adminPlatformUserOutreachEmail.js";
import { isValidUuid } from "./inputValidation.js";
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

function parsePayload(body) {
  const subject = body?.subject != null ? String(body.subject) : "";
  const content = String(body?.content ?? "").trim();
  const sendEmail = body?.send_email != null ? Boolean(body.send_email) : true;
  const sendInApp = body?.send_in_app != null ? Boolean(body.send_in_app) : true;
  if (!sendEmail && !sendInApp) {
    throw new Error("Select at least one delivery channel");
  }
  if (!content) {
    throw new Error("content is required");
  }

  const recipientIds = Array.isArray(body?.recipient_ids)
    ? body.recipient_ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const recipientId = String(body?.recipient_id || "").trim();
  if (recipientId) recipientIds.push(recipientId);

  const dedupedRecipientIds = Array.from(new Set(recipientIds)).filter((id) => isValidUuid(id));
  return {
    subject,
    content,
    sendEmail,
    sendInApp,
    recipientIds: dedupedRecipientIds,
    hadExplicitRecipients: recipientIds.length > 0,
  };
}

async function resolveRecipients(supabase, senderId, explicitRecipientIds, hadExplicitRecipients) {
  if (hadExplicitRecipients && explicitRecipientIds.length === 0) {
    throw new Error("Invalid recipient_id(s)");
  }
  if (explicitRecipientIds.length > 0) return explicitRecipientIds.filter((id) => id !== senderId);
  const { data, error } = await supabase.from("profiles").select("id").limit(3000);
  if (error) throw new Error(error.message || "Failed to fetch recipients");
  return Array.from(
    new Set(
      (data || [])
        .map((row) => String(row?.id || "").trim())
        .filter((id) => isValidUuid(id) && id !== senderId)
    )
  );
}

async function insertDelivery(supabase, row) {
  const { error } = await supabase.from("message_deliveries").insert(row);
  if (error) throw new Error(error.message || "Failed to create message delivery");
}

async function updateMessageStatus(supabase, messageId, status) {
  const { error } = await supabase.from("admin_platform_messages").update({ status }).eq("id", messageId);
  if (error) throw new Error(error.message || "Failed to update message status");
}

export async function handleVercelAdminSendMessagePost(req, res) {
  applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { client: supabase, configError } = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

  const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowInternalTeam: true });
  if (deny) return res.status(deny.status).json(deny.body);

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  try {
    const senderId = String(authData.user.id);
    const payload = parsePayload(body || {});
    const recipients = await resolveRecipients(
      supabase,
      senderId,
      payload.recipientIds,
      payload.hadExplicitRecipients
    );
    if (recipients.length === 0) {
      return res.status(200).json({ ok: true, recipients: 0, sent: 0, failedEmail: 0, skippedEmail: 0 });
    }

    let sent = 0;
    let failedEmail = 0;
    let skippedEmail = 0;
    const nowIso = new Date().toISOString();

    for (const recipientId of recipients) {
      const { message } = await insertAdminPlatformMessage(supabase, {
        recipientId,
        senderId,
        subject: payload.subject,
        content: payload.content,
        sendEmail: payload.sendEmail,
        sendInApp: payload.sendInApp,
        status: "pending",
      });
      const messageId = String(message?.id || "");
      if (!messageId) continue;

      if (payload.sendInApp) {
        await insertDelivery(supabase, {
          message_id: messageId,
          user_id: recipientId,
          channel: "in_app",
          status: "sent",
          sent_at: nowIso,
        });
      }

      if (payload.sendEmail) {
        await insertDelivery(supabase, {
          message_id: messageId,
          user_id: recipientId,
          channel: "email",
          status: "pending",
        });
        const emailDelivery = await sendAdminPlatformMessageToSignupEmail(supabase, {
          recipientId,
          subject: message.subject,
          plainBody: payload.content,
          messageId,
        });
        const emailStatus = emailDelivery?.status === "sent" ? "sent" : "failed";
        const sentAt = emailDelivery?.status === "sent" ? new Date().toISOString() : null;
        if (emailDelivery?.status === "failed") {
          failedEmail += 1;
          console.error("[admin/send-message] email failed", { recipientId, reason: emailDelivery?.reason || "send_failed" });
        } else if (emailDelivery?.status !== "sent") {
          skippedEmail += 1;
        }
        const { error: deliveryUpdateError } = await supabase
          .from("message_deliveries")
          .update({ status: emailStatus, sent_at: sentAt })
          .eq("message_id", messageId)
          .eq("user_id", recipientId)
          .eq("channel", "email");
        if (deliveryUpdateError) throw new Error(deliveryUpdateError.message || "Failed to update email delivery");
      }

      await updateMessageStatus(supabase, messageId, "sent");
      sent += 1;
    }

    return res.status(200).json({
      ok: true,
      recipients: recipients.length,
      sent,
      failedEmail,
      skippedEmail,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /content is required|Select at least one delivery channel|Invalid JSON|Invalid recipient_id/i.test(msg) ? 400 : 500;
    return res.status(status).json({ error: msg });
  }
}
