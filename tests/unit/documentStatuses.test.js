import { describe, expect, it } from "vitest";
import {
  INVOICE_STATUS,
  QUOTE_STATUS,
  normalizeInvoiceStatus,
  normalizeQuoteStatus,
  canTransitionInvoiceStatus,
  canTransitionQuoteStatus,
  sanitizeInvoiceStatusWrite,
  sanitizeQuoteStatusWrite,
  isInvoicePaidLike,
  isInvoiceVoidLike,
  isInvoiceOpenReceivable,
  invoiceStatusesMatch,
  invoiceLifecycleLabel,
  invoiceLifecyclePillClass,
  quoteStatusLabel,
} from "@shared/commercial/documentStatuses.js";
import { getDerivedStatus, isManualStatusChangeAllowed } from "@/utils/invoiceStatus";
import { canTransitionStatus, allowedNextStatuses } from "@/document-engine/documentStateMachine";

describe("invoice status aliases", () => {
  it("maps historical invoice values onto canonical statuses", () => {
    expect(normalizeInvoiceStatus("partial_paid")).toBe(INVOICE_STATUS.partially_paid);
    expect(normalizeInvoiceStatus("cancelled")).toBe(INVOICE_STATUS.void);
    expect(normalizeInvoiceStatus("canceled")).toBe(INVOICE_STATUS.void);
    expect(normalizeInvoiceStatus("sending")).toBe(INVOICE_STATUS.sent);
    expect(normalizeInvoiceStatus("preparing")).toBe(INVOICE_STATUS.sent);
    expect(normalizeInvoiceStatus("pending")).toBe(INVOICE_STATUS.sent);
    expect(normalizeInvoiceStatus("converted")).toBe(INVOICE_STATUS.sent);
  });

  it("treats aliases as equal for filters and predicates", () => {
    expect(invoiceStatusesMatch("partial_paid", "partially_paid")).toBe(true);
    expect(isInvoicePaidLike("partial_paid")).toBe(true);
    expect(isInvoiceVoidLike("cancelled")).toBe(true);
    expect(isInvoiceOpenReceivable("viewed")).toBe(true);
    expect(isInvoiceOpenReceivable("draft")).toBe(false);
  });
});

describe("quote status aliases", () => {
  it("maps rejected to declined", () => {
    expect(normalizeQuoteStatus("rejected")).toBe(QUOTE_STATUS.declined);
  });

  it("labels declined as Rejected and never Overdue or Paid", () => {
    expect(quoteStatusLabel("declined")).toBe("Rejected");
    expect(quoteStatusLabel("accepted")).toBe("Accepted");
    expect(quoteStatusLabel("expired")).toBe("Expired");
    expect(Object.values(QUOTE_STATUS).every((status) => quoteStatusLabel(status) !== "Overdue")).toBe(true);
    expect(Object.values(QUOTE_STATUS).every((status) => quoteStatusLabel(status) !== "Paid")).toBe(true);
  });
});

describe("invoice collection labels", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("shows due-soon and due-today without changing stored status", () => {
    expect(invoiceLifecycleLabel({ status: "sent", delivery_date: "2026-09-10" }, now)).toBe("Due Soon");
    expect(invoiceLifecycleLabel({ status: "viewed", delivery_date: "2026-09-08" }, now)).toBe("Due Today");
    expect(invoiceLifecycleLabel({ status: "sent", delivery_date: "2026-09-01" }, now)).toBe("Overdue");
    expect(invoiceLifecycleLabel({ status: "paid", delivery_date: "2026-09-01" }, now)).toBe("Paid");
    expect(invoiceLifecycleLabel({ status: "draft" }, now)).toBe("Draft");
  });

  it("styles the displayed collection label, not the stored status", () => {
    expect(invoiceLifecyclePillClass("Overdue", "sent")).toBe("overdue");
    expect(invoiceLifecyclePillClass("Due Soon", "viewed")).toBe("due_soon");
    expect(invoiceLifecyclePillClass("Due Today", "sent")).toBe("due_today");
    expect(invoiceLifecyclePillClass("Unpaid", "partially_paid")).toBe("sent");
    expect(invoiceLifecyclePillClass("Paid", "paid")).toBe("paid");
    expect(invoiceLifecyclePillClass("Draft", "draft")).toBe("draft");
    expect(invoiceLifecyclePillClass("Viewed", "viewed")).toBe("viewed");
    expect(invoiceLifecyclePillClass("Sent", "sent")).toBe("sent");
    expect(invoiceLifecyclePillClass("Partially Paid", "partially_paid")).toBe("partially_paid");
    expect(invoiceLifecyclePillClass("Void", "void")).toBe("void");
  });
});

