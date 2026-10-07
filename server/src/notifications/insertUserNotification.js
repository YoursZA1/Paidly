import { supabaseAdmin } from "../supabaseAdmin.js";
import { safeNotificationPath } from "../../../shared/notifications/notificationTarget.js";

function rowPayload(row) {
  const payload = {
    user_id: row.user_id,
    message: row.message,
    read: row.read === true,
  };
  const link = safeNotificationPath(row.link);
  if (link) payload.link = link;
  return payload;
}

function missingLinkColumn(error) {
  return /link/i.test(error?.message || "");
}

export async function insertUserNotification(client, row) {
  const db = client || supabaseAdmin;
  const payload = rowPayload(row);
  let result = await db.from("notifications").insert(payload);
  if (result.error && payload.link && missingLinkColumn(result.error)) {
    delete payload.link;
    result = await db.from("notifications").insert(payload);
  }
  return result.error || null;
}

export async function insertUserNotifications(client, rows) {
  const db = client || supabaseAdmin;
  const prepared = (rows || []).map(rowPayload);
  if (!prepared.length) return null;
  let result = await db.from("notifications").insert(prepared);
  if (result.error && prepared.some((row) => row.link) && missingLinkColumn(result.error)) {
    result = await db.from("notifications").insert(prepared.map(({ link, ...rest }) => rest));
  }
  return result.error || null;
}
