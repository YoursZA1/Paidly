/**
 * Admin API: list / send messages to platform users (profiles.id).
 * Used by GET/POST /api/admin/platform-user-messages and POST /api/admin/send-platform-message.
 */

import { isValidUuid } from "./inputValidation.js";

const MAX_LIST = 500;
const MAX_THREAD = 150;

/** Keep aligned with email + DB ergonomics (defense in depth vs oversized payloads). */
export const ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT = 300;
export const ADMIN_PLATFORM_MESSAGE_MAX_CONTENT = 50_000;

/** Maps to HTTP 400 when thrown from list/send helpers (Express + Vercel). */
export function isAdminPlatformMessageClientError(message) {
  return /Invalid (recipient|sender)_id|Recipient not found|Sender profile not found|recipient_id and sender_id are required|content is required|subject too long|content too long/i.test(
    String(message || "")
  );
}

/** Migration not applied: thrown message from insert when relation is missing. */
export function isAdminPlatformMessagesSchemaMissingError(message) {
  return /Admin messages table is not installed/i.test(String(message || ""));
}

/**
 * @param {{ message?: string, code?: string, details?: string }} [error]
 */
export function isMissingAdminPlatformMessagesRelation(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || error.details || "");
  if (code === "42P01") return true;
  return /admin_platform_messages/i.test(msg) && /does not exist|undefined table|relation/i.test(msg);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ recipientId?: string, listLimit?: number, threadLimit?: number }} opts
 */
export async function getAdminPlatformUserMessages(supabaseAdmin, opts = {}) {
  const recipientId = String(opts.recipientId || "").trim();
  const threadLimit = Math.min(MAX_THREAD, Math.max(1, Number(opts.threadLimit) || 100));
  const listLimit = Math.min(MAX_LIST, Math.max(1, Number(opts.listLimit) || 500));

  if (recipientId && !isValidUuid(recipientId)) {
    throw new Error("Invalid recipient_id");
  }

  if (recipientId) {
    const { data, error } = await supabaseAdmin
      .from("admin_platform_messages")
      .select("id, recipient_id, sender_id, subject, content, is_read, created_at")
      .eq("recipient_id", recipientId)
      .order("created_at", { ascending: false })
      .limit(threadLimit);

    if (error) {
      if (isMissingAdminPlatformMessagesRelation(error)) {
        console.warn(
          "[admin_platform_messages] table missing — apply supabase migration 20260411180000_admin_platform_messages.sql; returning empty thread."
        );
        return { messages: [] };
      }
      throw new Error(error.message);
    }
    return { messages: data || [] };
  }

  const { data, error } = await supabaseAdmin
    .from("admin_platform_messages")
    .select("id, recipient_id, sender_id, subject, content, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(listLimit);

  if (error) {
    if (isMissingAdminPlatformMessagesRelation(error)) {
      console.warn(
        "[admin_platform_messages] table missing — apply supabase migration 20260411180000_admin_platform_messages.sql; returning empty conversations."
      );
      return { conversations: [] };
    }
    throw new Error(error.message);
  }

  const rows = data || [];
  const seen = new Set();
  const conversations = [];
  for (const m of rows) {
    const rid = m.recipient_id;
    if (!rid || seen.has(rid)) continue;
    seen.add(rid);
    conversations.push({
      recipient_id: rid,
      last_at: m.created_at,
      preview: String(m.content || "").slice(0, 140),
      subject: m.subject || "",
    });
  }

  return { conversations };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {{ recipientId: string, senderId: string, subject?: string, content: string }} payload
 */
export async function insertAdminPlatformMessage(supabaseAdmin, payload) {
  const recipientId = String(payload.recipientId || "").trim();
  const senderId = String(payload.senderId || "").trim();
  const content = String(payload.content || "").trim();
  const subject = String(payload.subject || "").trim();

  if (!recipientId || !senderId) {
    throw new Error("recipient_id and sender_id are required");
  }
  if (!content) {
    throw new Error("content is required");
  }
  if (!isValidUuid(recipientId)) {
    throw new Error("Invalid recipient_id");
  }
  if (!isValidUuid(senderId)) {
    throw new Error("Invalid sender_id");
  }
  if (subject.length > ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT) {
    throw new Error(`subject too long (max ${ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT} characters)`);
  }
  if (content.length > ADMIN_PLATFORM_MESSAGE_MAX_CONTENT) {
    throw new Error(`content too long (max ${ADMIN_PLATFORM_MESSAGE_MAX_CONTENT} characters)`);
  }

  const { data: recipientRow, error: recipientErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", recipientId)
    .maybeSingle();

  if (recipientErr) {
    throw new Error(recipientErr.message);
  }
  if (!recipientRow?.id) {
    throw new Error("Recipient not found");
  }

  const { data: senderRow, error: senderErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", senderId)
    .maybeSingle();

  if (senderErr) {
    throw new Error(senderErr.message);
  }
  if (!senderRow?.id) {
    throw new Error("Sender profile not found");
  }

  const row = {
    recipient_id: recipientId,
    sender_id: senderId,
    subject: subject || "Message from the Paidly team",
    content,
    is_read: false,
  };

  const { data, error } = await supabaseAdmin.from("admin_platform_messages").insert(row).select("*").single();

  if (error) {
    if (isMissingAdminPlatformMessagesRelation(error)) {
      throw new Error(
        "Admin messages table is not installed — run Supabase migration 20260411180000_admin_platform_messages.sql (e.g. supabase db push)."
      );
    }
    throw new Error(error.message);
  }
  return { message: data };
}
