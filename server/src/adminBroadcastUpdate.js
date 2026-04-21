import { isValidUuid } from "./inputValidation.js";
import { processQueuedBroadcastJobs } from "./adminBroadcastQueue.js";

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

function normalizeMessageSubject(subject) {
  const s = String(subject || "").trim();
  return s || "Message from the Paidly team";
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

function parseRecipientRows(users, sender) {
  return Array.from(
    new Map(
      (users || [])
        .map((u) => ({
          id: String(u?.id || "").trim(),
          email: String(u?.email || "").trim(),
        }))
        .filter((u) => isValidUuid(u.id) && u.id !== sender)
        .map((u) => [u.id, u])
    ).values()
  );
}

async function getBroadcastJobByIdempotencyKey(supabaseAdmin, key) {
  const { data, error } = await supabaseAdmin
    .from("admin_broadcast_jobs")
    .select("*")
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to load broadcast job");
  return data || null;
}

function jobToBroadcastResult(job) {
  const total = Number(job?.total_recipients || 0);
  const sent = Number(job?.email_sent || 0);
  const skipped = Number(job?.email_skipped || 0);
  const failed = Number(job?.email_failed || 0);
  const progress = sent + skipped + failed;
  return {
    jobId: job?.id || null,
    status: String(job?.status || "queued"),
    recipients: total,
    inserted: Number(job?.notifications_inserted || 0),
    insertedMessages: Number(job?.messages_inserted || 0),
    emailSent: sent,
    emailSkipped: skipped,
    emailFailed: failed,
    emailQueued: Math.max(0, total - progress),
  };
}

async function createBroadcastJob(supabaseAdmin, idempotencyKey, sender, subject, content, recipientRows) {
  const { data, error } = await supabaseAdmin
    .from("admin_broadcast_jobs")
    .insert({
      idempotency_key: idempotencyKey,
      sender_id: sender,
      subject,
      content,
      recipient_rows: recipientRows,
      total_recipients: recipientRows.length,
      status: "queued",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message || "Failed to create broadcast job");
  return data;
}

async function updateBroadcastJobCounts(supabaseAdmin, jobId, notificationsInserted, messagesInserted) {
  const { data, error } = await supabaseAdmin
    .from("admin_broadcast_jobs")
    .update({
      notifications_inserted: Number(notificationsInserted || 0),
      messages_inserted: Number(messagesInserted || 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) throw new Error(error.message || "Failed to update broadcast job counts");
  return data;
}

export async function broadcastAdminUpdateToAllUsers(supabaseAdmin, senderId, users, payload, options = {}) {
  const sender = String(senderId || "").trim();
  if (!isValidUuid(sender)) {
    throw new Error("Invalid sender_id");
  }
  const idempotencyKey = String(options.idempotencyKey || "").trim();
  if (!idempotencyKey) {
    throw new Error("idempotency key is required");
  }

  const { subject, content } = validateAdminBroadcastPayload(payload);
  const normalizedSubject = normalizeMessageSubject(subject);
  const message = buildNotificationMessage(subject, content);
  const existingJob = await getBroadcastJobByIdempotencyKey(supabaseAdmin, idempotencyKey);
  if (existingJob) {
    return jobToBroadcastResult(existingJob);
  }

  const recipientRows = parseRecipientRows(users, sender);
  const recipientIds = recipientRows.map((u) => u.id);

  if (recipientIds.length === 0) {
    return {
      recipients: 0,
      inserted: 0,
      insertedMessages: 0,
      emailSent: 0,
      emailSkipped: 0,
      emailFailed: 0,
      emailQueued: 0,
    };
  }

  const createdJob = await createBroadcastJob(
    supabaseAdmin,
    idempotencyKey,
    sender,
    normalizedSubject,
    content,
    recipientRows
  );

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

  // Keep broadcast aligned with one-to-one messaging style:
  // create admin_platform_messages rows so recipients see the same subject/body thread structure.
  let insertedMessages = 0;
  for (const ids of idChunks) {
    const rows = ids.map((userId) => ({
      recipient_id: userId,
      sender_id: sender,
      subject: normalizedSubject,
      content,
      is_read: false,
    }));
    const { error } = await supabaseAdmin.from("admin_platform_messages").insert(rows);
    if (error) {
      if (String(error.code || "") === "42P01") {
        throw new Error(
          "Admin messages table is not installed — run Supabase migration 20260411180000_admin_platform_messages.sql (e.g. supabase db push)."
        );
      }
      throw new Error(error.message || "Failed to insert broadcast platform messages");
    }
    insertedMessages += rows.length;
  }

  await updateBroadcastJobCounts(supabaseAdmin, createdJob.id, inserted, insertedMessages);

  // Best-effort kick worker once; cron job remains the authoritative async processor.
  try {
    await processQueuedBroadcastJobs(supabaseAdmin, { jobLimit: 1, batchSize: 50 });
  } catch {
    // no-op
  }

  const freshJob = await getBroadcastJobByIdempotencyKey(supabaseAdmin, idempotencyKey);
  return jobToBroadcastResult(freshJob || createdJob);
}
