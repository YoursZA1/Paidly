/**
 * /api/company/product-import — auth, company isolation, permissions, plan, server-side re-validation,
 * duplicate handling, update-only-provided-fields, stock through the ledger, idempotent retries and
 * partial failures. Data access is an in-memory fake catalogue holding TWO companies; RLS and the
 * SQL lookup are covered by productImport.db.test.js.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: { from: () => ({}) } }));

const { createProductImportHandler, PRODUCT_IMPORT_MESSAGES } = await import("../../server/src/catalog/productImportRoutes.js");
const { UpgradeRequiredError } = await import("../../server/src/featureGate.js");
const { identifierKey, nameKey } = await import("../../shared/catalog/productImport.js");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const IMPORT = "44444444-4444-4444-8444-444444444444";
const COKE_A = "c0000000-0000-4000-8000-00000000000a";
const COKE_B = "c0000000-0000-4000-8000-00000000000b";

function mockRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

/** In-memory catalogue shaped like public.services, scoped by org like the real queries. */
function makeCatalogue() {
  const rows = [
    { id: COKE_A, org_id: ORG_A, name: "Coca Cola 330ml", sku: "COKE330", barcode: "5449000000996", item_type: "product", is_active: true, stock_quantity: 10, price: 11, type_specific_data: null, category: "Drinks", description: "Old description" },
    { id: COKE_B, org_id: ORG_B, name: "Coffee Beans 1kg", sku: "COF001", barcode: "6001234567892", item_type: "product", is_active: true, stock_quantity: 3, price: 150, type_specific_data: null },
  ];
  const movements = [];
  let seq = 0;
  const repo = {
    rows,
    movements,
    findMatches: vi.fn(async (orgId, { skus, barcodes, names }) => {
      const s = new Set(skus.map(identifierKey));
      const b = new Set(barcodes.map(identifierKey));
      const n = new Set(names.map(nameKey));
      return rows.filter(
        (r) => r.org_id === orgId && ((r.sku && s.has(identifierKey(r.sku))) || (r.barcode && b.has(identifierKey(r.barcode))) || n.has(nameKey(r.name)))
      );
    }),
    findByImportRefs: vi.fn(async (orgId, refs) => rows.filter((r) => r.org_id === orgId && refs.includes(r.import_ref))),
    findByIds: vi.fn(async (orgId, ids) => rows.filter((r) => r.org_id === orgId && ids.includes(r.id))),
    insertRows: vi.fn(async (newRows) => {
      for (const r of newRows) {
        if (r.org_id !== ORG_A) throw Object.assign(new Error("rls"), { code: "42501" });
        if (!r.name) throw Object.assign(new Error("null name"), { code: "23502" });
      }
      const out = [];
      for (const r of newRows) {
        if (rows.some((x) => x.org_id === r.org_id && x.import_ref && x.import_ref === r.import_ref)) continue; // ON CONFLICT DO NOTHING
        const taken = r.barcode && rows.some((x) => x.org_id === r.org_id && x.is_active !== false && x.item_type === "product" && identifierKey(x.barcode) === identifierKey(r.barcode));
        if (taken) throw Object.assign(new Error('duplicate key value violates unique constraint "idx_services_org_active_barcode_unique"'), { code: "23505" });
      }
      for (const r of newRows) {
        if (rows.some((x) => x.org_id === r.org_id && x.import_ref && x.import_ref === r.import_ref)) continue;
        const row = { id: `new-${++seq}`, ...r };
        rows.push(row);
        out.push({ id: row.id, import_ref: row.import_ref });
      }
      return out;
    }),
    updateRow: vi.fn(async (orgId, id, patch) => {
      const row = rows.find((r) => r.id === id && r.org_id === orgId);
      if (!row) return null;
      Object.assign(row, patch);
      return { id };
    }),
    adjustStock: vi.fn(async (orgId, id, delta, source) => {
      const row = rows.find((r) => r.id === id && r.org_id === orgId);
      row.stock_quantity = Number(row.stock_quantity || 0) + delta;
      movements.push({ product_id: id, delta, source });
    }),
    hasOpeningStock: vi.fn(async (id) => movements.some((m) => m.product_id === id && m.source === "initial_stock")),
    writeAudit: vi.fn(async () => {}),
  };
  return repo;
}

