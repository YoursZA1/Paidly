/**
 * Client Relationship Timeline contract.
 *
 * Financial/document status stays on invoices, quotes, payments, and payment_intents.
 * document_events remain the Observe log. This module maps those sources (plus notes
 * and relationship events) into one chronological CRM feed.
 */

import {
  isInvoiceOpenReceivable,
  normalizeInvoiceStatus,
  normalizeQuoteStatus,
  INVOICE_STATUS,
  QUOTE_STATUS,
} from "../commercial/documentStatuses.js";
import { invoiceAmountDue, isConfirmedInvoicePayment } from "../payments/invoiceBalance.js";
import { DOCUMENT_EVENT_TYPE } from "../documents/documentEvents.js";

export const CLIENT_TIMELINE_PAGE_SIZE = 40;
export const CLIENT_TIMELINE_MAX_PAGE_SIZE = 100;
export const CLIENT_TIMELINE_GROUP_WINDOW_MS = 15 * 60 * 1000;

export const CLIENT_TIMELINE_CATEGORY = Object.freeze({
  ALL: "all",
  DOCUMENTS: "documents",
  QUOTES: "quotes",
  INVOICES: "invoices",
  PAYMENTS: "payments",
  COMMUNICATION: "communication",
  REMINDERS: "reminders",
  NOTES: "notes",
  CLIENT_CHANGES: "client_changes",
  RELATIONSHIP: "relationship",
});

export const CLIENT_TIMELINE_FILTERS = Object.freeze([
  CLIENT_TIMELINE_CATEGORY.ALL,
  CLIENT_TIMELINE_CATEGORY.DOCUMENTS,
  CLIENT_TIMELINE_CATEGORY.QUOTES,
  CLIENT_TIMELINE_CATEGORY.INVOICES,
  CLIENT_TIMELINE_CATEGORY.PAYMENTS,
  CLIENT_TIMELINE_CATEGORY.COMMUNICATION,
  CLIENT_TIMELINE_CATEGORY.REMINDERS,
  CLIENT_TIMELINE_CATEGORY.NOTES,
  CLIENT_TIMELINE_CATEGORY.CLIENT_CHANGES,
]);

export const CLIENT_TIMELINE_ACTOR = Object.freeze({
  USER: "user",
  SYSTEM: "system",
  CLIENT: "client",
  RECIPIENT: "recipient",
  PAYMENT_GATEWAY: "payment_gateway",
  EMAIL_PROVIDER: "email_provider",
  AUTOMATION: "automation",
  API: "api",
  WEBHOOK: "webhook",
});

export const CLIENT_RELATIONSHIP_EVENT_TYPE = Object.freeze({
  client_created: "client_created",
  client_updated: "client_updated",
  note_added: "note_added",
  note_updated: "note_updated",
  note_archived: "note_archived",
  follow_up_required: "follow_up_required",
  client_contacted: "client_contacted",
  meeting_held: "meeting_held",
  call_completed: "call_completed",
  revision_requested: "revision_requested",
  new_quote_requested: "new_quote_requested",
  payment_extension_requested: "payment_extension_requested",
});

export const MANUAL_RELATIONSHIP_EVENT_TYPES = Object.freeze([
  CLIENT_RELATIONSHIP_EVENT_TYPE.follow_up_required,
  CLIENT_RELATIONSHIP_EVENT_TYPE.client_contacted,
  CLIENT_RELATIONSHIP_EVENT_TYPE.meeting_held,
  CLIENT_RELATIONSHIP_EVENT_TYPE.call_completed,
  CLIENT_RELATIONSHIP_EVENT_TYPE.revision_requested,
  CLIENT_RELATIONSHIP_EVENT_TYPE.new_quote_requested,
  CLIENT_RELATIONSHIP_EVENT_TYPE.payment_extension_requested,
]);

export const CLIENT_PROFILE_TRACKED_FIELDS = Object.freeze([
  "name",
  "email",
  "phone",
  "address",
  "contact_person",
  "website",
  "tax_id",
  "fax",
  "alternate_email",
  "payment_terms",
  "payment_terms_days",
  "segment",
  "industry",
]);

const PROFILE_FIELD_LABELS = Object.freeze({
  name: "Company name",
  email: "Email address",
  phone: "Phone number",
  address: "Billing address",
  contact_person: "Contact person",
  website: "Website",
  tax_id: "Tax/VAT information",
  fax: "Fax",
  alternate_email: "Alternate email",
  payment_terms: "Payment terms",
  payment_terms_days: "Payment terms",
  segment: "Client status",
  industry: "Industry",
});

