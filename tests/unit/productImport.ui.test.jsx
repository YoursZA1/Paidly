/** @vitest-environment jsdom */
/**
 * Product Import dialog — the full Upload → Map → Review → Import flow with the document reader and API
 * mocked: nothing is saved before the summary is confirmed, errors can be fixed inline, duplicates are
 * skipped by default, the result is a Done State with an error report, and the Products page button
 * opens the dialog.
 */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const reader = vi.hoisted(() => ({ readProductDocument: vi.fn(), readScannedPdf: vi.fn() }));
const service = vi.hoisted(() => ({ checkImportDuplicates: vi.fn(), commitProductImport: vi.fn() }));
const files = vi.hoisted(() => ({ downloadErrorReport: vi.fn(), downloadCsvTemplate: vi.fn(), downloadExcelTemplate: vi.fn() }));

vi.mock("@/lib/productImport/readProductDocument.js", () => reader);
vi.mock("@/lib/productImport/importFiles.js", () => files);
vi.mock("@/services/ProductImportService.js", async () => {
  class ProductImportApiError extends Error {
    constructor(message, extra = {}) {
      super(message);
      Object.assign(this, { code: "ERROR", status: 0, network: false }, extra);
    }
  }
  return { ...service, ProductImportApiError };
});
vi.mock("@/utils/confetti", () => ({ runPaidConfetti: vi.fn() }));