let repo;
let membership;
let user;
let feature;

function handler(extra = {}) {
  return createProductImportHandler({
    getUserFromRequest: async () => ({ user }),
    loadMembership: async () => membership,
    assertFeature: feature,
    userClientFor: async () => ({}),
    adminClient: {},
    repoFor: () => repo,
    rateLimit: async () => ({ ok: true }),
    log: () => {},
    ...extra,
  });
}

async function call(op, body = {}, { method = "POST", auth = "Bearer token", h } = {}) {
  const res = mockRes();
  await (h || handler())({ method, query: { op }, headers: auth ? { authorization: auth } : {}, body, url: "/api/company/product-import" }, res);
  return res;
}

const commit = (rows, over = {}) => call("commit", { import_id: IMPORT, item_type: "product", rows, ...over });
const create = (row_number, values, extra = {}) => ({ row_number, action: "create", values, ...extra });

beforeEach(() => {
  repo = makeCatalogue();
  user = { id: USER, email: "owner@spaza.co.za" };
  membership = { orgId: ORG_A, companyRole: "admin", membershipRole: "owner" };
  feature = vi.fn(async () => {});
});

describe("gate", () => {
  it("401 without a session", async () => {
    user = null;
    const res = await call("check", { rows: [] });
    expect(res.statusCode).toBe(401);
  });

  it("401 without a bearer token", async () => {
    const res = await call("check", { rows: [] }, { auth: "" });
    expect(res.statusCode).toBe(401);
  });

  it("403 for someone outside any company", async () => {
    membership = null;
    const res = await call("check", { rows: [] });
    expect(res.body.code).toBe("NO_COMPANY");
  });

  it("403 for employees and managers — only owners/admins import", async () => {
    for (const companyRole of ["employee", "manager"]) {
      membership = { orgId: ORG_A, companyRole, membershipRole: companyRole };
      const res = await commit([create(2, { name: "X" })]);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
    expect(repo.insertRows).not.toHaveBeenCalled();
  });

  it("products need the inventory feature; services need invoices", async () => {
    feature = vi.fn(async (_u, f) => {
      if (f === "inventory") throw new UpgradeRequiredError("inventory");
    });
    const res = await commit([create(2, { name: "Coke" })]);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: "UPGRADE_REQUIRED", feature: "inventory" });
    const svc = await commit([create(2, { name: "Consulting hour", price: "450" })], { item_type: "service" });
    expect(svc.statusCode).toBe(200);
    expect(feature).toHaveBeenLastCalledWith(USER, "invoices", ORG_A);
  });

  it("rejects GET and unknown ops", async () => {
    expect((await call("commit", {}, { method: "GET" })).statusCode).toBe(405);
    expect((await call("delete-all", {})).statusCode).toBe(404);
  });

  it("maps a database plan-trigger rejection to an upgrade message", async () => {
    repo.insertRows = vi.fn(async () => {
      throw Object.assign(new Error("UPGRADE_REQUIRED"), { code: "P0001", hint: "UPGRADE_REQUIRED:inventory" });
    });
    const res = await commit([create(2, { name: "Coke" })]);
    expect(res.body.code).toBe("UPGRADE_REQUIRED");
  });

  it("never exposes raw errors", async () => {
    repo.findMatches = vi.fn(async () => {
      throw new Error('relation "services" does not exist at character 42');
    });
    const res = await commit([create(2, { name: "Coke" })]);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe(PRODUCT_IMPORT_MESSAGES.generic);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|character/);
  });
});