export const LAST_ACTIVITY_DOCUMENT_EVENT_TYPES = Object.freeze([
  DOCUMENT_EVENT_TYPE.sent,
  DOCUMENT_EVENT_TYPE.opened,
  DOCUMENT_EVENT_TYPE.accepted,
  DOCUMENT_EVENT_TYPE.rejected,
  DOCUMENT_EVENT_TYPE.paid,
  DOCUMENT_EVENT_TYPE.reminded,
  DOCUMENT_EVENT_TYPE.clicked,
  DOCUMENT_EVENT_TYPE.overdue,
  DOCUMENT_EVENT_TYPE.payment_failed,
  DOCUMENT_EVENT_TYPE.payment_cancelled,
  DOCUMENT_EVENT_TYPE.payment_refunded,
  DOCUMENT_EVENT_TYPE.converted_to_invoice,
]);

export const LAST_ACTIVITY_RELATIONSHIP_EVENT_TYPES = Object.freeze([
  CLIENT_RELATIONSHIP_EVENT_TYPE.client_created,
  CLIENT_RELATIONSHIP_EVENT_TYPE.client_updated,
  CLIENT_RELATIONSHIP_EVENT_TYPE.note_added,
  CLIENT_RELATIONSHIP_EVENT_TYPE.follow_up_required,
  CLIENT_RELATIONSHIP_EVENT_TYPE.client_contacted,
  CLIENT_RELATIONSHIP_EVENT_TYPE.meeting_held,
  CLIENT_RELATIONSHIP_EVENT_TYPE.call_completed,
  CLIENT_RELATIONSHIP_EVENT_TYPE.revision_requested,
  CLIENT_RELATIONSHIP_EVENT_TYPE.new_quote_requested,
  CLIENT_RELATIONSHIP_EVENT_TYPE.payment_extension_requested,
]);

export const HIGH_VISIBILITY_EVENT_TYPES = Object.freeze([
  DOCUMENT_EVENT_TYPE.paid,
  DOCUMENT_EVENT_TYPE.payment_failed,
  DOCUMENT_EVENT_TYPE.payment_cancelled,
  DOCUMENT_EVENT_TYPE.payment_refunded,
  DOCUMENT_EVENT_TYPE.payment_partially_refunded,
  DOCUMENT_EVENT_TYPE.overdue,
  DOCUMENT_EVENT_TYPE.accepted,
  DOCUMENT_EVENT_TYPE.rejected,
]);

export const GROUPABLE_EVENT_TYPES = Object.freeze([
  DOCUMENT_EVENT_TYPE.opened,
  DOCUMENT_EVENT_TYPE.clicked,
  DOCUMENT_EVENT_TYPE.payment_intent,
  DOCUMENT_EVENT_TYPE.payment_processing,
  DOCUMENT_EVENT_TYPE.viewed,
  "email_opened",
  "email_clicked",
]);

const PAYMENT_STATUS_TO_EVENT = Object.freeze({
  processing: DOCUMENT_EVENT_TYPE.payment_processing,
  failed: DOCUMENT_EVENT_TYPE.payment_failed,
  cancelled: DOCUMENT_EVENT_TYPE.payment_cancelled,
  canceled: DOCUMENT_EVENT_TYPE.payment_cancelled,
  refunded: DOCUMENT_EVENT_TYPE.payment_refunded,
  paid: DOCUMENT_EVENT_TYPE.paid,
});

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function normalizeTimelineCategory(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (key === "client_changes" || key === "changes") return CLIENT_TIMELINE_CATEGORY.CLIENT_CHANGES;
  if (Object.values(CLIENT_TIMELINE_CATEGORY).includes(key)) return key;
  return CLIENT_TIMELINE_CATEGORY.ALL;
}

export function isManualRelationshipEventType(raw) {
  return MANUAL_RELATIONSHIP_EVENT_TYPES.includes(String(raw || "").trim().toLowerCase());
}

export function documentPaymentEventTypeForStatus(status) {
  const key = String(status || "")
    .trim()
    .toLowerCase();
  return PAYMENT_STATUS_TO_EVENT[key] || null;
}

export function mapActorType(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (key === "recipient" || key === "client") return CLIENT_TIMELINE_ACTOR.CLIENT;
  if (key === "webhook") return CLIENT_TIMELINE_ACTOR.PAYMENT_GATEWAY;
  if (key === "payment_gateway") return CLIENT_TIMELINE_ACTOR.PAYMENT_GATEWAY;
  if (key === "email_provider") return CLIENT_TIMELINE_ACTOR.EMAIL_PROVIDER;
  if (key === "automation") return CLIENT_TIMELINE_ACTOR.AUTOMATION;
  if (key === "api") return CLIENT_TIMELINE_ACTOR.API;
  if (key === "user") return CLIENT_TIMELINE_ACTOR.USER;
  return CLIENT_TIMELINE_ACTOR.SYSTEM;
}

