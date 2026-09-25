/**
 * Customer Payment Engine follow-ups (2026-09-25, second pass) — gaps found after
 * customerPaymentEngine.audit.test.js, against the real services:
 *   - a charge result never overwrites an intent a verified event already moved (stale read)
 *   - one payment settles one POS sale (link never re-pointed; lost link finds the sale)
 *   - mock outcomes: card rail only, never in production (no override)
 *   - offline receipts: a reused idempotency key cannot settle a different amount
 *   - the public webhook refuses the cash rail as a client error
 *   - the client portal hands "Pay" to the Payment Engine page with the real balance
 * The database backstops (paid-status guard on total_amount, unique settlement indexes) are proven on
 * Postgres in customerPaymentIntegrity.db.test.js.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const { memory, tables, gate } = vi.hoisted(() => {
  const tables = {};
  const matches = (row, f) => {
    const v = row[f.col];
    if (f.op === "eq") return String(v ?? "") === String(f.value ?? "");
    if (f.op === "in") return f.value.map(String).includes(String(v ?? ""));
    if (f.op === "is") return f.value === null ? v == null : v === f.value;
    return true;
  };
  const memory = {
    from(table) {
      tables[table] ||= [];
      const st = { action: "select", payload: null, filters: [], order: null, limit: null };
      const run = () => {
        if (st.action === "insert") {
          const now = new Date().toISOString();
          const rows = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({
            id: randomUUID(),
            created_at: now,
            updated_at: now,
            ...p,
          }));
          tables[table].push(...rows);
          return rows;
        }
        let found = tables[table].filter((r) => st.filters.every((f) => matches(r, f)));
        if (st.action === "update") {
          found.forEach((r) => Object.assign(r, st.payload));
          return found;
        }
        if (st.order) {
          const { col, asc } = st.order;
          found = [...found].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
        }
        return st.limit != null ? found.slice(0, st.limit) : found;
      };
      const api = {
        select: () => api,
        insert: (p) => ((st.action = "insert"), (st.payload = p), api),
        update: (p) => ((st.action = "update"), (st.payload = p), api),
        eq: (col, value) => (st.filters.push({ op: "eq", col, value }), api),
        in: (col, value) => (st.filters.push({ op: "in", col, value }), api),
        is: (col, value) => (st.filters.push({ op: "is", col, value }), api),
        order: (col, o) => ((st.order = { col, asc: o?.ascending !== false }), api),
        limit: (n) => ((st.limit = n), api),
        maybeSingle: async () => ({ data: run()[0] || null, error: null }),
        single: async () => {
          const r = run()[0];
          return r ? { data: r, error: null } : { data: null, error: { message: "no rows" } };
        },
        then: (res, rej) => Promise.resolve({ data: run(), error: null }).then(res, rej),
      };
      return api;
    },
  };
  return { memory, tables, gate: { current: null } };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory }));
vi.mock("../../server/src/sendInvoice.js", () => ({ sendHtmlEmail: async () => ({ success: true }) }));
vi.mock("../../server/src/pos/posConnectionsRoutes.js", () => ({
  requireOrgMember: async () => gate.current,
  requirePosPermission: async () => gate.current,
}));
vi.mock("../../server/src/pos/posEntitlement.js", () => ({ requirePosPlan: async () => true }));
vi.mock("../../server/src/pos/posBusinessType.js", () => ({ requirePosCapability: async () => true }));
vi.mock("../../server/src/pos/posInventorySync.js", () => ({
  commitNativePosInventory: async () => ({ applied: true, failed: null, duplicate: false, results: [] }),
}));
vi.mock("../../server/src/pos/posAudit.js", () => ({
  recordPosAuditEvent: async () => {},
  recordPosAuditEvents: async () => {},
}));

import {
  attachPosSaleToIntent,
  confirmPaymentIntent,
  findSaleForIntent,
} from "../../server/src/payments/paymentIntentService.js";
import { settlePosIntent } from "../../server/src/paidlyPay/settlePosIntent.js";
import { handleDocumentRecord } from "../../server/src/payments/documentPaymentRoutes.js";
import { handleCustomerPaymentWebhook, handlePaymentIntentAction } from "../../server/src/payments/paymentIntentRoutes.js";
import { cardTerminalRailEnabled, isMockPaymentsEnabled } from "../../shared/payments/paidlyPayContract.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const INVOICE = "22222222-2222-4222-8222-222222222222";

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

function posIntent(partial = {}) {
  const row = {
    id: randomUUID(),
    org_id: ORG,
    source_kind: "pos",
    provider: "card_terminal",
    amount: 150,
    currency: "ZAR",
    status: "requires_action",
    pos_sale_event_id: null,
    metadata: {
      // Paidly Pay snapshot without a register connection: dedupe cannot rely on (connection_id, external_id).
      checkout: { items: [{ service_id: "svc-1", quantity: 1, unit_price: 150 }], payment_method: "card" },
    },
    ...partial,
  };
  tables.payment_intents.push(row);
  return row;
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.payment_intents = [];
  tables.pos_sales_events = [];
  tables.payments = [];
  tables.invoices = [
    { id: INVOICE, org_id: ORG, status: "sent", total_amount: 1000, currency: "ZAR", user_id: "owner-1", created_by: "owner-1" },
  ];
  gate.current = { ok: true, user: { id: "staff-1" }, membership: { orgId: ORG, companyRole: "admin" } };
  process.env.OZOW_SITE_CODE = "TSTSTE0001";
  process.env.OZOW_API_KEY = "key";
  process.env.OZOW_PRIVATE_KEY = "private-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("state machine: a stale charge never overwrites a verified outcome", () => {
  it("Ozow Notify paid the intent while the Pay click was in flight → confirm leaves it paid", async () => {
    const intent = posIntent({ provider: "ozow", status: "pending" });
    const staleCopy = { ...intent, metadata: { ...intent.metadata } };
    intent.status = "paid"; // the verified Notify landed first

    const out = await confirmPaymentIntent(staleCopy, { appOrigin: "https://www.paidly.co.za" });
    expect(tables.payment_intents[0].status).toBe("paid");
    expect(out.intent.status).toBe("paid");
    expect(out.charge.duplicate).toBe(true);
  });
});

describe("one payment settles one POS sale", () => {
  it("links once; relinking the same sale is idempotent; a second sale is refused", async () => {
    const intent = posIntent({ status: "paid" });
    await attachPosSaleToIntent(intent.id, "sale-1");
    expect(intent.pos_sale_event_id).toBe("sale-1");
    await expect(attachPosSaleToIntent(intent.id, "sale-1")).resolves.toMatchObject({ pos_sale_event_id: "sale-1" });
    await expect(attachPosSaleToIntent(intent.id, "sale-2")).rejects.toMatchObject({ code: "INTENT_ALREADY_LINKED" });
    expect(intent.pos_sale_event_id).toBe("sale-1");

    const unpaid = posIntent();
    await expect(attachPosSaleToIntent(unpaid.id, "sale-3")).rejects.toMatchObject({ code: "INTENT_NOT_PAID" });
  });

  it("a replayed settlement after the intent→sale link was lost reuses the sale (no connection_id)", async () => {
    const intent = posIntent({ status: "paid" });
    const first = await settlePosIntent({ ...intent });
    expect(first).toMatchObject({ settled: true, duplicate: false });
    expect(tables.pos_sales_events).toHaveLength(1);

    intent.pos_sale_event_id = null; // link lost (e.g. crash between insert and link)
    const again = await settlePosIntent({ ...intent });
    expect(again).toMatchObject({ settled: true, duplicate: true, saleId: first.saleId });
    expect(tables.pos_sales_events).toHaveLength(1);
    expect(await findSaleForIntent(ORG, intent.id)).toMatchObject({ id: first.saleId, payment_intent_id: intent.id });
  });

  it("an unpaid intent never produces a sale", async () => {
    const intent = posIntent({ status: "requires_action" });
    expect(await settlePosIntent(intent)).toMatchObject({ settled: false, reason: "not_paid" });
    expect(tables.pos_sales_events).toHaveLength(0);
  });
});

describe("mock outcomes are test-only and card-rail-only", () => {
  const mockAction = async (intent, outcome = "succeeded") => {
    const res = mockRes();
    await handlePaymentIntentAction({ params: { id: intent.id }, body: { action: "mock", outcome }, headers: {} }, res);
    return res;
  };

  it("in a mock dev environment a mock success cannot pay an Ozow or cash intent", async () => {
    vi.stubEnv("PAYMENT_PROVIDER_MODE", "mock");
    vi.stubEnv("NODE_ENV", "test");
    for (const provider of ["ozow", "cash"]) {
      const intent = posIntent({ provider, status: provider === "cash" ? "pending" : "requires_action" });
      const res = await mockAction(intent);
      expect(res.statusCode).toBe(409);
      expect(res.body.code).toBe("PROVIDER_MISMATCH");
      expect(intent.status).not.toBe("paid");
    }
    expect(tables.pos_sales_events).toHaveLength(0);
  });

  it("…while a mock card success still works in development (one sale)", async () => {
    vi.stubEnv("PAYMENT_PROVIDER_MODE", "mock");
    vi.stubEnv("NODE_ENV", "test");
    const intent = posIntent();
    const res = await mockAction(intent);
    expect(res.statusCode).toBe(200);
    expect(intent.status).toBe("paid");
    expect(tables.pos_sales_events).toHaveLength(1);
  });

  it.each([
    [{ NODE_ENV: "production", ALLOW_MOCK_PAYMENTS: "1" }],
    [{ NODE_ENV: "test", VERCEL_ENV: "production", ALLOW_MOCK_PAYMENTS: "1" }],
  ])("production refuses mock and the card rail, even with the old override: %o", async (env) => {
    vi.stubEnv("PAYMENT_PROVIDER_MODE", "mock");
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    expect(isMockPaymentsEnabled()).toBe(false);
    expect(cardTerminalRailEnabled()).toBe(false);
    const intent = posIntent();
    const res = await mockAction(intent);
    expect(res.statusCode).toBe(403);
    expect(intent.status).toBe("requires_action");
    expect(tables.pos_sales_events).toHaveLength(0);
  });
});

describe("offline receipts: an idempotency key describes one receipt", () => {
  const record = async (body) => {
    const res = mockRes();
    await handleDocumentRecord({ method: "POST", body: { invoice_id: INVOICE, payment_method: "cash", ...body }, headers: {} }, res);
    return res;
  };

  it("an earlier unsettled attempt with the same key cannot be settled for a different amount", async () => {
    // Attempt 1 created its intent but died before settling it.
    tables.payment_intents.push({
      id: randomUUID(),
      org_id: ORG,
      source_kind: "document",
      provider: "cash",
      document_id: INVOICE,
      amount: 900,
      currency: "ZAR",
      status: "pending",
      idempotency_key: `document:${INVOICE}:offline:k-1`,
      metadata: {},
    });
    const changed = await record({ amount: 100, idempotency_key: "k-1" });
    expect(changed.statusCode).toBe(409);
    expect(changed.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(tables.payments).toHaveLength(0);

    const same = await record({ amount: 900, idempotency_key: "k-1" });
    expect(same.statusCode).toBe(201);
    expect(tables.payments).toHaveLength(1);
    expect(tables.payments[0]).toMatchObject({ amount: 900, reference: tables.payment_intents[0].id });

    const replay = await record({ amount: 900, idempotency_key: "k-1" });
    expect(replay.body.duplicate).toBe(true);
    expect(tables.payments).toHaveLength(1);
  });
});

describe("public webhook", () => {
  it("the cash rail has no webhook: 400, never a settlement", async () => {
    const intent = posIntent({ provider: "cash", status: "pending" });
    const res = mockRes();
    await handleCustomerPaymentWebhook({ params: { provider: "cash" }, body: { TransactionReference: intent.id }, headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("CASH_NOT_ONLINE_PROVIDER");
    expect(intent.status).toBe("pending");
  });
});

describe("frontend hand-offs", () => {
  const SRC = path.resolve(__dirname, "../../src");
  const code = (rel) =>
    readFileSync(path.join(SRC, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("client portal Pay goes to the invoice's Payment Engine page and shows the balance net of payments", () => {
    const modal = code("components/clientportal/PaymentModal.jsx");
    expect(modal).toMatch(/invoiceAmountDue\(invoice, invoice\?\.payments/);
    expect(modal).toMatch(/`\/view\/\$\{encodeURIComponent\(invoice\.public_share_token\)\}`/);
    expect(modal).not.toMatch(/recordPayment|Payment\.create|card number|cvv/i);
  });

  it("Record Payment sends one idempotency key per opening", () => {
    const modal = code("components/invoice/RecordPaymentModal.jsx");
    expect(modal).toMatch(/idempotency_key: idempotencyKey/);
    expect(modal).toMatch(/if \(!isOpen\) return;\s*setPhase\('form'\);\s*setIdempotencyKey\(/);
  });
});
