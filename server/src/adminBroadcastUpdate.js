import { isValidUuid } from "./inputValidation.js";

export const ADMIN_BROADCAST_SUBJECT_MAX = 300;
export const ADMIN_BROADCAST_CONTENT_MAX = 50_000;

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function buildNotificationMessage(subject, content) {
  const s = String(subject || "").trim();
  const c = String(content || "").trim();
  if (!s) return c;
  return `${s}: ${c}`;
}

export function validateAdminBroadcastPayload(payload) {
  const subject = String(payload?.subject ?? "").trim();
  const content = String(payload?.content ?? "").trim();
  if (!content) {
    throw new Error("content is required");
  }
  if (subject.length > ADMIN_BROADCAST_SUBJECT_MAX) {
    throw new Error(`subject too long (max ${ADMIN_BROADCAST_SUBJECT_MAX} characters)`);
  }
  if (content.length > ADMIN_BROADCAST_CONTENT_MAX) {
    throw new Error(`content too long (max ${ADMIN_BROADCAST_CONTENT_MAX} characters)`);
  }
  return { subject, content };
}

export async function broadcastAdminUpdateToAllUsers(supabaseAdmin, senderId, users, payload) {
  const sender = String(senderId || "").trim();
  if (!isValidUuid(sender)) {
    throw new Error("Invalid sender_id");
  }

  const { subject, content } = validateAdminBroadcastPayload(payload);
  const message = buildNotificationMessage(subject, content);

  const recipientIds = Array.from(
    new Set(
      (users || [])
        .map((u) => String(u?.id || "").trim())
        .filter((id) => isValidUuid(id) && id !== sender)
    )
  );

  if (recipientIds.length === 0) {
    return { recipients: 0, inserted: 0 };
  }

  let inserted = 0;
  const idChunks = chunkArray(recipientIds, 500);
  for (const ids of idChunks) {
    const rows = ids.map((userId) => ({
      user_id: userId,
      message,
      read: false,
    }));
    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) {
      throw new Error(error.message || "Failed to insert notifications");
    }
    inserted += rows.length;
  }

  return { recipients: recipientIds.length, inserted };
}