export function formatActorLabel(actorType, metadata = {}) {
  const actor = mapActorType(actorType);
  const source = String(metadata.source || metadata.provider || "").trim().toLowerCase();
  if (actor === CLIENT_TIMELINE_ACTOR.PAYMENT_GATEWAY || source === "ozow") {
    return source === "ozow" || metadata.provider === "ozow" ? "Via Ozow" : "Payment gateway";
  }
  if (actor === CLIENT_TIMELINE_ACTOR.CLIENT) return "By client";
  if (actor === CLIENT_TIMELINE_ACTOR.USER) {
    return metadata.actor_name ? `By ${metadata.actor_name}` : "By team";
  }
  if (actor === CLIENT_TIMELINE_ACTOR.AUTOMATION || source === "cron" || source === "reminder_engine") {
    return "Automated reminder";
  }
  if (actor === CLIENT_TIMELINE_ACTOR.EMAIL_PROVIDER) return "Email provider";
  if (actor === CLIENT_TIMELINE_ACTOR.API) return "API";
  return "System";
}

export function timelineEventCategory({ eventType, sourceKind, documentType } = {}) {
  const type = String(eventType || "").trim().toLowerCase();
  const kind = String(sourceKind || documentType || "").trim().toLowerCase();

  if (type.startsWith("note_") || type === "note_added") return CLIENT_TIMELINE_CATEGORY.NOTES;
  if (type === "client_created" || type === "client_updated") return CLIENT_TIMELINE_CATEGORY.CLIENT_CHANGES;
  if (MANUAL_RELATIONSHIP_EVENT_TYPES.includes(type)) return CLIENT_TIMELINE_CATEGORY.RELATIONSHIP;

  if (
    type === DOCUMENT_EVENT_TYPE.reminded ||
    type === DOCUMENT_EVENT_TYPE.due_soon ||
    type === DOCUMENT_EVENT_TYPE.due_today ||
    type === "invoice_reminded"
  ) {
    return CLIENT_TIMELINE_CATEGORY.REMINDERS;
  }

  if (
    type.startsWith("email_") ||
    type.startsWith("message_") ||
    type === "communication"
  ) {
    return CLIENT_TIMELINE_CATEGORY.COMMUNICATION;
  }

  if (
    type === DOCUMENT_EVENT_TYPE.paid ||
    type === DOCUMENT_EVENT_TYPE.payment_intent ||
    type === DOCUMENT_EVENT_TYPE.payment_processing ||
    type === DOCUMENT_EVENT_TYPE.payment_failed ||
    type === DOCUMENT_EVENT_TYPE.payment_cancelled ||
    type === DOCUMENT_EVENT_TYPE.payment_refunded ||
    type === DOCUMENT_EVENT_TYPE.payment_partially_refunded
  ) {
    return CLIENT_TIMELINE_CATEGORY.PAYMENTS;
  }

  if (kind === "quote" || type.startsWith("quote_")) return CLIENT_TIMELINE_CATEGORY.QUOTES;
  if (kind === "invoice" || type.startsWith("invoice_")) return CLIENT_TIMELINE_CATEGORY.INVOICES;
  return CLIENT_TIMELINE_CATEGORY.DOCUMENTS;
}

export function eventMatchesCategory(item, category) {
  const wanted = normalizeTimelineCategory(category);
  if (wanted === CLIENT_TIMELINE_CATEGORY.ALL) return true;
  const actual = item?.category || timelineEventCategory(item);
  if (wanted === CLIENT_TIMELINE_CATEGORY.DOCUMENTS) {
    return (
      actual === CLIENT_TIMELINE_CATEGORY.DOCUMENTS ||
      actual === CLIENT_TIMELINE_CATEGORY.QUOTES ||
      actual === CLIENT_TIMELINE_CATEGORY.INVOICES
    );
  }
  if (wanted === CLIENT_TIMELINE_CATEGORY.REMINDERS) {
    return actual === CLIENT_TIMELINE_CATEGORY.REMINDERS;
  }
  return actual === wanted;
}

function documentLabel(item) {
  const kind = String(item.documentType || item.sourceKind || "").toLowerCase();
  const number = item.documentNumber || item.metadata?.invoice_number || item.metadata?.quote_number;
  if (number && kind === "quote") return `Quote #${number}`;
  if (number && kind === "invoice") return `Invoice #${number}`;
  if (number) return `#${number}`;
  if (kind === "quote") return "Quote";
  if (kind === "invoice") return "Invoice";
  return "";
}

