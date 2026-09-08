import { beforeEach, describe, expect, it, vi } from "vitest";

const { memory } = vi.hoisted(() => {
  const rows = [];
  const memory = {
    rows,
    from() {
      return {
        insert(row) {
          const existing = rows.find(
            (item) => item.org_id === row.org_id && item.idempotency_key && item.idempotency_key === row.idempotency_key
          );
          if (existing) {
            return {
              select() {
                return {
                  single: async () => ({ data: null, error: { code: "23505", message: "duplicate" } }),
                };
              },
            };
          }
          const created = { id: `evt-${rows.length + 1}`, ...row };
          rows.push(created);
          return {
            select() {
              return { single: async () => ({ data: created, error: null }) };
            },
          };
        },
        select() {
          const filters = {};
          return {
            eq(field, value) {
              filters[field] = value;
              return this;
            },
            maybeSingle: async () => {
              const found = rows.find(
                (item) =>
                  item.org_id === filters.org_id && item.idempotency_key === filters.idempotency_key
              );
              return { data: found || null, error: null };
            },
          };
        },
      };
    },
  };
  return { memory };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory }));

import {
  DOCUMENT_EVENT_TYPE,
  OPEN_DEDUPE_MS,
  buildDocumentEventIdempotencyKey,
} from "../../shared/documents/documentEvents.js";
import {
  evaluateInvoiceReminderActions,
  invoiceIsRemindable,
  normalizeReminderSettings,
} from "../../shared/documents/documentReminderRules.js";
import { computeDocumentEngagementMetrics } from "../../shared/documents/documentEngagementMetrics.js";
import { appendDocumentEvent } from "../../server/src/documents/documentEventService.js";