const { default: ProductImportDialog } = await import("@/components/inventory/import/ProductImportDialog");
const { default: CatalogDataActions } = await import("@/components/inventory/CatalogDataActions");
const { ImportFileError } = await import("@/lib/productImport/fileDetect.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ||= () => {};
Element.prototype.hasPointerCapture ||= () => false;

const EXISTING = [{ id: "p1", name: "Coca Cola 330ml", sku: "COKE330", barcode: null, item_type: "product", is_active: true }];
const DOC = {
  kind: "xlsx",
  activeSheet: 0,
  notices: [],
  sheets: [
    {
      name: "Products",
      table: {
        headers: ["Product Name", "SKU", "Selling Price", "VAT", "Stock"],
        rows: [
          ["Coffee Beans 1kg", "COF001", "R185.00", "15%", "20"],
          ["Coke can", "COKE330", "R12.00", "15%", "50"],
          ["", "BAD1", "abc", "15%", "3"],
        ],
        rowNumbers: [2, 3, 4],
        headerDetected: true,
      },
    },
  ],
};

let container;
let root;
let props;

function render(extra = {}) {
  props = { open: true, onOpenChange: vi.fn(), canImportProducts: true, onUpgrade: vi.fn(), onImported: vi.fn(), ...extra };
  act(() => {
    root.render(
      <MemoryRouter>
        <ProductImportDialog {...props} />
      </MemoryRouter>
    );
  });
}

const text = () => document.body.textContent;
const buttons = () => [...document.body.querySelectorAll("button")];
const button = (label) => buttons().find((b) => b.textContent.trim().startsWith(label));
async function click(el) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    el.click();
  });
}
async function chooseFile(file) {
  const input = document.body.querySelector('input[type="file"]');
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {});
}
async function typeInto(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    input.blur();
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  reader.readProductDocument.mockReset().mockResolvedValue(structuredClone(DOC));
  reader.readScannedPdf.mockReset();
  service.checkImportDuplicates.mockReset().mockResolvedValue({ existing: EXISTING, matches: [] });
  service.commitProductImport.mockReset();
  files.downloadErrorReport.mockReset();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("ProductImportDialog", () => {
  it("explains the import and offers templates", () => {
    render();
    expect(text()).toContain("Upload an Excel, CSV or PDF product document and Paidly will extract the product information for you.");
    expect(button("Download Excel template")).toBeTruthy();
    expect(button("Download CSV template")).toBeTruthy();
    expect(text()).toMatch(/Excel \(\.xlsx, \.xls\), CSV \(\.csv\) or PDF \(\.pdf\) · up to 10 MB/);
    expect(text()).toContain("Stock Quantity");
  });

  it("walks Upload → Map → Review → Summary → Import without saving anything early", async () => {
    render();
    await chooseFile(new File(["x"], "stock.xlsx"));
    expect(text()).toContain("stock.xlsx");
    // Map step, auto-mapped
    expect(text()).toContain("“Selling Price”");
    expect(text()).toContain("3 row(s) found");
    await click(button("Continue to review"));
    expect(service.checkImportDuplicates).toHaveBeenCalledWith("product", [
      { row_number: 2, sku: "COF001", barcode: null, name: "Coffee Beans 1kg" },
      { row_number: 3, sku: "COKE330", barcode: null, name: "Coke can" },
      { row_number: 4, sku: "BAD1", barcode: null, name: "" },
    ]);

    // Review: 1 ready, 1 duplicate (skipped by default), 1 error
    expect(text()).toContain("Review Products");
    expect(text()).toContain("Matches “Coca Cola 330ml” by SKU");
    expect(text()).toContain("Product name is missing.");
    expect(service.commitProductImport).not.toHaveBeenCalled();
    expect(button("Continue with 1 row")).toBeTruthy();

    // Fix the bad row inline (desktop table cells)
    const nameCell = document.body.querySelector('input[aria-label="Product Name, row 4"]');
    const priceCell = document.body.querySelector('input[aria-label="Selling Price, row 4"]');
    await typeInto(nameCell, "Rusks 500g");
    await typeInto(priceCell, "R39.99");
    expect(button("Continue with 2 rows")).toBeTruthy();

    await click(button("Continue with 2 rows"));
    expect(text()).toContain("Import Summary");
    expect(text()).toMatch(/2\s*new products will be added/);
    expect(text()).toContain("1 duplicate(s) will be skipped.");
    expect(service.commitProductImport).not.toHaveBeenCalled();

    service.commitProductImport.mockResolvedValue([
      { row_number: 2, outcome: "created", product_id: "n1" },
      { row_number: 4, outcome: "created", product_id: "n2" },
    ]);
    await click(button("Import 2 Products"));
    await act(async () => {});
    const call = service.commitProductImport.mock.calls[0][0];
    expect(call.itemType).toBe("product");
    expect(call.rows.map((r) => [r.row_number, r.action])).toEqual([
      [2, "create"],
      [4, "create"],
    ]);
    expect(call.rows[1].values).toMatchObject({ name: "Rusks 500g", price: "R39.99" });
    expect(call.rows.some((r) => "org_id" in r || "company_id" in r)).toBe(false);

    expect(text()).toContain("Import complete");
    expect(text()).toContain("✓ 2 products imported");
    expect(text()).toContain("⚠ 1 products skipped");
    expect(text()).toContain("✕ 0 products failed");
    expect(props.onImported).toHaveBeenCalled();
    await click(button("Download error report"));
    expect(files.downloadErrorReport).toHaveBeenCalledWith([expect.objectContaining({ row: 3, outcome: "skipped" })], "stock.xlsx");
    expect(button("View products")).toBeTruthy();
    expect(button("Import another file")).toBeTruthy();
  });

  it("offers Fix errors or Import ready only when errors remain", async () => {
    render();
    await chooseFile(new File(["x"], "stock.xlsx"));
    await click(button("Continue to review"));
    await click(button("Continue with 1 row"));
    expect(button("Fix errors")).toBeTruthy();
    expect(button("Import ready products only (1)")).toBeTruthy();
    await click(button("Fix errors"));
    expect(text()).toContain("Review Products");
    // Filter jumped to errors: only the invalid row is shown
    expect(document.body.querySelector('input[aria-label="Product Name, row 2"]')).toBeNull();
    expect(document.body.querySelector('input[aria-label="Product Name, row 4"]')).toBeTruthy();
  });

  it("shows readable errors for unsupported and corrupt files", async () => {
    reader.readProductDocument.mockRejectedValue(new ImportFileError("Upload an Excel (.xlsx, .xls), CSV or PDF file.", "UNSUPPORTED"));
    render();
    await chooseFile(new File(["x"], "notes.docx"));
    expect(text()).toContain("Upload an Excel (.xlsx, .xls), CSV or PDF file.");
    reader.readProductDocument.mockRejectedValue(new ImportFileError("Could not read this Excel file.", "UNREADABLE"));
    await chooseFile(new File(["x"], "broken.xlsx"));
    expect(text()).toContain("Could not read this Excel file.");
  });

  it("scanned PDFs: offers OCR, and says so honestly when it fails", async () => {
    reader.readProductDocument.mockResolvedValue({ kind: "pdf", sheets: [], activeSheet: -1, notices: [], scanned: true, pdfBuffer: new ArrayBuffer(4) });
    reader.readScannedPdf.mockRejectedValue(
      new ImportFileError("This PDF appears to be scanned/image-based. Text could not be reliably extracted. Please upload an Excel/CSV file or a text-based PDF.", "SCANNED")
    );
    render();
    await chooseFile(new File(["x"], "scan.pdf"));
    expect(text()).toContain("This PDF appears to be scanned/image-based");
    await click(button("Try reading with OCR"));
    await act(async () => {});
    expect(text()).toContain("Text could not be reliably extracted. Please upload an Excel/CSV file or a text-based PDF.");
    expect(text()).not.toContain("Review Products");
  });

  it("stops and explains when the import is refused by the plan", async () => {
    render();
    await chooseFile(new File(["x"], "stock.xlsx"));
    await click(button("Continue to review"));
    await click(button("Continue with 1 row"));
    const { ProductImportApiError } = await import("@/services/ProductImportService.js");
    service.commitProductImport.mockRejectedValue(new ProductImportApiError("Importing stock-tracked products is part of the Business and Growth plans.", { code: "UPGRADE_REQUIRED" }));
    await click(button("Import ready products only"));
    await act(async () => {});
    expect(props.onUpgrade).toHaveBeenCalled();
    expect(text()).toContain("Business and Growth plans");
    expect(text()).toContain("Import Summary");
  });

  it("without the inventory feature, Products opens the upgrade prompt and Services stay available", async () => {
    render({ canImportProducts: false });
    expect(text()).toContain("Import Services");
    const productsOption = buttons().find((b) => b.textContent === "Products (with stock)");
    await click(productsOption);
    expect(props.onUpgrade).toHaveBeenCalled();
  });

  it("renders mobile cards alongside the desktop table", async () => {
    render();
    await chooseFile(new File(["x"], "stock.xlsx"));
    await click(button("Continue to review"));
    const cards = document.body.querySelectorAll("ul.md\\:hidden > li");
    expect(cards.length).toBe(3);
    // The error row opens in edit mode on mobile
    expect(cards[2].querySelector('input[aria-label="Product Name, row 4"]')).toBeTruthy();
    expect(document.body.querySelector("div.md\\:block table")).toBeTruthy();
  });

  it("remembers a mapping for the same headers in this session", async () => {
    render();
    await chooseFile(new File(["x"], "stock.xlsx"));
    await click(button("Continue to review"));
    const saved = JSON.parse(sessionStorage.getItem("paidly.productImport.mappings"));
    expect(Object.values(saved)[0]).toEqual(["name", "sku", "price", "vat", "stock"]);
  });
});

describe("Products page entry point", () => {
  it("Import products opens the dialog (no raw file picker)", async () => {
    const onImport = vi.fn();
    act(() => {
      root.render(<CatalogDataActions onImport={onImport} onExport={vi.fn()} onOpenIndustryTemplates={vi.fn()} />);
    });
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Import products"));
    await click(btn);
    expect(onImport).toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
