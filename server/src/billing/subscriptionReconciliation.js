/**
 * Safety net for subscription billing. PayFast ITNs update payment state immediately.
 * This job does not charge anyone, does not invent PayFast retries, and does not
 * delete invoices, customers, POS data, employees, or reports.
 *
 * It does:
 *   - suspend a past_due agreement whose grace_ends_at has passed
 *   - finish a customer cancel once the paid period has ended
 *   - expire stale pending checkouts
 *   - send the payment-failed email if the ITN send did not stick, and the day-3 reminder
 *   - report upcoming billing, billing silence, and stale pending counts
 */

import { addCalendarDaysIso } from "../../../shared/subscriptionAccess.js";
import {
  BILLING_NOTIFY,
  BILLING_SILENCE_DAYS,
  GRACE_WARNING_AFTER_DAYS,
  paymentFailedAt,
  shouldFinishCancelAtPeriodEnd,
  shouldSuspendExpiredGrace,
} from "../../../shared/subscriptionBillingPolicy.js";
import { SUBSCRIPTION_STATUS } from "../../../shared/subscriptionStatuses.js";
import { sendSubscriptionBillingEmail } from "./subscriptionBillingMail.js";

const RECONCILE_SELECT =
  "id, user_id, company_id, email, user_email, full_name, user_name, status, grace_ends_at, past_due_at, last_payment_failure_at, current_period_end, expires_at, next_billing_date, payfast_token, subscription_source, pending_expires_at, updated_at";

function missingColumn(error) {
  return /column|schema cache|does not exist|cancel_at_period_end/i.test(String(error?.message || ""));
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ now?: Date, limit?: number, send?: Function }} [opts]
 */
export async function runSubscriptionReconciliation(supabase, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowIso = now.toISOString();
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || 200));

  const suspended = await suspendExpiredGrace(supabase, now, nowIso, limit);
  const cancelled = await finishScheduledCancels(supabase, now, nowIso, limit);
  const pending = await expireStalePending(supabase, nowIso, limit);
  const mail = await sendDueBillingEmails(supabase, now, limit, opts.send);
  const identified = await identifyBillingGaps(supabase, now, limit);

  return {
    ran: true,
    suspended,
    cancelledAtPeriodEnd: cancelled,
    stalePendingExpired: pending.expired,
    mail,
    identified,
    note: "PayFast ITN is the payment source of truth. This job does not retry charges.",
  };
}

async function suspendExpiredGrace(supabase, now, nowIso, limit) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, status, grace_ends_at, company_id")
    .eq("status", SUBSCRIPTION_STATUS.PAST_DUE)
    .not("grace_ends_at", "is", null)
    .lte("grace_ends_at", nowIso)
    .limit(limit);
  if (error) throw error;

  let count = 0;
  for (const row of data || []) {
    if (!shouldSuspendExpiredGrace(row, now)) continue;
    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({
        status: SUBSCRIPTION_STATUS.SUSPENDED,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("status", SUBSCRIPTION_STATUS.PAST_DUE);
    if (upErr) continue;
    count += 1;
    try {
      await supabase.from("subscription_events").insert({
        subscription_id: row.id,
        company_id: row.company_id || null,
        event_type: "payment_failed",
        source: "cron",
        details: { reason: "grace_period_ended", status: "suspended" },
      });
    } catch {
      /* event log is audit-only */
    }
  }
  return count;
}

async function finishScheduledCancels(supabase, now, nowIso, limit) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, status, cancel_at_period_end, current_period_end, expires_at, company_id")
    .eq("cancel_at_period_end", true)
    .in("status", [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE])
    .limit(limit);
  if (error) {
    if (missingColumn(error)) return 0;
    throw error;
  }

  let count = 0;
  for (const row of data || []) {
    if (!shouldFinishCancelAtPeriodEnd(row, now)) continue;
    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({
        status: SUBSCRIPTION_STATUS.CANCELLED,
        cancelled_at: nowIso,
        canceled_at: nowIso,
        cancel_at_period_end: false,
        updated_at: nowIso,
      })
      .eq("id", row.id);
    if (upErr) continue;
    count += 1;
    try {
      await supabase.from("subscription_events").insert({
        subscription_id: row.id,
        company_id: row.company_id || null,
        event_type: "cancelled",
        source: "cron",
        details: { reason: "cancel_at_period_end" },
      });
    } catch {
      /* audit-only */
    }
  }
  return count;
}

async function expireStalePending(supabase, nowIso, limit) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, company_id")
    .eq("status", SUBSCRIPTION_STATUS.PENDING)
    .lt("pending_expires_at", nowIso)
    .limit(limit);
  if (error) {
    if (missingColumn(error)) return { scanned: 0, expired: 0 };
    throw error;
  }
  let expired = 0;
  for (const row of data || []) {
    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({
        status: SUBSCRIPTION_STATUS.CANCELLED,
        cancelled_at: nowIso,
        canceled_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("status", SUBSCRIPTION_STATUS.PENDING);
    if (!upErr) expired += 1;
  }
  return { scanned: (data || []).length, expired };
}

async function sendDueBillingEmails(supabase, now, limit, send) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(RECONCILE_SELECT)
    .eq("status", SUBSCRIPTION_STATUS.PAST_DUE)
    .not("grace_ends_at", "is", null)
    .gt("grace_ends_at", now.toISOString())
    .limit(limit);
  if (error) {
    if (missingColumn(error)) return { skipped: true, reason: error.message };
    throw error;
  }

  let failedNotices = 0;
  let reminders = 0;
  for (const row of data || []) {
    if (!row.grace_ends_at) continue;
    const first = await sendSubscriptionBillingEmail(supabase, row, BILLING_NOTIFY.PAYMENT_FAILED, { send });
    if (first.sent) failedNotices += 1;

    const failedAt = paymentFailedAt(row);
    const warningAt = failedAt ? addCalendarDaysIso(failedAt, GRACE_WARNING_AFTER_DAYS) : null;
    const warningDue = warningAt && new Date(warningAt).getTime() <= now.getTime();
    if (!warningDue) continue;
    const second = await sendSubscriptionBillingEmail(
      supabase,
      row,
      BILLING_NOTIFY.PAYMENT_FAILED_REMINDER,
      { send }
    );
    if (second.sent) reminders += 1;
  }
  return { failedNotices, reminders, scanned: (data || []).length };
}

async function identifyBillingGaps(supabase, now, limit) {
  const soon = addCalendarDaysIso(now, 7);
  const silenceBefore = addCalendarDaysIso(now, -BILLING_SILENCE_DAYS);
  const [upcomingRes, silenceRes, pastDueRes, suspendedRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", SUBSCRIPTION_STATUS.ACTIVE)
      .gte("next_billing_date", now.toISOString())
      .lte("next_billing_date", soon)
      .limit(limit),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", SUBSCRIPTION_STATUS.ACTIVE)
      .eq("subscription_source", "payfast")
      .lt("next_billing_date", silenceBefore)
      .limit(limit),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", SUBSCRIPTION_STATUS.PAST_DUE),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", SUBSCRIPTION_STATUS.SUSPENDED),
  ]);

  return {
    pastDue: pastDueRes.count ?? 0,
    suspended: suspendedRes.count ?? 0,
    upcomingBilling: upcomingRes.count ?? 0,
    billingSilence: silenceRes.count ?? 0,
    billingSilenceNote:
      "Active PayFast agreements whose next billing date passed without an ITN. Reported only — access is unchanged until PayFast confirms a failure.",
  };
}
