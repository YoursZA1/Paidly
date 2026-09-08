import { isInvoiceOpenReceivable, normalizeInvoiceStatus, normalizeQuoteStatus, QUOTE_STATUS } from "../commercial/documentStatuses.js";
import { invoiceAmountDue, isConfirmedInvoicePayment } from "../payments/invoiceBalance.js";
import {
  DOCUMENT_EVENT_SOURCE,
  DOCUMENT_EVENT_TYPE,
  documentEventOccurredAt,
  firstEventOfType,
} from "./documentEvents.js";

function hoursBetween(a, b) {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / (60 * 60 * 1000);
}

function average(values) {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 10) / 10;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function eventSource(event) {
  return String(event?.source_kind || event?.document_type || "").toLowerCase();
}

function isPaymentCtaClick(event) {
  if (eventSource(event) !== DOCUMENT_EVENT_SOURCE.INVOICE) return false;
  if (String(event?.event_type || "") !== DOCUMENT_EVENT_TYPE.clicked) return false;
  const action = String(event?.payload?.action || event?.metadata?.action || "").toLowerCase();
  return action === "payment_cta" || action === "pay_now" || action === "payment_link" || action === "primary_cta";
}

function ofKind(events, kind) {
  return (Array.isArray(events) ? events : []).filter((event) => eventSource(event) === kind);
}

function countDocs(events, eventType) {
  return new Set(
    events.filter((e) => e.event_type === eventType).map((e) => e.source_id || e.document_id)
  ).size;
}

export function computeQuoteEngagementMetrics({ events = [], quotes = [] } = {}) {
  const quoteEvents = ofKind(events, DOCUMENT_EVENT_SOURCE.QUOTE);
  const rows = Array.isArray(quotes) ? quotes : [];
  const byDoc = new Map();
  for (const event of quoteEvents) {
    const id = String(event.source_id || event.document_id || "");
    if (!id) continue;
    if (!byDoc.has(id)) byDoc.set(id, []);
    byDoc.get(id).push(event);
  }
  const acceptHours = [];
  for (const [, docEvents] of byDoc) {
    const sent = firstEventOfType(docEvents, DOCUMENT_EVENT_TYPE.sent);
    const accepted = firstEventOfType(docEvents, DOCUMENT_EVENT_TYPE.accepted);
    if (sent && accepted) acceptHours.push(hoursBetween(sent.at, accepted.at));
  }
  const acceptedRows = rows.filter((quote) => {
    const status = normalizeQuoteStatus(quote.status);
    return status === QUOTE_STATUS.accepted || status === QUOTE_STATUS.converted;
  });
  const convertedRows = rows.filter((quote) => normalizeQuoteStatus(quote.status) === QUOTE_STATUS.converted);
  const sentCount = Math.max(countDocs(quoteEvents, DOCUMENT_EVENT_TYPE.sent), rows.filter((q) => normalizeQuoteStatus(q.status) !== QUOTE_STATUS.draft).length);
  return {
    quotesCreated: countDocs(quoteEvents, DOCUMENT_EVENT_TYPE.created) || rows.length,
    quotesSent: countDocs(quoteEvents, DOCUMENT_EVENT_TYPE.sent),
    quotesOpened: countDocs(quoteEvents, DOCUMENT_EVENT_TYPE.opened),
    quotesAccepted: countDocs(quoteEvents, DOCUMENT_EVENT_TYPE.accepted) || acceptedRows.length,
    quotesRejected: countDocs(quoteEvents, DOCUMENT_EVENT_TYPE.rejected) || rows.filter((q) => normalizeQuoteStatus(q.status) === QUOTE_STATUS.declined).length,
    quotesExpired: countDocs(quoteEvents, DOCUMENT_EVENT_TYPE.expired) || rows.filter((q) => normalizeQuoteStatus(q.status) === QUOTE_STATUS.expired).length,
    quotesConverted: countDocs(quoteEvents, DOCUMENT_EVENT_TYPE.converted_to_invoice) || convertedRows.length,
    acceptanceRate: sentCount ? Math.round((acceptedRows.length / sentCount) * 1000) / 10 : null,
    averageHoursToAcceptance: average(acceptHours),
    averageQuoteValue: rows.length ? money(rows.reduce((sum, q) => sum + money(q.total_amount || q.total), 0) / rows.length) : 0,
    quoteConversionValue: money(convertedRows.reduce((sum, q) => sum + money(q.total_amount || q.total), 0)),
    quotedValue: money(rows.reduce((sum, q) => sum + money(q.total_amount || q.total), 0)),
  };
}

