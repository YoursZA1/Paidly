import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { sendHtmlEmail, memory } = vi.hoisted(() => {
  const sendHtmlEmail = vi.fn(async () => ({ success: true }));
  const tables = {
    invoices: [],
    payment_intents: [],
    payments: [],
    clients: [],
    document_sends: [],
    document_events: [],
  };

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter.op === "eq") return String(row[filter.col] ?? "") === String(filter.value ?? "");
        if (filter.op === "in") return (filter.value || []).includes(row[filter.col]);
        return true;
      })
    );
  }

  const memory = {
    tables,
    from(table) {
      const state = {
        action: "select",
        payload: null,
        filters: [],
        order: null,
        limit: null,
      };

      async function execute(mode) {
        const rows = tables[table] || [];
        if (state.action === "insert") {
          const rec = {
            id: state.payload.id || randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...state.payload,
          };
          if (table === "payment_intents" && rec.idempotency_key) {
            const existing = rows.find(
              (row) => row.org_id === rec.org_id && row.idempotency_key === rec.idempotency_key
            );
            if (existing) return { data: existing, error: { code: "23505" } };
          }
          if (table === "payments" && rec.reference) {
            const existing = rows.find(
              (row) => row.org_id === rec.org_id && row.reference === rec.reference && row.method === "ozow"
            );
            if (existing) return { data: existing, error: { code: "23505" } };
          }
          if (table === "document_events" && rec.idempotency_key) {
            const existing = rows.find(
              (row) => row.org_id === rec.org_id && row.idempotency_key === rec.idempotency_key
            );
            if (existing) return { data: existing, error: { code: "23505" } };
          }
          tables[table].push(rec);
          return { data: rec, error: null };
        }

        let found = applyFilters(rows, state.filters);
        if (state.order) {
          found = [...found].sort((a, b) => {
            const av = a[state.order.col];
            const bv = b[state.order.col];
            if (av === bv) return 0;
            const cmp = av > bv ? 1 : -1;
            return state.order.ascending ? cmp : -cmp;
          });
        }
        if (state.limit != null) found = found.slice(0, state.limit);

        if (state.action === "update") {
          found.forEach((row) => Object.assign(row, state.payload));
          if (mode === "maybeSingle") return { data: found[0] || null, error: null };
          if (mode === "single") {
            return { data: found[0] || null, error: found[0] ? null : { message: "not found" } };
          }
          return { data: found, error: null };
        }

        if (mode === "maybeSingle") return { data: found[0] || null, error: null };
        if (mode === "single") {
          return { data: found[0] || null, error: found[0] ? null : { message: "not found" } };
        }
        return { data: found, error: null };
      }

      const api = {
        select() {
          return api;
        },
        eq(col, value) {
          state.filters.push({ op: "eq", col, value });
          return api;
        },
        in(col, value) {
          state.filters.push({ op: "in", col, value });
          return api;
        },
        order(col, opts = {}) {
          state.order = { col, ascending: opts.ascending !== false };
          return api;
        },
        limit(n) {
          state.limit = n;
          return api;
        },
        insert(payload) {
          state.action = "insert";
          state.payload = payload;
          return api;
        },
        update(payload) {
          state.action = "update";
          state.payload = payload;
          return api;
        },
        maybeSingle() {
          return execute("maybeSingle");
        },
        single() {
          return execute("single");
        },
        then(resolve, reject) {
          return execute("list").then(resolve, reject);
        },
      };
      return api;
    },
  };

  return { sendHtmlEmail, memory };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({
  supabaseAdmin: {
    from: (table) => memory.from(table),
  },
}));

vi.mock("../../server/src/sendInvoice.js", () => ({
  sendHtmlEmail,
}));

const orgId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const shareToken = "44444444-4444-4444-8444-444444444444";