export function formatPaymentTermsLabel(terms, days) {
  if (!terms && days == null) return "";
  if (terms === "due_on_receipt") return "Due on receipt";
  if (terms === "custom") return `Net ${days || 30} days`;
  if (String(terms || "").startsWith("net_")) {
    return `Net ${String(terms).split("_")[1]} days`;
  }
  if (days != null && days !== "") return `Net ${days} days`;
  return String(terms || "").replace(/_/g, " ");
}

export function formatClientFieldChange(field, fromValue, toValue) {
  const key = String(field || "").trim();
  const label = PROFILE_FIELD_LABELS[key] || key.replace(/_/g, " ");
  if (key === "payment_terms" || key === "payment_terms_days") {
    return {
      title: "Payment terms changed",
      description: [fromValue ? `From: ${fromValue}` : null, toValue ? `To: ${toValue}` : null]
        .filter(Boolean)
        .join(" · "),
    };
  }
  return {
    title: `${label} updated`,
    description: [fromValue ? `From: ${fromValue}` : null, toValue ? `To: ${toValue}` : null]
      .filter(Boolean)
      .join(" · "),
  };
}

const DOCUMENT_EVENT_TITLES = Object.freeze({
  created: { quote: "Quote created", invoice: "Invoice created", default: "Document created" },
  sent: { quote: "Quote sent to client", invoice: "Invoice sent", default: "Sent to client" },
  opened: { quote: "Client opened quote", invoice: "Client opened invoice", default: "Client opened document" },
  clicked: { quote: "Quote link clicked", invoice: "Payment link clicked", default: "Link clicked" },
  accepted: { quote: "Client accepted quote", default: "Quote accepted" },
  rejected: { quote: "Client rejected quote", default: "Quote rejected" },
  expired: { quote: "Quote expired", default: "Quote expired" },
  converted_to_invoice: { quote: "Quote converted to invoice", default: "Converted to invoice" },
  converted: { quote: "Quote converted", default: "Converted" },
  paid: { invoice: "Payment received", default: "Payment received" },
  payment_intent: { invoice: "Payment started", default: "Payment intent created" },
  payment_processing: { default: "Payment processing" },
  payment_failed: { default: "Payment failed" },
  payment_cancelled: { default: "Payment cancelled" },
  payment_refunded: { default: "Payment refunded" },
  payment_partially_refunded: { default: "Payment partially refunded" },
  reminded: { quote: "Quote follow-up sent", invoice: "Invoice payment reminder sent", default: "Reminder sent" },
  viewed_not_paid: { invoice: "Invoice viewed but unpaid", default: "Viewed, still unpaid" },
  due_soon: { invoice: "Invoice due soon", default: "Due soon" },
  due_today: { invoice: "Invoice due today", default: "Due today" },
  overdue: { invoice: "Invoice overdue", default: "Overdue" },
  created_from_quote: { invoice: "Invoice created from quote", default: "Created from quote" },
  status_changed: { default: "Status changed" },
  updated: { default: "Details updated" },
  email_sent: { default: "Email sent" },
  email_delivered: { default: "Email delivered" },
  email_failed: { default: "Email failed" },
  email_opened: { default: "Email opened" },
  email_clicked: { default: "Email clicked" },
  message_sent: { default: "Message sent" },
  message_delivered: { default: "Message delivered" },
  message_failed: { default: "Message failed" },
  message_received: { default: "Message received" },
  client_created: { default: "Client created" },
  client_updated: { default: "Client information updated" },
  note_added: { default: "Internal note" },
  note_updated: { default: "Internal note updated" },
  note_archived: { default: "Internal note archived" },
  follow_up_required: { default: "Follow-up required" },
  client_contacted: { default: "Client contacted" },
  meeting_held: { default: "Meeting held" },
  call_completed: { default: "Call completed" },
  revision_requested: { default: "Client requested revision" },
  new_quote_requested: { default: "Client requested new quote" },
  payment_extension_requested: { default: "Client requested payment extension" },
});

export function formatTimelineEventTitle(item) {
  const type = String(item?.eventType || item?.event_type || "").trim().toLowerCase();
  const kind = String(item?.documentType || item?.sourceKind || item?.document_type || "").toLowerCase();
  if (type === "client_updated") {
    const field = item?.metadata?.field || item?.metadata?.changed_fields?.[0];
    if (field) {
      return formatClientFieldChange(field, item.metadata.from, item.metadata.to).title;
    }
  }
  const map = DOCUMENT_EVENT_TITLES[type];
  if (!map) {
    return type
      ? type
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : "Activity";
  }
  return map[kind] || map.default || "Activity";
}

