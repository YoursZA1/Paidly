/**
 * Document Observe contract — immutable activity timeline.
 * Invoice/quote rows remain source of truth for status, due date, and money.
 */

export const DOCUMENT_EVENT_SOURCE = Object.freeze({
  HUB: "hub",
  INVOICE: "invoice",
  QUOTE: "quote",
  PAYSLIP: "payslip",
});

export const DOCUMENT_EVENT_TYPE = Object.freeze({
  created: "created",
  updated: "updated",
  sent: "sent",
  opened: "opened",
  clicked: "clicked",
  paid: "paid",
  reminded: "reminded",
  viewed_not_paid: "viewed_not_paid",
  due_soon: "due_soon",
  due_today: "due_today",
  overdue: "overdue",
  viewed: "viewed",
  accepted: "accepted",
  rejected: "rejected",
  expired: "expired",
  converted_to_invoice: "converted_to_invoice",
  payment_intent: "payment_intent",
  payment_processing: "payment_processing",
  payment_failed: "payment_failed",
  payment_cancelled: "payment_cancelled",
  payment_refunded: "payment_refunded",
  payment_partially_refunded: "payment_partially_refunded",
  status_changed: "status_changed",
  converted: "converted",
  created_from_quote: "created_from_quote",
  delivered: "delivered",
  failed: "failed",
  bounced: "bounced",
  downloaded: "downloaded",
});

/** Shared Observe events. Quotes never share invoice payment events. */
export const SHARED_DOCUMENT_EVENT_TYPES = Object.freeze([
  DOCUMENT_EVENT_TYPE.created,
  DOCUMENT_EVENT_TYPE.updated,
  DOCUMENT_EVENT_TYPE.sent,
  DOCUMENT_EVENT_TYPE.opened,
  DOCUMENT_EVENT_TYPE.clicked,
  DOCUMENT_EVENT_TYPE.reminded,
  DOCUMENT_EVENT_TYPE.viewed,
  DOCUMENT_EVENT_TYPE.status_changed,
]);

export const QUOTE_ONLY_EVENT_TYPES = Object.freeze([
  DOCUMENT_EVENT_TYPE.accepted,
  DOCUMENT_EVENT_TYPE.rejected,
  DOCUMENT_EVENT_TYPE.expired,
  DOCUMENT_EVENT_TYPE.converted_to_invoice,
  DOCUMENT_EVENT_TYPE.converted,
  DOCUMENT_EVENT_TYPE.created_from_quote,
]);

export const INVOICE_ONLY_EVENT_TYPES = Object.freeze([
  DOCUMENT_EVENT_TYPE.paid,
  DOCUMENT_EVENT_TYPE.viewed_not_paid,
  DOCUMENT_EVENT_TYPE.due_soon,
  DOCUMENT_EVENT_TYPE.due_today,
  DOCUMENT_EVENT_TYPE.overdue,
  DOCUMENT_EVENT_TYPE.payment_intent,
  DOCUMENT_EVENT_TYPE.payment_processing,
  DOCUMENT_EVENT_TYPE.payment_failed,
  DOCUMENT_EVENT_TYPE.payment_cancelled,
  DOCUMENT_EVENT_TYPE.payment_refunded,
  DOCUMENT_EVENT_TYPE.payment_partially_refunded,
  DOCUMENT_EVENT_TYPE.created_from_quote,
]);

export const QUOTE_EVENT_TYPES = Object.freeze([...SHARED_DOCUMENT_EVENT_TYPES, ...QUOTE_ONLY_EVENT_TYPES]);
export const INVOICE_EVENT_TYPES = Object.freeze([...SHARED_DOCUMENT_EVENT_TYPES, ...INVOICE_ONLY_EVENT_TYPES]);

/** Payslips never share invoice payment or quote decision events. */
export const PAYSLIP_EVENT_TYPES = Object.freeze([
  DOCUMENT_EVENT_TYPE.created,
  DOCUMENT_EVENT_TYPE.sent,
  DOCUMENT_EVENT_TYPE.delivered,
  DOCUMENT_EVENT_TYPE.opened,
  DOCUMENT_EVENT_TYPE.clicked,
  DOCUMENT_EVENT_TYPE.downloaded,
  DOCUMENT_EVENT_TYPE.failed,
  DOCUMENT_EVENT_TYPE.bounced,
]);

