/**
 * External POS sales count as money received only on provider evidence the merchant cannot forge.
 *  - per-connection webhook: Yoco-connect only (secret issued by Yoco, never shown), Yoco signature
 *  - manual / generic connections (secret handed to the merchant) are refused, and cannot be created
 *    or have their secret rotated/revealed any more
 *  - a POS sale becomes a paid tax invoice only if it is verified money
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const { memory, tables, ingested } = vi.hoisted(() => {
  const tables = {};
  const ingested = [];
  const memory = {
    from(table) {
      tables[table] ||= [];
      const filters = [];
      let update = null;
      const run = () => {
        const rows = tables[table].filter((r) => filters.every(([c, v]) => String(r[c] ?? "") === String(v ?? "")));
        if (update) rows.forEach((r) => Object.assign(r, update));
        return rows;
      };
      const api = {
        select: () => api,
        update: (p) => ((update = p), api),
        eq: (c, v) => (filters.push([c, v]), api),
        maybeSingle: async () => ({ data: run()[0] || null, error: null }),
        single: async () => ({ data: run()[0] || null, error: null }),
      };
      return api;
    },
  };
  return { memory, tables, ingested };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory }));
vi.mock("../../server/src/pos/posSaleProcessor.js", () => ({
  processPosWebhookSale: async (_sb, { connection, payload }) => {
    ingested.push({ connection: connection.id, payload });
    return { ok: true, status: 200, saleEventId: "sale-1" };
  },
}));
vi.mock("../../server/src/supabaseAuth.js", () => ({
  getUserFromRequest: async () => ({ user: { id: "owner-1" } }),
}));
vi.mock("../../server/src/companyRouteAccess.js", async (importOriginal) => ({
  ...(await importOriginal()),
  loadCompanyMembership: async () => ({ orgId: "org-1", companyId: "org-1", companyRole: "admin" }),
}));
vi.mock("../../server/src/pos/posEntitlement.js", () => ({ requirePosPlan: async () => true, requirePosPlanForOrg: async () => true }));
vi.mock("../../server/src/pos/posBusinessType.js", () => ({ requirePosCapability: async () => true }));

import { handlePosWebhook } from "../../server/src/pos/posWebhookHandler.js";
import { handlePosConnectionCreate, handlePosConnectionPatch } from "../../server/src/pos/posConnectionsRoutes.js";
import { saleIsVerifiedMoney } from "../../server/src/pos/posSaleInvoice.js";

const YOCO_SECRET = `whsec_${Buffer.from("yoco-issued-secret-bytes").toString("base64")}`;

function yocoHeaders(rawBody, secret = YOCO_SECRET) {
  const id = "msg_1";
  const ts = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice(6), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` };
}

function merchantHmac(rawBody, secret) {
  return { "x-paidly-signature": crypto.createHmac("sha256", secret).update(rawBody).digest("hex") };
}

function res() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}

async function post(token, rawBody, headers) {
  const r = res();
  await handlePosWebhook({ method: "POST", params: { token }, query: {}, rawBody, body: JSON.parse(rawBody), headers }, r);
  return r;
}

const SALE = JSON.stringify({ id: "ext-1", total_amount: 5000, payment_method: "card", status: "completed" });

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  ingested.length = 0;
  tables.pos_connections = [
    { id: "c-generic", org_id: "org-1", provider: "generic", status: "active", webhook_token: "t-generic", webhook_secret: "merchant-known", config: {} },
    { id: "c-yoco-manual", org_id: "org-1", provider: "yoco", status: "active", webhook_token: "t-yoco-manual", webhook_secret: YOCO_SECRET, config: { connection_method: "manual_webhook" } },
    { id: "c-yoco", org_id: "org-1", provider: "yoco", status: "active", webhook_token: "t-yoco", webhook_secret: YOCO_SECRET, config: { connection_method: "oauth_connect" } },
    { id: "c-yoco-nosecret", org_id: "org-1", provider: "yoco", status: "active", webhook_token: "t-yoco-empty", webhook_secret: "", config: { connection_method: "oauth_connect" } },
    { id: "c-square", org_id: "org-1", provider: "square", status: "active", webhook_token: "t-square", webhook_secret: "merchant-known", config: { square_merchant_id: "SQ1" } },
  ];
});

describe("per-connection POS webhook: provider-signed only", () => {
  it("generic connection signed with the merchant's secret → refused, nothing ingested", async () => {
    const r = await post("t-generic", SALE, merchantHmac(SALE, "merchant-known"));
    expect(r.statusCode).toBe(403);
    expect(r.body.code).toBe("EXTERNAL_SALE_UNVERIFIED");
    expect(ingested).toHaveLength(0);
  });

  it("a manual 'yoco' connection or a square token-route post is refused even with a valid signature", async () => {
    expect((await post("t-yoco-manual", SALE, yocoHeaders(SALE))).statusCode).toBe(403);
    expect((await post("t-square", SALE, merchantHmac(SALE, "merchant-known"))).statusCode).toBe(403);
    expect(ingested).toHaveLength(0);
  });

  it("Yoco-connect: Yoco's signature is ingested; a wrong or missing signature / empty secret is not", async () => {
    expect((await post("t-yoco", SALE, yocoHeaders(SALE))).statusCode).toBe(200);
    expect(ingested).toHaveLength(1);

    expect((await post("t-yoco", SALE, yocoHeaders(SALE, `whsec_${Buffer.from("other").toString("base64")}`))).statusCode).toBe(401);
    expect((await post("t-yoco", SALE, merchantHmac(SALE, YOCO_SECRET))).statusCode).toBe(403);
    expect((await post("t-yoco-empty", SALE, yocoHeaders(SALE))).statusCode).toBe(401);
    expect(ingested).toHaveLength(1);
  });
});

describe("manual connections are retired", () => {
  it("cannot create one (no merchant-held signing secret is issued)", async () => {
    const r = res();
    await handlePosConnectionCreate({ headers: { authorization: "Bearer x" }, body: { provider: "generic" } }, r);
    expect(r.statusCode).toBe(410);
    expect(r.body.code).toBe("MANUAL_POS_WEBHOOK_DISABLED");
    expect(JSON.stringify(r.body)).not.toMatch(/webhook_secret/);
  });

  it("cannot rotate (and so reveal) a connection's secret", async () => {
    const r = res();
    await handlePosConnectionPatch({ headers: { authorization: "Bearer x" }, params: { id: "c-yoco" }, body: { rotate_secret: true } }, r);
    expect(r.statusCode).toBe(410);
    expect(tables.pos_connections.find((c) => c.id === "c-yoco").webhook_secret).toBe(YOCO_SECRET);
  });
});

describe("POS sale → paid tax invoice only for verified money", () => {
  it.each([
    [{ provider: "paidly" }, true],
    [{ provider: "yoco", connection_id: "c-yoco" }, true],
    [{ provider: "square", connection_id: "c-square" }, true],
    [{ provider: "generic", connection_id: "c-generic" }, false],
    [{ provider: "yoco", connection_id: "c-yoco-manual" }, false],
    [{ provider: "yoco", connection_id: null }, false],
    [{ provider: "square", connection_id: "missing" }, false],
  ])("%o → %s", async (sale, expected) => {
    expect(await saleIsVerifiedMoney(sale)).toBe(expected);
  });
});
