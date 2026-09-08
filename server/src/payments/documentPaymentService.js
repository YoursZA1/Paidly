import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { resolvePublicAppOrigin } from "../companyInviteAppUrl.js";
import { CUSTOMER_PAYMENT_PROVIDERS } from "./paymentIntentContract.js";
import {
  applyVerifiedIntentStatus,
  confirmPaymentIntent,
  createPaymentIntentRow,
  getOrgPaymentIntent,
  markPaymentIntentExpired,
  publicPaymentIntentView,
} from "./paymentIntentService.js";
import { ozowAmountString } from "./ozowHash.js";
import {
  ACTIVE_PAYMENT_INTENT_STATUSES,
  isActivePaymentIntentStatus,
  isConfirmedPaymentIntent,
  paymentIntentIsExpired,
} from "../../../shared/payments/paymentIntentStates.js";
import {
  INVOICE_STATUS,
  canTransitionInvoiceStatus,
  isInvoiceFullyPaid,
  isInvoiceOpenReceivable,
  isInvoiceVoidLike,
  normalizeInvoiceStatus,
} from "../../../shared/commercial/documentStatuses.js";
import { resolveDocumentPaymentCtas } from "../../../shared/payments/documentPaymentCtas.js";
import { invoiceAmountDue, isConfirmedInvoicePayment } from "../../../shared/payments/invoiceBalance.js";

const REMIND_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const INTENT_TTL_MS = 24 * 60 * 60 * 1000;

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function listConfirmedInvoicePayments(orgId, invoiceId) {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("id, invoice_id, amount, status, paid_at, method, reference, created_at")
    .eq("org_id", orgId)
    .eq("invoice_id", invoiceId);
  if (error) throw error;
  return (data || []).filter(isConfirmedInvoicePayment);
}

export { invoiceAmountDue };

