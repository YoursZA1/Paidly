import { sendAdminPlatformMessageToKnownEmail } from "./adminPlatformUserOutreachEmail.js";

const BROADCAST_EMAIL_BATCH_SIZE = 50;
const BROADCAST_EMAIL_CONCURRENCY = 12;
const BROADCAST_EMAIL_TIMEOUT_MS = 12000;

function getProgress(job) {
  return Number(job.email_sent || 0) + Number(job.email_skipped || 0) + Number(job.email_failed || 0);
}

function parseRecipientRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({
      id: String(r?.id || "").trim(),
      email: String(r?.email || "").trim(),
    }))
    .filter((r) => r.id);
}

async function withTimeout(promise, ms) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Email delivery timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function processRecipientsBatch(recipientRows, subject, content) {
  let emailSent = 0;
  let emailSkipped = 0;
  let emailFailed = 0;
  let index = 0;

  async function worker() {
    while (index < recipientRows.length) {
      const current = recipientRows[index];
      index += 1;
      try {
        const delivery = await withTimeout(
          sendAdminPlatformMessageToKnownEmail({
            email: current.email,
            subject,
            plainBody: content,
          }),
          BROADCAST_EMAIL_TIMEOUT_MS
        );
        if (delivery?.status === "sent") emailSent += 1;
        else if (delivery?.status === "failed") emailFailed += 1;
        else emailSkipped += 1;
      } catch {
        emailFailed += 1;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(BROADCAST_EMAIL_CONCURRENCY, recipientRows.length) },
    () => worker()
  );
  await Promise.all(workers);
  return { emailSent, emailSkipped, emailFailed };
}

export async function processQueuedBroadcastJobs(supabaseAdmin, opts = {}) {
  const jobLimit = Math.max(1, Number(opts.jobLimit || 3));
  const batchSize = Math.max(1, Number(opts.batchSize || BROADCAST_EMAIL_BATCH_SIZE));

  const { data: jobs, error } = await supabaseAdmin
    .from("admin_broadcast_jobs")
    .select("*")
    .in("status", ["queued", "in_progress"])
    .order("created_at", { ascending: true })
    .limit(jobLimit);
  if (error) throw new Error(error.message || "Failed to load queued broadcast jobs");

  let processedJobs = 0;
  let completedJobs = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs || []) {
    const recipients = parseRecipientRows(job.recipient_rows);
    const totalRecipients = Number(job.total_recipients || recipients.length || 0);
    const progress = getProgress(job);
    if (progress >= totalRecipients) {
      const { error: doneErr } = await supabaseAdmin
        .from("admin_broadcast_jobs")
        .update({
          status: "completed",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      if (!doneErr) completedJobs += 1;
      continue;
    }

    const remaining = recipients.slice(progress, progress + batchSize);
    if (!remaining.length) continue;
    processedJobs += 1;

    await supabaseAdmin
      .from("admin_broadcast_jobs")
      .update({
        status: "in_progress",
        started_at: job.started_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    const out = await processRecipientsBatch(remaining, String(job.subject || ""), String(job.content || ""));
    sent += out.emailSent;
    skipped += out.emailSkipped;
    failed += out.emailFailed;

    const nextSent = Number(job.email_sent || 0) + out.emailSent;
    const nextSkipped = Number(job.email_skipped || 0) + out.emailSkipped;
    const nextFailed = Number(job.email_failed || 0) + out.emailFailed;
    const nextProgress = nextSent + nextSkipped + nextFailed;
    const done = nextProgress >= totalRecipients;

    const { error: updateErr } = await supabaseAdmin
      .from("admin_broadcast_jobs")
      .update({
        email_sent: nextSent,
        email_skipped: nextSkipped,
        email_failed: nextFailed,
        status: done ? "completed" : "in_progress",
        finished_at: done ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (updateErr) {
      await supabaseAdmin
        .from("admin_broadcast_jobs")
        .update({
          status: "failed",
          error: updateErr.message || "Failed to persist broadcast job progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      continue;
    }
    if (done) completedJobs += 1;
  }

  return { processedJobs, completedJobs, sent, skipped, failed };
}
