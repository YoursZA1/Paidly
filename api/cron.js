/**
 * Single Vercel cron entry (Hobby plan). Jobs dispatched via `?job=` (see vercel.json rewrites).
 */
import { createClient } from "@supabase/supabase-js";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || typeof secret !== "string" || secret.length < 8) {
    return { ok: false, reason: "misconfigured" };
  }
  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true };
}

async function runPaymentReminderBatch() {
  return {
    ran: false,
    processedUsers: 0,
    message:
      "Batch not implemented yet. Persist reminder_settings to profiles (or JSONB) and query invoices by org_id, then send via Resend. See docs/CRON_PAYMENT_REMINDERS.md",
  };
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function addHoursIso(baseDate, hours) {
  const d = new Date(baseDate);
  if (!Number.isFinite(d.getTime())) return null;
  d.setTime(d.getTime() + Math.max(1, Number(hours || 24)) * 60 * 60 * 1000);
  return d.toISOString();
}

async function insertDunningEvent(supabase, sub, eventType, attemptNo, details = {}) {
  await supabase.from("subscription_dunning_events").insert({
    subscription_id: sub.id,
    user_id: sub.user_id || null,
    event_type: eventType,
    attempt_no: attemptNo,
    details,
  });
}

async function runSubscriptionDunningBatch() {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const maxRows = Math.max(1, Number(process.env.SUBSCRIPTION_DUNNING_BATCH_SIZE || 200));

  const { data: dueRows, error: dueErr } = await supabase
    .from("subscriptions")
    .select("id, user_id, status, failure_count, dunning_stage, max_retry_attempts, retry_interval_hours, next_billing_date")
    .in("status", ["active", "past_due"])
    .lte("next_billing_date", nowIso)
    .order("next_billing_date", { ascending: true })
    .limit(maxRows);
  if (dueErr) throw dueErr;

  const { data: retryRows, error: retryErr } = await supabase
    .from("subscriptions")
    .select("id, user_id, status, failure_count, dunning_stage, max_retry_attempts, retry_interval_hours, next_retry_at")
    .eq("status", "past_due")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(maxRows);
  if (retryErr) throw retryErr;

  let movedToPastDue = 0;
  let retriesScheduled = 0;
  let canceled = 0;

  for (const sub of dueRows || []) {
    const prevFailures = Number(sub.failure_count || 0);
    const nextFailures = prevFailures + 1;
    const maxRetry = Math.max(1, Number(sub.max_retry_attempts || 3));
    const retryHours = Math.max(1, Number(sub.retry_interval_hours || 24));
    const nextStatus = nextFailures >= maxRetry ? "canceled" : "past_due";
    const patch = {
      status: nextStatus,
      failure_count: nextFailures,
      dunning_stage: nextFailures,
      last_payment_failure_at: nowIso,
      updated_at: nowIso,
      next_retry_at: nextStatus === "past_due" ? addHoursIso(nowIso, retryHours) : null,
      past_due_at: nowIso,
      canceled_at: nextStatus === "canceled" ? nowIso : null,
    };
    const { error } = await supabase.from("subscriptions").update(patch).eq("id", sub.id);
    if (!error) {
      if (nextStatus === "canceled") canceled += 1;
      else movedToPastDue += 1;
      await insertDunningEvent(
        supabase,
        sub,
        nextStatus === "canceled" ? "canceled_for_nonpayment" : "payment_failed",
        nextFailures,
        { reason: "billing_due_without_confirmed_itn" }
      );
    }
  }

  for (const sub of retryRows || []) {
    const prevFailures = Number(sub.failure_count || 0);
    const nextFailures = prevFailures + 1;
    const maxRetry = Math.max(1, Number(sub.max_retry_attempts || 3));
    const retryHours = Math.max(1, Number(sub.retry_interval_hours || 24));
    const nextStatus = nextFailures >= maxRetry ? "canceled" : "past_due";
    const patch = {
      status: nextStatus,
      failure_count: nextFailures,
      dunning_stage: nextFailures,
      last_payment_failure_at: nowIso,
      updated_at: nowIso,
      next_retry_at: nextStatus === "past_due" ? addHoursIso(nowIso, retryHours) : null,
      canceled_at: nextStatus === "canceled" ? nowIso : null,
    };
    const { error } = await supabase.from("subscriptions").update(patch).eq("id", sub.id);
    if (!error) {
      if (nextStatus === "canceled") canceled += 1;
      else retriesScheduled += 1;
      await insertDunningEvent(
        supabase,
        sub,
        nextStatus === "canceled" ? "canceled_for_nonpayment" : "retry_scheduled",
        nextFailures,
        { reason: "retry_window_elapsed_without_confirmed_itn" }
      );
    }
  }

  return {
    ran: true,
    scannedDue: (dueRows || []).length,
    scannedRetry: (retryRows || []).length,
    movedToPastDue,
    retriesScheduled,
    canceled,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authz = isAuthorized(req);
  if (authz.reason === "misconfigured") {
    return res.status(503).json({
      error: "CRON_SECRET is not set (min 8 chars). Add it in Vercel env for production.",
    });
  }
  if (authz.reason === "unauthorized") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const job = String(req.query?.job || "").trim();
  if (!job) {
    return res.status(400).json({ error: "Missing job" });
  }

  try {
    if (job === "payment-reminders") {
      const batch = await runPaymentReminderBatch();
      return res.status(200).json({
        ok: true,
        at: new Date().toISOString(),
        path: "payment-reminders",
        ...batch,
      });
    }
    if (job === "subscription-dunning") {
      const out = await runSubscriptionDunningBatch();
      return res.status(200).json({
        ok: true,
        at: new Date().toISOString(),
        path: "subscription-dunning",
        ...out,
      });
    }
    return res.status(404).json({ error: "Unknown cron job" });
  } catch (e) {
    console.error("[api/cron]", job, e);
    return res.status(500).json({
      ok: false,
      error: e?.message || String(e),
    });
  }
}