export function computeInvoiceEngagementMetrics({ events = [], invoices = [], payments = [] } = {}) {
  const invoiceEvents = ofKind(events, DOCUMENT_EVENT_SOURCE.INVOICE);
  const invoiceRows = Array.isArray(invoices) ? invoices : [];
  const confirmed = (Array.isArray(payments) ? payments : []).filter(isConfirmedInvoicePayment);
  const paidEvents = invoiceEvents.filter((e) => e.event_type === DOCUMENT_EVENT_TYPE.paid);
  const byDoc = new Map();
  for (const event of invoiceEvents) {
    const id = String(event.source_id || event.document_id || "");
    if (!id) continue;
    if (!byDoc.has(id)) byDoc.set(id, []);
    byDoc.get(id).push(event);
  }
  const sentToOpened = [];
  const openedToPaid = [];
  const sentToPaid = [];
  for (const [, docEvents] of byDoc) {
    const firstSent = firstEventOfType(docEvents, DOCUMENT_EVENT_TYPE.sent);
    const firstOpened = firstEventOfType(docEvents, DOCUMENT_EVENT_TYPE.opened);
    const firstPaid = firstEventOfType(docEvents, DOCUMENT_EVENT_TYPE.paid);
    if (firstSent && firstOpened) sentToOpened.push(hoursBetween(firstSent.at, firstOpened.at));
    if (firstOpened && firstPaid) openedToPaid.push(hoursBetween(firstOpened.at, firstPaid.at));
    if (firstSent && firstPaid) sentToPaid.push(hoursBetween(firstSent.at, firstPaid.at));
  }

  const overdueDocuments = invoiceRows.filter((invoice) => {
    const status = normalizeInvoiceStatus(invoice.status);
    if (status === "overdue") return true;
    if (!isInvoiceOpenReceivable(status)) return false;
    const due = invoice.delivery_date || invoice.due_date;
    if (!due) return false;
    const dueAt = new Date(due);
    if (Number.isNaN(dueAt.getTime())) return false;
    const duePayments = confirmed.filter((row) => String(row.invoice_id) === String(invoice.id));
    return invoiceAmountDue(invoice, duePayments) > 0.009 && dueAt.getTime() < Date.now();
  });

  const invoicedValue = money(invoiceRows.reduce((sum, inv) => sum + money(inv.total_amount || inv.total), 0));
  const paidValue = money(confirmed.reduce((sum, row) => sum + money(row.amount), 0));
  const outstandingValue = money(
    invoiceRows
      .filter((inv) => isInvoiceOpenReceivable(inv.status))
      .reduce((sum, inv) => {
        const duePayments = confirmed.filter((row) => String(row.invoice_id) === String(inv.id));
        return sum + invoiceAmountDue(inv, duePayments);
      }, 0)
  );
  const overdueValue = money(
    overdueDocuments.reduce((sum, inv) => {
      const duePayments = confirmed.filter((row) => String(row.invoice_id) === String(inv.id));
      return sum + invoiceAmountDue(inv, duePayments);
    }, 0)
  );

  return {
    invoicesCreated: countDocs(invoiceEvents, DOCUMENT_EVENT_TYPE.created) || invoiceRows.length,
    invoicesSent: countDocs(invoiceEvents, DOCUMENT_EVENT_TYPE.sent),
    invoicesOpened: countDocs(invoiceEvents, DOCUMENT_EVENT_TYPE.opened),
    paymentCtaClicks: invoiceEvents.filter(isPaymentCtaClick).length,
    viewedButUnpaid: countDocs(invoiceEvents, DOCUMENT_EVENT_TYPE.viewed_not_paid),
    paymentIntents: countDocs(invoiceEvents, DOCUMENT_EVENT_TYPE.payment_intent),
    remindersSent: invoiceEvents.filter((e) => e.event_type === DOCUMENT_EVENT_TYPE.reminded).length,
    dueSoon: countDocs(invoiceEvents, DOCUMENT_EVENT_TYPE.due_soon),
    dueToday: countDocs(invoiceEvents, DOCUMENT_EVENT_TYPE.due_today),
    overdueDocuments: overdueDocuments.length,
    paidDocuments: new Set(paidEvents.map((e) => e.source_id || e.document_id)).size,
    averageHoursSentToOpened: average(sentToOpened),
    averageHoursOpenedToPaid: average(openedToPaid),
    averageHoursSentToPaid: average(sentToPaid),
    invoicedValue,
    paidValue,
    outstandingValue,
    overdueValue,
  };
}

/**
 * Split funnel. Quote value is never treated as revenue.
 */
export function computeDocumentEngagementMetrics({
  events = [],
  invoices = [],
  payments = [],
  quotes = [],
} = {}) {
  const quotesMetrics = computeQuoteEngagementMetrics({ events, quotes });
  const invoicesMetrics = computeInvoiceEngagementMetrics({ events, invoices, payments });
  return {
    quotes: quotesMetrics,
    invoices: invoicesMetrics,
    quotedValue: quotesMetrics.quotedValue,
    invoicedValue: invoicesMetrics.invoicedValue,
    paidValue: invoicesMetrics.paidValue,
    outstandingValue: invoicesMetrics.outstandingValue,
    overdueValue: invoicesMetrics.overdueValue,
    documentsSent: invoicesMetrics.invoicesSent,
    documentsOpened: invoicesMetrics.invoicesOpened,
    paymentCtaClicks: invoicesMetrics.paymentCtaClicks,
    viewedButUnpaid: invoicesMetrics.viewedButUnpaid,
    remindersSent: invoicesMetrics.remindersSent,
    paidDocuments: invoicesMetrics.paidDocuments,
    overdueDocuments: invoicesMetrics.overdueDocuments,
    averageHoursSentToOpened: invoicesMetrics.averageHoursSentToOpened,
    averageHoursOpenedToPaid: invoicesMetrics.averageHoursOpenedToPaid,
    averageHoursSentToPaid: invoicesMetrics.averageHoursSentToPaid,
  };
}

export function documentEventOccurredAtSafe(event) {
  return documentEventOccurredAt(event);
}
