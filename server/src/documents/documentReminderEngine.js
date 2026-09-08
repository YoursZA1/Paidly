import { supabaseAdmin } from "../supabaseAdmin.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { resolvePublicAppOrigin } from "../companyInviteAppUrl.js";
import { invoiceAmountDue } from "../../../shared/payments/invoiceBalance.js";
import { INVOICE_STATUS, isInvoiceFullyPaid, isInvoiceVoidLike, normalizeInvoiceStatus } from "../../../shared/commercial/documentStatuses.js";
import {
  DOCUMENT_EVENT_ACTOR,
  DOCUMENT_EVENT_SOURCE,
  DOCUMENT_EVENT_TYPE,
} from "../../../shared/documents/documentEvents.js";
import {
  applyReminderTemplate,
  evaluateInvoiceReminderActions,
  invoiceIsRemindable,
  normalizeReminderSettings,
} from "../../../shared/documents/documentReminderRules.js";
import {
  evaluateQuoteFollowUpActions,
  normalizeQuoteFollowUpSettings,
  quoteShouldExpire,
} from "../../../shared/documents/quoteReminderRules.js";
import { QUOTE_STATUS, canTransitionQuoteStatus, normalizeQuoteStatus } from "../../../shared/commercial/documentStatuses.js";
import { appendDocumentEvent, appendDocumentEventBestEffort, listDocumentEvents } from "./documentEventService.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function loadConfirmedPayments(orgId, invoiceId, client = supabaseAdmin) {
  const { data, error } = await client
    .from("payments")
    .select("id, invoice_id, amount, status, paid_at")
    .eq("org_id", orgId)
    .eq("invoice_id", invoiceId);
  if (error) throw error;
  return data || [];
}

async function loadSettingsForOrg(orgId, client = supabaseAdmin) {
  const { data: org } = await client
    .from("organizations")
    .select("id, owner_id, reminder_settings, name")
    .eq("id", orgId)
    .maybeSingle();
  const orgSettings = org?.reminder_settings && Object.keys(org.reminder_settings).length
    ? org.reminder_settings
    : null;
  if (orgSettings) {
    return {
      settings: normalizeReminderSettings(orgSettings),
      quoteFollowUp: normalizeQuoteFollowUpSettings(orgSettings.quote_follow_up || orgSettings.quote_reminder_settings),
      org,
      profile: null,
    };
  }

  if (!org?.owner_id) {
    return {
      settings: normalizeReminderSettings(null),
      quoteFollowUp: normalizeQuoteFollowUpSettings(null),
      org,
      profile: null,
    };
  }
  const { data: profile } = await client
    .from("profiles")
    .select("id, company_name, currency, reminder_settings, quote_reminder_settings, logo_url")
    .eq("id", org.owner_id)
    .maybeSingle();
  return {
    settings: normalizeReminderSettings(profile?.reminder_settings),
    quoteFollowUp: normalizeQuoteFollowUpSettings(profile?.quote_reminder_settings),
    org,
    profile,
  };
}

