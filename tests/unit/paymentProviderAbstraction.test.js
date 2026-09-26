/**
 * Provider-agnostic Payment Engine (2026-09-26).
 * Paidly POS → Payment Engine → selected provider adapter → verified webhook → payment_intents → POS/invoice.
 * Ozow is one registered adapter; nothing outside server/src/payments/providers may depend on it.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
vi.mock("../../server/src/paidlyPay/settlePosIntent.js", () => ({
  settlePosIntent: async () => ({ settled: true, duplicate: false, saleId: "sale-1" }),
}));

import {
  describeOnlineProvider,
  listCustomerPaymentProviders,
  resolveOnlineProvider,
  resolvePosTenderProvider,
} from "../../server/src/payments/paymentProviders.js";
import {
  handleCustomerPaymentWebhook,
  handlePaymentIntentCreate,
  handlePaymentProvidersList,
} from "../../server/src/payments/paymentIntentRoutes.js";
import { createOrReuseDocumentPaymentIntent } from "../../server/src/payments/documentPaymentService.js";
import { createPaymentIntentRow, confirmPaymentIntent } from "../../server/src/payments/paymentIntentService.js";
import { handleNativePosCheckout } from "../../server/src/pos/posNativeCheckout.js";
import { buildOzowNotifyHash, ozowAmountString } from "../../server/src/payments/ozowHash.js";
import { paymentProviderLabel } from "../../shared/payments/paymentProviderCatalog.js";
import { formatActorLabel } from "../../shared/clients/clientRelationshipTimeline.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const INVOICE = "22222222-2222-4222-8222-222222222222";
const SHARE = "44444444-4444-4444-8444-444444444444";
const OZOW_ENV = ["OZOW_SITE_CODE", "OZOW_API_KEY", "OZOW_PRIVATE_KEY", "OZOW_IS_TEST"];
const SECRET_PRIVATE_KEY = "private-key-never-in-browser";
const savedEnv = {};

function configureOzow() {
  process.env.OZOW_SITE_CODE = "TSTSTE0001";
  process.env.OZOW_API_KEY = "api-key-never-in-browser";
  process.env.OZOW_PRIVATE_KEY = SECRET_PRIVATE_KEY;
  process.env.OZOW_IS_TEST = "true";
}

function unconfigureOzow() {
  for (const key of OZOW_ENV) delete process.env[key];
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
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
  n.Hash = buildOzowNotifyHash(n, SECRET_PRIVATE_KEY);
  return n;
}

async function postWebhook(provider, body) {
  const res = mockRes();
  await handleCustomerPaymentWebhook({ params: { provider }, body, headers: {} }, res);
  return res;
}

async function createIntent(body) {
  const res = mockRes();
  await handlePaymentIntentCreate({ body, headers: {} }, res);
  return res;
}

function posIntent(overrides = {}) {
  const row = {
    id: randomUUID(),
    org_id: ORG,
    source_kind: "pos",
    provider: "ozow",
    amount: 120,
    currency: "ZAR",
    status: "requires_action",
    metadata: {},
    ...overrides,
  };
  tables.payment_intents.push(row);
  return row;
}

beforeEach(() => {
  for (const key of OZOW_ENV) savedEnv[key] = process.env[key];
  for (const k of Object.keys(tables)) delete tables[k];
  tables.invoices = [
    {
      id: INVOICE,
      org_id: ORG,
      client_id: null,
      invoice_number: "INV-1",
      status: "sent",
      total_amount: 500,
      currency: "ZAR",
      public_share_token: SHARE,
    },
  ];
  tables.payments = [];
  tables.payment_intents = [];
  tables.companies = [{ id: "co-own", org_id: ORG }, { id: "co-other", org_id: OTHER_ORG }];
  tables.clients = [];
  gate.current = { ok: true, user: { id: "staff-1" }, membership: { orgId: ORG, companyRole: "owner" } };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of OZOW_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
});

describe("provider abstraction — the Payment Engine picks the rail", () => {
  it("POS does not require Ozow: cash and card resolve with no provider credentials", () => {
    unconfigureOzow();
    expect(resolvePosTenderProvider("cash")).toBe("cash");
    expect(resolvePosTenderProvider("other")).toBe("cash");
    expect(resolvePosTenderProvider("card")).toBe("card_terminal");
    expect(describeOnlineProvider({ sourceKind: "pos" })).toBeNull();
  });

  it("digital tender resolves to the configured online provider, and fails cleanly when none is configured", () => {
    unconfigureOzow();
    expect(() => resolvePosTenderProvider("digital")).toThrow(expect.objectContaining({ code: "PROVIDER_NOT_CONFIGURED", status: 422 }));
    configureOzow();
    expect(resolvePosTenderProvider("digital")).toBe("ozow");
    expect(describeOnlineProvider({ sourceKind: "pos" })).toEqual({ id: "ozow", label: "Ozow" });
  });

  it("accepts an explicitly selected provider and rejects unsupported or non-online ones", () => {
    configureOzow();
    expect(resolveOnlineProvider({ sourceKind: "pos", requested: "ozow" }).id).toBe("ozow");
    expect(() => resolveOnlineProvider({ sourceKind: "pos", requested: "stripe" })).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_PAYMENT_PROVIDER" })
    );
    expect(() => resolveOnlineProvider({ sourceKind: "pos", requested: "card_terminal" })).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_PAYMENT_PROVIDER" })
    );
    expect(() => resolveOnlineProvider({ sourceKind: "pos", requested: "cash" })).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_PAYMENT_PROVIDER" })
    );
  });

  it("validates provider configuration (credentials, currency) before use", () => {
    unconfigureOzow();
    expect(() => resolveOnlineProvider({ sourceKind: "document", requested: "ozow" })).toThrow(
      expect.objectContaining({ code: "PROVIDER_NOT_CONFIGURED" })
    );
    configureOzow();
    expect(() => resolveOnlineProvider({ sourceKind: "document", currency: "USD" })).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_CURRENCY" })
    );
    expect(resolveOnlineProvider({ sourceKind: "document", currency: "ZAR" }).id).toBe("ozow");
  });

  it("POST /api/payment-intents: cash works without Ozow; digital without a provider creates no intent", async () => {
    unconfigureOzow();
    const cash = await createIntent({ source_kind: "pos", payment_method: "cash", amount: 50 });
    expect(cash.statusCode).toBe(201);
    expect(cash.body.payment_intent.provider).toBe("cash");

    const digital = await createIntent({ source_kind: "pos", payment_method: "digital", amount: 50 });
    expect(digital.statusCode).toBe(422);
    expect(digital.body.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(tables.payment_intents).toHaveLength(1);

    configureOzow();
    const online = await createIntent({ source_kind: "pos", payment_method: "digital", amount: 50 });
    expect(online.statusCode).toBe(201);
    expect(online.body.payment_intent).toMatchObject({ provider: "ozow", provider_label: "Ozow" });
  });

  it("users cannot pick an unsupported provider (or PayFast) for a customer payment", async () => {
    configureOzow();
    for (const provider of ["stripe", "payfast", "OZOW_FAKE"]) {
      const res = await createIntent({ source_kind: "pos", provider, amount: 10 });
      expect(res.statusCode).toBe(422);
    }
    expect(tables.payment_intents).toHaveLength(0);
  });

  it("the till's native checkout refuses digital before opening an intent when no provider is connected", async () => {
    unconfigureOzow();
    const res = mockRes();
    await handleNativePosCheckout(
      { body: { payment_method: "digital", items: [{ product_id: "p1", quantity: 1 }] }, headers: {}, query: {} },
      res,
      gate.current
    );
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(tables.payment_intents).toHaveLength(0);
  });

  it("a company cannot attach another organization's company to its payment intent", async () => {
    configureOzow();
    const res = await createIntent({ source_kind: "pos", payment_method: "digital", amount: 10, company_id: "co-other" });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("ORG_MISMATCH");
    expect(tables.payment_intents).toHaveLength(0);
  });
});

describe("Ozow adapter behind the engine", () => {
  it("creates an Ozow invoice intent whose TransactionReference is the Paidly intent id", async () => {
    configureOzow();
    const started = await createOrReuseDocumentPaymentIntent({ orgId: ORG, invoiceId: INVOICE, shareToken: SHARE, appOrigin: "https://www.paidly.co.za" });
    expect(started.intent).toMatchObject({ provider: "ozow", source_kind: "document", status: "requires_action" });
    const url = new URL(started.redirectUrl);
    expect(url.origin).toBe("https://pay.ozow.com");
    expect(url.searchParams.get("TransactionReference")).toBe(started.intent.id);
    expect(url.searchParams.get("Amount")).toBe("500.00");
  });

  it("invoice Pay Now without a configured provider fails cleanly and creates no intent", async () => {
    unconfigureOzow();
    await expect(
      createOrReuseDocumentPaymentIntent({ orgId: ORG, invoiceId: INVOICE, shareToken: SHARE, appOrigin: "https://www.paidly.co.za" })
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED", status: 422 });
    expect(tables.payment_intents).toHaveLength(0);
  });

  it("POS redirect returns to a provider-neutral till URL", async () => {
    configureOzow();
    const intent = await createPaymentIntentRow({ orgId: ORG, sourceKind: "pos", provider: "ozow", amount: 80, currency: "ZAR" });
    const { charge } = await confirmPaymentIntent(intent, { appOrigin: "https://www.paidly.co.za" });
    const success = new URL(new URL(charge.next_action.redirect_url).searchParams.get("SuccessUrl"));
    expect(success.pathname).toBe("/pos");
    expect(success.searchParams.get("payment")).toBe("return");
    expect(success.searchParams.get("ozow")).toBeNull();
  });

  it("verified webhook stores the provider transaction id and provider status on the canonical intent", async () => {
    configureOzow();
    const intent = posIntent();
    const res = await postWebhook("ozow", ozowNotify(intent));
    expect(res.statusCode).toBe(200);
    expect(intent).toMatchObject({ status: "paid", external_id: `oz-${intent.id}` });
    expect(intent.metadata).toMatchObject({ provider_status: "Complete", webhook_verified: true });
  });

  it("failed and cancelled provider statuses map onto the shared state machine", async () => {
    configureOzow();
    const failed = posIntent();
    await postWebhook("ozow", ozowNotify(failed, { Status: "Error" }));
    expect(failed.status).toBe("failed");
    const cancelled = posIntent();
    await postWebhook("ozow", ozowNotify(cancelled, { Status: "Cancelled" }));
    expect(cancelled.status).toBe("cancelled");
    // A later "Complete" cannot revive a failed attempt.
    const revive = await postWebhook("ozow", ozowNotify(failed));
    expect(revive.statusCode).toBe(409);
    expect(failed.status).toBe("failed");
  });

  it("duplicate callbacks are idempotent", async () => {
    configureOzow();
    const intent = posIntent();
    const notify = ozowNotify(intent);
    expect((await postWebhook("ozow", notify)).body.duplicate).toBe(false);
    const again = await postWebhook("ozow", notify);
    expect(again.statusCode).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(intent.status).toBe("paid");
  });

  it("webhook verification stays enforced and a provider only settles its own intents", async () => {
    configureOzow();
    const forged = posIntent();
    const bad = await postWebhook("ozow", { ...ozowNotify(forged), Hash: "0".repeat(128) });
    expect(bad.statusCode).toBe(400);
    expect(forged.status).toBe("requires_action");

    const cardIntent = posIntent({ provider: "card_terminal" });
    const crossRail = await postWebhook("ozow", ozowNotify(cardIntent));
    expect(crossRail.statusCode).toBe(409);
    expect(crossRail.body.code).toBe("PROVIDER_MISMATCH");
    expect(cardIntent.status).toBe("requires_action");

    const unknown = await postWebhook("stripe", {});
    expect(unknown.statusCode).toBe(404);
  });
});

describe("security — provider credentials stay server-side", () => {
  it("the providers endpoint exposes labels and status, never credentials", async () => {
    configureOzow();
    const res = mockRes();
    await handlePaymentProvidersList({ query: { source_kind: "pos" }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(SECRET_PRIVATE_KEY);
    expect(serialized).not.toContain("api-key-never-in-browser");
    expect(serialized).not.toContain("TSTSTE0001");
    expect(res.body.providers.find((p) => p.id === "ozow")).toMatchObject({ label: "Ozow", configured: true, kind: "online" });
    expect(Object.keys(res.body.providers[0]).sort()).toEqual(["configured", "currencies", "id", "kind", "label", "sourceKinds"]);
    expect(listCustomerPaymentProviders({ sourceKind: "document" }).map((p) => p.id)).toEqual(["ozow"]);
  });

  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("._")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  };

  it("browser code never reads Ozow credentials or imports a provider adapter", () => {
    const files = walk(path.resolve(__dirname, "../../src"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/OZOW_(SITE_CODE|API_KEY|PRIVATE_KEY)/);
      expect(text, file).not.toMatch(/payments\/providers\/|ozowHash/);
    }
  });

  it("POS server modules do not depend on a specific online provider", () => {
    const files = walk(path.resolve(__dirname, "../../server/src/pos"));
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/ozow/i);
    }
  });
});

describe("provider labels", () => {
  it("labels the actual provider and falls back to neutral wording", () => {
    expect(paymentProviderLabel("ozow")).toBe("Ozow");
    expect(paymentProviderLabel("card_terminal")).toBe("Card terminal");
    expect(paymentProviderLabel(null)).toBe("Payment provider");
    expect(paymentProviderLabel("something_new")).toBe("Payment provider");
    expect(formatActorLabel("payment_gateway", { provider: "ozow" })).toBe("Via Ozow");
    expect(formatActorLabel("payment_gateway", {})).toBe("Payment gateway");
  });
});
