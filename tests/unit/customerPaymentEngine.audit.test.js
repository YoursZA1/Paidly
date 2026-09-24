/**
 * Customer Payment Engine audit (2026-09-25) — the required test list, against the real services.
 * Cases already proven elsewhere are referenced, not duplicated:
 *   TEST 3 / 4  → paymentIntegrity.day1.test.js ("POST /api/payfast/once returns 410",
 *                 "processPayfastInvoiceItn throws and does not settle")
 *   TEST 5      → entitlementEnforcement.day2.test.js §13 (PayFast SaaS ITN COMPLETE → active)
 *   TEST 6      → documentPaymentLifecycle.acceptance.test.js ("never treats an Ozow Success URL…")
 *   TEST 18 (DB) → customerPaymentIntegrity.db.test.js (payments / invoice status guards, real Postgres)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const { memory, tables, gate, settlePosIntentSpy } = vi.hoisted(() => {
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
          const rec = { id: randomUUID(), created_at: now, updated_at: now, ...st.payload };
          tables[table].push(rec);
          return [rec];
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
  const gate = { current: null };
  const settlePosIntentSpy = { calls: [] };
  return { memory, tables, gate, settlePosIntentSpy };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory }));
vi.mock("../../server/src/sendInvoice.js", () => ({ sendHtmlEmail: async () => ({ success: true }) }));
vi.mock("../../server/src/pos/posConnectionsRoutes.js", () => ({
  requireOrgMember: async () => gate.current,
  requirePosPermission: async () => gate.current,
}));
vi.mock("../../server/src/pos/posEntitlement.js", () => ({ requirePosPlan: async () => true }));
vi.mock("../../server/src/pos/posBusinessType.js", () => ({ requirePosCapability: async () => true }));
vi.mock("../../server/src/paidlyPay/settlePosIntent.js", () => ({
  settlePosIntent: async (intent) => {
    settlePosIntentSpy.calls.push(intent);
    return { settled: true, duplicate: false, saleId: "sale-1" };
  },
}));

import {
  applyVerifiedProviderEvent,
  createOrReuseDocumentPaymentIntent,
  settleDocumentIntent,
} from "../../server/src/payments/documentPaymentService.js";
import { handleDocumentRecord } from "../../server/src/payments/documentPaymentRoutes.js";
import {
  handleCustomerPaymentWebhook,
  handlePaymentIntentCreate,
  handlePaymentIntentGet,
  handlePaymentIntentAction,
} from "../../server/src/payments/paymentIntentRoutes.js";
import {
  attachPosSaleToIntent,
  confirmPaymentIntent,
  createPaymentIntentRow,
  settleTillCashIntent,
} from "../../server/src/payments/paymentIntentService.js";
import { buildOzowNotifyHash, ozowAmountString } from "../../server/src/payments/ozowHash.js";
import { invoiceAmountDue } from "../../shared/payments/invoiceBalance.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const INVOICE = "22222222-2222-4222-8222-222222222222";
const SHARE = "44444444-4444-4444-8444-444444444444";

function reset() {
  for (const k of Object.keys(tables)) delete tables[k];
  settlePosIntentSpy.calls.length = 0;
  tables.invoices = [
    {
      id: INVOICE,
      org_id: ORG,
      client_id: null,
      invoice_number: "INV-1",
      status: "sent",
      total_amount: 1000,
      currency: "ZAR",
      public_share_token: SHARE,
      user_id: "owner-1",
      created_by: "owner-1",
    },
  ];
  tables.payments = [];
  tables.payment_intents = [];
  tables.companies = [{ id: "co-own", org_id: ORG }, { id: "co-other", org_id: OTHER_ORG }];
  tables.clients = [{ id: "cl-other", org_id: OTHER_ORG }];
  gate.current = { ok: true, user: { id: "staff-1" }, membership: { orgId: ORG, companyRole: "admin" } };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

async function startInvoicePayment() {
  return createOrReuseDocumentPaymentIntent({ orgId: ORG, invoiceId: INVOICE, shareToken: SHARE, appOrigin: "https://www.paidly.co.za" });
}

function ozowNotify(intent, overrides = {}) {
  const n = {
    SiteCode: "TSTSTE0001",
    TransactionId: `oz-${intent.id}`,
    TransactionReference: intent.id,
    Amount: ozowAmountString(intent.amount),
    Status: "Complete",
    Optional1: intent.source_kind,
    Optional2: intent.document_id || "",
    Optional3: intent.org_id,
    Optional4: "",
    Optional5: "",
    CurrencyCode: "ZAR",
    IsTest: "true",
    StatusMessage: "Approved",
    ...overrides,
  };
  n.Hash = buildOzowNotifyHash(n, "private-key");
  return n;
}

async function postOzowWebhook(body) {
  const res = mockRes();
  await handleCustomerPaymentWebhook({ params: { provider: "ozow" }, body, headers: {} }, res);
  return res;
}

const invoice = () => tables.invoices[0];

beforeEach(() => {
  reset();
  process.env.OZOW_SITE_CODE = "TSTSTE0001";
  process.env.OZOW_API_KEY = "key";
  process.env.OZOW_PRIVATE_KEY = "private-key";
  process.env.OZOW_IS_TEST = "true";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("invoice payments go through payment_intents", () => {
  it("TEST 1 — Pay creates a document payment_intent for the outstanding amount (server-derived)", async () => {
    const started = await startInvoicePayment();
    expect(started.intent).toMatchObject({ source_kind: "document", document_id: INVOICE, org_id: ORG, provider: "ozow" });
    expect(Number(started.intent.amount)).toBe(1000);
    expect(started.intent.status).toBe("requires_action");
    expect(tables.payments).toHaveLength(0);
    expect(invoice().status).toBe("sent");
  });

  it("TEST 2 / 11 — a raw intent cannot target an invoice or carry a client amount", async () => {
    const res = mockRes();
    await handlePaymentIntentCreate(
      { body: { source_kind: "document", provider: "ozow", amount: 1, document_id: INVOICE }, headers: {} },
      res
    );
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe("USE_DOCUMENT_PAY");
    expect(tables.payment_intents).toHaveLength(0);
  });

  it("TEST 11 — Ozow notify with a different amount is rejected (409) and settles nothing", async () => {
    const { intent } = await startInvoicePayment();
    const res = await postOzowWebhook(ozowNotify(intent, { Amount: ozowAmountString(1) }));
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("AMOUNT_MISMATCH");
    expect(tables.payments).toHaveLength(0);
    expect(invoice().status).toBe("sent");
  });

  it("TEST 7 — unverified notify (bad hash) settles nothing; PayFast is refused as a customer rail", async () => {
    const { intent } = await startInvoicePayment();
    const forged = { ...ozowNotify(intent), Hash: "0".repeat(128) };
    const res = await postOzowWebhook(forged);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("OZOW_HASH_INVALID");
    expect(tables.payment_intents[0].status).toBe("requires_action");
    expect(tables.payments).toHaveLength(0);

    const pf = mockRes();
    await handleCustomerPaymentWebhook({ params: { provider: "payfast" }, body: {}, headers: {} }, pf);
    expect(pf.statusCode).toBe(400);
    expect(pf.body.code).toBe("PAYFAST_NOT_CUSTOMER_RAIL");
  });

  it("TEST 8 / 9 / 20 — verified Ozow notify settles once; replays create no second payment", async () => {
    const { intent } = await startInvoicePayment();
    const notify = ozowNotify(intent);
    const first = await postOzowWebhook(notify);
    expect(first.statusCode).toBe(200);
    expect(first.body.settlement).toMatchObject({ settled: true, duplicate: false, invoice_status: "paid", amount_due: 0 });

    const again = await postOzowWebhook(notify);
    expect(again.statusCode).toBe(200);
    expect(again.body.duplicate).toBe(true);
    await settleDocumentIntent(tables.payment_intents[0]); // direct repeat of the settlement adapter

    expect(tables.payments).toHaveLength(1);
    expect(tables.payments[0]).toMatchObject({ method: "ozow", reference: intent.id, amount: 1000, status: "paid" });
    expect(invoice().status).toBe("paid");
  });

  it.each([
    ["TEST 12", "Error", "failed"],
    ["TEST 12", "Abandoned", "failed"],
    ["TEST 13", "Cancelled", "cancelled"],
  ])("%s — Ozow %s → intent %s; invoice stays unpaid and a later Complete cannot revive it", async (_t, ozowStatus, expected) => {
    const { intent } = await startInvoicePayment();
    const res = await postOzowWebhook(ozowNotify(intent, { Status: ozowStatus }));
    expect(res.statusCode).toBe(200);
    expect(tables.payment_intents[0].status).toBe(expected);
    expect(invoice().status).toBe("sent");

    const revive = await postOzowWebhook(ozowNotify(intent, { Status: "Complete", TransactionId: "oz-late" }));
    expect(revive.statusCode).toBe(409);
    expect(revive.body.code).toBe("INVALID_INTENT_TRANSITION");
    expect(tables.payments).toHaveLength(0);
    expect(invoice().status).toBe("sent");
  });

  it("TEST 19 — partial payment: next intent is for the balance; settling it moves partially_paid → paid", async () => {
    tables.payments.push({ id: "p-cash", org_id: ORG, invoice_id: INVOICE, amount: 400, status: "completed", method: "cash", paid_at: new Date().toISOString() });
    invoice().status = "partially_paid";
    expect(invoiceAmountDue(invoice(), tables.payments)).toBe(600);

    const { intent } = await startInvoicePayment();
    expect(Number(intent.amount)).toBe(600);
    await postOzowWebhook(ozowNotify(intent));
    expect(invoice().status).toBe("paid");
    expect(invoiceAmountDue(invoice(), tables.payments)).toBe(0);
  });

  it("TEST 10 — another company cannot read, cancel or settle an intent through the org APIs", async () => {
    const { intent } = await startInvoicePayment();
    gate.current = { ok: true, user: { id: "intruder" }, membership: { orgId: OTHER_ORG } };

    const get = mockRes();
    await handlePaymentIntentGet({ params: { id: intent.id }, query: {}, headers: {} }, get);
    expect(get.statusCode).toBe(404);

    const act = mockRes();
    await handlePaymentIntentAction({ params: { id: intent.id }, body: { action: "cancel" }, headers: {} }, act);
    expect(act.statusCode).toBe(404);
    expect(tables.payment_intents[0].status).toBe("requires_action");

    const create = mockRes();
    await handlePaymentIntentCreate({ body: { source_kind: "pos", provider: "cash", amount: 10, company_id: "co-own" }, headers: {} }, create);
    expect(create.statusCode).toBe(403); // co-own belongs to ORG, not the caller's org
    expect(create.body.code).toBe("ORG_MISMATCH");
  });
});

describe("POS payments", () => {
  const posIntent = (partial = {}) => {
    const row = {
      id: randomUUID(),
      org_id: ORG,
      source_kind: "pos",
      provider: "cash",
      amount: 150,
      currency: "ZAR",
      status: "pending",
      metadata: {},
      ...partial,
    };
    tables.payment_intents.push(row);
    return row;
  };

  it("TEST 14 — till cash settles the intent with tendered/change; a cancelled cash intent is never paid", async () => {
    const intent = posIntent();
    const paid = await settleTillCashIntent(intent, 200);
    expect(paid.charge).toMatchObject({ status: "paid", change_due: 50 });
    expect(tables.payment_intents[0]).toMatchObject({ status: "paid", external_id: `till-cash:${intent.id}` });

    const cancelled = posIntent({ status: "cancelled" });
    const refused = await settleTillCashIntent(cancelled, 200);
    expect(refused.charge.status).toBe("cancelled");
    expect(refused.charge.code).toBe("INVALID_INTENT_TRANSITION");
    expect(cancelled.status).toBe("cancelled");

    const expired = posIntent({ status: "pending", expires_at: new Date(Date.now() - 60_000).toISOString() });
    expect((await settleTillCashIntent(expired, 200)).charge.code).toBe("INTENT_EXPIRED");
    expect(expired.status).toBe("pending");
  });

  it("TEST 15 — POS Ozow settles only through a verified notify on its payment_intent", async () => {
    const intent = posIntent({ provider: "ozow", status: "requires_action" });
    const res = await postOzowWebhook(ozowNotify(intent));
    expect(res.statusCode).toBe(200);
    expect(intent.status).toBe("paid");
    expect(settlePosIntentSpy.calls).toHaveLength(1);

    const bad = posIntent({ provider: "ozow", status: "requires_action" });
    await postOzowWebhook({ ...ozowNotify(bad), Hash: "f".repeat(128) });
    expect(bad.status).toBe("requires_action");
    expect(settlePosIntentSpy.calls).toHaveLength(1);
  });

  it("TEST 16 — card terminal / Yoco / Square never return paid from a till click; a sale cannot attach to an unpaid intent", async () => {
    for (const rail of ["paidly_pay", "yoco", "square"]) {
      const intent = posIntent({ provider: "card_terminal", metadata: { card_rail: { id: rail } } });
      const confirmed = await confirmPaymentIntent(intent, {});
      expect(confirmed.intent.status).toBe("requires_action");
      expect(confirmed.intent.status).not.toBe("paid");
    }
    const unpaid = posIntent({ provider: "card_terminal", status: "requires_action" });
    await expect(attachPosSaleToIntent(unpaid.id, "sale-x")).rejects.toMatchObject({ code: "INTENT_NOT_PAID" });
    expect(unpaid).toMatchObject({ status: "requires_action" });
    expect(unpaid.pos_sale_event_id).toBeUndefined();
  });

  it("TEST 16 — mock outcomes are refused unless PAYMENT_PROVIDER_MODE=mock (and never in production without ALLOW_MOCK_PAYMENTS)", async () => {
    const intent = posIntent({ provider: "card_terminal", status: "requires_action" });
    const res = mockRes();
    await handlePaymentIntentAction({ params: { id: intent.id }, body: { action: "mock", outcome: "succeeded" }, headers: {} }, res);
    expect(res.statusCode).toBe(403);
    expect(intent.status).toBe("requires_action");

    const { isMockPaymentsEnabled } = await import("../../shared/payments/paidlyPayContract.js");
    expect(isMockPaymentsEnabled({ PAYMENT_PROVIDER_MODE: "mock", NODE_ENV: "production" })).toBe(false);
  });
});

describe("static audit — no customer path around the Payment Engine", () => {
  const SRC = path.resolve(__dirname, "../../src");
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("._")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|jsx|ts|tsx)$/.test(name) && !/\.test\./.test(name)) files.push(full);
    }
  };
  walk(SRC);
  // Code only: comments (docs of what was removed) are not call sites.
  const read = (f) =>
    readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("TEST 17 — no SPA code calls a customer PayFast checkout or invoice ITN", () => {
    const offenders = files.filter((f) =>
      /\/api\/payfast\/once|payfastOnceApi|processPayfastInvoiceItn|payfastInvoiceItn/.test(read(f))
    );
    expect(offenders).toEqual([]);
  });

  it("TEST 18 — the SPA never writes payment_intents / pos_sales_events, and never writes an Engine payment", () => {
    const writes = files.filter((f) =>
      /from\(\s*["'](payment_intents|pos_sales_events)["']\s*\)\s*\.(insert|update|upsert|delete)/.test(read(f))
    );
    expect(writes).toEqual([]);
    const engineMethod = files.filter((f) => /method:\s*["'](ozow|card_terminal|paidly_pay|payfast)["']/.test(read(f)));
    expect(engineMethod).toEqual([]);
  });

  it("'Mark as Paid' opens Record Payment instead of flipping the status", () => {
    const actions = read(path.join(SRC, "components/invoice/InvoiceActions.jsx"));
    expect(actions).toMatch(/newStatus === INVOICE_STATUS\.paid \|\| newStatus === INVOICE_STATUS\.partially_paid\)\s*\{\s*setShowPaymentModal\(true\)/);
    const detail = read(path.join(SRC, "pages/DocumentDetail.jsx"));
    expect(detail).toMatch(/doc\.type === DOCUMENT_TYPES\.invoice\)\s*\{[\s\S]{0,400}navigate\(createPageUrl\(`ViewInvoice/);
  });
});

describe("offline invoice money = Payment Engine cash with approved settlement", () => {
  const record = async (body, who = gate.current) => {
    gate.current = who;
    const res = mockRes();
    await handleDocumentRecord({ method: "POST", body: { invoice_id: INVOICE, ...body }, headers: {} }, res);
    return res;
  };
  const employee = { ok: true, user: { id: "emp-1" }, membership: { orgId: ORG, companyRole: "employee" } };

  it("owner/manager records EFT received: cash intent → paid → one payment linked to it → derived status", async () => {
    const res = await record({ amount: 400, payment_method: "bank_transfer", reference: "FNB-123", idempotency_key: "k1" });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ invoice_status: "partially_paid", amount_due: 600 });
    const [intent] = tables.payment_intents;
    expect(intent).toMatchObject({ source_kind: "document", provider: "cash", status: "paid", document_id: INVOICE });
    expect(intent.metadata).toMatchObject({ origin: "offline_receipt", offline_method: "bank_transfer", settlement: "approved", approved_by: "staff-1" });
    expect(tables.payments).toEqual([
      expect.objectContaining({ amount: 400, method: "bank_transfer", reference: intent.id, status: "paid", notes: "Ref FNB-123" }),
    ]);

    const replay = await record({ amount: 400, payment_method: "bank_transfer", idempotency_key: "k1" });
    expect(replay.statusCode).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(tables.payments).toHaveLength(1);

    const rest = await record({ amount: 600, payment_method: "cash" });
    expect(rest.body).toMatchObject({ invoice_status: "paid", amount_due: 0 });
    expect(invoice().status).toBe("paid");
  });

  it("refuses: overpayment, draft / void / paid invoices, client-sent status or provider", async () => {
    expect((await record({ amount: 1000.02 })).body.code).toBe("AMOUNT_EXCEEDS_BALANCE");
    expect((await record({ amount: 0 })).body.code).toBe("AMOUNT_INVALID");
    expect((await record({ amount: 10, payment_method: "ozow" })).body.code).toBe("CLIENT_OVERRIDE_FORBIDDEN");
    expect((await record({ amount: 10, status: "paid" })).body.code).toBe("CLIENT_OVERRIDE_FORBIDDEN");
    expect((await record({ amount: 10, payment_method: "crypto" })).body.code).toBe("METHOD_INVALID");
    invoice().status = "draft";
    expect((await record({ amount: 10 })).body.code).toBe("INVOICE_NOT_PAYABLE");
    invoice().status = "void";
    expect((await record({ amount: 10 })).body.code).toBe("INVOICE_NOT_PAYABLE");
    expect(tables.payments).toHaveLength(0);
    expect(tables.payment_intents.filter((i) => i.status === "paid")).toHaveLength(0);
  });

  it("an employee who does not own the invoice, and till (POS access) sessions, cannot approve", async () => {
    expect((await record({ amount: 100 }, employee)).statusCode).toBe(403);
    expect((await record({ amount: 100 }, { ...employee, posAccess: true })).statusCode).toBe(403);
    const cashier = { ok: true, user: { id: "owner-1" }, membership: { orgId: ORG, companyRole: "employee", jobFunction: "pos" } };
    expect((await record({ amount: 100 }, cashier)).statusCode).toBe(403);
    expect(tables.payments).toHaveLength(0);
    // …but an employee who created the invoice may record against it.
    expect((await record({ amount: 100 }, { ...employee, user: { id: "owner-1" } })).statusCode).toBe(201);
  });

  it("Pay now (Ozow) never reuses an offline cash intent", async () => {
    await record({ amount: 100 });
    const { intent } = await startInvoicePayment();
    expect(intent.provider).toBe("ozow");
    expect(Number(intent.amount)).toBe(900);
  });

  it("a provider only settles its own rail: an Ozow notify cannot pay a cash intent (PROVIDER_MISMATCH)", async () => {
    const cash = { id: randomUUID(), org_id: ORG, source_kind: "document", provider: "cash", document_id: INVOICE, amount: 1000, status: "pending", metadata: {} };
    tables.payment_intents.push(cash);
    const res = await postOzowWebhook(ozowNotify(cash));
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("PROVIDER_MISMATCH");
    expect(cash.status).toBe("pending");
    expect(tables.payments).toHaveLength(0);
  });
});

describe("card / terminal rail is off in production (no acquirer)", () => {
  const withProduction = async (fn) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_PROVIDER_MODE", "");
    try {
      await fn();
    } finally {
      vi.unstubAllEnvs();
    }
  };

  it("no card intent can be created, and an existing one can never become paid", async () => {
    const existing = { id: randomUUID(), org_id: ORG, source_kind: "pos", provider: "card_terminal", amount: 50, status: "requires_action", metadata: {} };
    tables.payment_intents.push(existing);
    await withProduction(async () => {
      await expect(
        createPaymentIntentRow({ orgId: ORG, sourceKind: "pos", provider: "card_terminal", amount: 50, currency: "ZAR", idempotencyKey: "c1" })
      ).rejects.toMatchObject({ code: "CARD_RAIL_UNAVAILABLE", status: 422 });
      await expect(
        applyVerifiedProviderEvent({ intentId: existing.id, nextStatus: "paid", provider: "card_terminal", metadata: { terminal_confirmed: true } })
      ).rejects.toMatchObject({ code: "CARD_RAIL_UNAVAILABLE" });
    });
    expect(existing.status).toBe("requires_action");
    expect(settlePosIntentSpy.calls).toHaveLength(0);
  });

  it("development keeps the rail for testing (still webhook-only, never paid from a click)", async () => {
    const row = await createPaymentIntentRow({ orgId: ORG, sourceKind: "pos", provider: "card_terminal", amount: 50, currency: "ZAR", idempotencyKey: "c2" });
    expect(row.status).toBe("pending");
  });
});

describe("static — the SPA cannot record money itself", () => {
  const SRC = path.resolve(__dirname, "../../src");
  const all = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("._")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|jsx|ts|tsx)$/.test(name) && !/\.test\./.test(name)) all.push(full);
    }
  };
  walk(SRC);
  const code = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("no Payment.create / update / delete, and no direct payments insert/update/delete", () => {
    const offenders = all.filter((f) => {
      const c = code(f);
      return /\bPayment\.(create|update|delete|bulkCreate)\(/.test(c) || /from\(\s*["']payments["']\s*\)\s*\.(insert|update|upsert|delete)/.test(c);
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("imports never create an invoice already paid", async () => {
    const { csvRowToInvoicePayload } = await import("../../src/utils/invoiceCsvMapping.js");
    for (const status of ["paid", "partially_paid", "partial_paid"]) {
      const { payload } = csvRowToInvoicePayload(["invoice_number", "status", "total_amount"], ["INV-9", status, "100"]);
      expect(payload.status).toBe("sent");
    }
  });
});