async function markInvoiceOverdue(invoice, client = supabaseAdmin) {
  const status = normalizeInvoiceStatus(invoice.status);
  if (status === INVOICE_STATUS.overdue || isInvoiceFullyPaid(status) || isInvoiceVoidLike(status)) {
    return invoice;
  }
  const { data } = await client
    .from("invoices")
    .update({ status: INVOICE_STATUS.overdue, updated_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .eq("org_id", invoice.org_id)
    .select("*")
    .single();
  return data || invoice;
}

export async function sendConfiguredReminder({
  invoice,
  clientRow,
  rule,
  settingsContext,
  appOrigin,
  payments,
  supabase = supabaseAdmin,
}) {
  if (!clientRow?.email) {
    const error = new Error("Client email is required to send a reminder");
    error.code = "CLIENT_EMAIL_REQUIRED";
    throw error;
  }
  if (!invoiceIsRemindable(invoice, payments)) {
    const error = new Error("This invoice cannot be reminded");
    error.code = "INVOICE_NOT_REMINDABLE";
    throw error;
  }

  const origin = String(appOrigin || resolvePublicAppOrigin()).replace(/\/$/, "");
  const share = invoice.public_share_token
    ? `${origin}/view/${encodeURIComponent(invoice.public_share_token)}`
    : origin;
  const currency = invoice.currency || settingsContext.profile?.currency || "ZAR";
  const amountDue = invoiceAmountDue(invoice, payments);
  const amountLabel = new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(money(amountDue));
  const dueLabel = invoice.delivery_date
    ? new Date(invoice.delivery_date).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "On receipt";
  const companyName = settingsContext.profile?.company_name || settingsContext.org?.name || "Paidly";
  const vars = {
    "{{invoice_number}}": invoice.invoice_number || "",
    "{{client_name}}": clientRow.name || "there",
    "{{contact_person}}": clientRow.contact_person || clientRow.name || "there",
    "{{amount}}": amountLabel,
    "{{currency}}": currency,
    "{{due_date}}": dueLabel,
    "{{company_name}}": companyName,
    "{{view_link}}": share,
  };
  const subject = applyReminderTemplate(rule?.subject || "Invoice reminder", vars);
  const body = applyReminderTemplate(
    rule?.body || "Just following up on invoice #{{invoice_number}}. You can review and pay securely using the link below.",
    vars
  );
  const html = `
    <p>Hi ${escapeHtml(clientRow.name || "there")},</p>
    <p style="white-space:pre-wrap;line-height:1.6;">${escapeHtml(body)}</p>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(share)}" style="display:inline-block;background:#f24e00;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:700;">Review and pay</a>
    </p>
    <p>If you have already paid, please ignore this message.</p>
  `;

  const sent = await sendHtmlEmail(clientRow.email, subject, html, companyName, {
    tags: [{ name: "category", value: "invoice_reminder" }],
  });
  if (!sent?.success) {
    const error = new Error(sent?.error || "Could not send reminder email");
    error.code = "REMINDER_SEND_FAILED";
    throw error;
  }

  const nowIso = new Date().toISOString();
  await supabase.from("document_sends").insert({
    org_id: invoice.org_id,
    document_type: "invoice",
    document_id: invoice.id,
    client_id: clientRow.id || null,
    channel: "remind",
    sent_at: nowIso,
  });

  return { remindedAt: nowIso, payUrl: share, subject };
}

export async function processInvoiceReminderActions({
  invoice,
  settingsContext,
  appOrigin,
  now = new Date(),
  supabase = supabaseAdmin,
}) {
  const payments = await loadConfirmedPayments(invoice.org_id, invoice.id, supabase);
  if (!invoiceIsRemindable(invoice, payments)) {
    return { skipped: true, reason: "not_remindable" };
  }

  const events = await listDocumentEvents({
    orgId: invoice.org_id,
    sourceKind: DOCUMENT_EVENT_SOURCE.INVOICE,
    sourceId: invoice.id,
    limit: 200,
  }, supabase);

  const actions = evaluateInvoiceReminderActions({
    invoice,
    payments,
    events,
    settings: settingsContext.settings,
    now,
  });

  const result = { observed: 0, reminded: 0, failed: 0, duplicates: 0 };
  let clientRow = null;

  for (const action of actions) {
    if (action.kind === "observe") {
      const written = await appendDocumentEventBestEffort({
        orgId: invoice.org_id,
        sourceKind: DOCUMENT_EVENT_SOURCE.INVOICE,
        sourceId: invoice.id,
        documentType: "invoice",
        eventType: action.eventType,
        clientId: invoice.client_id || null,
        actorType: DOCUMENT_EVENT_ACTOR.SYSTEM,
        reminderType: action.reminderType,
        dueDate: action.dueDate,
        days: action.days,
        metadata: {
          reminder_type: action.reminderType,
          due_date: action.dueDate,
          days: action.days,
        },
      }, supabase);
      if (written?.duplicate) result.duplicates += 1;
      else if (written?.event) result.observed += 1;
      if (action.eventType === DOCUMENT_EVENT_TYPE.overdue) {
        await markInvoiceOverdue(invoice, supabase);
      }
      continue;
    }

    if (action.kind !== "remind") continue;
    if (invoice.client_id && !clientRow) {
      const { data } = await supabase
        .from("clients")
        .select("id, name, email, contact_person, follow_up_enabled, org_id")
        .eq("id", invoice.client_id)
        .eq("org_id", invoice.org_id)
        .maybeSingle();
      clientRow = data;
    }
    if (clientRow?.follow_up_enabled === false) continue;

    try {
      const sent = await sendConfiguredReminder({
        invoice,
        clientRow,
        rule: action.rule,
        settingsContext,
        appOrigin,
        payments,
        supabase,
      });
      const written = await appendDocumentEvent({
        orgId: invoice.org_id,
        sourceKind: DOCUMENT_EVENT_SOURCE.INVOICE,
        sourceId: invoice.id,
        documentType: "invoice",
        eventType: DOCUMENT_EVENT_TYPE.reminded,
        clientId: invoice.client_id || null,
        actorType: DOCUMENT_EVENT_ACTOR.SYSTEM,
        reminderType: action.reminderType,
        dueDate: action.dueDate,
        days: action.days,
        metadata: {
          reminder_type: action.reminderType,
          due_date: action.dueDate,
          days: action.days,
          pay_url: sent.payUrl,
        },
      }, supabase);
      if (written.duplicate) result.duplicates += 1;
      else result.reminded += 1;
    } catch (err) {
      if (err?.code === "23505") {
        result.duplicates += 1;
        continue;
      }
      result.failed += 1;
      console.warn("[document-reminders]", invoice.id, err?.message || err);
    }
  }

  return result;
}

export async function runPaymentReminderBatch({
  supabase = supabaseAdmin,
  appOrigin = null,
  limit = 150,
  now = new Date(),
} = {}) {
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("id, org_id, client_id, status, invoice_number, total_amount, currency, delivery_date, due_date, public_share_token")
    .in("status", ["sent", "viewed", "partially_paid", "partial_paid", "overdue"])
    .order("updated_at", { ascending: true })
    .limit(Math.min(400, Math.max(1, Number(limit) || 150)));
  if (error) throw error;

  const settingsByOrg = new Map();
  let processed = 0;
  let observed = 0;
  let reminded = 0;
  let failed = 0;
  let skipped = 0;

  for (const invoice of invoices || []) {
    processed += 1;
    if (!settingsByOrg.has(invoice.org_id)) {
      settingsByOrg.set(invoice.org_id, await loadSettingsForOrg(invoice.org_id, supabase));
    }
    const settingsContext = settingsByOrg.get(invoice.org_id);
    if (!settingsContext.settings.reminders_enabled && !settingsContext.settings.viewed_not_paid.enabled) {
      skipped += 1;
      continue;
    }
    try {
      const out = await processInvoiceReminderActions({
        invoice,
        settingsContext,
        appOrigin,
        now,
        supabase,
      });
      if (out.skipped) skipped += 1;
      observed += out.observed || 0;
      reminded += out.reminded || 0;
      failed += out.failed || 0;
    } catch (err) {
      failed += 1;
      console.warn("[document-reminders] invoice", invoice.id, err?.message || err);
    }
  }

  const quotesOut = await runQuoteFollowUpBatch({ supabase, appOrigin, limit, now, settingsByOrg });

  return {
    ran: true,
    skipped: false,
    processedInvoices: processed,
    observed,
    reminded,
    failed,
    skippedInvoices: skipped,
    quotes: quotesOut,
  };
}

async function expireOpenQuote(quote, supabase) {
  const status = normalizeQuoteStatus(quote.status);
  if (!canTransitionQuoteStatus(status, QUOTE_STATUS.expired)) return quote;
  const { data } = await supabase
    .from("quotes")
    .update({ status: QUOTE_STATUS.expired, updated_at: new Date().toISOString() })
    .eq("id", quote.id)
    .eq("org_id", quote.org_id)
    .select("*")
    .single();
  await appendDocumentEventBestEffort({
    orgId: quote.org_id,
    sourceKind: DOCUMENT_EVENT_SOURCE.QUOTE,
    sourceId: quote.id,
    documentType: "quote",
    eventType: DOCUMENT_EVENT_TYPE.expired,
    clientId: quote.client_id || null,
    actorType: DOCUMENT_EVENT_ACTOR.SYSTEM,
    metadata: { valid_until: quote.valid_until || quote.due_date || null },
  }, supabase);
  return data || quote;
}

export async function processQuoteFollowUpActions({
  quote,
  settingsContext,
  appOrigin,
  now = new Date(),
  supabase = supabaseAdmin,
}) {
  if (quoteShouldExpire(quote, now)) {
    await expireOpenQuote(quote, supabase);
    return { expired: 1, reminded: 0, failed: 0 };
  }

  const events = await listDocumentEvents({
    orgId: quote.org_id,
    sourceKind: DOCUMENT_EVENT_SOURCE.QUOTE,
    sourceId: quote.id,
    limit: 100,
  }, supabase);
  const actions = evaluateQuoteFollowUpActions({
    quote,
    events,
    settings: settingsContext.quoteFollowUp,
    now,
  });
  const result = { expired: 0, reminded: 0, failed: 0 };
  if (!actions.length) return result;

  let clientRow = null;
  if (quote.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("id, name, email, contact_person, follow_up_enabled, org_id")
      .eq("id", quote.client_id)
      .eq("org_id", quote.org_id)
      .maybeSingle();
    clientRow = data;
  }
  if (!clientRow?.email || clientRow.follow_up_enabled === false) return result;

  const origin = String(appOrigin || resolvePublicAppOrigin()).replace(/\/$/, "");
  const viewUrl = quote.public_share_token
    ? `${origin}/PublicQuote?token=${encodeURIComponent(quote.public_share_token)}`
    : origin;
  const companyName = settingsContext.profile?.company_name || settingsContext.org?.name || "Paidly";
  const vars = {
    "{{quote_number}}": quote.quote_number || "",
    "{{client_name}}": clientRow.name || "there",
    "{{company_name}}": companyName,
    "{{view_link}}": viewUrl,
  };

  for (const action of actions) {
    try {
      const subject = applyReminderTemplate(action.rule.subject, vars);
      const body = applyReminderTemplate(action.rule.body, vars);
      const html = `
        <p>Hi ${escapeHtml(clientRow.name || "there")},</p>
        <p style="white-space:pre-wrap;line-height:1.6;">${escapeHtml(body)}</p>
        <p style="margin:24px 0;">
          <a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#f24e00;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:700;">Review quote</a>
        </p>
      `;
      const sent = await sendHtmlEmail(clientRow.email, subject, html, companyName, {
        tags: [{ name: "category", value: "quote_followup" }],
      });
      if (!sent?.success) {
        result.failed += 1;
        continue;
      }
      await supabase.from("document_sends").insert({
        org_id: quote.org_id,
        document_type: "quote",
        document_id: quote.id,
        client_id: clientRow.id,
        channel: "remind",
        sent_at: new Date().toISOString(),
      });
      await appendDocumentEvent({
        orgId: quote.org_id,
        sourceKind: DOCUMENT_EVENT_SOURCE.QUOTE,
        sourceId: quote.id,
        documentType: "quote",
        eventType: DOCUMENT_EVENT_TYPE.reminded,
        clientId: clientRow.id,
        actorType: DOCUMENT_EVENT_ACTOR.SYSTEM,
        reminderType: action.reminderType,
        metadata: { reminder_type: action.reminderType, kind: "quote_follow_up" },
      }, supabase);
      result.reminded += 1;
    } catch (err) {
      if (err?.code === "23505") continue;
      result.failed += 1;
      console.warn("[quote-follow-up]", quote.id, err?.message || err);
    }
  }
  return result;
}

async function runQuoteFollowUpBatch({ supabase, appOrigin, limit, now, settingsByOrg }) {
  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("id, org_id, client_id, status, quote_number, valid_until, due_date, sent_date, updated_at, public_share_token")
    .in("status", ["sent", "viewed"])
    .order("updated_at", { ascending: true })
    .limit(Math.min(400, Math.max(1, Number(limit) || 150)));
  if (error) throw error;

  let processed = 0;
  let reminded = 0;
  let expired = 0;
  let failed = 0;
  for (const quote of quotes || []) {
    processed += 1;
    if (!settingsByOrg.has(quote.org_id)) {
      settingsByOrg.set(quote.org_id, await loadSettingsForOrg(quote.org_id, supabase));
    }
    try {
      const out = await processQuoteFollowUpActions({
        quote,
        settingsContext: settingsByOrg.get(quote.org_id),
        appOrigin,
        now,
        supabase,
      });
      reminded += out.reminded || 0;
      expired += out.expired || 0;
      failed += out.failed || 0;
    } catch (err) {
      failed += 1;
      console.warn("[quote-follow-up] quote", quote.id, err?.message || err);
    }
  }
  return { processedQuotes: processed, reminded, expired, failed };
}