export function formatTimelineEventDescription(item) {
  const type = String(item?.eventType || "").trim().toLowerCase();
  const parts = [];
  const doc = documentLabel(item);
  if (doc) parts.push(doc);
  if (item.amount != null && Number.isFinite(Number(item.amount))) {
    parts.push(item.amountFormatted || String(item.amount));
  }
  if (type === "client_updated") {
    const change = formatClientFieldChange(
      item.metadata?.field,
      item.metadata?.from,
      item.metadata?.to
    );
    if (change.description) return change.description;
  }
  if (type === "note_added" || type === "note_updated") {
    return String(item.metadata?.preview || item.description || "").trim();
  }
  if (item.metadata?.subject) parts.push(String(item.metadata.subject));
  if (item.description && !parts.includes(item.description)) parts.push(item.description);
  return parts.filter(Boolean).join(" · ");
}

export function canViewInternalNotes(membership) {
  const role = String(membership?.companyRole || membership?.role || "").toLowerCase();
  const membershipRole = String(membership?.membershipRole || "").toLowerCase();
  if (membershipRole === "owner" || membership?.isOrgOwner) return true;
  return role === "admin" || role === "manager";
}

export function canMutateClientTimeline(membership) {
  return canViewInternalNotes(membership);
}

export function eventTouchesLastActivity(eventType, source = "document") {
  const type = String(eventType || "").trim().toLowerCase();
  if (source === "relationship") return LAST_ACTIVITY_RELATIONSHIP_EVENT_TYPES.includes(type);
  return LAST_ACTIVITY_DOCUMENT_EVENT_TYPES.includes(type);
}

export function buildTimelineHref(item) {
  const kind = String(item?.documentType || item?.sourceKind || "").toLowerCase();
  const id = item?.documentId || item?.sourceId;
  if (id && (kind === "invoice" || kind === "quote")) {
    return `/ViewDocument/${kind}/${encodeURIComponent(id)}`;
  }
  if (item?.noteId) return null;
  return null;
}

export function normalizeTimelineItem(raw = {}) {
  const eventType = String(raw.eventType || raw.event_type || "").trim().toLowerCase();
  const sourceKind = String(raw.sourceKind || raw.source_kind || raw.documentType || raw.document_type || "").trim().toLowerCase();
  const occurredAt = raw.occurredAt || raw.occurred_at || raw.created_at || raw.sent_at || new Date(0).toISOString();
  const metadata = raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {};
  const item = {
    id: String(raw.id || ""),
    origin: raw.origin || "document_events",
    eventType,
    sourceKind,
    documentType: String(raw.documentType || raw.document_type || sourceKind || "").toLowerCase(),
    documentId: raw.documentId || raw.document_id || raw.sourceId || raw.source_id || null,
    documentNumber: raw.documentNumber || raw.document_number || metadata.invoice_number || metadata.quote_number || null,
    clientId: raw.clientId || raw.client_id || null,
    actorType: mapActorType(raw.actorType || raw.actor_type),
    actorId: raw.actorId || raw.actor_id || raw.actor_user_id || null,
    source: raw.source || metadata.source || metadata.provider || null,
    occurredAt,
    amount: raw.amount != null ? money(raw.amount) : metadata.amount != null ? money(metadata.amount) : null,
    currency: raw.currency || metadata.currency || null,
    status: raw.status || metadata.status || null,
    noteId: raw.noteId || raw.note_id || metadata.note_id || null,
    paymentIntentId: raw.paymentIntentId || raw.payment_intent_id || metadata.payment_intent_id || null,
    paymentId: raw.paymentId || raw.payment_id || metadata.payment_id || null,
    metadata,
    description: raw.description || null,
    searchable: String(raw.searchable || "").toLowerCase(),
  };
  item.category = timelineEventCategory(item);
  item.title = raw.title || formatTimelineEventTitle(item);
  item.description = raw.description || formatTimelineEventDescription(item);
  item.actorLabel = raw.actorLabel || formatActorLabel(item.actorType, { ...metadata, provider: item.source, actor_name: raw.actorName });
  item.href = raw.href || buildTimelineHref(item);
  item.highVisibility = HIGH_VISIBILITY_EVENT_TYPES.includes(item.eventType);
  return item;
}