export async function loadOrgInvoice(orgId, invoiceId) {
  const id = String(invoiceId || "").trim();
  if (!id) return null;
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function findActiveDocumentIntent(orgId, invoiceId) {
  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("org_id", orgId)
    .eq("source_kind", "document")
    .eq("document_id", invoiceId)
    .in("status", ACTIVE_PAYMENT_INTENT_STATUSES)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  const now = new Date();
  for (const row of data || []) {
    if (paymentIntentIsExpired(row, now)) {
      await markPaymentIntentExpired(row);
      continue;
    }
    return row;
  }
  return null;
}

export async function listDocumentPaymentIntents(orgId, invoiceId) {
  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("org_id", orgId)
    .eq("source_kind", "document")
    .eq("document_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function ensureInvoiceShareToken(invoice) {
  if (invoice.public_share_token) return invoice;
  const token = randomUUID();
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .update({ public_share_token: token, updated_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .eq("org_id", invoice.org_id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

function invoiceIsPayable(invoice, amountDue) {
  const status = normalizeInvoiceStatus(invoice?.status);
  if (!invoice || isInvoiceVoidLike(status) || isInvoiceFullyPaid(status)) return false;
  if (status === INVOICE_STATUS.draft) return false;
  if (amountDue <= 0) return false;
  return isInvoiceOpenReceivable(status) || status === INVOICE_STATUS.sent;
}

export async function createOrReuseDocumentPaymentIntent({
  orgId,
  invoiceId,
  createdBy = null,
  shareToken = null,
  forceNewAttempt = false,
  appOrigin = null,
}) {
  const invoice = await loadOrgInvoice(orgId, invoiceId);
  if (!invoice) {
    const error = new Error("Invoice not found");
    error.code = "INVOICE_NOT_FOUND";
    error.status = 404;
    throw error;
  }

  const currency = String(invoice.currency || invoice.owner_currency || "ZAR").trim().toUpperCase();
  if (currency !== "ZAR") {
    const error = new Error("Ozow invoice payments are only available in ZAR");
    error.code = "UNSUPPORTED_CURRENCY";
    error.status = 422;
    throw error;
  }

  const payments = await listConfirmedInvoicePayments(orgId, invoice.id);
  const amountDue = invoiceAmountDue(invoice, payments);
  if (!invoiceIsPayable(invoice, amountDue)) {
    const error = new Error("This invoice is not payable");
    error.code = "INVOICE_NOT_PAYABLE";
    error.status = 422;
    throw error;
  }

  const withToken = await ensureInvoiceShareToken(invoice);
  let intent = forceNewAttempt ? null : await findActiveDocumentIntent(orgId, invoice.id);
  if (intent && money(intent.amount) !== amountDue) {
    await markPaymentIntentExpired(intent);
    intent = null;
  }

  if (!intent) {
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS).toISOString();
    intent = await createPaymentIntentRow({
      orgId,
      sourceKind: "document",
      provider: CUSTOMER_PAYMENT_PROVIDERS.OZOW,
      amount: amountDue,
      currency,
      idempotencyKey: `document:${invoice.id}:attempt:${randomUUID()}`,
      clientId: invoice.client_id || null,
      companyId: invoice.company_id || null,
      createdBy,
      documentId: invoice.id,
      documentType: "invoice",
      expiresAt,
      metadata: {
        origin: "document",
        invoice_number: invoice.invoice_number || null,
        customer_name: null,
        share_token: withToken.public_share_token,
      },
    });
    const { appendDocumentEventBestEffort } = await import("../documents/documentEventService.js");
    const { DOCUMENT_EVENT_ACTOR, DOCUMENT_EVENT_SOURCE, DOCUMENT_EVENT_TYPE } = await import(
      "../../../shared/documents/documentEvents.js"
    );
    await appendDocumentEventBestEffort({
      orgId,
      sourceKind: DOCUMENT_EVENT_SOURCE.INVOICE,
      sourceId: invoice.id,
      documentType: "invoice",
      eventType: DOCUMENT_EVENT_TYPE.payment_intent,
      clientId: invoice.client_id || null,
      actorType: DOCUMENT_EVENT_ACTOR.SYSTEM,
      paymentIntentId: intent.id,
      metadata: { payment_intent_id: intent.id, amount: amountDue },
    });
  }

  const origin = String(appOrigin || resolvePublicAppOrigin()).replace(/\/$/, "");
  const token = shareToken || withToken.public_share_token;
  const publicReturn = `${origin}/view/${encodeURIComponent(token)}?pay=return&intent=${encodeURIComponent(intent.id)}`;
  const confirmed = await confirmPaymentIntent(intent, {
    appOrigin: origin,
    shareToken: token,
    successUrl: publicReturn,
    cancelUrl: `${publicReturn}&result=cancel`,
    errorUrl: `${publicReturn}&result=error`,
  });

  return {
    invoice: withToken,
    amountDue,
    currency,
    intent: confirmed.intent,
    charge: confirmed.charge,
    redirectUrl: confirmed.charge?.next_action?.redirect_url || null,
  };
}

async function insertSettledInvoicePayment(intent, invoice, amount) {
  const reference = String(intent.id);
  const { data: existingRows, error: findErr } = await supabaseAdmin
    .from("payments")
    .select("id, amount, status, invoice_id")
    .eq("org_id", intent.org_id)
    .eq("reference", reference)
    .limit(1);
  if (findErr) throw findErr;
  if (existingRows?.[0]?.id) return { payment: existingRows[0], duplicate: true };

  const row = {
    org_id: intent.org_id,
    invoice_id: invoice.id,
    document_id: invoice.id,
    client_id: invoice.client_id || intent.client_id || null,
    amount,
    status: "paid",
    paid_at: new Date().toISOString(),
    method: "ozow",
    reference,
    notes: `Ozow ${intent.external_id || intent.id}`,
  };

  const { data, error } = await supabaseAdmin.from("payments").insert(row).select("*").single();
  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("payments")
        .select("id, amount, status, invoice_id")
        .eq("org_id", intent.org_id)
        .eq("reference", reference)
        .maybeSingle();
      if (raced?.id) return { payment: raced, duplicate: true };
    }
    throw error;
  }
  return { payment: data, duplicate: false };
}

async function reconcileInvoiceStatus(invoice, payments) {
  const amountDue = invoiceAmountDue(invoice, payments);
  const current = normalizeInvoiceStatus(invoice.status);
  const next = amountDue <= 0 ? INVOICE_STATUS.paid : INVOICE_STATUS.partially_paid;
  if (current === next) return invoice;
  if (!canTransitionInvoiceStatus(current, next)) return invoice;

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .update({
      status: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id)
    .eq("org_id", invoice.org_id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function settleDocumentIntent(intent) {
  if (!intent?.document_id || intent.source_kind !== "document") {
    return { settled: false, reason: "not_document" };
  }
  if (!isConfirmedPaymentIntent(intent.status)) {
    return { settled: false, reason: "not_paid" };
  }

  const invoice = await loadOrgInvoice(intent.org_id, intent.document_id);
  if (!invoice) {
    console.error("[document-payment] invoice missing for paid intent", intent.id);
    return { settled: false, reason: "invoice_missing" };
  }

  const amount = money(intent.amount);
  const inserted = await insertSettledInvoicePayment(intent, invoice, amount);
  const payments = await listConfirmedInvoicePayments(intent.org_id, invoice.id);
  const updatedInvoice = await reconcileInvoiceStatus(invoice, payments);
  const { appendDocumentEventBestEffort } = await import("../documents/documentEventService.js");
  const { DOCUMENT_EVENT_ACTOR, DOCUMENT_EVENT_SOURCE, DOCUMENT_EVENT_TYPE } = await import(
    "../../../shared/documents/documentEvents.js"
  );
  await appendDocumentEventBestEffort({
    orgId: intent.org_id,
    sourceKind: DOCUMENT_EVENT_SOURCE.INVOICE,
    sourceId: invoice.id,
    documentType: "invoice",
    eventType: DOCUMENT_EVENT_TYPE.paid,
    clientId: invoice.client_id || intent.client_id || null,
    actorType: DOCUMENT_EVENT_ACTOR.PAYMENT_GATEWAY,
    paymentIntentId: intent.id,
    paymentId: inserted.payment?.id,
    metadata: {
      payment_intent_id: intent.id,
      payment_id: inserted.payment?.id,
      payment_reference: inserted.payment?.reference || intent.id,
      amount: amount,
      duplicate_settlement: inserted.duplicate,
    },
  });
  return {
    settled: true,
    duplicate: inserted.duplicate,
    payment: inserted.payment,
    invoice: updatedInvoice,
    amountDue: invoiceAmountDue(updatedInvoice, payments),
  };
}

export async function applyVerifiedProviderEvent({ intentId, nextStatus, externalId, amount, metadata }) {
  if (!intentId) {
    const error = new Error("Payment intent reference is required");
    error.code = "INTENT_REQUIRED";
    throw error;
  }

  const { data: intent, error } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("id", intentId)
    .maybeSingle();
  if (error) throw error;
  if (!intent) {
    const missing = new Error("Payment intent not found");
    missing.code = "INTENT_NOT_FOUND";
    throw missing;
  }

  if (amount != null && amount !== "" && ozowAmountString(intent.amount) !== ozowAmountString(amount)) {
    console.error("[document-payment] amount mismatch", {
      intentId: intent.id,
      expected: intent.amount,
      notified: amount,
    });
    const mismatch = new Error("Payment amount does not match the intent");
    mismatch.code = "AMOUNT_MISMATCH";
    throw mismatch;
  }

  const applied = await applyVerifiedIntentStatus(intent, nextStatus, {
    externalId,
    metadata,
  });

  let settlement = null;
  if (applied.intent.source_kind === "document" && isConfirmedPaymentIntent(applied.intent.status)) {
    settlement = await settleDocumentIntent(applied.intent);
  }

  return { ...applied, settlement };
}

export async function documentPaymentSnapshot(orgId, invoiceId) {
  const invoice = await loadOrgInvoice(orgId, invoiceId);
  if (!invoice) return null;
  const [payments, intents] = await Promise.all([
    listConfirmedInvoicePayments(orgId, invoice.id),
    listDocumentPaymentIntents(orgId, invoice.id),
  ]);
  const amountDue = invoiceAmountDue(invoice, payments);
  const latest = intents[0] || null;
  const overdue =
    Boolean(invoice.delivery_date) && new Date(invoice.delivery_date).getTime() < Date.now();
  const ctas = resolveDocumentPaymentCtas({
    invoiceStatus: invoice.status,
    paymentStatus: latest?.status || null,
    amountDue,
    overdue,
  });
  return {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    invoice_status: normalizeInvoiceStatus(invoice.status),
    payment_status: latest?.status || null,
    amount_due: amountDue,
    currency: invoice.currency || invoice.owner_currency || "ZAR",
    due_date: invoice.delivery_date || null,
    latest_intent: publicPaymentIntentView(latest),
    history: intents.map((row) => ({
      id: row.id,
      provider: row.provider,
      amount: money(row.amount),
      currency: row.currency,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      external_id: row.external_id,
    })),
    payments: payments.map((row) => ({
      id: row.id,
      amount: money(row.amount),
      status: row.status,
      method: row.method,
      paid_at: row.paid_at,
      reference: row.reference,
    })),
    ctas,
  };
}

async function lastReminderAt(orgId, invoiceId) {
  const { data, error } = await supabaseAdmin
    .from("document_sends")
    .select("sent_at, created_at")
    .eq("org_id", orgId)
    .eq("document_id", invoiceId)
    .eq("document_type", "invoice")
    .eq("channel", "remind")
    .order("sent_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const row = data?.[0];
  const raw = row?.sent_at || row?.created_at;
  return raw ? new Date(raw) : null;
}

export async function remindDocumentPayment({ orgId, invoiceId, createdBy = null, appOrigin = null }) {
  const invoice = await loadOrgInvoice(orgId, invoiceId);
  if (!invoice) {
    const error = new Error("Invoice not found");
    error.code = "INVOICE_NOT_FOUND";
    error.status = 404;
    throw error;
  }
  const status = normalizeInvoiceStatus(invoice.status);
  if (isInvoiceVoidLike(status) || isInvoiceFullyPaid(status) || status === INVOICE_STATUS.draft) {
    const error = new Error("This invoice cannot be reminded");
    error.code = "INVOICE_NOT_REMINDABLE";
    error.status = 422;
    throw error;
  }

  const lastAt = await lastReminderAt(orgId, invoice.id);
  if (lastAt && Date.now() - lastAt.getTime() < REMIND_COOLDOWN_MS) {
    const error = new Error("A reminder was already sent recently. Try again later.");
    error.code = "REMINDER_THROTTLED";
    error.status = 429;
    error.retry_after_ms = REMIND_COOLDOWN_MS - (Date.now() - lastAt.getTime());
    throw error;
  }

  let client = null;
  if (invoice.client_id) {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("id, name, email, org_id")
      .eq("id", invoice.client_id)
      .eq("org_id", orgId)
      .maybeSingle();
    client = data;
  }
  if (!client?.email) {
    const error = new Error("Client email is required to send a reminder");
    error.code = "CLIENT_EMAIL_REQUIRED";
    error.status = 422;
    throw error;
  }

  const payments = await listConfirmedInvoicePayments(orgId, invoice.id);
  const amountDue = invoiceAmountDue(invoice, payments);
  const withToken = await ensureInvoiceShareToken(invoice);
  const origin = String(appOrigin || resolvePublicAppOrigin()).replace(/\/$/, "");
  const payUrl = `${origin}/view/${encodeURIComponent(withToken.public_share_token)}`;
  const currency = invoice.currency || invoice.owner_currency || "ZAR";
  const amountLabel = new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(amountDue);
  const dueLabel = invoice.delivery_date
    ? new Date(invoice.delivery_date).toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "On receipt";
  const companyName = invoice.owner_company_name || "Paidly";
  const subject = `Payment reminder: invoice ${invoice.invoice_number || ""}`.trim();
  const html = `
    <p>Hi ${escapeHtml(client.name || "there")},</p>
    <p>This is a reminder that invoice <strong>${escapeHtml(invoice.invoice_number || "")}</strong> from ${escapeHtml(companyName)} is outstanding.</p>
    <p>
      <strong>Amount due:</strong> ${escapeHtml(amountLabel)}<br/>
      <strong>Due date:</strong> ${escapeHtml(dueLabel)}
    </p>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#f24e00;color:#fff;padding:12px 22px;text-decoration:none;border-radius:8px;font-weight:700;">Pay now</a>
    </p>
    <p>If you have already paid, please ignore this message.</p>
  `;

  const sent = await sendHtmlEmail(client.email, subject, html, companyName, {
    tags: [{ name: "category", value: "invoice_reminder" }],
  });
  if (!sent?.success) {
    const error = new Error(sent?.error || "Could not send reminder email");
    error.code = "REMINDER_SEND_FAILED";
    error.status = 502;
    throw error;
  }

  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("document_sends").insert({
    org_id: orgId,
    document_type: "invoice",
    document_id: invoice.id,
    client_id: client.id,
    channel: "remind",
    sent_at: nowIso,
  });

  const { appendDocumentEventBestEffort } = await import("../documents/documentEventService.js");
  const { DOCUMENT_EVENT_ACTOR, DOCUMENT_EVENT_SOURCE, DOCUMENT_EVENT_TYPE } = await import(
    "../../../shared/documents/documentEvents.js"
  );
  await appendDocumentEventBestEffort({
    orgId,
    sourceKind: DOCUMENT_EVENT_SOURCE.INVOICE,
    sourceId: invoice.id,
    documentType: "invoice",
    eventType: DOCUMENT_EVENT_TYPE.reminded,
    clientId: client.id,
    actorType: DOCUMENT_EVENT_ACTOR.USER,
    actorUserId: createdBy,
    reminderType: "manual",
    metadata: {
      reminder_type: "manual",
      channel: "remind",
      pay_url: payUrl,
    },
  });

  return {
    ok: true,
    reminded_at: nowIso,
    invoice_id: invoice.id,
    pay_url: payUrl,
    created_by: createdBy,
  };
}

export function isActiveDocumentIntent(intent) {
  return isActivePaymentIntentStatus(intent?.status);
}

export { publicPaymentIntentView };