describe("company isolation", () => {
  it("uses the server-resolved company, ignoring any org / company id in the request", async () => {
    const res = await call("commit", {
      import_id: IMPORT,
      item_type: "product",
      org_id: ORG_B,
      company_id: ORG_B,
      rows: [create(2, { name: "Rooibos Tea", org_id: ORG_B, company_id: ORG_B })],
    });
    expect(res.body.results[0].outcome).toBe("created");
    const inserted = repo.insertRows.mock.calls[0][0][0];
    expect(inserted.org_id).toBe(ORG_A);
    expect(inserted).not.toHaveProperty("company_id");
    expect(repo.findMatches.mock.calls.every(([org]) => org === ORG_A)).toBe(true);
  });

  it("another company's product is never a duplicate (same SKU / barcode / name in company B)", async () => {
    const check = await call("check", { item_type: "product", rows: [{ row_number: 2, sku: "COF001", barcode: "6001234567892", name: "Coffee Beans 1kg" }] });
    expect(check.body.matches).toEqual([]);
    expect(check.body.existing).toEqual([]);
    const res = await commit([create(2, { name: "Coffee Beans 1kg", sku: "COF001", barcode: "6001234567892", price: "R185.00", stock: "20" })]);
    expect(res.body.results[0].outcome).toBe("created");
    expect(repo.rows.find((r) => r.id === COKE_B)).toMatchObject({ stock_quantity: 3, price: 150 });
  });

  it("cannot update another company's product even with its id", async () => {
    const res = await commit([{ row_number: 2, action: "update", target_id: COKE_B, values: { name: "Hijacked", price: "1" } }]);
    expect(res.body.results[0]).toMatchObject({ outcome: "failed", reason: PRODUCT_IMPORT_MESSAGES.targetMissing });
    expect(repo.rows.find((r) => r.id === COKE_B).name).toBe("Coffee Beans 1kg");
    expect(repo.updateRow).not.toHaveBeenCalled();
  });
});

describe("check", () => {
  it("reports duplicates by SKU, barcode and name (case / space insensitive)", async () => {
    const res = await call("check", {
      item_type: "product",
      rows: [
        { row_number: 2, sku: "coke330", name: "Something else" },
        { row_number: 3, barcode: "5449000000996", name: "Another" },
        { row_number: 4, name: "  coca   COLA 330ML " },
        { row_number: 5, sku: "NEW1", name: "Brand new" },
      ],
    });
    expect(res.body.matches).toEqual([
      { row_number: 2, existing_id: COKE_A, matched_by: "sku", barcode_taken_by: null },
      { row_number: 3, existing_id: COKE_A, matched_by: "barcode", barcode_taken_by: COKE_A },
      { row_number: 4, existing_id: COKE_A, matched_by: "name", barcode_taken_by: null },
    ]);
    expect(res.body.existing[0]).toMatchObject({ id: COKE_A, name: "Coca Cola 330ml", item_type: "product" });
  });

  it("refuses oversized key lists", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ row_number: i + 2, name: `P${i}` }));
    expect((await call("check", { rows })).statusCode).toBe(422);
  });
});

