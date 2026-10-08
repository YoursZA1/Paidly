/**
 * Subscription payment emails. One successful send per subscription, type, and grace end.
 * A failed send is recorded and can be retried. Nothing here deletes business data.
 * PayFast is not asked to retry from this module.
 */

import { BILLING_NOTIFY } from "../../../shared/subscriptionBillingPolicy.js";
import { renderPaidlyEmail, PAIDLY_EMAIL_LOGO_PATH } from "../auth/paidlyAuthEmails.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { resolvePublicAppOrigin } from "../companyInviteAppUrl.js";
import { suppressForDemoOrg } from "../demo/demoMode.js";

export function buildPaymentFailedEmail(name) {
  const who = String(name || "").trim() || "there";
  return {
    subject: "Your Paidly payment couldn't be processed",
    heading: "Your Paidly payment couldn't be processed",
    paragraphs: [
      `Hi ${who},`,
      "We couldn't process your latest Paidly subscription payment.",
      "Your Paidly account is still active for now, but we need you to update your payment details or resolve the payment before your grace period ends.",
      "If you've already resolved the issue, you can ignore this message.",
    ],
    ctaLabel: "Resolve Payment",
    note: "The Paidly Team",
  };
}

export function buildPaymentReminderEmail(name) {
  const who = String(name || "").trim() || "there";
  return {
    subject: "Your Paidly subscription needs attention",
    heading: "Your Paidly subscription needs attention",
    paragraphs: [
      `Hi ${who},`,
      "Your Paidly subscription payment is still outstanding.",
      "If it stays unpaid, account access to paid features may be restricted.",
      "Your existing business data remains safe. Invoices, customers, and the rest of your account are not deleted.",
      "You can resolve the payment to restore full access.",
    ],
    ctaLabel: "Resolve Payment",
    note: "The Paidly Team",
  };
}

function renderMail(mail) {
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

async function alreadySent(supabase, subscriptionId, type, graceEndsAt) {
  const { data, error } = await supabase
    .from("subscription_notifications")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("notification_type", type)
    .eq("status", "sent")
    .eq("trial_ends_at", graceEndsAt)
    .limit(1);
  if (error) {
    if (/does not exist|schema cache|notification_type/i.test(String(error.message || ""))) return false;
    throw error;
  }
  return Boolean(data?.[0]?.id);
}

async function record(supabase, row) {
  const { error } = await supabase.from("subscription_notifications").insert(row);
  if (error && !/duplicate|unique/i.test(String(error.message || ""))) {
    console.warn("[subscription-billing-mail]", error.message);
  }
  return error;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} sub
 * @param {'PAYMENT_FAILED'|'PAYMENT_FAILED_REMINDER'} type
 * @param {{ send?: Function }} [opts]
 */
export async function sendSubscriptionBillingEmail(supabase, sub, type, opts = {}) {
  if (!sub?.id || !sub.grace_ends_at) return { skipped: true, reason: "no_grace" };
  if (await suppressForDemoOrg(sub.company_id, "subscription_billing")) {
    return { skipped: true, reason: "demo" };
  }
  if (await alreadySent(supabase, sub.id, type, sub.grace_ends_at)) {
    return { skipped: true, reason: "already_sent" };
  }

  let name = sub.full_name || sub.user_name || null;
  let email = String(sub.email || sub.user_email || "").trim();
  if (sub.user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", sub.user_id)
      .maybeSingle();
    name = name || profile?.full_name || null;
    email = email || String(profile?.email || "").trim();
  }

  const mail = type === BILLING_NOTIFY.PAYMENT_FAILED_REMINDER
    ? buildPaymentReminderEmail(name)
    : buildPaymentFailedEmail(name);
  if (!email) {
    await record(supabase, {
      user_id: sub.user_id || null,
      company_id: sub.company_id || null,
      subscription_id: sub.id,
      notification_type: type,
      channel: "email",
      subject: mail.subject,
      status: "failed",
      source: "system",
      trial_ends_at: sub.grace_ends_at,
      error: "No email address",
      metadata: {},
    });
    return { sent: false, reason: "no_email" };
  }

  const rendered = renderMail(mail);
  const send = opts.send || ((to, subject, html, text) => sendHtmlEmail(to, subject, html, "Paidly", { text }));
  let result;
  try {
    result = await send(email, mail.subject, rendered.html, rendered.text);
  } catch (err) {
    result = { success: false, error: err?.message || String(err) };
  }
  const ok = Boolean(result?.success);
  await record(supabase, {
    user_id: sub.user_id || null,
    company_id: sub.company_id || null,
    subscription_id: sub.id,
    notification_type: type,
    channel: "email",
    subject: mail.subject,
    status: ok ? "sent" : "failed",
    source: "system",
    sent_at: ok ? new Date().toISOString() : null,
    trial_ends_at: sub.grace_ends_at,
    error: ok ? null : result?.error || "Send failed",
    metadata: { to: email },
  });
  return { sent: ok, error: ok ? null : result?.error || "Send failed" };
}