describe("invoice transitions", () => {
  it("allows the happy path and payment shortcuts", () => {
    expect(canTransitionInvoiceStatus("draft", "sent")).toBe(true);
    expect(canTransitionInvoiceStatus("sent", "viewed")).toBe(true);
    expect(canTransitionInvoiceStatus("viewed", "partially_paid")).toBe(true);
    expect(canTransitionInvoiceStatus("partially_paid", "paid")).toBe(true);
    expect(canTransitionInvoiceStatus("sent", "paid")).toBe(true);
    expect(canTransitionInvoiceStatus("partial_paid", "paid")).toBe(true);
    expect(canTransitionInvoiceStatus("cancelled", "void")).toBe(true);
  });

  it("blocks invalid jumps and terminal exits", () => {
    expect(canTransitionInvoiceStatus("draft", "paid")).toBe(false);
    expect(canTransitionInvoiceStatus("paid", "void")).toBe(false);
    expect(canTransitionInvoiceStatus("void", "sent")).toBe(false);
    expect(canTransitionInvoiceStatus("draft", "viewed")).toBe(false);
    expect(() => sanitizeInvoiceStatusWrite("sending", "draft")).not.toThrow();
    expect(sanitizeInvoiceStatusWrite("sending", "draft")).toBe(INVOICE_STATUS.sent);
    expect(sanitizeInvoiceStatusWrite("paid", null)).toBe(INVOICE_STATUS.paid);
    expect(() => sanitizeInvoiceStatusWrite("paid", "draft")).toThrow(/Invalid invoice status/);
    expect(() => sanitizeInvoiceStatusWrite("bogus", "draft")).toThrow(/Unsupported invoice status/);
  });
});

describe("quote transitions", () => {
  it("allows draft → sent → viewed → accepted → converted", () => {
    expect(canTransitionQuoteStatus("draft", "sent")).toBe(true);
    expect(canTransitionQuoteStatus("sent", "viewed")).toBe(true);
    expect(canTransitionQuoteStatus("viewed", "accepted")).toBe(true);
    expect(canTransitionQuoteStatus("accepted", "converted")).toBe(true);
    expect(canTransitionQuoteStatus("draft", "converted")).toBe(true);
  });

  it("blocks client writes of converted and invalid jumps", () => {
    expect(canTransitionQuoteStatus("declined", "accepted")).toBe(false);
    expect(canTransitionQuoteStatus("converted", "accepted")).toBe(false);
    expect(() => sanitizeQuoteStatusWrite("converted", "accepted")).toThrow(/convert_quote_to_invoice/);
    expect(() => sanitizeQuoteStatusWrite("rejected", "sent")).not.toThrow();
    expect(sanitizeQuoteStatusWrite("rejected", "sent")).toBe(QUOTE_STATUS.declined);
  });
});

describe("derived invoice status", () => {
  it("returns canonical partially_paid and void", () => {
    expect(getDerivedStatus({ status: "sent", total_amount: 100, payments: [{ amount: 40 }] })).toBe(
      INVOICE_STATUS.partially_paid
    );
    expect(getDerivedStatus({ status: "cancelled", total_amount: 100, payments: [] })).toBe(
      INVOICE_STATUS.void
    );
    expect(getDerivedStatus({ status: "sent", total_amount: 100, payments: [{ amount: 100 }] })).toBe(
      INVOICE_STATUS.paid
    );
  });

  it("uses the transition graph for manual changes", () => {
    expect(isManualStatusChangeAllowed("sent", "partially_paid")).toBe(true);
    expect(isManualStatusChangeAllowed("partial_paid", "paid")).toBe(true);
    expect(isManualStatusChangeAllowed("draft", "paid")).toBe(false);
    expect(isManualStatusChangeAllowed("paid", "void")).toBe(false);
  });
});

describe("document state machine wiring", () => {
  it("exposes canonical next statuses for invoices and quotes", () => {
    expect(canTransitionStatus("invoice", "draft", "void")).toBe(true);
    expect(canTransitionStatus("invoice", "sent", "partially_paid")).toBe(true);
    expect(allowedNextStatuses("invoice", "partial_paid")).toEqual(
      expect.arrayContaining([INVOICE_STATUS.paid, INVOICE_STATUS.void])
    );
    expect(allowedNextStatuses("quote", "rejected")).toEqual([]);
  });
});
