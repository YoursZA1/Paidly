import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const ORG = "11111111-1111-4111-8111-111111111111";
const COMPANY_A = "22222222-2222-4222-8222-222222222222";
const COMPANY_B = "33333333-3333-4333-8333-333333333333";
const INTENT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const INTENT_B = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const API_KEY = "test-pos-api-key-value";
const WEBHOOK_SECRET = "test-webhook-secret-value";

const { memory } = vi.hoisted(() => {
  const tables = {
    payment_intents: [],
    pos_sales_events: [],
    payment_provider_events: [],
    payment_refunds: [],
    paidly_api_keys: [],
    paidly_devices: [],
    pos_audit_events: [],
  };

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter.op === "eq") return String(row[filter.col] ?? "") === String(filter.value ?? "");
        if (filter.op === "in") return (filter.value || []).includes(row[filter.col]);
        if (filter.op === "is") return row[filter.col] == null;
        if (filter.op === "lt") return String(row[filter.col] ?? "") < String(filter.value ?? "");
        return true;
      })
    );
  }

  const memory = {
    tables,
    reset() {
      for (const key of Object.keys(tables)) tables[key] = [];
    },
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
            id: state.payload.id || crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...state.payload,
          };
          if (table === "payment_provider_events") {
            const existing = rows.find(
              (row) => row.org_id === rec.org_id && row.provider_event_id === rec.provider_event_id
            );
            if (existing) return { data: null, error: { code: "23505" } };
          }
          if (table === "pos_sales_events" && rec.connection_id && rec.external_id) {
            const existing = rows.find(
              (row) => row.connection_id === rec.connection_id && row.external_id === rec.external_id
            );
            if (existing) return { data: null, error: { code: "23505" } };
          }
          rows.push(rec);
          tables[table] = rows;
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
          found.forEach((row) => Object.assign(row, state.payload, { updated_at: new Date().toISOString() }));
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
        is(col) {
          state.filters.push({ op: "is", col, value: null });
          return api;
        },
        lt(col, value) {
          state.filters.push({ op: "lt", col, value });
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

  return { memory };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({
  supabaseAdmin: {
    from: (table) => memory.from(table),
  },
}));

vi.mock("../../server/src/pos/posInventorySync.js", () => ({
  commitNativePosInventory: vi.fn(async () => ({
    applied: true,
    failed: null,
    duplicate: false,
    results: [],
  })),
}));

vi.mock("../../server/src/pos/posAudit.js", () => ({
  recordPosAuditEvent: vi.fn(async () => ({ ok: true })),
  recordPosAuditEvents: vi.fn(async () => {}),
}));

import { handlePaidlyPayApi } from "../../server/src/paidlyPay/paidlyPayApi.js";
import { hmacSha256Hex } from "../../server/src/paidlyPay/paidlyPayHmac.js";
import { redactSensitive } from "../../server/src/paidlyPay/paidlyPayHttp.js";
import { PAIDLY_PAY_ERROR } from "../../shared/payments/paidlyPayContract.js";

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    },
  };
}

function createReq({ method = "GET", url = "/api/paidly/health", headers = {}, body = {}, rawBody, query = {}, paidlyParts }) {
  return {
    method,
    url,
    headers,
    body,
    rawBody,
    query,
    paidlyParts,
  };
}

function openIntent(overrides = {}) {
  return {
    id: INTENT_A,
    org_id: ORG,
    company_id: COMPANY_A,
    source_kind: "pos",
    provider: "card_terminal",
    amount: 450,
    currency: "ZAR",
    status: "requires_action",
    pos_sale_event_id: null,
    metadata: {
      payment_method: "card",
      checkout: {
        items: [{ product_id: "p1", quantity: 1, unit_price: 450, line_total: 450 }],
        payment_method: "card",
        idempotency_key: "checkout-1",
        customer_name: "Walk-in Customer",
        company_id: COMPANY_A,
      },
    },
    created_at: "2026-09-15T17:30:00.000Z",
    updated_at: "2026-09-15T17:30:00.000Z",
    ...overrides,
  };
}

function authHeaders() {
  return { authorization: `Bearer ${API_KEY}` };
}

function signedReq(eventBody) {
  const rawBody = JSON.stringify(eventBody);
  return {
    method: "POST",
    url: "/api/paidly/webhooks/payment",
    paidlyParts: ["webhooks", "payment"],
    headers: {
      "x-pos-signature": hmacSha256Hex(rawBody, WEBHOOK_SECRET),
    },
    body: JSON.parse(rawBody),
    rawBody,
  };
}