describe("commit — validation happens on the server", () => {
  it("normalises South African formats before saving", async () => {
    const res = await commit([
      create(2, { name: " Coffee Beans 1kg ", sku: "COF001", price: "R 1 250,00", cost_price: "R1,000.00", vat: "0.15", stock: "Qty: 20", unit: "bags", brand: "Paidly Roasters" }),
    ]);
    expect(res.body.results[0].outcome).toBe("created");
    const row = repo.rows.find((r) => r.sku === "COF001" && r.org_id === ORG_A);
    expect(row).toMatchObject({
      name: "Coffee Beans 1kg",
      price: 1250,
      default_rate: 1250,
      rate: 1250,
      unit_price: 1250,
      cost_price: 1000,
      tax_category: "standard",
      default_unit: "bag",
      item_type: "product",
      type_specific_data: { brand: "Paidly Roasters" },
      import_ref: `${IMPORT}:2`,
      created_by_id: USER,
    });
  });

  it("rejects rows the browser should have caught (never trusts client validation)", async () => {
    const res = await commit([
      create(2, { name: "" }),
      create(3, { name: "Bad price", price: "twelve" }),
      create(4, { name: "Bad stock", stock: "-5" }),
      create(5, { name: "Bad VAT", vat: "150%" }),
      create(6, { name: "Bad barcode", barcode: "<script>" }),
      create(7, { name: "Good", price: "12" }),
    ]);
    expect(res.body.results.map((r) => [r.row_number, r.outcome])).toEqual([
      [2, "failed"],
      [3, "failed"],
      [4, "failed"],
      [5, "failed"],
      [6, "failed"],
      [7, "created"],
    ]);
    expect(res.body.results[0].reason).toBe("Product name is missing.");
    expect(res.body.results[1].reason).toBe("Selling price must be a number.");
    expect(res.body.results[1].fix).toBeTruthy();
    expect(repo.insertRows.mock.calls.flatMap((c) => c[0]).map((r) => r.name)).toEqual(["Good"]);
  });

  it("strips HTML from names (XSS) and keeps text otherwise as written", async () => {
    await commit([create(2, { name: '<img src=x onerror=alert(1)>Castle Lager 440ml', description: "<b>Crisp</b> & cold" })]);
    const row = repo.rows.find((r) => r.import_ref === `${IMPORT}:2`);
    expect(row.name).toBe("Castle Lager 440ml");
    expect(row.description).toBe("Crisp & cold");
  });

  it("refuses bad batches: no import id, >100 rows, repeated row numbers", async () => {
    expect((await call("commit", { item_type: "product", rows: [create(2, { name: "A" })] })).statusCode).toBe(422);
    const big = Array.from({ length: 101 }, (_, i) => create(i + 2, { name: `P${i}` }));
    expect((await commit(big)).statusCode).toBe(422);
    expect((await commit([create(2, { name: "A" }), create(2, { name: "B" })])).statusCode).toBe(422);
  });

  it("services ignore stock, barcode and cost", async () => {
    const res = await commit([create(2, { name: "Callout fee", price: "650", stock: "5", barcode: "5449000000996", cost_price: "100", unit: "Hour" })], { item_type: "service" });
    expect(res.body.results[0].outcome).toBe("created");
    const row = repo.rows.find((r) => r.name === "Callout fee");
    expect(row).toMatchObject({ item_type: "service", stock_quantity: null, barcode: null, cost_price: null, default_unit: "hour", price: 650 });
    expect(repo.adjustStock).not.toHaveBeenCalled();
  });
});

describe("commit — duplicates", () => {
  it("skips a duplicate by default, re-checked on the server", async () => {
    const res = await commit([create(2, { name: "Coca-Cola can", sku: "coke330", price: "12" })]);
    expect(res.body.results[0]).toMatchObject({ outcome: "skipped", product_id: COKE_A });
    expect(res.body.results[0].reason).toMatch(/same SKU/);
    expect(repo.insertRows).not.toHaveBeenCalled();
  });

  it("imports as new when the person chose it — unless the barcode is taken", async () => {
    const res = await commit([
      create(2, { name: "Coca Cola 330ml", sku: "COKE330-B", price: "12" }, { allow_duplicate: true }),
      create(3, { name: "Coke clone", barcode: "5449000000996", price: "12" }, { allow_duplicate: true }),
    ]);
    expect(res.body.results[0].outcome).toBe("created");
    expect(res.body.results[1]).toMatchObject({ outcome: "failed", reason: PRODUCT_IMPORT_MESSAGES.barcodeTaken });
  });

  it("two new rows in one batch cannot share a barcode", async () => {
    const res = await commit([create(2, { name: "A", barcode: "6009876543210" }), create(3, { name: "B", barcode: "6009876543210" })]);
    expect(res.body.results.map((r) => r.outcome)).toEqual(["created", "failed"]);
  });

  it("update changes only the fields present in the row — blanks never wipe data", async () => {
    const res = await commit([{ row_number: 2, action: "update", target_id: COKE_A, values: { name: "Coca Cola 330ml", sku: "COKE330", price: "R12.50", description: "" } }]);
    expect(res.body.results[0]).toMatchObject({ outcome: "updated", product_id: COKE_A });
    const row = repo.rows.find((r) => r.id === COKE_A);
    expect(row).toMatchObject({ price: 12.5, default_rate: 12.5, description: "Old description", category: "Drinks", barcode: "5449000000996" });
    const patch = repo.updateRow.mock.calls[0][2];
    expect(Object.keys(patch).sort()).toEqual(["default_rate", "name", "price", "rate", "sku", "unit_price"]);
    expect(repo.adjustStock).not.toHaveBeenCalled();
  });

  it("update sets stock through the ledger (delta to the imported level)", async () => {
    await commit([{ row_number: 2, action: "update", target_id: COKE_A, values: { name: "Coca Cola 330ml", stock: "50" } }]);
    expect(repo.adjustStock).toHaveBeenCalledWith(ORG_A, COKE_A, 40, "import");
    expect(repo.rows.find((r) => r.id === COKE_A).stock_quantity).toBe(50);
    expect(repo.updateRow.mock.calls[0][2]).not.toHaveProperty("stock_quantity");
  });

  it("an update can't target a service when importing products", async () => {
    repo.rows.push({ id: "svc-1", org_id: ORG_A, name: "Delivery", item_type: "service", is_active: true });
    const res = await commit([{ row_number: 2, action: "update", target_id: "5e000000-0000-4000-8000-000000000001", values: { name: "Delivery" } }]);
    expect(res.body.results[0].outcome).toBe("failed");
  });
});

