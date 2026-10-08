/**
 * Trial conversion mail. Runs inside the existing expire-trials cron.
 * One successful send per subscription, notification type, and trial_ends_at.
 * A failed send is recorded and retried on a later run. Subscribed, free-access,
 * and suspended companies are skipped. Nothing here deletes business data.
 */

import { planTrialNotifications, buildTrialEmail, TRIAL_NOTIFY } from "../../../shared/trialLifecycle.js";
import { renderPaidlyEmail, PAIDLY_EMAIL_LOGO_PATH } from "../auth/paidlyAuthEmails.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { resolvePublicAppOrigin } from "../companyInviteAppUrl.js";

const TRIAL_SELECT =
  "id, user_id, company_id, email, status, plan, plan_family, trial_ends_at, trial_started_at, subscription_source, admin_override, grace_ends_at, current_period_end, expires_at, next_billing_date, free_access, free_access_until, payfast_token, updated_at, created_at";
const TRIAL_SELECT_BASE = TRIAL_SELECT.replace(", free_access, free_access_until", "");

const SIBLING_STATUSES = ["active", "past_due", "cancelled", "suspended"];

function missingRelation(error) {
  const msg = String(error?.message || error?.details || "");
  return /subscription_notifications|free_access|does not exist|schema cache|column/i.test(msg);
}

function groupKey(row) {
  return row?.company_id ? `company:${row.company_id}` : `user:${row.user_id || row.id}`;
}

async function selectRows(supabase, build) {
  let res = await build(TRIAL_SELECT);
  if (res.error && /free_access/i.test(String(res.error.message || ""))) {
    res = await build(TRIAL_SELECT_BASE);
  }
  return res;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ now?: Date, limit?: number, send?: Function }} [opts]
 */
export async function runTrialConversionBatch(supabase, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 100));
  const send = opts.send || defaultSend;

  const trialRes = await selectRows(supabase, (columns) =>
    supabase
      .from("subscriptions")
      .select(columns)
      .in("status", ["trialing", "trial", "expired"])
      .not("trial_ends_at", "is", null)
      .order("trial_ends_at", { ascending: true })
      .limit(limit)
  );
  if (trialRes.error) {
    if (missingRelation(trialRes.error)) {
      return { skipped: true, reason: trialRes.error.message, sent: 0, failed: 0 };
    }
    throw trialRes.error;
  }
  const trials = trialRes.data || [];
  if (trials.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const companyIds = [...new Set(trials.map((row) => row.company_id).filter(Boolean))];
  const userIds = [...new Set(trials.map((row) => row.user_id).filter(Boolean))];
  let siblings = [];
  if (companyIds.length) {
    const sib = await selectRows(supabase, (columns) =>
      supabase.from("subscriptions").select(columns).in("company_id", companyIds).in("status", SIBLING_STATUSES).limit(500)
    );
    if (!sib.error) siblings = sib.data || [];
  }

  const groups = new Map();
  for (const row of [...trials, ...siblings]) {
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    if (!groups.get(key).some((existing) => existing.id === row.id)) groups.get(key).push(row);
  }

  const ids = trials.map((row) => row.id);
  const historyRes = await supabase
    .from("subscription_notifications")
    .select("id, subscription_id, notification_type, status, trial_ends_at")
    .in("subscription_id", ids)
    .eq("status", "sent")
    .limit(1000);
  if (historyRes.error) {
    if (missingRelation(historyRes.error)) {
      return { skipped: true, reason: "subscription_notifications is not available yet", sent: 0, failed: 0 };
    }
    throw historyRes.error;
  }

  const names = await loadNames(supabase, userIds);
  const planned = planTrialNotifications([...groups.values()], historyRes.data || [], now);
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const item of planned) {
    const sub = item.subscription;
    const to = String(sub.email || names.get(sub.user_id)?.email || "").trim();
    const mail = buildTrialEmail(item.type, { name: names.get(sub.user_id)?.full_name || null });
    if (!mail || !to) {
      failed += 1;
      await record(supabase, {
        sub,
        type: item.type,
        status: "failed",
        to,
        subject: mail?.subject || item.type,
        source: "system",
        error: to ? "Unknown notification type" : "No email address",
      });
      continue;
    }
    const rendered = renderTrialEmail(mail);
    let result;
    try {
      result = await send(to, mail.subject, rendered.html, rendered.text);
    } catch (err) {
      result = { success: false, error: err?.message || String(err) };
    }
    const ok = Boolean(result?.success);
    await record(supabase, {
      sub,
      type: item.type,
      status: ok ? "sent" : "failed",
      to,
      subject: mail.subject,
      source: "system",
      error: ok ? null : result?.error || "Send failed",
    });
    if (ok) sent += 1;
    else {
      failed += 1;
      if (result?.error) errors.push(result.error);
    }
  }

  return { sent, failed, planned: planned.length, errors: errors.slice(0, 5) };
}