describe("Paidly Pay API", () => {
  const envKeys = [
    "POS_API_KEY",
    "POS_API_ORG_ID",
    "POS_API_COMPANY_ID",
    "POS_WEBHOOK_SECRET",
    "PAYMENT_PROVIDER_MODE",
    "PAIDLY_PAY_APP_URL",
    "RATE_LIMIT_PERSIST",
    "NODE_ENV",
  ];
  const previous = {};

  beforeEach(() => {
    for (const key of envKeys) previous[key] = process.env[key];
    process.env.POS_API_KEY = API_KEY;
    process.env.POS_API_ORG_ID = ORG;
    process.env.POS_API_COMPANY_ID = COMPANY_A;
    process.env.POS_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.PAYMENT_PROVIDER_MODE = "mock";
    process.env.PAIDLY_PAY_APP_URL = "https://www.paidly.co.za";
    process.env.RATE_LIMIT_PERSIST = "false";
    process.env.NODE_ENV = "test";
    memory.reset();
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it("health succeeds without secrets", async () => {
    const res = createRes();
    await handlePaidlyPayApi(createReq({ paidlyParts: ["health"] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: "paidly-api", version: "1" });
    expect(JSON.stringify(res.body)).not.toContain(API_KEY);
    expect(JSON.stringify(res.body)).not.toContain(WEBHOOK_SECRET);
  });

  it("rejects a missing API key", async () => {
    const res = createRes();
    await handlePaidlyPayApi(createReq({ url: "/api/paidly/transactions", paidlyParts: ["transactions"] }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe(PAIDLY_PAY_ERROR.UNAUTHORIZED);
  });

  it("rejects an invalid API key", async () => {
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        url: "/api/paidly/transactions",
        paidlyParts: ["transactions"],
        headers: { authorization: "Bearer wrong-key" },
      }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid API key and lists open transactions", async () => {
    memory.tables.payment_intents.push(openIntent());
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "GET",
        url: "/api/paidly/transactions",
        paidlyParts: ["transactions"],
        headers: authHeaders(),
        query: { status: "open" },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0]).toMatchObject({
      id: INTENT_A,
      amount: 450,
      currency: "ZAR",
      status: "open",
      company_id: COMPANY_A,
    });
  });

  it("rejects a cross-company transaction", async () => {
    memory.tables.payment_intents.push(openIntent({ id: INTENT_B, company_id: COMPANY_B }));
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "GET",
        url: `/api/paidly/transactions/${INTENT_B}`,
        paidlyParts: ["transactions", INTENT_B],
        headers: authHeaders(),
      }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe(PAIDLY_PAY_ERROR.CROSS_COMPANY_DENIED);
  });

  it("returns 404 for a nonexistent transaction", async () => {
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "GET",
        paidlyParts: ["transactions", INTENT_A],
        headers: authHeaders(),
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("creates/reuses a payment intent from a valid open transaction", async () => {
    memory.tables.payment_intents.push(openIntent());
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents"],
        headers: authHeaders(),
        body: { pos_transaction_id: INTENT_A, payment_method: "tap_to_pay" },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.payment_intent_id).toBe(INTENT_A);
    expect(res.body.amount).toBe(450);
    expect(res.body.payment_method).toBe("tap_to_pay");
    expect(res.body.next_action.display).toBe("TAP CARD");
    expect(res.body.next_action.payment_intent_id).toBe(INTENT_A);
    expect(res.body.next_action.open_url).toBe(
      `https://www.paidly.co.za/pay?payment_intent_id=${INTENT_A}`
    );
    expect(JSON.stringify(res.body)).not.toContain(API_KEY);
  });

  it("rejects an already-paid transaction", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "paid", pos_sale_event_id: "sale-1" }));
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents"],
        headers: authHeaders(),
        body: { pos_transaction_id: INTENT_A, payment_method: "tap_to_pay" },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe(PAIDLY_PAY_ERROR.PAYMENT_TRANSACTION_ALREADY_PAID);
  });

  it("rejects an invalid transaction id", async () => {
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents"],
        headers: authHeaders(),
        body: { pos_transaction_id: "not-a-uuid", payment_method: "qr" },
      }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it("does not let the client override amount or status", async () => {
    memory.tables.payment_intents.push(openIntent());
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents"],
        headers: authHeaders(),
        body: { pos_transaction_id: INTENT_A, payment_method: "tap_to_pay", amount: 1, status: "succeeded" },
      }),
      res
    );
    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe(PAIDLY_PAY_ERROR.AMOUNT_OVERRIDE_FORBIDDEN);
    expect(memory.tables.payment_intents[0].amount).toBe(450);
    expect(memory.tables.payment_intents[0].status).toBe("requires_action");
  });

  it("accepts a valid webhook signature and marks the POS sale paid", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "requires_action" }));
    const res = createRes();
    await handlePaidlyPayApi(
      createReq(
        signedReq({
          event: "payment.succeeded",
          provider_event_id: "evt_123",
          payment_intent_id: INTENT_A,
          amount: 450,
        })
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(memory.tables.payment_intents[0].status).toBe("paid");
    expect(memory.tables.pos_sales_events).toHaveLength(1);
    expect(memory.tables.pos_sales_events[0].total_amount).toBe(450);
  });

  it("rejects an invalid webhook signature", async () => {
    const rawBody = JSON.stringify({ event: "payment.succeeded", payment_intent_id: INTENT_A, provider_event_id: "evt_bad" });
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["webhooks", "payment"],
        headers: { "x-pos-signature": "deadbeef" },
        rawBody,
        body: JSON.parse(rawBody),
      }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe(PAIDLY_PAY_ERROR.INVALID_SIGNATURE);
  });

  it("rejects a missing webhook signature", async () => {
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["webhooks", "payment"],
        rawBody: JSON.stringify({ event: "payment.succeeded", payment_intent_id: INTENT_A }),
        body: { event: "payment.succeeded", payment_intent_id: INTENT_A },
      }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe(PAIDLY_PAY_ERROR.MISSING_SIGNATURE);
  });

  it("does not double-process a duplicate webhook", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "requires_action" }));
    const payload = {
      event: "payment.succeeded",
      provider_event_id: "evt_123",
      payment_intent_id: INTENT_A,
      amount: 450,
    };
    const first = createRes();
    await handlePaidlyPayApi(createReq(signedReq(payload)), first);
    expect(first.body.duplicate).toBeFalsy();
    const second = createRes();
    await handlePaidlyPayApi(createReq(signedReq(payload)), second);
    expect(second.statusCode).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(memory.tables.pos_sales_events).toHaveLength(1);
  });

  it("does not mark the POS sale paid on a failed webhook", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "requires_action" }));
    const res = createRes();
    await handlePaidlyPayApi(
      createReq(
        signedReq({
          event: "payment.failed",
          provider_event_id: "evt_fail",
          payment_intent_id: INTENT_A,
        })
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(memory.tables.payment_intents[0].status).toBe("failed");
    expect(memory.tables.pos_sales_events).toHaveLength(0);
  });

  it("simulates a mock success once and ignores a duplicate tap", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "requires_action" }));
    const first = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents", INTENT_A, "simulate"],
        headers: authHeaders(),
        body: { outcome: "succeeded" },
      }),
      first
    );
    expect(first.statusCode).toBe(200);
    expect(memory.tables.payment_intents[0].status).toBe("paid");
    expect(memory.tables.pos_sales_events).toHaveLength(1);
    const second = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents", INTENT_A, "simulate"],
        headers: authHeaders(),
        body: { outcome: "succeeded" },
      }),
      second
    );
    expect(second.body.duplicate).toBe(true);
    expect(memory.tables.pos_sales_events).toHaveLength(1);
  });

  it("cancels a payment without writing a POS sale", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "requires_action" }));
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents", INTENT_A, "cancel"],
        headers: authHeaders(),
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(memory.tables.payment_intents[0].status).toBe("cancelled");
    expect(memory.tables.pos_sales_events).toHaveLength(0);
  });

  it("refunds a successful payment only after a verified webhook", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "paid" }));
    const request = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents", INTENT_A, "refund"],
        headers: authHeaders(),
        body: { amount: 450, reason: "Customer returned product" },
      }),
      request
    );
    expect(request.statusCode).toBe(202);
    expect(memory.tables.payment_intents[0].status).toBe("paid");
    expect(memory.tables.payment_refunds[0].status).toBe("pending");

    const webhook = createRes();
    await handlePaidlyPayApi(
      createReq(
        signedReq({
          event: "payment.refunded",
          provider_event_id: "evt_refund_1",
          payment_intent_id: INTENT_A,
        })
      ),
      webhook
    );
    expect(webhook.statusCode).toBe(200);
    expect(memory.tables.payment_intents[0].status).toBe("refunded");
  });

  it("does not refund a failed payment", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "failed" }));
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents", INTENT_A, "refund"],
        headers: authHeaders(),
        body: { amount: 450 },
      }),
      res
    );
    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe(PAIDLY_PAY_ERROR.PAYMENT_NOT_REFUNDABLE);
  });

  it("rejects a refund greater than the paid amount", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "paid" }));
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents", INTENT_A, "refund"],
        headers: authHeaders(),
        body: { amount: 999 },
      }),
      res
    );
    expect(res.statusCode).toBe(422);
    expect(res.body.error.code).toBe(PAIDLY_PAY_ERROR.REFUND_AMOUNT_INVALID);
  });

  it("rejects a cross-company refund", async () => {
    memory.tables.payment_intents.push(openIntent({ status: "paid", company_id: COMPANY_B }));
    const res = createRes();
    await handlePaidlyPayApi(
      createReq({
        method: "POST",
        paidlyParts: ["payment-intents", INTENT_A, "refund"],
        headers: authHeaders(),
        body: { amount: 450 },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it("never puts secrets in responses or redacted logs", () => {
    const redacted = redactSensitive({
      authorization: `Bearer ${API_KEY}`,
      webhook_secret: WEBHOOK_SECRET,
      endpoint: "/api/paidly/health",
    });
    expect(JSON.stringify(redacted)).not.toContain(API_KEY);
    expect(JSON.stringify(redacted)).not.toContain(WEBHOOK_SECRET);
    expect(redacted.authorization).toBe("[redacted]");
  });
});