describe("commit — stock, idempotency and partial failure", () => {
  it("new products start at 0 and opening stock is one initial_stock movement", async () => {
    await commit([create(2, { name: "Simba Chips 125g", stock: "22" }), create(3, { name: "No stock item" })]);
    const inserted = repo.insertRows.mock.calls[0][0];
    expect(inserted.every((r) => r.stock_quantity === 0)).toBe(true);
    expect(repo.movements).toEqual([{ product_id: expect.any(String), delta: 22, source: "initial_stock" }]);
  });

  it("retrying the same batch never creates products twice or double-counts stock", async () => {
    const rows = [create(2, { name: "Maize Meal 5kg", sku: "MM5", stock: "12" }), create(3, { name: "Sugar 2kg", sku: "SUG2" })];
    const first = await commit(rows);
    const again = await commit(rows);
    expect(first.body.counts.created).toBe(2);
    expect(again.body.results.map((r) => r.outcome)).toEqual(["created", "created"]);
    expect(again.body.results.every((r) => r.replayed)).toBe(true);
    expect(again.body.results.map((r) => r.product_id)).toEqual(first.body.results.map((r) => r.product_id));
    expect(repo.rows.filter((r) => r.sku === "MM5")).toHaveLength(1);
    expect(repo.movements.filter((m) => m.source === "initial_stock")).toHaveLength(1);
  });

  it("a retry finishes opening stock that failed the first time", async () => {
    repo.adjustStock.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "57014" }));
    const first = await commit([create(2, { name: "Maize Meal 5kg", stock: "12" })]);
    expect(first.body.results[0]).toMatchObject({ outcome: "created", warning: PRODUCT_IMPORT_MESSAGES.stockFailed });
    const again = await commit([create(2, { name: "Maize Meal 5kg", stock: "12" })]);
    expect(again.body.results[0].outcome).toBe("created");
    expect(repo.rows.find((r) => r.name === "Maize Meal 5kg").stock_quantity).toBe(12);
  });

  it("if the batch insert fails, good rows still land and the bad one is reported plainly", async () => {
    repo.rows.push({ id: "race", org_id: ORG_A, name: "Raced in", barcode: "6001111111110", item_type: "product", is_active: true });
    // The duplicate check didn't see it (created by someone else a moment later).
    const realFind = repo.findMatches;
    repo.findMatches = vi.fn(async (org, keys) => (await realFind(org, keys)).filter((r) => r.id !== "race"));
    const res = await commit([create(2, { name: "Good one" }), create(3, { name: "Clash", barcode: "6001111111110" }), create(4, { name: "Good two" })]);
    expect(res.body.results.map((r) => r.outcome)).toEqual(["created", "failed", "created"]);
    expect(res.body.results[1].reason).toBe(PRODUCT_IMPORT_MESSAGES.barcodeTaken);
    expect(res.body.counts).toEqual({ created: 2, updated: 0, skipped: 0, failed: 1 });
  });

  it("writes one audit entry per batch with counts only", async () => {
    await commit([create(2, { name: "A" }), create(3, { name: "" })]);
    expect(repo.writeAudit).toHaveBeenCalledTimes(1);
    expect(repo.writeAudit.mock.calls[0][0].metadata).toEqual({ import_id: IMPORT, item_type: "product", created: 1, updated: 0, skipped: 0, failed: 1 });
  });
});
