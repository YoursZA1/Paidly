import { describe, expect, it } from "vitest";
import {
  DOCUMENT_EVENT_TYPE,
  assertEventAllowedForSource,
  isEventAllowedForSource,
} from "../../shared/documents/documentEvents.js";
import {
  evaluateQuoteFollowUpActions,
  quoteIsFollowUpable,
  quoteShouldExpire,
} from "../../shared/documents/quoteReminderRules.js";
import {
  evaluateInvoiceReminderActions,
  invoiceIsRemindable,
  normalizeReminderSettings,
} from "../../shared/documents/documentReminderRules.js";
import { computeDocumentEngagementMetrics } from "../../shared/documents/documentEngagementMetrics.js";
import { formatDocumentEventType } from "../../src/document-engine/documentEventLabels.js";
import { canConvertQuote, convertQuoteWithStore } from "../../shared/commercial/quoteInvoiceConversion.js";
import { QUOTE_STATUS } from "../../shared/commercial/documentStatuses.js";

const FORBIDDEN_QUOTE_EVENTS = [
  DOCUMENT_EVENT_TYPE.paid,
  DOCUMENT_EVENT_TYPE.viewed_not_paid,
  DOCUMENT_EVENT_TYPE.due_soon,
  DOCUMENT_EVENT_TYPE.due_today,
  DOCUMENT_EVENT_TYPE.overdue,
  DOCUMENT_EVENT_TYPE.payment_intent,
];

const FORBIDDEN_INVOICE_EVENTS = [
  DOCUMENT_EVENT_TYPE.accepted,
  DOCUMENT_EVENT_TYPE.rejected,
  DOCUMENT_EVENT_TYPE.expired,
  DOCUMENT_EVENT_TYPE.converted_to_invoice,
];

describe("quote vs invoice event allowlists", () => {
  it("allows quote decision events and rejects payment events", () => {
    expect(isEventAllowedForSource("quote", "accepted")).toBe(true);
    expect(isEventAllowedForSource("quote", "rejected")).toBe(true);
    expect(isEventAllowedForSource("quote", "expired")).toBe(true);
    expect(isEventAllowedForSource("quote", "converted_to_invoice")).toBe(true);
    expect(isEventAllowedForSource("quote", "reminded")).toBe(true);
    for (const eventType of FORBIDDEN_QUOTE_EVENTS) {
      expect(isEventAllowedForSource("quote", eventType)).toBe(false);
      expect(() => assertEventAllowedForSource("quote", eventType)).toThrow(/Quotes cannot record payment/);
    }
  });

  it("allows invoice payment events and rejects quote decision events", () => {
    expect(isEventAllowedForSource("invoice", "paid")).toBe(true);
    expect(isEventAllowedForSource("invoice", "overdue")).toBe(true);
    expect(isEventAllowedForSource("invoice", "payment_intent")).toBe(true);
    for (const eventType of FORBIDDEN_INVOICE_EVENTS) {
      expect(isEventAllowedForSource("invoice", eventType)).toBe(false);
      expect(() => assertEventAllowedForSource("invoice", eventType)).toThrow(/Invoices cannot record quote/);
    }
  });
});

describe("quote follow-ups", () => {
  const quote = {
    id: "q-1",
    status: "sent",
    sent_date: "2026-09-01T08:00:00.000Z",
    valid_until: "2026-09-20",
  };

  it("sends a decision follow-up after the wait and not a payment reminder", () => {
    const actions = evaluateQuoteFollowUpActions({
      quote,
      events: [{ event_type: "sent", occurred_at: "2026-09-01T08:00:00.000Z" }],
      settings: { enabled: true, days_after_sent: 3 },
      now: new Date("2026-09-05T09:00:00.000Z"),
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].rule.body).toMatch(/proceed/i);
    expect(actions[0].rule.body).not.toMatch(/pay/i);
  });

  it("stops follow-ups after accepted, rejected, or expired", () => {
    for (const status of ["accepted", "declined", "expired", "converted"]) {
      expect(quoteIsFollowUpable({ ...quote, status })).toBe(false);
      expect(
        evaluateQuoteFollowUpActions({
          quote: { ...quote, status },
          events: [{ event_type: "sent", occurred_at: "2026-09-01T08:00:00.000Z" }],
          settings: { enabled: true, days_after_sent: 1 },
          now: new Date("2026-09-08T09:00:00.000Z"),
        })
      ).toEqual([]);
    }
  });

  it("expires a quote from valid_until, not invoice overdue", () => {
    expect(quoteShouldExpire({ ...quote, status: "viewed", valid_until: "2026-09-07" }, new Date("2026-09-08T12:00:00Z"))).toBe(true);
    expect(quoteShouldExpire({ ...quote, status: "accepted", valid_until: "2026-09-07" }, new Date("2026-09-08T12:00:00Z"))).toBe(false);
  });
});

