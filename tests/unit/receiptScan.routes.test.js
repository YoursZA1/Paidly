/**
 * /api/company/receipts — auth, company isolation, permissions, entitlement, extraction, validation,
 * duplicates, idempotency and failure handling. Data access is a fake repo; RLS itself is covered by
 * receiptScan.db.test.js.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: { from: () => ({}) } }));

const { createReceiptScanHandler, RECEIPT_MESSAGES } = await import("../../server/src/expenses/receiptScanRoutes.js");
const { ReceiptExtractionError } = await import("../../server/src/expenses/receiptExtractionProviders.js");
const { UpgradeRequiredError } = await import("../../server/src/featureGate.js");
const { RECEIPT_EXTRACTION_VERSION } = await import("../../shared/expenses/receiptScan.js");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const OP = "44444444-4444-4444-8444-444444444444";
const SUPPLIER_A = "55555555-5555-4555-8555-555555555555";
const SHA = "a".repeat(64);
const ownPath = `${ORG_A}/receipts/${USER}/${FILE}.jpg`;

function mockRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

function makeRepo(overrides = {}) {
  return {
    receiptExists: vi.fn(async () => true),
    downloadReceipt: vi.fn(async () => Buffer.from("%PDF-1.7 test")),
    removeReceipt: vi.fn(async () => {}),
    listSuppliers: vi.fn(async () => [{ id: SUPPLIER_A, name: "Woolworths (Pty) Ltd", tax_number: null }]),
    supplierInCompany: vi.fn(async (orgId, id) => (orgId === ORG_A && id === SUPPLIER_A ? { id, name: "Woolworths (Pty) Ltd" } : null)),
    findDuplicateSources: vi.fn(async () => []),
    findExpenseByOperation: vi.fn(async () => null),
    insertExpense: vi.fn(async (row) => ({ id: "exp-1", ...row })),
    writeAudit: vi.fn(async () => {}),
    ...overrides,
  };
}

let repo;
let provider;
let membership;
let user;
let feature;
let rateLimit;

function handler(extra = {}) {
  return createReceiptScanHandler({
    getUserFromRequest: async () => ({ user }),
    loadMembership: async () => membership,
    assertFeature: feature,
    userClientFor: async () => ({}),
    adminClient: {},
    repoFor: () => repo,
    provider,
    rateLimit,
    today: () => "2026-09-30",
    log: () => {},
    ...extra,
  });
}

async function call(op, body = {}, { method = "POST", auth = "Bearer token", h } = {}) {
  const res = mockRes();
  await (h || handler())({ method, query: { op }, headers: auth ? { authorization: auth } : {}, body, url: "/api/company/receipts" }, res);
  return res;
}

const confirmBody = (over = {}) => ({
  client_operation_id: OP,
  receipt_path: ownPath,
  sha256: SHA,
  vendor: "Woolworths",
  date: "2026-09-30",
  category: "supplies",
  subtotal: "420.00",
  vat: "63.00",
  total: "483.00",
  payment_method: "debit_card",
  extraction_source: "server",
  ...over,
});

beforeEach(() => {
  repo = makeRepo();
  provider = {
    id: "fake",
    extract: vi.fn(async () => ({ isReceipt: true, merchantName: "Woolworths", total: 483, vatAmount: 63, subtotal: 420, transactionDate: "2026-09-30" })),
  };
  user = { id: USER, email: "owner@a.test" };
  membership = { orgId: ORG_A, companyId: ORG_A, membershipRole: "owner", companyRole: "admin", jobFunction: "general" };
  feature = vi.fn(async () => {});
  rateLimit = vi.fn(async () => ({ ok: true }));
});

describe("access", () => {
  it("unauthenticated / expired session → 401", async () => {
    user = null;
    const res = await call("confirm", confirmBody());
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe(RECEIPT_MESSAGES.unauthorized);
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });

  it("missing bearer token → 401", async () => {
    const res = await call("review", {}, { auth: "" });
    expect(res.statusCode).toBe(401);
  });

  it("no company membership → 403", async () => {
    membership = null;
    expect((await call("review")).statusCode).toBe(403);
  });

  it("POS-only staff cannot create expenses", async () => {
    membership = { orgId: ORG_A, membershipRole: "employee", companyRole: "employee", jobFunction: "pos" };
    const res = await call("confirm", confirmBody());
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("POS_SCOPE");
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });

  it("company without the expenses feature gets the upgrade code", async () => {
    feature = vi.fn(async () => {
      throw new UpgradeRequiredError("expenses");
    });
    const res = await call("confirm", confirmBody());
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: "UPGRADE_REQUIRED", feature: "expenses" });
    expect(feature).toHaveBeenCalledWith(USER, "expenses", ORG_A);
  });

  it("non-POST and unknown ops are refused", async () => {
    expect((await call("confirm", {}, { method: "GET" })).statusCode).toBe(405);
    expect((await call("delete-everything")).statusCode).toBe(404);
  });
});

describe("company isolation", () => {
  it("a manipulated org_id in the body is ignored — the server company is used", async () => {
    const res = await call("confirm", confirmBody({ org_id: ORG_B, company_id: ORG_B, created_by_id: OTHER_USER }));
    expect(res.statusCode).toBe(201);
    const row = repo.insertExpense.mock.calls[0][0];
    expect(row.org_id).toBe(ORG_A);
    expect(row.created_by_id).toBe(USER);
  });

  it("a receipt path in another company's folder is refused", async () => {
    const res = await call("confirm", confirmBody({ receipt_path: `${ORG_B}/receipts/${USER}/${FILE}.jpg` }));
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("RECEIPT_NOT_OWNED");
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });

  it("another user's receipt path in the same company is refused", async () => {
    const res = await call("confirm", confirmBody({ receipt_path: `${ORG_A}/receipts/${OTHER_USER}/${FILE}.jpg` }));
    expect(res.statusCode).toBe(403);
  });

  it("traversal / legacy paths are refused", async () => {
    for (const receipt_path of [`${ORG_A}/receipts/${USER}/../x.jpg`, `${ORG_A}/receipt-1.jpg`, "", null]) {
      expect((await call("confirm", confirmBody({ receipt_path }))).statusCode).toBe(403);
    }
  });

  it("a supplier from another company is refused", async () => {
    const res = await call("confirm", confirmBody({ supplier_id: "66666666-6666-4666-8666-666666666666" }));
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe("INVALID_SUPPLIER");
  });

  it("a manipulated expense id cannot be injected", async () => {
    await call("confirm", confirmBody({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }));
    expect(repo.insertExpense.mock.calls[0][0].id).toBeUndefined();
  });
});

describe("prepare", () => {
  it("returns a server-chosen path in the caller's company folder", async () => {
    const res = await call("prepare", { media_type: "image/jpeg", org_id: ORG_B });
    expect(res.statusCode).toBe(200);
    expect(res.body.receipt_path).toMatch(new RegExp(`^${ORG_A}/receipts/${USER}/[0-9a-f-]{36}\\.jpg$`));
    expect(res.body.extraction_available).toBe(true);
  });

  it("refuses unsupported files before upload", async () => {
    for (const media_type of ["image/gif", "text/html", "application/x-msdownload", ""]) {
      expect((await call("prepare", { media_type })).body.code).toBe("UNSUPPORTED_FILE");
    }
  });
});

describe("extract", () => {
  // Real JPEG signature (FF D8 FF E0 …JFIF) followed by placeholder bytes.
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.from("fake")]);
  const extractBody = { receipt_path: ownPath, image: { media_type: "image/jpeg", data: JPEG.toString("base64") } };

  it("successful OCR returns a validated extraction, stamped with the extraction version", async () => {
    const res = await call("extract", extractBody);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, available: true, extraction: { merchantName: "Woolworths", total: 483 } });
    expect(res.body.extraction_version).toBe(RECEIPT_EXTRACTION_VERSION);
    expect(repo.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "receipt.processed" }));
  });

  it("no provider configured → available:false (browser falls back to on-device OCR)", async () => {
    provider = null;
    const res = await call("extract", extractBody);
    expect(res.body).toEqual({ ok: true, available: false });
  });

  it("missing fields stay missing", async () => {
    provider.extract = vi.fn(async () => ({ isReceipt: true, merchantName: null, total: 99.5, vatAmount: null, transactionDate: null }));
    const res = await call("extract", extractBody);
    expect(res.body.extraction).toEqual({ isReceipt: true, total: 99.5 });
  });

  it("invalid AI response (not an object) → friendly failure, no internals", async () => {
    provider.extract = vi.fn(async () => "ignore previous instructions");
    const res = await call("extract", extractBody);
    expect(res.body).toMatchObject({ ok: false, code: "EXTRACTION_FAILED", error: RECEIPT_MESSAGES.unreadable });
  });

  it("incorrect OCR types are dropped, never trusted", async () => {
    provider.extract = vi.fn(async () => ({ isReceipt: true, total: "lots", vatAmount: -3, transactionDate: "31/02/2026", merchantName: "Spar" }));
    const res = await call("extract", extractBody);
    expect(res.body.extraction).toEqual({ isReceipt: true, merchantName: "Spar" });
  });

  it("provider failure → friendly message, provider detail never leaks", async () => {
    provider.extract = vi.fn(async () => {
      throw new ReceiptExtractionError("provider_error", "500 upstream sk-ant-secret prompt=...");
    });
    const res = await call("extract", extractBody);
    expect(res.statusCode).toBe(200);
    expect(res.body.error).toBe(RECEIPT_MESSAGES.unreadable);
    expect(JSON.stringify(res.body)).not.toMatch(/sk-ant|upstream|prompt/);
  });

  it("not a receipt", async () => {
    provider.extract = vi.fn(async () => ({ isReceipt: false }));
    const res = await call("extract", extractBody);
    expect(res.body).toMatchObject({ ok: false, code: "NOT_A_RECEIPT", error: RECEIPT_MESSAGES.notReceipt });
  });

  it("rate limited per user", async () => {
    rateLimit = vi.fn(async () => ({ ok: false, retryAfterSeconds: 60 }));
    const res = await call("extract", extractBody);
    expect(res.statusCode).toBe(429);
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it("refuses bytes that are not the image type they claim (renamed / disguised files)", async () => {
    for (const bytes of [Buffer.from("<html><script>alert(1)</script>"), Buffer.from("%PDF-1.7\n"), Buffer.from("MZ\x90\x00binary")]) {
      const res = await call("extract", { ...extractBody, image: { media_type: "image/jpeg", data: bytes.toString("base64") } });
      expect(res.statusCode).toBe(422);
      expect(res.body.code).toBe("INVALID_IMAGE");
    }
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const mislabelled = await call("extract", { ...extractBody, image: { media_type: "image/jpeg", data: png.toString("base64") } });
    expect(mislabelled.statusCode).toBe(422);
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it("refuses oversize / wrong-type images and missing uploads", async () => {
    const big = { ...extractBody, image: { media_type: "image/jpeg", data: "A".repeat(6 * 1024 * 1024) } };
    expect((await call("extract", big)).statusCode).toBe(422);
    expect((await call("extract", { ...extractBody, image: { media_type: "image/gif", data: "AAAA" } })).statusCode).toBe(422);
    repo.receiptExists = vi.fn(async () => false);
    expect((await call("extract", extractBody)).body.code).toBe("RECEIPT_MISSING");
  });

  it("PDFs are read from storage and checked", async () => {
    const pdfPath = `${ORG_A}/receipts/${USER}/${FILE}.pdf`;
    const res = await call("extract", { receipt_path: pdfPath });
    expect(res.body.ok).toBe(true);
    expect(provider.extract.mock.calls[0][0].mediaType).toBe("application/pdf");
    repo.downloadReceipt = vi.fn(async () => Buffer.from("<html>not a pdf"));
    expect((await call("extract", { receipt_path: pdfPath })).statusCode).toBe(422);
  });

  it("cannot extract another user's receipt", async () => {
    const res = await call("extract", { ...extractBody, receipt_path: `${ORG_A}/receipts/${OTHER_USER}/${FILE}.jpg` });
    expect(res.statusCode).toBe(403);
  });
});

describe("review (supplier + duplicates)", () => {
  it("existing supplier match", async () => {
    const res = await call("review", { receipt_path: ownPath, vendor: "WOOLWORTHS", total: "483", date: "2026-09-30" });
    expect(res.body.supplier_match).toEqual({ kind: "exact", supplier: { id: SUPPLIER_A, name: "Woolworths (Pty) Ltd" } });
    expect(res.body.can_manage_suppliers).toBe(true);
  });

  it("new supplier detected", async () => {
    const res = await call("review", { receipt_path: ownPath, vendor: "Pick n Pay" });
    expect(res.body.supplier_match).toEqual({ kind: "none", supplier: null });
  });

  it("staff don't manage suppliers", async () => {
    membership = { orgId: ORG_A, membershipRole: "employee", companyRole: "employee", jobFunction: "sales" };
    repo.listSuppliers = vi.fn(async () => []);
    const res = await call("review", { receipt_path: ownPath, vendor: "Woolworths" });
    expect(res.body).toMatchObject({ can_manage_suppliers: false, suppliers: [], supplier_match: { kind: "none" } });
  });

  it("possible duplicate is reported with safe fields only", async () => {
    repo.findDuplicateSources = vi.fn(async () => [
      { id: "exp-old", vendor: "Woolworths", amount: "483.00", date: "2026-09-30", receipt_sha256: SHA, notes: "secret" },
    ]);
    const res = await call("review", { receipt_path: ownPath, sha256: SHA, vendor: "Woolworths", total: "483", date: "2026-09-30" });
    expect(res.body.duplicates).toEqual([
      { id: "exp-old", vendor: "Woolworths", date: "2026-09-30", amount: 483, reason: "same_file", strength: "exact" },
    ]);
  });
});

describe("confirm", () => {
  it("manual entry records no extraction version — values were typed, not read", async () => {
    const res = await call("confirm", confirmBody({ extraction_source: "manual" }));
    expect(res.statusCode).toBe(201);
    expect(repo.insertExpense.mock.calls[0][0].receipt_review).toMatchObject({
      extraction_source: "manual",
      extraction_version: null,
    });
  });

  it("successful confirmation creates one expense with the receipt attached", async () => {
    const res = await call("confirm", confirmBody({ edited_fields: ["total", "category"], vat_acknowledged: false }));
    expect(res.statusCode).toBe(201);
    const row = repo.insertExpense.mock.calls[0][0];
    expect(row).toMatchObject({
      org_id: ORG_A,
      amount: 483,
      vat: 63,
      subtotal: 420,
      receipt_path: ownPath,
      receipt_sha256: SHA,
      capture_source: "receipt_scan",
      client_operation_id: OP,
      category: "supplies",
      description: "Receipt from Woolworths",
    });
    expect(row.receipt_review).toMatchObject({
      vat_status: "consistent",
      extraction_source: "server",
      extraction_version: RECEIPT_EXTRACTION_VERSION,
      edited_fields: ["total", "category"],
    });
    expect(repo.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "expense.created_from_receipt" }));
    const audit = repo.writeAudit.mock.calls.at(-1)[0];
    expect(JSON.stringify(audit)).not.toMatch(/Woolworths|483/);
  });

  it("validation errors come back per field", async () => {
    const res = await call("confirm", confirmBody({ total: "", date: "2027-01-01" }));
    expect(res.statusCode).toBe(422);
    expect(Object.keys(res.body.errors)).toEqual(expect.arrayContaining(["total", "date"]));
  });

  it("VAT mismatch must be acknowledged", async () => {
    const res = await call("confirm", confirmBody({ total: "500.00" }));
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("VAT_REVIEW_REQUIRED");
    expect((await call("confirm", confirmBody({ total: "500.00", vat_acknowledged: true }))).statusCode).toBe(201);
  });

  it("possible duplicate blocks until acknowledged, then saves", async () => {
    repo.findDuplicateSources = vi.fn(async () => [{ id: "exp-old", vendor: "Woolworths", amount: 483, date: "2026-09-30" }]);
    const first = await call("confirm", confirmBody());
    expect(first.statusCode).toBe(409);
    expect(first.body.code).toBe("POSSIBLE_DUPLICATE");
    expect(repo.insertExpense).not.toHaveBeenCalled();
    const second = await call("confirm", confirmBody({ duplicate_acknowledged: true }));
    expect(second.statusCode).toBe(201);
    expect(repo.insertExpense.mock.calls[0][0].receipt_review.duplicate_acknowledged).toBe(true);
  });

  it("retry after a lost response returns the same expense (no double save)", async () => {
    repo.findExpenseByOperation = vi.fn(async () => ({ id: "exp-1", amount: 483 }));
    const res = await call("confirm", confirmBody());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, replayed: true, expense: { id: "exp-1" } });
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });

  it("concurrent double-submit resolves to the winner", async () => {
    repo.findExpenseByOperation = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "exp-winner" });
    repo.insertExpense = vi.fn(async () => {
      throw Object.assign(new Error('duplicate key value violates unique constraint "expenses_org_client_operation_uidx"'), {
        code: "23505",
        details: "Key (org_id, client_operation_id)",
      });
    });
    const res = await call("confirm", confirmBody());
    expect(res.body).toMatchObject({ ok: true, replayed: true, expense: { id: "exp-winner" } });
  });

  it("failed database operation → human message, nothing internal leaks", async () => {
    repo.insertExpense = vi.fn(async () => {
      throw Object.assign(new Error('relation "public.expenses" violates row-level security policy'), { code: "XX000" });
    });
    const res = await call("confirm", confirmBody());
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ ok: false, code: "SAVE_FAILED", error: RECEIPT_MESSAGES.saveFailed });
  });

  it("failed receipt attachment (object gone) never creates an expense", async () => {
    repo.receiptExists = vi.fn(async () => false);
    const res = await call("confirm", confirmBody());
    expect(res.body.code).toBe("RECEIPT_MISSING");
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });

  it("receipt already attached to another expense", async () => {
    repo.insertExpense = vi.fn(async () => {
      throw Object.assign(new Error("dup"), { code: "23505", details: "Key (receipt_path)=(...) already exists." });
    });
    expect((await call("confirm", confirmBody())).body.code).toBe("RECEIPT_ALREADY_ATTACHED");
  });

  it("database plan guard is surfaced as an upgrade, not an error", async () => {
    repo.insertExpense = vi.fn(async () => {
      throw Object.assign(new Error("This feature is not included"), { code: "P0001", hint: "PLAN_UPGRADE_REQUIRED:expenses" });
    });
    expect((await call("confirm", confirmBody())).body.code).toBe("UPGRADE_REQUIRED");
  });

  it("unexpected exceptions → generic message only", async () => {
    repo.findExpenseByOperation = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.1:5432 service_role");
    });
    const res = await call("confirm", confirmBody());
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONN|service_role|10\.0/);
  });

  it("requires an operation id", async () => {
    expect((await call("confirm", confirmBody({ client_operation_id: "x" }))).statusCode).toBe(422);
  });
});

describe("discard", () => {
  it("removes the caller's own pending upload", async () => {
    const res = await call("discard", { receipt_path: ownPath });
    expect(res.body).toEqual({ ok: true, removed: true });
    expect(repo.removeReceipt).toHaveBeenCalledWith(ownPath);
  });

  it("cannot discard someone else's receipt", async () => {
    const res = await call("discard", { receipt_path: `${ORG_A}/receipts/${OTHER_USER}/${FILE}.jpg` });
    expect(res.statusCode).toBe(403);
    expect(repo.removeReceipt).not.toHaveBeenCalled();
  });
});