describe("document event idempotency", () => {
  beforeEach(() => {
    memory.rows.length = 0;
  });

  it("dedupes refreshes in the same open window and allows a later open", () => {
    const first = buildDocumentEventIdempotencyKey({
      eventType: DOCUMENT_EVENT_TYPE.opened,
      sourceKind: "invoice",
      sourceId: "inv-1",
      channel: "public_page",
      at: "2026-09-08T10:00:00.000Z",
    });
    const refresh = buildDocumentEventIdempotencyKey({
      eventType: DOCUMENT_EVENT_TYPE.opened,
      sourceKind: "invoice",
      sourceId: "inv-1",
      channel: "public_page",
      at: "2026-09-08T10:10:00.000Z",
    });
    const later = buildDocumentEventIdempotencyKey({
      eventType: DOCUMENT_EVENT_TYPE.opened,
      sourceKind: "invoice",
      sourceId: "inv-1",
      channel: "public_page",
      at: new Date(Date.parse("2026-09-08T10:00:00.000Z") + OPEN_DEDUPE_MS + 60 * 1000).toISOString(),
    });
    expect(first).toBe(refresh);
    expect(later).not.toBe(first);
  });

  it("keeps paid events unique per payment intent", () => {
    const a = buildDocumentEventIdempotencyKey({
      eventType: DOCUMENT_EVENT_TYPE.paid,
      sourceKind: "invoice",
      sourceId: "inv-1",
      paymentIntentId: "pi-1",
    });
    const b = buildDocumentEventIdempotencyKey({
      eventType: DOCUMENT_EVENT_TYPE.paid,
      sourceKind: "invoice",
      sourceId: "inv-1",
      paymentIntentId: "pi-1",
    });
    expect(a).toBe(b);
  });

  it("does not insert a second row for the same idempotency key", async () => {
    const first = await appendDocumentEvent({
      orgId: "org-1",
      sourceKind: "invoice",
      sourceId: "inv-1",
      eventType: "sent",
      sendAttemptId: "send-1",
    });
    const second = await appendDocumentEvent({
      orgId: "org-1",
      sourceKind: "invoice",
      sourceId: "inv-1",
      eventType: "sent",
      sendAttemptId: "send-1",
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(memory.rows).toHaveLength(1);
  });
});

describe("reminder safety", () => {
  const invoice = {
    id: "inv-1",
    status: "sent",
    total_amount: 1000,
    delivery_date: "2026-09-08",
  };

  it("does not remind paid or void invoices", () => {
    expect(invoiceIsRemindable({ ...invoice, status: "paid" }, [{ amount: 1000, status: "paid" }])).toBe(false);
    expect(invoiceIsRemindable({ ...invoice, status: "void" })).toBe(false);
    expect(invoiceIsRemindable(invoice, [])).toBe(true);
  });

  it("does not send a reminder immediately after an open", () => {
    const actions = evaluateInvoiceReminderActions({
      invoice,
      payments: [],
      events: [{ event_type: "opened", occurred_at: "2026-09-08T11:00:00.000Z" }],
      settings: normalizeReminderSettings({
        reminders_enabled: false,
        reminder_rules: [{ id: "unused", days: 99, type: "before", subject: "x", body: "x" }],
        viewed_not_paid: { enabled: true, wait_hours: 24 },
      }),
      now: new Date("2026-09-08T11:10:00.000Z"),
    });
    expect(actions.some((action) => action.kind === "remind")).toBe(false);
    expect(actions.some((action) => action.eventType === "viewed_not_paid")).toBe(false);
  });

  it("emits viewed_not_paid and a friendly follow-up after the wait", () => {
    const actions = evaluateInvoiceReminderActions({
      invoice,
      payments: [],
      events: [{ event_type: "opened", occurred_at: "2026-09-07T10:00:00.000Z" }],
      settings: normalizeReminderSettings({
        reminder_rules: [],
        viewed_not_paid: { enabled: true, wait_hours: 24 },
      }),
      now: new Date("2026-09-08T11:00:00.000Z"),
    });
    expect(actions.some((action) => action.eventType === "viewed_not_paid")).toBe(true);
    const remind = actions.find((action) => action.kind === "remind");
    expect(remind?.rule?.body).toMatch(/review and pay securely/i);
    expect(remind?.rule?.body).not.toMatch(/opened|tracked|pixel/i);
  });

  it("emits due_today and skips a duplicate reminder", () => {
    const first = evaluateInvoiceReminderActions({
      invoice,
      payments: [],
      events: [],
      settings: normalizeReminderSettings({
        reminder_rules: [{ id: "due-today", days: 0, type: "after", subject: "Due", body: "Pay" }],
      }),
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    expect(first.some((action) => action.eventType === "due_today")).toBe(true);
    expect(first.some((action) => action.kind === "remind")).toBe(true);

    const again = evaluateInvoiceReminderActions({
      invoice,
      payments: [],
      events: [{ event_type: "reminded", payload: { reminder_type: "due-today" } }],
      settings: normalizeReminderSettings({
        reminder_rules: [{ id: "due-today", days: 0, type: "after", subject: "Due", body: "Pay" }],
      }),
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    expect(again.some((action) => action.kind === "remind")).toBe(false);
  });

  it("does not schedule a reminder after payment is confirmed", () => {
    const actions = evaluateInvoiceReminderActions({
      invoice: { ...invoice, status: "paid" },
      payments: [{ amount: 1000, status: "paid" }],
      events: [{ event_type: "opened", occurred_at: "2026-09-01T00:00:00.000Z" }],
      settings: normalizeReminderSettings(null),
      now: new Date("2026-09-08T12:00:00.000Z"),
    });
    expect(actions).toEqual([]);
  });
});

describe("engagement metrics", () => {
  it("uses events plus authoritative invoice/payment rows", () => {
    const metrics = computeDocumentEngagementMetrics({
      events: [
        { source_kind: "invoice", source_id: "inv-1", event_type: "sent", occurred_at: "2026-09-01T08:00:00.000Z" },
        { source_kind: "invoice", source_id: "inv-1", event_type: "opened", occurred_at: "2026-09-01T10:00:00.000Z" },
        { source_kind: "invoice", source_id: "inv-1", event_type: "clicked", occurred_at: "2026-09-01T11:00:00.000Z", payload: { action: "payment_cta" } },
        { source_kind: "invoice", source_id: "inv-1", event_type: "paid", occurred_at: "2026-09-02T08:00:00.000Z" },
        { source_kind: "invoice", source_id: "inv-2", event_type: "sent", occurred_at: "2026-09-01T08:00:00.000Z" },
        { source_kind: "invoice", source_id: "inv-2", event_type: "opened", occurred_at: "2026-09-01T09:00:00.000Z" },
        { source_kind: "invoice", source_id: "inv-2", event_type: "viewed_not_paid", occurred_at: "2026-09-02T09:00:00.000Z" },
        { source_kind: "invoice", source_id: "inv-2", event_type: "reminded", occurred_at: "2026-09-02T10:00:00.000Z" },
      ],
      invoices: [
        { id: "inv-1", status: "paid", total_amount: 500 },
        { id: "inv-2", status: "overdue", total_amount: 200, delivery_date: "2026-08-01" },
      ],
      payments: [{ invoice_id: "inv-1", amount: 500, status: "paid", paid_at: "2026-09-02T08:00:00.000Z" }],
    });
    expect(metrics.documentsSent).toBe(2);
    expect(metrics.documentsOpened).toBe(2);
    expect(metrics.paymentCtaClicks).toBe(1);
    expect(metrics.viewedButUnpaid).toBe(1);
    expect(metrics.remindersSent).toBe(1);
    expect(metrics.paidDocuments).toBe(1);
    expect(metrics.overdueDocuments).toBe(1);
    expect(metrics.averageHoursSentToOpened).toBe(1.5);
    expect(metrics.averageHoursSentToPaid).toBe(24);
  });
});