function seedInvoice(status = "sent") {
  memory.tables.invoices.splice(0, memory.tables.invoices.length, {
    id: invoiceId,
    org_id: orgId,
    client_id: clientId,
    company_id: null,
    invoice_number: "INV-2026-001",
    status,
    total_amount: 7750,
    currency: "ZAR",
    owner_currency: "ZAR",
    owner_company_name: "Brandcafe",
    delivery_date: "2026-09-11",
    public_share_token: shareToken,
    project_title: "Brand work",
  });
  memory.tables.clients.splice(0, memory.tables.clients.length, {
    id: clientId,
    org_id: orgId,
    name: "Brandcafe",
    email: "accounts@brandcafe.test",
  });
  memory.tables.payment_intents.length = 0;
  memory.tables.payments.length = 0;
  memory.tables.document_sends.length = 0;
  memory.tables.document_events.length = 0;
}

describe("document payment lifecycle acceptance", () => {
  beforeEach(() => {
    sendHtmlEmail.mockClear();
    sendHtmlEmail.mockResolvedValue({ success: true });
    process.env.OZOW_SITE_CODE = "TSTSTE0001";
    process.env.OZOW_API_KEY = "key";
    process.env.OZOW_PRIVATE_KEY = "private-key";
    process.env.OZOW_IS_TEST = "true";
    seedInvoice("sent");
  });

  it("pays an invoice only after a verified Ozow webhook, then updates history and revenue", async () => {
    const { createOrReuseDocumentPaymentIntent, applyVerifiedProviderEvent, documentPaymentSnapshot } =
      await import("../../server/src/payments/documentPaymentService.js");
    const { ozowProvider } = await import("../../server/src/payments/providers/ozowProvider.js");
    const { buildOzowNotifyHash, ozowAmountString } = await import("../../server/src/payments/ozowHash.js");
    const { computeDashboardFinancials } = await import("../../src/lib/dashboard/financialSummary.js");
    const { resolveDocumentPaymentCtas, DOCUMENT_PAYMENT_ACTION } = await import(
      "../../shared/payments/documentPaymentCtas.js"
    );

    const started = await createOrReuseDocumentPaymentIntent({
      orgId,
      invoiceId,
      createdBy: "staff-1",
      shareToken,
      appOrigin: "https://www.paidly.co.za",
    });

    expect(started.intent.document_id).toBe(invoiceId);
    expect(started.intent.source_kind).toBe("document");
    expect(started.intent.status).toBe("requires_action");
    expect(started.intent.status).not.toBe("paid");
    expect(started.redirectUrl).toContain("pay.ozow.com");
    expect(memory.tables.invoices[0].status).toBe("sent");
    expect(memory.tables.payments).toHaveLength(0);

    const reused = await createOrReuseDocumentPaymentIntent({
      orgId,
      invoiceId,
      shareToken,
      appOrigin: "https://www.paidly.co.za",
    });
    expect(reused.intent.id).toBe(started.intent.id);
    expect(memory.tables.payment_intents).toHaveLength(1);

    const notify = {
      SiteCode: "TSTSTE0001",
      TransactionId: "oz-success-1",
      TransactionReference: started.intent.id,
      Amount: ozowAmountString(7750),
      Status: "Complete",
      Optional1: "document",
      Optional2: invoiceId,
      Optional3: orgId,
      Optional4: "",
      Optional5: "",
      CurrencyCode: "ZAR",
      IsTest: "true",
      StatusMessage: "Approved",
    };
    notify.Hash = buildOzowNotifyHash(notify, "private-key");

    const verified = await ozowProvider.handleWebhook(notify);
    expect(verified.ok).toBe(true);
    expect(verified.nextStatus).toBe("paid");

    const applied = await applyVerifiedProviderEvent({
      intentId: verified.intentId,
      nextStatus: verified.nextStatus,
      externalId: verified.externalId,
      amount: verified.amount,
      metadata: { webhook_verified: true },
    });

    expect(applied.intent.status).toBe("paid");
    expect(applied.settlement.settled).toBe(true);
    expect(applied.settlement.invoice.status).toBe("paid");
    expect(applied.settlement.amountDue).toBe(0);
    expect(memory.tables.payments).toHaveLength(1);
    expect(memory.tables.payments[0].reference).toBe(started.intent.id);
    expect(memory.tables.payments[0].method).toBe("ozow");

    const replay = await applyVerifiedProviderEvent({
      intentId: verified.intentId,
      nextStatus: "paid",
      externalId: verified.externalId,
      amount: verified.amount,
    });
    expect(replay.duplicate).toBe(true);
    expect(memory.tables.payments).toHaveLength(1);

    const snapshot = await documentPaymentSnapshot(orgId, invoiceId);
    expect(snapshot.invoice_status).toBe("paid");
    expect(snapshot.payment_status).toBe("paid");
    expect(snapshot.history).toHaveLength(1);
    expect(snapshot.history[0].status).toBe("paid");
    expect(snapshot.ctas.actions).toEqual([
      DOCUMENT_PAYMENT_ACTION.view_payment,
      DOCUMENT_PAYMENT_ACTION.download_receipt,
    ]);

    const dashboard = computeDashboardFinancials({
      now: new Date(Date.now() + 60_000),
      invoices: memory.tables.invoices,
      payments: memory.tables.payments,
    });
    expect(dashboard.paidThisMonth).toBe(7750);
    expect(dashboard.outstandingTotal).toBe(0);
  });

  it("keeps the invoice unpaid on failure, then pays on a controlled retry attempt", async () => {
    const { createOrReuseDocumentPaymentIntent, applyVerifiedProviderEvent, documentPaymentSnapshot } =
      await import("../../server/src/payments/documentPaymentService.js");
    const { ozowProvider } = await import("../../server/src/payments/providers/ozowProvider.js");
    const { buildOzowNotifyHash, ozowAmountString } = await import("../../server/src/payments/ozowHash.js");
    const { computeDashboardFinancials } = await import("../../src/lib/dashboard/financialSummary.js");
    const { DOCUMENT_PAYMENT_ACTION } = await import("../../shared/payments/documentPaymentCtas.js");

    const first = await createOrReuseDocumentPaymentIntent({
      orgId,
      invoiceId,
      shareToken,
      appOrigin: "https://www.paidly.co.za",
    });

    const failNotify = {
      SiteCode: "TSTSTE0001",
      TransactionId: "oz-fail-1",
      TransactionReference: first.intent.id,
      Amount: ozowAmountString(7750),
      Status: "Error",
      Optional1: "document",
      Optional2: invoiceId,
      Optional3: orgId,
      Optional4: "",
      Optional5: "",
      CurrencyCode: "ZAR",
      IsTest: "true",
      StatusMessage: "Declined",
    };
    failNotify.Hash = buildOzowNotifyHash(failNotify, "private-key");
    const failedHook = await ozowProvider.handleWebhook(failNotify);
    const failed = await applyVerifiedProviderEvent({
      intentId: failedHook.intentId,
      nextStatus: failedHook.nextStatus,
      externalId: failedHook.externalId,
      amount: failedHook.amount,
    });

    expect(failed.intent.status).toBe("failed");
    expect(failed.settlement).toBeNull();
    expect(memory.tables.invoices[0].status).toBe("sent");
    expect(memory.tables.payments).toHaveLength(0);

    const afterFail = await documentPaymentSnapshot(orgId, invoiceId);
    expect(afterFail.invoice_status).toBe("sent");
    expect(afterFail.payment_status).toBe("failed");
    expect(afterFail.ctas.actions).toEqual([
      DOCUMENT_PAYMENT_ACTION.retry,
      DOCUMENT_PAYMENT_ACTION.remind,
    ]);

    const retry = await createOrReuseDocumentPaymentIntent({
      orgId,
      invoiceId,
      shareToken,
      forceNewAttempt: true,
      appOrigin: "https://www.paidly.co.za",
    });
    expect(retry.intent.id).not.toBe(first.intent.id);
    expect(retry.intent.document_id).toBe(invoiceId);
    expect(retry.intent.status).toBe("requires_action");
    expect(memory.tables.payment_intents).toHaveLength(2);
    expect(memory.tables.payment_intents.filter((row) => row.status === "failed")).toHaveLength(1);

    const successNotify = {
      SiteCode: "TSTSTE0001",
      TransactionId: "oz-success-2",
      TransactionReference: retry.intent.id,
      Amount: ozowAmountString(7750),
      Status: "Complete",
      Optional1: "document",
      Optional2: invoiceId,
      Optional3: orgId,
      Optional4: "",
      Optional5: "",
      CurrencyCode: "ZAR",
      IsTest: "true",
      StatusMessage: "Approved",
    };
    successNotify.Hash = buildOzowNotifyHash(successNotify, "private-key");
    const paidHook = await ozowProvider.handleWebhook(successNotify);
    const paid = await applyVerifiedProviderEvent({
      intentId: paidHook.intentId,
      nextStatus: paidHook.nextStatus,
      externalId: paidHook.externalId,
      amount: paidHook.amount,
    });

    expect(paid.settlement.invoice.status).toBe("paid");
    expect(memory.tables.payments).toHaveLength(1);
    expect(memory.tables.payments[0].reference).toBe(retry.intent.id);

    const history = await documentPaymentSnapshot(orgId, invoiceId);
    expect(history.history.map((row) => row.status).sort()).toEqual(["failed", "paid"]);
    expect(history.invoice_status).toBe("paid");

    const dashboard = computeDashboardFinancials({
      now: new Date(Date.now() + 60_000),
      invoices: [{ ...memory.tables.invoices[0], status: "paid" }],
      payments: [
        ...memory.tables.payments,
        { id: "ignored-fail", invoice_id: invoiceId, amount: 7750, status: "failed" },
      ],
    });
    expect(dashboard.paidThisMonth).toBe(7750);
    expect(dashboard.outstandingTotal).toBe(0);
    expect(memory.tables.document_events.some((row) => row.event_type === "paid")).toBe(true);
  });

  it("sends a remind through the existing mailer with a payment link and records the send", async () => {
    const { remindDocumentPayment } = await import("../../server/src/payments/documentPaymentService.js");

    const result = await remindDocumentPayment({
      orgId,
      invoiceId,
      createdBy: "staff-1",
      appOrigin: "https://www.paidly.co.za",
    });

    expect(result.ok).toBe(true);
    expect(result.pay_url).toBe(`https://www.paidly.co.za/view/${shareToken}`);
    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendHtmlEmail.mock.calls[0];
    expect(to).toBe("accounts@brandcafe.test");
    expect(subject).toContain("INV-2026-001");
    expect(html).toContain(result.pay_url);
    expect(html).toContain("Pay now");
    expect(html).toContain("7");
    expect(html).toContain("11");
    expect(memory.tables.document_sends).toHaveLength(1);
    expect(memory.tables.document_events.some((row) => row.event_type === "reminded")).toBe(true);
    expect(memory.tables.document_sends[0]).toMatchObject({
      org_id: orgId,
      document_id: invoiceId,
      document_type: "invoice",
      channel: "remind",
      client_id: clientId,
    });

    await expect(
      remindDocumentPayment({
        orgId,
        invoiceId,
        appOrigin: "https://www.paidly.co.za",
      })
    ).rejects.toMatchObject({ code: "REMINDER_THROTTLED" });
    expect(sendHtmlEmail).toHaveBeenCalledTimes(1);
  });

  it("never treats an Ozow Success URL return as settlement", async () => {
    const { createOrReuseDocumentPaymentIntent, documentPaymentSnapshot } = await import(
      "../../server/src/payments/documentPaymentService.js"
    );

    const started = await createOrReuseDocumentPaymentIntent({
      orgId,
      invoiceId,
      shareToken,
      appOrigin: "https://www.paidly.co.za",
    });
    expect(decodeURIComponent(started.redirectUrl)).toContain("pay=return");
    expect(started.intent.status).not.toBe("paid");

    const snapshot = await documentPaymentSnapshot(orgId, invoiceId);
    expect(snapshot.invoice_status).toBe("sent");
    expect(snapshot.payments).toHaveLength(0);
    expect(memory.tables.invoices[0].status).toBe("sent");
  });
});