describe("invoice payment reminders", () => {
  const invoice = {
    id: "inv-1",
    status: "sent",
    total_amount: 1000,
    delivery_date: "2026-09-08",
  };

  it("stops immediately after payment is confirmed", () => {
    expect(invoiceIsRemindable({ ...invoice, status: "paid" }, [{ amount: 1000, status: "paid" }])).toBe(false);
    const actions = evaluateInvoiceReminderActions({
      invoice: { ...invoice, status: "paid" },
      payments: [{ amount: 1000, status: "paid" }],
      events: [{ event_type: "reminded", occurred_at: "2026-09-07T08:00:00.000Z" }],
      settings: normalizeReminderSettings(null),
      now: new Date("2026-09-09T12:00:00.000Z"),
    });
    expect(actions).toEqual([]);
  });
});

describe("quote conversion keeps separate records", () => {
  it("keeps the quote and creates a new unpaid invoice", () => {
    const quote = {
      id: "quote-1",
      org_id: "org-1",
      client_id: "client-1",
      quote_number: "Q-1001",
      status: QUOTE_STATUS.accepted,
      total_amount: 1150,
      items: [{ service_name: "Design", quantity: 1, unit_price: 1000, total_price: 1000 }],
    };
    expect(canConvertQuote(quote)).toBe(true);
    const store = {
      quotes: new Map([[quote.id, { ...quote }]]),
      invoices: new Map(),
      invoiceItems: [],
    };
    const result = convertQuoteWithStore(store, quote.id, { now: new Date("2026-09-08T12:00:00Z") });
    expect(store.quotes.get(quote.id).status).toBe(QUOTE_STATUS.converted);
    expect(result.invoice.status).toBe("draft");
    expect(result.invoice.source_quote_id).toBe(quote.id);
    expect(result.invoice.id).not.toBe(quote.id);
  });
});

describe("split reporting", () => {
  it("does not treat quoted value as paid revenue", () => {
    const metrics = computeDocumentEngagementMetrics({
      events: [
        { source_kind: "quote", source_id: "q-1", event_type: "accepted", occurred_at: "2026-09-02T08:00:00.000Z" },
        { source_kind: "quote", source_id: "q-1", event_type: "converted_to_invoice", occurred_at: "2026-09-02T09:00:00.000Z" },
        { source_kind: "invoice", source_id: "inv-1", event_type: "created", occurred_at: "2026-09-02T09:00:00.000Z" },
        { source_kind: "invoice", source_id: "inv-1", event_type: "paid", occurred_at: "2026-09-04T08:00:00.000Z" },
      ],
      quotes: [{ id: "q-1", status: "converted", total_amount: 50000 }],
      invoices: [{ id: "inv-1", status: "paid", total_amount: 35000 }],
      payments: [{ invoice_id: "inv-1", amount: 20000, status: "paid", paid_at: "2026-09-04T08:00:00.000Z" }],
    });
    expect(metrics.quotedValue).toBe(50000);
    expect(metrics.invoicedValue).toBe(35000);
    expect(metrics.paidValue).toBe(20000);
    expect(metrics.quotes.quotesAccepted).toBe(1);
    expect(metrics.invoices.paidDocuments).toBe(1);
    expect(metrics.quotes.quotedValue).not.toBe(metrics.paidValue);
  });
});

describe("timeline labels", () => {
  it("uses human-readable quote and invoice copy", () => {
    expect(formatDocumentEventType("accepted", "quote")).toBe("Client accepted quote");
    expect(formatDocumentEventType("rejected", "quote")).toBe("Client rejected quote");
    expect(formatDocumentEventType("converted_to_invoice", "quote")).toBe("Quote converted to invoice");
    expect(formatDocumentEventType("reminded", "quote")).toBe("Quote follow-up sent");
    expect(formatDocumentEventType("paid", "invoice")).toBe("Payment received");
    expect(formatDocumentEventType("overdue", "invoice")).toBe("Invoice overdue");
    expect(formatDocumentEventType("clicked", "invoice")).toBe("Payment link clicked");
  });
});