export const CANONICAL_ENGAGEMENT_EVENT_TYPES = Object.freeze([
  ...SHARED_DOCUMENT_EVENT_TYPES,
  ...QUOTE_ONLY_EVENT_TYPES,
  ...INVOICE_ONLY_EVENT_TYPES,
]);

export const DOCUMENT_EVENT_ACTOR = Object.freeze({
  SYSTEM: "system",
  USER: "user",
  RECIPIENT: "recipient",
  CLIENT: "client",
  WEBHOOK: "webhook",
  PAYMENT_GATEWAY: "payment_gateway",
  EMAIL_PROVIDER: "email_provider",
  AUTOMATION: "automation",
  API: "api",
});

export const OPEN_DEDUPE_MS = 30 * 60 * 1000;
export const CLICK_DEDUPE_MS = 10 * 60 * 1000;

export function normalizeDocumentEventSource(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (
    key === DOCUMENT_EVENT_SOURCE.HUB ||
    key === DOCUMENT_EVENT_SOURCE.INVOICE ||
    key === DOCUMENT_EVENT_SOURCE.QUOTE ||
    key === DOCUMENT_EVENT_SOURCE.PAYSLIP
  ) {
    return key;
  }
  return null;
}

export function documentEventSourceFromType(documentType) {
  const key = String(documentType || "").trim().toLowerCase();
  if (key === DOCUMENT_EVENT_SOURCE.QUOTE || key === "quotes") return DOCUMENT_EVENT_SOURCE.QUOTE;
  if (key === DOCUMENT_EVENT_SOURCE.PAYSLIP || key === "payslips") return DOCUMENT_EVENT_SOURCE.PAYSLIP;
  if (key === DOCUMENT_EVENT_SOURCE.HUB) return DOCUMENT_EVENT_SOURCE.HUB;
  if (key === DOCUMENT_EVENT_SOURCE.INVOICE || key === "invoices") return DOCUMENT_EVENT_SOURCE.INVOICE;
  return null;
}

export function assertDocumentEventSource(raw) {
  const source = normalizeDocumentEventSource(raw);
  if (source) return source;
  const error = new Error("Unknown document event source");
  error.code = "UNKNOWN_DOCUMENT_EVENT_SOURCE";
  throw error;
}

export function allowedEventTypesForSource(sourceKind) {
  const source = normalizeDocumentEventSource(sourceKind);
  if (source === DOCUMENT_EVENT_SOURCE.QUOTE) return QUOTE_EVENT_TYPES;
  if (source === DOCUMENT_EVENT_SOURCE.INVOICE) return INVOICE_EVENT_TYPES;
  if (source === DOCUMENT_EVENT_SOURCE.PAYSLIP) return PAYSLIP_EVENT_TYPES;
  return CANONICAL_ENGAGEMENT_EVENT_TYPES;
}

export function isEventAllowedForSource(sourceKind, eventType) {
  const type = String(eventType || "").trim().toLowerCase();
  const source = normalizeDocumentEventSource(sourceKind);
  if (!type || !source) return false;
  if (source === DOCUMENT_EVENT_SOURCE.HUB) return true;
  return allowedEventTypesForSource(source).includes(type);
}

export function assertEventAllowedForSource(sourceKind, eventType) {
  const source = assertDocumentEventSource(sourceKind);
  const type = String(eventType || "").trim().toLowerCase();
  if (isEventAllowedForSource(source, type)) return type;
  const error = new Error(
    source === DOCUMENT_EVENT_SOURCE.QUOTE
      ? "Quotes cannot record payment lifecycle events"
      : source === DOCUMENT_EVENT_SOURCE.PAYSLIP
        ? "Payslips cannot record invoice or quote lifecycle events"
        : "Invoices cannot record quote decision events"
  );
  error.code = "DOCUMENT_EVENT_TYPE_NOT_ALLOWED";
  throw error;
}