async function loadNames(supabase, userIds) {
  const map = new Map();
  if (!userIds.length) return map;
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
  for (const row of data || []) map.set(row.id, row);
  return map;
}

function renderTrialEmail(mail) {
  const origin = String(resolvePublicAppOrigin() || "https://www.paidly.co.za").replace(/\/$/, "");
  const href = `${origin}/Settings?tab=subscription`;
  const html = renderPaidlyEmail({
    title: mail.subject,
    preheader: mail.heading,
    heading: mail.heading,
    paragraphs: mail.paragraphs,
    cta: { label: mail.ctaLabel, href },
    note: mail.note,
    fallbackLink: true,
    logoUrl: `${origin}${PAIDLY_EMAIL_LOGO_PATH}`,
    appOrigin: origin,
  });
  const text = [...mail.paragraphs, "", `${mail.ctaLabel}: ${href}`, "", mail.note].join("\n");
  return { html, text };
}

async function defaultSend(to, subject, html, text) {
  return sendHtmlEmail(to, subject, html, "Paidly", { text });
}

async function record(supabase, { sub, type, status, to, subject, source, error }) {
  const row = {
    user_id: sub.user_id || null,
    company_id: sub.company_id || null,
    subscription_id: sub.id,
    notification_type: type,
    channel: "email",
    subject: subject || type,
    status,
    source: source === "admin" ? "admin" : "system",
    sent_at: status === "sent" ? new Date().toISOString() : null,
    trial_ends_at: sub.trial_ends_at || null,
    error: error || null,
    metadata: { to: to || null },
  };
  const { error: insertError } = await supabase.from("subscription_notifications").insert(row);
  if (insertError && !/duplicate|unique/i.test(String(insertError.message || ""))) {
    console.warn("[trial-conversion] notification log", insertError.message);
  }
}

/**
 * Admin "Send trial reminder" / "Send subscription prompt".
 * Recorded with source admin. A type already sent for this trial end is not sent again.
 */
export async function sendAdminTrialNotification(supabase, sub, action, opts = {}) {
  const type =
    action === "send_subscription_prompt" ? TRIAL_NOTIFY.EXPIRED : TRIAL_NOTIFY.ENDING;
  const { data: prior, error: priorError } = await supabase
    .from("subscription_notifications")
    .select("id, status, notification_type, trial_ends_at")
    .eq("subscription_id", sub.id)
    .eq("notification_type", type)
    .eq("status", "sent")
    .limit(20);
  if (priorError && missingRelation(priorError)) {
    const err = new Error("Trial notification history needs the trial conversion migration applied.");
    err.status = 503;
    throw err;
  }
  const end = new Date(sub.trial_ends_at || "").getTime();
  const already = Number.isFinite(end)
    ? (prior || []).some((row) => new Date(row.trial_ends_at || "").getTime() === end)
    : (prior || []).length > 0;
  if (already) {
    const err = new Error("Already sent for this trial.");
    err.status = 409;
    throw err;
  }
  let name = null;
  let email = String(sub.email || sub.user_email || "").trim();
  if (sub.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", sub.user_id)
      .maybeSingle();
    name = profile?.full_name || null;
    if (!email) email = String(profile?.email || "").trim();
  }
  if (!email) {
    const err = new Error("This account has no email address.");
    err.status = 400;
    throw err;
  }
  const mail = buildTrialEmail(type, { name });
  const rendered = renderTrialEmail(mail);
  const result = await (opts.send || defaultSend)(email, mail.subject, rendered.html, rendered.text);
  const ok = Boolean(result?.success);
  await record(supabase, {
    sub,
    type,
    status: ok ? "sent" : "failed",
    to: email,
    subject: mail.subject,
    source: "admin",
    error: ok ? null : result?.error || "Send failed",
  });
  if (!ok) {
    const err = new Error(result?.error || "Could not send the email.");
    err.status = 502;
    throw err;
  }
  return { type, to: email, subject: mail.subject, source: "admin" };
}