export function timelineItemSearchText(item) {
  return [
    item.searchable,
    item.title,
    item.description,
    item.documentNumber,
    item.eventType,
    item.metadata?.subject,
    item.metadata?.preview,
    item.metadata?.recipient,
    item.metadata?.reference,
    item.paymentIntentId,
    item.paymentId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesTimelineSearch(item, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return timelineItemSearchText(item).includes(q);
}

export function mergeTimelineItems(lists = []) {
  const sources =
    Array.isArray(lists) && lists.length && !Array.isArray(lists[0]) && (lists[0]?.eventType || lists[0]?.event_type || lists[0]?.id)
      ? [lists]
      : lists;
  const seen = new Set();
  const out = [];
  for (const list of sources) {
    for (const raw of Array.isArray(list) ? list : []) {
      const item = raw?.eventType || raw?.event_type ? normalizeTimelineItem(raw) : raw;
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  out.sort((a, b) => {
    const tb = Date.parse(b.occurredAt) || 0;
    const ta = Date.parse(a.occurredAt) || 0;
    if (tb !== ta) return tb - ta;
    return String(b.id).localeCompare(String(a.id));
  });
  return out;
}

export function groupTimelineItems(items, windowMs = CLIENT_TIMELINE_GROUP_WINDOW_MS) {
  const list = Array.isArray(items) ? items : [];
  const grouped = [];
  let i = 0;
  while (i < list.length) {
    const current = list[i];
    const canGroup =
      current &&
      !current.highVisibility &&
      GROUPABLE_EVENT_TYPES.includes(current.eventType) &&
      current.documentId;
    if (!canGroup) {
      grouped.push(current);
      i += 1;
      continue;
    }
    const bucket = [current];
    let j = i + 1;
    const startMs = Date.parse(current.occurredAt) || 0;
    while (j < list.length) {
      const next = list[j];
      const nextMs = Date.parse(next?.occurredAt) || 0;
      if (next?.highVisibility) break;
      if (!GROUPABLE_EVENT_TYPES.includes(next?.eventType)) break;
      if (next.documentId !== current.documentId) break;
      if (Math.abs(startMs - nextMs) > windowMs) break;
      bucket.push(next);
      j += 1;
    }
    if (bucket.length >= 2) {
      grouped.push({
        id: `group:${current.documentId}:${current.id}`,
        kind: "group",
        title: current.documentType === "quote" ? "Quote activity" : "Invoice activity",
        occurredAt: current.occurredAt,
        documentId: current.documentId,
        documentType: current.documentType,
        documentNumber: current.documentNumber,
        href: current.href,
        events: bucket,
      });
      i = j;
    } else {
      grouped.push(current);
      i += 1;
    }
  }
  return grouped;
}

export function paginateTimelineItems(items, { cursor = null, limit = CLIENT_TIMELINE_PAGE_SIZE } = {}) {
  const size = Math.min(CLIENT_TIMELINE_MAX_PAGE_SIZE, Math.max(1, Number(limit) || CLIENT_TIMELINE_PAGE_SIZE));
  const list = Array.isArray(items) ? items : [];
  let start = 0;
  if (cursor) {
    const idx = list.findIndex((item) => item.id === cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const slice = list.slice(start, start + size);
  const last = slice[slice.length - 1];
  return {
    items: slice,
    nextCursor: slice.length === size && last ? last.id : null,
    hasMore: start + slice.length < list.length,
  };
}

export function computeClientRelationshipSummary({
  invoices = [],
  quotes = [],
  payments = [],
  lastActivityAt = null,
} = {}) {
  const inv = Array.isArray(invoices) ? invoices : [];
  const quo = Array.isArray(quotes) ? quotes : [];
  const pays = Array.isArray(payments) ? payments.filter(isConfirmedInvoicePayment) : [];
  const totalInvoiced = money(inv.reduce((sum, row) => sum + money(row.total_amount), 0));
  const totalPaid = money(pays.reduce((sum, row) => sum + money(row.amount), 0));
  const outstanding = money(
    inv
      .filter((row) => isInvoiceOpenReceivable(row.status))
      .reduce((sum, row) => sum + invoiceAmountDue(row, pays.filter((p) => String(p.invoice_id) === String(row.id))), 0)
  );
  const overdue = money(
    inv
      .filter((row) => {
        if (!isInvoiceOpenReceivable(row.status)) return false;
        if (normalizeInvoiceStatus(row.status) === INVOICE_STATUS.overdue) return true;
        const due = row.delivery_date || row.due_date;
        if (!due) return false;
        const dueAt = new Date(due);
        return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now() && invoiceAmountDue(row, pays) > 0.009;
      })
      .reduce((sum, row) => sum + invoiceAmountDue(row, pays.filter((p) => String(p.invoice_id) === String(row.id))), 0)
  );
  const acceptedQuotes = quo.filter((row) => {
    const status = normalizeQuoteStatus(row.status);
    return status === QUOTE_STATUS.accepted || status === QUOTE_STATUS.converted;
  });
  const paidInvoices = inv.filter((row) => normalizeInvoiceStatus(row.status) === INVOICE_STATUS.paid);
  const lastPayment = pays
    .map((row) => row.paid_at || row.created_at)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;

  return {
    totalInvoiced,
    totalPaid,
    outstanding,
    overdue,
    quotes: quo.length,
    quotesAccepted: acceptedQuotes.length,
    invoices: inv.length,
    invoicesPaid: paidInvoices.length,
    lastActivityAt: lastActivityAt || null,
    lastPaymentAt: lastPayment,
  };
}

export function computeClientAttention({ invoices = [], quotes = [], payments = [], events = [] } = {}) {
  const pays = Array.isArray(payments) ? payments : [];
  const overdueInvoices = (invoices || []).filter((row) => {
    if (!isInvoiceOpenReceivable(row.status)) return false;
    if (normalizeInvoiceStatus(row.status) === INVOICE_STATUS.overdue) return true;
    const due = row.delivery_date || row.due_date;
    if (!due) return false;
    const dueAt = new Date(due);
    return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now() && invoiceAmountDue(row, pays.filter((p) => String(p.invoice_id) === String(row.id))) > 0.009;
  });
  const awaitingQuotes = (quotes || []).filter((row) => {
    const status = normalizeQuoteStatus(row.status);
    return status === QUOTE_STATUS.sent || status === QUOTE_STATUS.viewed;
  });
  const failedPayments = (events || []).filter((ev) => String(ev.eventType || ev.event_type) === DOCUMENT_EVENT_TYPE.payment_failed);
  const followUps = (events || []).filter((ev) => String(ev.eventType || ev.event_type) === CLIENT_RELATIONSHIP_EVENT_TYPE.follow_up_required);

  const items = [];
  for (const inv of overdueInvoices) {
    items.push({
      id: `overdue:${inv.id}`,
      kind: "overdue_invoice",
      label: `Overdue invoice${inv.invoice_number ? ` #${inv.invoice_number}` : ""}`,
      href: `/ViewDocument/invoice/${encodeURIComponent(inv.id)}`,
      documentId: inv.id,
    });
  }
  for (const quote of awaitingQuotes) {
    items.push({
      id: `quote-awaiting:${quote.id}`,
      kind: "quote_awaiting",
      label: `Quote awaiting response${quote.quote_number ? ` #${quote.quote_number}` : ""}`,
      href: `/ViewDocument/quote/${encodeURIComponent(quote.id)}`,
      documentId: quote.id,
    });
  }
  const seenFailed = new Set();
  for (const ev of failedPayments) {
    const key = ev.paymentIntentId || ev.documentId || ev.id;
    if (seenFailed.has(key)) continue;
    seenFailed.add(key);
    items.push({
      id: `failed:${key}`,
      kind: "payment_failed",
      label: "Payment failed",
      href: ev.href || (ev.documentId ? `/ViewDocument/invoice/${encodeURIComponent(ev.documentId)}` : null),
      documentId: ev.documentId || null,
    });
  }
  for (const ev of followUps) {
    items.push({
      id: `follow-up:${ev.id}`,
      kind: "follow_up",
      label: "Client follow-up due",
      href: null,
      documentId: ev.documentId || null,
    });
  }
  return items;
}

export function computeClientEngagementSignals({ invoices = [], quotes = [], payments = [], events = [] } = {}) {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
  const list = Array.isArray(events) ? events : [];
  const opens = list.filter((ev) => {
    const type = String(ev.eventType || ev.event_type);
    const at = Date.parse(ev.occurredAt || ev.occurred_at || "") || 0;
    return (type === DOCUMENT_EVENT_TYPE.opened || type === "email_opened") && at >= twoWeeksAgo;
  });
  const recentOpens = opens.filter((ev) => (Date.parse(ev.occurredAt || ev.occurred_at || "") || 0) >= weekAgo);
  const paidCount = (invoices || []).filter((row) => normalizeInvoiceStatus(row.status) === INVOICE_STATUS.paid).length;
  const invoiceCount = (invoices || []).length;
  const unpaidViewed = list.some((ev) => String(ev.eventType || ev.event_type) === DOCUMENT_EVENT_TYPE.viewed_not_paid);
  const recentQuotesSilent = (quotes || []).some((row) => {
    const status = normalizeQuoteStatus(row.status);
    if (status !== QUOTE_STATUS.sent && status !== QUOTE_STATUS.viewed) return false;
    const sentAt = Date.parse(row.sent_date || row.sent_at || row.created_at || "") || 0;
    if (!sentAt || now - sentAt < 7 * 24 * 60 * 60 * 1000) return false;
    const responded = list.some((ev) => {
      const id = ev.documentId || ev.source_id;
      const type = String(ev.eventType || ev.event_type);
      return String(id) === String(row.id) && (type === DOCUMENT_EVENT_TYPE.accepted || type === DOCUMENT_EVENT_TYPE.rejected || type === DOCUMENT_EVENT_TYPE.opened);
    });
    return !responded && status === QUOTE_STATUS.sent;
  });

  const signals = [];
  if (opens.length >= 3) signals.push({ id: "highly_engaged", label: "Highly engaged" });
  if (recentOpens.length) signals.push({ id: "recently_viewed", label: "Recently viewed documents" });
  if (invoiceCount >= 3 && paidCount / invoiceCount >= 0.8) {
    signals.push({ id: "pays_consistently", label: "Pays invoices consistently" });
  }
  if (unpaidViewed) signals.push({ id: "viewed_unpaid", label: "Invoice viewed but unpaid" });
  if (recentQuotesSilent) signals.push({ id: "quote_no_response", label: "No response to recent quote" });
  const overdueOpen = (invoices || []).some((row) => isInvoiceOpenReceivable(row.status) && normalizeInvoiceStatus(row.status) === INVOICE_STATUS.overdue);
  if (overdueOpen || recentQuotesSilent) signals.push({ id: "needs_follow_up", label: "Needs follow-up" });
  return signals;
}

export function messageLogToTimelineItems(log) {
  if (!log?.id) return [];
  const items = [];
  const channel = String(log.channel || "email").toLowerCase();
  const prefix = channel === "email" ? "email" : "message";
  const base = {
    origin: "message_logs",
    sourceKind: String(log.document_type || "").toLowerCase() || null,
    documentType: String(log.document_type || "").toLowerCase() || null,
    documentId: log.document_id || null,
    clientId: log.client_id || null,
    actorType: CLIENT_TIMELINE_ACTOR.SYSTEM,
    source: "email_provider",
    metadata: {
      channel: log.channel || "email",
      recipient: log.recipient || null,
      tracking_token: log.tracking_token || null,
      delivery_status: log.viewed ? "opened" : "sent",
    },
    searchable: [log.recipient, log.tracking_token, log.document_id].filter(Boolean).join(" "),
  };
  if (log.sent_at || log.created_at) {
    items.push(
      normalizeTimelineItem({
        ...base,
        id: `msglog:${log.id}:sent`,
        eventType: `${prefix}_sent`,
        occurredAt: log.sent_at || log.created_at,
        actorType: CLIENT_TIMELINE_ACTOR.USER,
      })
    );
  }
  if (log.opened_at) {
    items.push(
      normalizeTimelineItem({
        ...base,
        id: `msglog:${log.id}:opened`,
        eventType: `${prefix}_opened`,
        occurredAt: log.opened_at,
        actorType: CLIENT_TIMELINE_ACTOR.CLIENT,
      })
    );
  }
  if (log.clicked_at) {
    items.push(
      normalizeTimelineItem({
        ...base,
        id: `msglog:${log.id}:clicked`,
        eventType: `${prefix}_clicked`,
        occurredAt: log.clicked_at,
        actorType: CLIENT_TIMELINE_ACTOR.CLIENT,
      })
    );
  }
  return items;
}

export function paymentRowToTimelineItem(payment, invoiceNumber = null) {
  if (!payment?.id) return null;
  return normalizeTimelineItem({
    id: `payment:${payment.id}`,
    origin: "payments",
    eventType: DOCUMENT_EVENT_TYPE.paid,
    sourceKind: "invoice",
    documentType: "invoice",
    documentId: payment.invoice_id || null,
    documentNumber: invoiceNumber,
    clientId: payment.client_id || null,
    actorType: CLIENT_TIMELINE_ACTOR.PAYMENT_GATEWAY,
    source: payment.method || "payment",
    occurredAt: payment.paid_at || payment.created_at,
    amount: payment.amount,
    metadata: {
      payment_id: payment.id,
      payment_reference: payment.reference || null,
      provider: payment.method || null,
      source: payment.method || "payment",
    },
    searchable: [payment.reference, invoiceNumber, payment.id].filter(Boolean).join(" "),
  });
}

export function paymentIntentFallbackItem(intent, invoiceNumber = null) {
  const eventType = documentPaymentEventTypeForStatus(intent?.status);
  if (!intent?.id || !eventType || eventType === DOCUMENT_EVENT_TYPE.paid) return null;
  if (String(intent.source_kind || "") !== "document") return null;
  return normalizeTimelineItem({
    id: `intent:${intent.id}:${eventType}`,
    origin: "payment_intents",
    eventType,
    sourceKind: "invoice",
    documentType: "invoice",
    documentId: intent.document_id || null,
    documentNumber: invoiceNumber,
    clientId: intent.client_id || null,
    actorType: CLIENT_TIMELINE_ACTOR.PAYMENT_GATEWAY,
    source: intent.provider || "ozow",
    occurredAt: intent.updated_at || intent.created_at,
    amount: intent.amount,
    paymentIntentId: intent.id,
    metadata: {
      payment_intent_id: intent.id,
      provider: intent.provider || null,
      status: intent.status,
    },
    searchable: [intent.id, invoiceNumber, intent.external_id].filter(Boolean).join(" "),
  });
}