export function documentEventOccurredAt(event) {
  const raw = event?.occurred_at || event?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bucketIso(at, windowMs) {
  const t = at instanceof Date ? at.getTime() : new Date(at || Date.now()).getTime();
  const ms = Number.isFinite(t) ? t : Date.now();
  const size = Math.max(60 * 1000, Number(windowMs) || OPEN_DEDUPE_MS);
  return new Date(Math.floor(ms / size) * size).toISOString();
}

export function buildDocumentEventIdempotencyKey({
  eventType,
  sourceKind,
  sourceId,
  sendAttemptId,
  action,
  reminderType,
  dueDate,
  days,
  paymentIntentId,
  paymentId,
  invoiceId,
  channel,
  at,
} = {}) {
  const type = String(eventType || "").trim().toLowerCase();
  const source = String(sourceKind || "").trim().toLowerCase();
  const id = String(sourceId || "").trim();
  if (!type || !source || !id) return null;

  if (type === DOCUMENT_EVENT_TYPE.sent) {
    const attempt = String(sendAttemptId || "").trim();
    return attempt ? `sent:${source}:${id}:${attempt}` : `sent:${source}:${id}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.delivered) {
    const attempt = String(sendAttemptId || "").trim();
    return attempt ? `delivered:${source}:${id}:${attempt}` : `delivered:${source}:${id}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.failed || type === DOCUMENT_EVENT_TYPE.bounced) {
    const attempt = String(sendAttemptId || channel || "").trim();
    return attempt ? `${type}:${source}:${id}:${attempt}` : `${type}:${source}:${id}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.opened) {
    return `opened:${source}:${id}:${String(channel || "public")}:${bucketIso(at, OPEN_DEDUPE_MS)}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.clicked) {
    return `clicked:${source}:${id}:${String(action || "cta")}:${bucketIso(at, CLICK_DEDUPE_MS)}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.downloaded) {
    return `downloaded:${source}:${id}:${String(channel || "secure")}:${bucketIso(at, CLICK_DEDUPE_MS)}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.paid) {
    const ref = String(paymentIntentId || paymentId || "").trim();
    return ref ? `paid:${source}:${id}:${ref}` : `paid:${source}:${id}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.reminded) {
    return `reminded:${source}:${id}:${String(reminderType || "manual")}:${String(dueDate || "none")}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.viewed_not_paid) {
    return `viewed_not_paid:${source}:${id}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.due_soon) {
    return `due_soon:${source}:${id}:${String(dueDate || "")}:${Number(days) || 0}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.due_today) {
    return `due_today:${source}:${id}:${String(dueDate || "")}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.overdue) {
    return `overdue:${source}:${id}:${String(dueDate || "")}:${Number(days) || 0}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.converted_to_invoice) {
    const related = String(invoiceId || "").trim();
    return related ? `converted_to_invoice:${source}:${id}:${related}` : `converted_to_invoice:${source}:${id}`;
  }
  if (type === DOCUMENT_EVENT_TYPE.payment_intent) {
    const ref = String(paymentIntentId || "").trim();
    return ref ? `payment_intent:${source}:${id}:${ref}` : `payment_intent:${source}:${id}`;
  }
  if (
    type === DOCUMENT_EVENT_TYPE.payment_processing ||
    type === DOCUMENT_EVENT_TYPE.payment_failed ||
    type === DOCUMENT_EVENT_TYPE.payment_cancelled ||
    type === DOCUMENT_EVENT_TYPE.payment_refunded ||
    type === DOCUMENT_EVENT_TYPE.payment_partially_refunded
  ) {
    const ref = String(paymentIntentId || "").trim();
    return ref ? `${type}:${source}:${id}:${ref}` : `${type}:${source}:${id}`;
  }
  return `${type}:${source}:${id}`;
}

export function firstEventOfType(events, eventType) {
  const list = Array.isArray(events) ? events : [];
  const wanted = String(eventType || "");
  let earliest = null;
  for (const event of list) {
    if (String(event?.event_type || "") !== wanted) continue;
    const at = documentEventOccurredAt(event);
    if (!at) continue;
    if (!earliest || at < earliest.at) earliest = { event, at };
  }
  return earliest;
}

export function hasEventType(events, eventType) {
  return (Array.isArray(events) ? events : []).some((event) => String(event?.event_type || "") === eventType);
}
