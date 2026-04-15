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

function toIsoDate(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d;
}

function subscriptionInvoiceProjectTitle(sub) {
  const plan = String(sub.plan || sub.current_plan || "Subscription").trim();
  return `Subscription renewal (${plan})`;
}

function subscriptionInvoiceDescription(sub) {
  const plan = String(sub.plan || sub.current_plan || "subscription").trim();
  const cycle = String(sub.billing_cycle || "monthly").trim();
  const nextBilling = sub.next_billing_date
    ? new Date(sub.next_billing_date).toISOString().slice(0, 10)
    : "N/A";
  return `Auto-generated ${cycle} ${plan} subscription invoice. Next billing date: ${nextBilling}.`;
}

function buildSubscriptionInvoiceNumber(sub, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = String(sub.id || "").replace(/-/g, "").slice(-6).toUpperCase() || "SUB";
  return `SUB-${y}${m}${d}-${suffix}`;
}

async function fetchPrimaryOrgByUserId(supabase, userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean).map((x) => String(x))));
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, org_id, created_at")
    .in("user_id", ids)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const out = new Map();
  for (const row of data || []) {
    const uid = String(row.user_id || "");
    if (!uid || out.has(uid) || !row.org_id) continue;
    out.set(uid, row.org_id);
  }
  return out;
}

async function runSubscriptionInvoicePrebillingBatch() {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const todayIso = toIsoDate(now);
  const leadDays = Math.max(
    1,
    Number.parseInt(String(process.env.SUBSCRIPTION_INVOICE_LEAD_DAYS || "5"), 10) || 5
  );
  const scanDays = Math.max(leadDays + 2, 10);
  const upperBound = addDays(now, scanDays)?.toISOString();
  if (!todayIso || !upperBound) {
    throw new Error("Failed to resolve cron date window");
  }

  const { data: candidates, error: candidatesErr } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, user_name, user_email, email, plan, current_plan, status, amount, billing_cycle, next_billing_date"
    )
    .in("status", ["active"])
    .not("next_billing_date", "is", null)
    .lte("next_billing_date", upperBound)
    .order("next_billing_date", { ascending: true })
    .limit(Math.max(50, Number(process.env.SUBSCRIPTION_PREBILL_BATCH_SIZE || 500)));
  if (candidatesErr) throw candidatesErr;

  const dueSubs = (candidates || []).filter((sub) => {
    const nextBilling = sub?.next_billing_date ? new Date(sub.next_billing_date) : null;
    if (!nextBilling || !Number.isFinite(nextBilling.getTime())) return false;
    const triggerDate = addDays(nextBilling, -leadDays);
    return toIsoDate(triggerDate) === todayIso;
  });

  const userIds = dueSubs.map((s) => s.user_id).filter(Boolean);
  const orgByUserId = await fetchPrimaryOrgByUserId(supabase, userIds);

  let created = 0;
  let skippedNoOrg = 0;
  let skippedMissingAmount = 0;
  let skippedAlreadyExists = 0;

  for (const sub of dueSubs) {
    const userId = sub.user_id ? String(sub.user_id) : "";
    const orgId = userId ? orgByUserId.get(userId) : null;
    if (!orgId) {
      skippedNoOrg += 1;
      continue;
    }

    const amount = Number(sub.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      skippedMissingAmount += 1;
      continue;
    }

    const projectTitle = subscriptionInvoiceProjectTitle(sub);
    const invoiceDate = todayIso;
    const { data: existing, error: existingErr } = await supabase
      .from("invoices")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId || null)
      .eq("invoice_date", invoiceDate)
      .eq("project_title", projectTitle)
      .limit(1);
    if (existingErr) throw existingErr;
    if ((existing || []).length > 0) {
      skippedAlreadyExists += 1;
      continue;
    }

    const invoiceNumber = buildSubscriptionInvoiceNumber(sub, now);
    const invoiceRow = {
      org_id: orgId,
      user_id: userId || null,
      created_by: userId || null,
      client_id: null,
      invoice_number: invoiceNumber,
      status: "draft",
      project_title: projectTitle,
      project_description: subscriptionInvoiceDescription(sub),
      invoice_date: invoiceDate,
      subtotal: amount,
      tax_rate: 0,
      tax_amount: 0,
      total_amount: amount,
      currency: "ZAR",
      notes: `Auto-generated ${leadDays} days before subscription billing date.`,
      owner_email: String(sub.user_email || sub.email || "").trim() || null,
    };

    const { data: createdInvoice, error: createErr } = await supabase
      .from("invoices")
      .insert(invoiceRow)
      .select("id")
      .single();
    if (createErr) throw createErr;

    if (createdInvoice?.id) {
      const { error: itemErr } = await supabase.from("invoice_items").insert({
        invoice_id: createdInvoice.id,
        service_name: projectTitle,
        description: subscriptionInvoiceDescription(sub),
        quantity: 1,
        unit_price: amount,
        total_price: amount,
      });
      if (itemErr) {
        console.warn("[api/cron] created invoice but failed invoice_items insert", itemErr.message);
      }
    }
    created += 1;
  }

  return {
    ran: true,
    leadDays,
    scanned: (candidates || []).length,
    dueToday: dueSubs.length,
    created,
    skippedNoOrg,
    skippedMissingAmount,
    skippedAlreadyExists,
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
    if (job === "subscription-prebill-invoices") {
      const out = await runSubscriptionInvoicePrebillingBatch();
      return res.status(200).json({
        ok: true,
        at: new Date().toISOString(),
        path: "subscription-prebill-invoices",
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
