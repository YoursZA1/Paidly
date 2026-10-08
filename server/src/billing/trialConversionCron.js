/**
 * Trial conversion mail. Runs inside the existing expire-trials cron.
 * One successful send per subscription, notification type, and trial_ends_at.
 * A failed send is recorded and retried on a later run. Subscribed, free-access,
 * and suspended companies are skipped. Nothing here deletes business data.
 */

import {
  TRIAL_NOTIFY,
  adminTrialNotificationType,
  buildTrialEmail,
  notificationCycleKey,
  planTrialNotifications,
} from "../../../shared/trialLifecycle.js";
import { MIGRATION_ACCESS_COLUMNS } from "../../../shared/trialMigration.js";
import { renderPaidlyEmail, PAIDLY_EMAIL_LOGO_PATH } from "../auth/paidlyAuthEmails.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { resolvePublicAppOrigin } from "../companyInviteAppUrl.js";
import { demoRestrictedError, suppressForDemoOrg } from "../demo/demoMode.js";

const TRIAL_SELECT =
  "id, user_id, company_id, email, status, plan, plan_family, trial_ends_at, trial_started_at, subscription_source, admin_override, grace_ends_at, current_period_end, expires_at, next_billing_date, free_access, free_access_until, payfast_token, updated_at, created_at";
const TRIAL_SELECT_MIGRATION = `${TRIAL_SELECT}, ${MIGRATION_ACCESS_COLUMNS}`;
const TRIAL_SELECT_BASE = TRIAL_SELECT.replace(", free_access, free_access_until", "");
const MIGRATION_MAIL_TYPES = new Set([TRIAL_NOTIFY.EXISTING_EXPIRED, TRIAL_NOTIFY.EXISTING_FOLLOWUP]);

const SIBLING_STATUSES = ["active", "past_due", "cancelled", "suspended"];

function missingRelation(error) {
  const msg = String(error?.message || error?.details || "");
  return /subscription_notifications|free_access|does not exist|schema cache|column/i.test(msg);
}

function groupKey(row) {
  return row?.company_id ? `company:${row.company_id}` : `user:${row.user_id || row.id}`;
}

/** Newest column set first; falls back while the migrations are not applied yet. */
async function selectRows(supabase, build) {
  let res = await build(TRIAL_SELECT_MIGRATION);
  if (res.error && /migration|column/i.test(String(res.error.message || ""))) {
    res = await build(TRIAL_SELECT);
  }
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
  // Existing accounts the migration marked expired: may have no trial date (legacy rows).
  const migratedRes = await supabase
    .from("subscriptions")
    .select(TRIAL_SELECT_MIGRATION)
    .eq("trial_migration_status", "MIGRATED_EXPIRED")
    .eq("migration_excluded", false)
    .limit(limit);
  if (!migratedRes.error) {
    for (const row of migratedRes.data || []) {
      if (!trials.some((t) => t.id === row.id)) trials.push(row);
    }
  }
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
    .select("id, subscription_id, notification_type, status, source, trial_ends_at, sent_at, created_at")
    .in("subscription_id", ids)
    .eq("status", "sent")
    .eq("source", "system")
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

  let demo = 0;
  for (const item of planned) {
    const sub = item.subscription;
    // Demo workspaces never receive real mail. Nothing is recorded, so nothing counts as sent.
    if (await suppressForDemoOrg(sub.company_id, "trial_conversion")) {
      demo += 1;
      continue;
    }
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
    if (MIGRATION_MAIL_TYPES.has(item.type)) {
      await auditMigrationMail(supabase, sub, item.type, to, ok, ok ? null : result?.error || "Send failed");
    }
  }

  return { sent, failed, demo, planned: planned.length, errors: errors.slice(0, 5) };
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
    // Once-only key: trial end for trial emails, grace start for migration emails.
    trial_ends_at: notificationCycleKey(sub, type),
    error: error || null,
    metadata: { to: to || null },
  };
  const { error: insertError } = await supabase.from("subscription_notifications").insert(row);
  if (insertError && !/duplicate|unique/i.test(String(insertError.message || ""))) {
    console.warn("[trial-conversion] notification log", insertError.message);
  }
}

/** user_notification_sent / user_notification_failed in the audit log for migration emails. */
async function auditMigrationMail(supabase, sub, type, to, ok, error) {
  try {
    await supabase.from("audit_logs").insert({
      category: "subscription",
      action: ok ? "trial_migration_user_notification_sent" : "trial_migration_user_notification_failed",
      description: ok ? `Sent ${type} to ${to}` : `Could not send ${type} to ${to || "no address"}: ${error}`,
      before: {},
      after: {},
      actor_id: null,
      actor_email: null,
      actor_name: "Paidly system",
      actor_role: "system",
      target_label: to || sub.id,
      metadata: {
        subscription_id: sub.id,
        user_id: sub.user_id || null,
        company_id: sub.company_id || null,
        notification_type: type,
        migration_grace_started_at: sub.migration_grace_started_at || null,
      },
    });
  } catch (e) {
    console.warn("[trial-migration] audit", e?.message || e);
  }
}

/**
 * Admin "Send trial reminder" / "Send subscription prompt".
 * Recorded with source admin, so it never uses up the automatic email for the trial.
 * The copy follows the company's phase; a subscribed, free-access, or suspended company is refused.
 */
export async function sendAdminTrialNotification(supabase, sub, action, opts = {}) {
  if (await suppressForDemoOrg(sub.company_id, "trial_conversion_admin")) {
    throw demoRestrictedError("Trial emails");
  }
  let rows = [sub];
  if (sub.company_id) {
    const sib = await selectRows(supabase, (columns) =>
      supabase.from("subscriptions").select(columns).eq("company_id", sub.company_id).limit(20)
    );
    if (!sib.error && Array.isArray(sib.data) && sib.data.length) rows = sib.data;
  }
  const decision = adminTrialNotificationType(rows, sub, action, opts.now instanceof Date ? opts.now : new Date());
  if (decision.error) {
    const err = new Error(decision.error);
    err.status = 409;
    throw err;
  }
  const type = decision.type;

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
  let result;
  try {
    result = await (opts.send || defaultSend)(email, mail.subject, rendered.html, rendered.text);
  } catch (err) {
    result = { success: false, error: err?.message || String(err) };
  }
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
    err.notification = { type, to: email, subject: mail.subject, source: "admin" };
    throw err;
  }
  return { type, to: email, subject: mail.subject, source: "admin" };
}
