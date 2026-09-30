/**
 * Product Import — review model (statuses, duplicate choices, summary, commit payload, error report)
 * and the client service (batching a large import, retries, a failing batch, auth/plan errors).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/utils/apiRequest", () => api);
vi.mock("@/core/auth/SessionCoordinator", () => ({ getStableSession: async () => ({ access_token: "tok" }) }));
vi.mock("@/api/backendClient", () => ({ getBackendBaseUrl: () => "" }));

const { createReviewRows, evaluateReviewRows, notImportedRows, summarizeReview, toCommitRows } = await import("@/lib/productImport/reviewModel.js");
const { checkImportDuplicates, commitProductImport, ProductImportApiError } = await import("@/services/ProductImportService.js");

const HEADERS = ["Product Name", "SKU", "Selling Price", "VAT", "Stock", "Barcode"];
const MAPPING = ["name", "sku", "price", "vat", "stock", "barcode"];
const table = (rows) => ({ headers: HEADERS, rows, rowNumbers: rows.map((_, i) => i + 2) });
const EXISTING = [{ id: "p1", name: "Coca Cola 330ml", sku: "COKE330", barcode: "5449000000996", item_type: "product", is_active: true }];

function review(rows, existing = EXISTING, itemType = "product") {
  return evaluateReviewRows(rows, { itemType, existing });
}

describe("review model", () => {
  const base = () =>
    createReviewRows(
      table([
        ["Coffee Beans 1kg", "COF001", "R185.00", "15%", "20", ""],
        ["Coca-Cola can", "coke330", "R12.00", "15%", "50", ""],
        ["", "X1", "R5", "", "", ""],
        ["Rooibos", "TEA1", "R45", "14%", "10", ""],
        ["Rooibos 2", "TEA1", "R45", "15%", "10", ""],
        ["Coke clone", "NEW9", "R12", "15%", "1", "5449000000996"],
      ]),
      MAPPING
    );

  it("gives each row READY / WARNING / ERROR / DUPLICATE", () => {
    const r = review(base());
    expect(r.map((x) => x.status)).toEqual(["ready", "duplicate", "error", "warning", "duplicate", "duplicate"]);
    expect(r[1].duplicate).toMatchObject({ id: "p1", matchedBy: "sku" });
    expect(r[4].fileDuplicate).toEqual({ kind: "sku", firstRow: 5 });
  });

  it("duplicates are skipped by default and never block the rest", () => {
    const r = review(base());
    const s = summarizeReview(r);
    expect(s).toMatchObject({ total: 6, ready: 1, warning: 1, error: 1, duplicate: 3, importable: 2, creates: 2, updates: 0, errorsSelected: 1 });
    expect(toCommitRows(r).map((c) => c.row_number)).toEqual([2, 5]);
  });

  it("update existing / import as new are the person's choice", () => {
    const rows = base();
    rows[1].action = "update";
    rows[4].action = "create";
    const r = review(rows);
    expect(toCommitRows(r)).toEqual([
      expect.objectContaining({ row_number: 2, action: "create" }),
      expect.objectContaining({ row_number: 3, action: "update", target_id: "p1" }),
      expect.objectContaining({ row_number: 5, action: "create" }),
      expect.objectContaining({ row_number: 6, action: "create", allow_duplicate: true }),
    ]);
  });

  it("an existing barcode can't be imported as new", () => {
    const rows = base();
    rows[5].action = "create";
    const r = review(rows);
    expect(r[5].status).toBe("error");
    expect(r[5].errors[0].message).toMatch(/Barcode already belongs to “Coca Cola 330ml”/);
  });

  it("editing a row re-validates it", () => {
    const rows = base();
    rows[2] = { ...rows[2], raw: { ...rows[2].raw, name: "Fixed name" } };
    expect(review(rows)[2].status).toBe("ready");
  });

  it("unticked rows are not imported", () => {
    const rows = base();
    rows[0].selected = false;
    const r = review(rows);
    expect(toCommitRows(r).map((c) => c.row_number)).toEqual([5]);
    expect(summarizeReview(r).unselected).toBe(1);
  });

  it("can't update a service from a product import", () => {
    const rows = base();
    rows[1].action = "update";
    const r = review(rows, [{ ...EXISTING[0], item_type: "service" }]);
    expect(r[1].canUpdate).toBe(false);
    expect(r[1].effectiveAction).toBe("skip");
  });

  it("PDF rows read without headings / with OCR / messy columns carry a warning", () => {
    const rows = createReviewRows({ ...table([["Coke", "C1", "R12", "15%", "5", ""]]), rowMeta: [{ page: 1, ocr: true, messy: true }] }, MAPPING);
    const [r] = review(rows, []);
    expect(r.status).toBe("warning");
    expect(r.warnings.map((w) => w.message).join(" ")).toMatch(/OCR.*didn't line up/);
  });

  it("the error report explains every row that wasn't imported", () => {
    const r = review(base());
    const results = [
      { row_number: 2, outcome: "created" },
      { row_number: 5, outcome: "failed", reason: "Barcode already belongs to another product", fix: "Use a different barcode." },
    ];
    expect(notImportedRows(r, results)).toEqual([
      { row: 3, product: "Coca-Cola can", outcome: "skipped", reason: "Duplicate skipped (same SKU as “Coca Cola 330ml”).", fix: expect.any(String) },
      { row: 4, product: "", outcome: "failed", reason: "Product name is missing.", fix: "Enter a product name." },
      { row: 5, product: "Rooibos", outcome: "failed", reason: "Barcode already belongs to another product", fix: "Use a different barcode." },
      { row: 6, product: "Rooibos 2", outcome: "skipped", reason: "Duplicate skipped (same SKU as row 5).", fix: expect.any(String) },
      { row: 7, product: "Coke clone", outcome: "skipped", reason: expect.stringMatching(/Duplicate skipped/), fix: expect.any(String) },
    ]);
  });

  it("handles 5,000 rows against a large catalogue quickly", () => {
    const rows = createReviewRows(
      table(Array.from({ length: 5000 }, (_, i) => [`Product ${i}`, `SKU${i}`, `R${i}.00`, "15%", String(i % 50), ""])),
      MAPPING
    );
    const existing = Array.from({ length: 5000 }, (_, i) => ({ id: `e${i}`, name: `Old ${i}`, sku: `SKU${i * 2}`, barcode: null, item_type: "product" }));
    const t0 = performance.now();
    const r = review(rows, existing);
    expect(performance.now() - t0).toBeLessThan(2000);
    const s = summarizeReview(r);
    expect(s.total).toBe(5000);
    expect(s.duplicate).toBe(2500);
  });
});

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });
const errJson = (status, body) => ({ ok: false, status, json: async () => body });

describe("ProductImportService", () => {
  beforeEach(() => {
    api.apiRequest.mockReset();
  });

  it("sends a 5,000-row import in batches of 100 and collects every result", async () => {
    api.apiRequest.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body.rows.length).toBeLessThanOrEqual(100);
      expect(init.headers.Authorization).toBe("Bearer tok");
      return okJson({ ok: true, results: body.rows.map((r) => ({ row_number: r.row_number, outcome: "created" })) });
    });
    const rows = Array.from({ length: 5000 }, (_, i) => ({ row_number: i + 2, action: "create", values: { name: `P${i}` } }));
    const progress = [];
    const results = await commitProductImport({ importId: "i", itemType: "product", rows, onProgress: (d) => progress.push(d) });
    expect(api.apiRequest).toHaveBeenCalledTimes(50);
    expect(results).toHaveLength(5000);
    expect(progress.at(-1)).toBe(5000);
  });

  it("retries a dropped batch with the same import id, then continues", async () => {
    let calls = 0;
    api.apiRequest.mockImplementation(async (_url, init) => {
      calls += 1;
      if (calls === 2) throw new TypeError("Failed to fetch");
      const body = JSON.parse(init.body);
      expect(body.import_id).toBe("imp-1");
      return okJson({ ok: true, results: body.rows.map((r) => ({ row_number: r.row_number, outcome: "created" })) });
    });
    const rows = Array.from({ length: 150 }, (_, i) => ({ row_number: i + 2, action: "create", values: { name: `P${i}` } }));
    const results = await commitProductImport({ importId: "imp-1", itemType: "product", rows });
    expect(results.every((r) => r.outcome === "created")).toBe(true);
    expect(calls).toBe(3);
  });

  it("a batch that keeps failing is marked failed (retryable) and later batches still run", async () => {
    vi.useFakeTimers();
    try {
      api.apiRequest.mockImplementation(async (_url, init) => {
        const body = JSON.parse(init.body);
        if (body.rows[0].row_number === 2) return errJson(503, {});
        return okJson({ ok: true, results: body.rows.map((r) => ({ row_number: r.row_number, outcome: "created" })) });
      });
      const rows = Array.from({ length: 150 }, (_, i) => ({ row_number: i + 2, action: "create", values: { name: `P${i}` } }));
      const pending = commitProductImport({ importId: "i", itemType: "product", rows });
      await vi.runAllTimersAsync();
      const results = await pending;
      expect(results.filter((r) => r.outcome === "failed")).toHaveLength(100);
      expect(results.filter((r) => r.outcome === "failed").every((r) => r.retryable)).toBe(true);
      expect(results.filter((r) => r.outcome === "created")).toHaveLength(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops on a plan or permission error with the server's plain message", async () => {
    api.apiRequest.mockResolvedValue(errJson(403, { ok: false, code: "UPGRADE_REQUIRED", error: "Importing stock-tracked products is part of the Business and Growth plans." }));
    const err = await commitProductImport({ importId: "i", itemType: "product", rows: [{ row_number: 2, values: { name: "x" } }] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProductImportApiError);
    expect(err.code).toBe("UPGRADE_REQUIRED");
    expect(err.message).toMatch(/Business and Growth/);
  });

  it("never shows proxy / HTML error bodies", async () => {
    api.apiRequest.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("<html>"); } });
    const err = await checkImportDuplicates("product", [{ row_number: 2, name: "x" }]).catch((e) => e);
    expect(err.message).toBe("Something went wrong. Please try again.");
  });

  it("duplicate checks are chunked and merged", async () => {
    api.apiRequest.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      return okJson({ ok: true, existing: [{ id: "p1", name: "Coke" }], matches: [{ row_number: body.rows[0].row_number, existing_id: "p1" }] });
    });
    const keys = Array.from({ length: 2500 }, (_, i) => ({ row_number: i + 2, name: `P${i}` }));
    const r = await checkImportDuplicates("product", keys);
    expect(api.apiRequest).toHaveBeenCalledTimes(3);
    expect(r.existing).toHaveLength(1);
    expect(r.matches).toHaveLength(3);
  });
});
