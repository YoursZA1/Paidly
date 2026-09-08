import { describe, expect, it } from "vitest";
import {
  CLIENT_TIMELINE_CATEGORY,
  HIGH_VISIBILITY_EVENT_TYPES,
  canViewInternalNotes,
  computeClientAttention,
  computeClientEngagementSignals,
  computeClientRelationshipSummary,
  documentPaymentEventTypeForStatus,
  eventMatchesCategory,
  formatTimelineEventTitle,
  groupTimelineItems,
  matchesTimelineSearch,
  mergeTimelineItems,
  normalizeTimelineItem,
} from "../../shared/clients/clientRelationshipTimeline.js";
import { DOCUMENT_EVENT_TYPE, isEventAllowedForSource } from "../../shared/documents/documentEvents.js";
import { resolveClientTimelineRoute } from "../../server/src/clients/clientTimelineRoutes.js";

describe("client relationship timeline contract", () => {
  it("maps payment intent statuses onto existing Observe types", () => {
    expect(documentPaymentEventTypeForStatus("failed")).toBe(DOCUMENT_EVENT_TYPE.payment_failed);
    expect(documentPaymentEventTypeForStatus("cancelled")).toBe(DOCUMENT_EVENT_TYPE.payment_cancelled);
    expect(documentPaymentEventTypeForStatus("processing")).toBe(DOCUMENT_EVENT_TYPE.payment_processing);
    expect(documentPaymentEventTypeForStatus("paid")).toBe(DOCUMENT_EVENT_TYPE.paid);
    expect(documentPaymentEventTypeForStatus("pending")).toBe(null);
  });

  it("keeps invoice payment events off quotes", () => {
    expect(isEventAllowedForSource("quote", "paid")).toBe(false);
    expect(isEventAllowedForSource("quote", "payment_failed")).toBe(false);
    expect(isEventAllowedForSource("invoice", "accepted")).toBe(false);
    expect(isEventAllowedForSource("invoice", "payment_failed")).toBe(true);
    expect(isEventAllowedForSource("invoice", "paid")).toBe(true);
  });

  it("labels quote vs invoice vs payment events distinctly", () => {
    expect(formatTimelineEventTitle({ eventType: "sent", documentType: "quote" })).toBe("Quote sent to client");
    expect(formatTimelineEventTitle({ eventType: "sent", documentType: "invoice" })).toBe("Invoice sent");
    expect(formatTimelineEventTitle({ eventType: "paid", documentType: "invoice" })).toBe("Payment received");
    expect(formatTimelineEventTitle({ eventType: "accepted", documentType: "quote" })).toBe("Client accepted quote");
    expect(
      formatTimelineEventTitle({
        eventType: "client_updated",
        metadata: { field: "payment_terms", from: "Net 15 days", to: "Net 30 days" },
      })
    ).toBe("Payment terms changed");
  });

  it("filters categories without dropping financial events from payments", () => {
    const paid = normalizeTimelineItem({
      id: "1",
      eventType: "paid",
      sourceKind: "invoice",
      documentType: "invoice",
      documentId: "inv-1",
      occurredAt: "2026-09-16T12:00:00.000Z",
    });
    const opened = normalizeTimelineItem({
      id: "2",
      eventType: "opened",
      sourceKind: "invoice",
      documentType: "invoice",
      documentId: "inv-1",
      occurredAt: "2026-09-14T12:00:00.000Z",
    });
    expect(eventMatchesCategory(paid, CLIENT_TIMELINE_CATEGORY.PAYMENTS)).toBe(true);
    expect(eventMatchesCategory(opened, CLIENT_TIMELINE_CATEGORY.INVOICES)).toBe(true);
    expect(eventMatchesCategory(opened, CLIENT_TIMELINE_CATEGORY.DOCUMENTS)).toBe(true);
    expect(eventMatchesCategory(paid, CLIENT_TIMELINE_CATEGORY.NOTES)).toBe(false);
  });

  it("does not group payment completed, failed, overdue, or quote decisions", () => {
    const items = mergeTimelineItems([
      [
        {
          id: "a",
          eventType: "opened",
          sourceKind: "invoice",
          documentType: "invoice",
          documentId: "inv-1",
          occurredAt: "2026-09-16T10:42:00.000Z",
        },
        {
          id: "b",
          eventType: "clicked",
          sourceKind: "invoice",
          documentType: "invoice",
          documentId: "inv-1",
          occurredAt: "2026-09-16T10:41:00.000Z",
        },
        {
          id: "c",
          eventType: "paid",
          sourceKind: "invoice",
          documentType: "invoice",
          documentId: "inv-1",
          occurredAt: "2026-09-16T10:40:00.000Z",
          amount: 45000,
        },
      ],
    ]);
    const grouped = groupTimelineItems(items);
    expect(HIGH_VISIBILITY_EVENT_TYPES.includes("paid")).toBe(true);
    expect(grouped.some((item) => item.eventType === "paid")).toBe(true);
    expect(grouped.some((item) => item.kind === "group" && item.events?.some((ev) => ev.eventType === "paid"))).toBe(
      false
    );
  });

  it("groups nearby view/click noise for the same document", () => {
    const grouped = groupTimelineItems(
      mergeTimelineItems([
        [
          {
            id: "a",
            eventType: "opened",
            sourceKind: "invoice",
            documentType: "invoice",
            documentId: "inv-1",
            occurredAt: "2026-09-16T10:42:00.000Z",
          },
          {
            id: "b",
            eventType: "clicked",
            sourceKind: "invoice",
            documentType: "invoice",
            documentId: "inv-1",
            occurredAt: "2026-09-16T10:41:00.000Z",
          },
          {
            id: "c",
            eventType: "payment_intent",
            sourceKind: "invoice",
            documentType: "invoice",
            documentId: "inv-1",
            occurredAt: "2026-09-16T10:40:00.000Z",
          },
        ],
      ])
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe("group");
    expect(grouped[0].events).toHaveLength(3);
  });

  it("searches by invoice number and note content", () => {
    const paid = normalizeTimelineItem({
      id: "p",
      eventType: "paid",
      documentType: "invoice",
      documentNumber: "INV-1088",
      occurredAt: "2026-09-16T12:00:00.000Z",
    });
    const note = normalizeTimelineItem({
      id: "n",
      eventType: "note_added",
      metadata: { preview: "Client requested payment terms to be changed to 30 days." },
      occurredAt: "2026-09-12T12:00:00.000Z",
    });
    expect(matchesTimelineSearch(paid, "INV-1088")).toBe(true);
    expect(matchesTimelineSearch(note, "30 days")).toBe(true);
    expect(matchesTimelineSearch(note, "INV-1088")).toBe(false);
  });

  it("builds health from invoices and payments, not event counts", () => {
    const summary = computeClientRelationshipSummary({
      invoices: [
        { id: "1", status: "paid", total_amount: 100 },
        { id: "2", status: "overdue", total_amount: 40, delivery_date: "2026-01-01" },
      ],
      quotes: [
        { id: "q1", status: "accepted" },
        { id: "q2", status: "sent" },
      ],
      payments: [{ invoice_id: "1", amount: 100, status: "paid", paid_at: "2026-09-01T00:00:00.000Z" }],
    });
    expect(summary.totalInvoiced).toBe(140);
    expect(summary.totalPaid).toBe(100);
    expect(summary.outstanding).toBe(40);
    expect(summary.quotesAccepted).toBe(1);
    expect(summary.invoicesPaid).toBe(1);
  });

  it("surfaces overdue invoices and awaiting quotes as attention items", () => {
    const attention = computeClientAttention({
      invoices: [{ id: "inv-1", invoice_number: "INV-1", status: "overdue", total_amount: 12 }],
      quotes: [{ id: "q-1", quote_number: "Q-1", status: "sent" }],
      payments: [],
      events: [{ id: "f1", eventType: "payment_failed", documentId: "inv-2" }],
    });
    expect(attention.some((item) => item.kind === "overdue_invoice")).toBe(true);
    expect(attention.some((item) => item.kind === "quote_awaiting")).toBe(true);
    expect(attention.some((item) => item.kind === "payment_failed")).toBe(true);
    expect(attention.find((item) => item.kind === "overdue_invoice")?.href).toContain("inv-1");
  });

  it("keeps engagement signals informational", () => {
    const signals = computeClientEngagementSignals({
      invoices: [
        { id: "1", status: "paid" },
        { id: "2", status: "paid" },
        { id: "3", status: "paid" },
      ],
      events: [
        { eventType: "opened", occurredAt: new Date().toISOString() },
        { eventType: "viewed_not_paid", occurredAt: new Date().toISOString() },
      ],
    });
    expect(signals.some((s) => s.id === "pays_consistently")).toBe(true);
    expect(signals.some((s) => s.id === "viewed_unpaid")).toBe(true);
    expect(signals.some((s) => /credit|score|risk rating/i.test(s.label))).toBe(false);
  });

  it("restricts internal notes to owners, admins, and managers", () => {
    expect(canViewInternalNotes({ membershipRole: "owner", companyRole: "admin" })).toBe(true);
    expect(canViewInternalNotes({ companyRole: "manager" })).toBe(true);
    expect(canViewInternalNotes({ companyRole: "employee" })).toBe(false);
  });
});

describe("Hobby client timeline routes", () => {
  it("resolves one-segment /api/company paths without a new Vercel function", () => {
    expect(resolveClientTimelineRoute({ query: { path: ["timeline"] }, url: "/api/company/timeline" })).toEqual({
      route: "timeline",
    });
    expect(resolveClientTimelineRoute({ query: { path: ["client-notes"] }, url: "/api/company/client-notes" })).toEqual({
      route: "client-notes",
    });
    expect(resolveClientTimelineRoute({ query: { path: ["client-events"] }, url: "/api/company/client-events" })).toEqual(
      { route: "client-events" }
    );
    expect(resolveClientTimelineRoute({ query: { path: ["invite"] }, url: "/api/company/invite" })).toBe(null);
  });
});
