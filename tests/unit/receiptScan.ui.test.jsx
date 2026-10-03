/** @vitest-environment jsdom */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const service = vi.hoisted(() => ({
  prepareReceiptUpload: vi.fn(),
  uploadReceiptOriginal: vi.fn(),
  extractReceiptOnServer: vi.fn(),
  reviewReceipt: vi.fn(),
  confirmReceiptExpense: vi.fn(),
  discardReceiptUpload: vi.fn(),
}));

vi.mock("@/services/ReceiptScanService.js", async () => {
  class ReceiptApiError extends Error {
    constructor(message, extra = {}) {
      super(message);
      Object.assign(this, { code: "ERROR", errors: {}, duplicates: [], network: false }, extra);
    }
  }
  return { ...service, ReceiptApiError };
});
vi.mock("@/lib/receipts/receiptFile.js", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    preprocessReceiptImage: vi.fn(async () => ({
      width: 1200,
      height: 1600,
      cropped: true,
      enhanced: true,
      preview: new Blob(["p"], { type: "image/jpeg" }),
      processing: new Blob(["x"], { type: "image/jpeg" }),
    })),
    sha256Hex: vi.fn(async () => "a".repeat(64)),
    blobToBase64: vi.fn(async () => "eA=="),
  };
});
vi.mock("@/lib/receipts/onDeviceOcr.js", () => ({ readReceiptOnDevice: vi.fn(async () => ({ isReceipt: false })) }));
vi.mock("@/api/entities", () => ({ Supplier: { create: vi.fn() } }));
vi.mock("@/stores/useUpgradeModalStore", () => ({ useUpgradeModalStore: (sel) => sel({ openUpgradeModal: vi.fn() }) }));

const { default: ReceiptScanner } = await import("@/components/cashflow/ReceiptScanner");
const { default: ReceiptReviewForm } = await import("@/components/cashflow/receipt/ReceiptReviewForm");
const { ReceiptApiError } = await import("@/services/ReceiptScanService.js");
const { readReceiptOnDevice } = await import("@/lib/receipts/onDeviceOcr.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
URL.createObjectURL = vi.fn(() => "blob:preview");
URL.revokeObjectURL = vi.fn();

const PATH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/receipts/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.jpg";
const EXTRACTION = {
  isReceipt: true,
  merchantName: "Woolworths",
  receiptNumber: "123456",
  transactionDate: "2026-09-30",
  subtotal: 420,
  vatAmount: 63,
  total: 483,
  vatRate: 15,
  confidence: { merchantName: 0.98, date: 0.4, subtotal: 0.95, vatAmount: 0.95, total: 0.97 },
};

let container;
let root;
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  service.prepareReceiptUpload.mockResolvedValue({ ok: true, receipt_path: PATH, extraction_available: true, can_manage_suppliers: true });
  service.uploadReceiptOriginal.mockResolvedValue(undefined);
  service.extractReceiptOnServer.mockResolvedValue({ ok: true, available: true, extraction: EXTRACTION });
  service.reviewReceipt.mockResolvedValue({ ok: true, suppliers: [], supplier_match: { kind: "none", supplier: null }, duplicates: [], can_manage_suppliers: true });
  service.confirmReceiptExpense.mockResolvedValue({
    ok: true,
    expense: { id: "exp-1", vendor: "Woolworths", amount: 483, date: "2026-09-30", is_claimable: false },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const text = () => document.body.textContent;
const flush = async () => {
  for (let i = 0; i < 8; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const click = async (el) => {
  await act(async () => el.click());
  await flush();
};
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], "receipt.jpg", { type: "image/jpeg" });
const typeInto = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

async function renderScanner(props = {}) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ReceiptScanner onCancel={vi.fn()} {...props} />
      </MemoryRouter>
    );
  });
}

async function pickFile(file) {
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  await flush();
}

describe("Scan Receipt dialog", () => {
  it("offers Upload receipt and Scan receipt, and is an accessible dialog", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: vi.fn() }, configurable: true });
    await renderScanner();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(button("Upload receipt")).toBeTruthy();
    expect(button("Scan receipt")).toBeTruthy();
    expect(document.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  it("rejects an unsupported file before upload", async () => {
    await renderScanner();
    await pickFile(new File([new TextEncoder().encode("<html>")], "x.jpg", { type: "image/jpeg" }));
    expect(text()).toContain("Use a JPG, PNG, WEBP or PDF receipt.");
    expect(service.prepareReceiptUpload).not.toHaveBeenCalled();
  });

  it("desktop/mobile workflow: upload → review → save → done, without auto-creating the expense", async () => {
    const onExpenseCreated = vi.fn();
    await renderScanner({ onExpenseCreated });
    await pickFile(jpeg());
    expect(service.uploadReceiptOriginal).toHaveBeenCalledWith(PATH, expect.any(File), "image/jpeg");
    expect(text()).toContain("Review receipt");
    expect(document.querySelector('input[value="Woolworths"]')).not.toBeNull();
    expect(text()).toContain("VAT checks out.");
    expect(text()).toContain("Needs review"); // date confidence 0.4
    expect(service.confirmReceiptExpense).not.toHaveBeenCalled();

    await click(button("Save expense"));
    expect(service.confirmReceiptExpense).toHaveBeenCalledTimes(1);
    const payload = service.confirmReceiptExpense.mock.calls[0][0];
    expect(payload).toMatchObject({ receipt_path: PATH, total: "483.00", vat: "63.00", extraction_source: "server" });
    expect(payload.client_operation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(text()).toContain("Expense added");
    expect(text()).toContain("Receipt attached successfully.");
    expect(button("Scan another receipt")).toBeTruthy();
    expect(onExpenseCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "exp-1" }));
  });

  it("fills blank amounts from the on-device read when the server only saw the merchant", async () => {
    service.extractReceiptOnServer.mockResolvedValueOnce({
      ok: true,
      available: true,
      extraction: { isReceipt: true, merchantName: "SHOPRITE CHE I 10", paymentMethod: "cash" },
    });
    readReceiptOnDevice.mockResolvedValueOnce({
      isReceipt: true,
      merchantName: "SHOPRITE CHE I 10",
      subtotal: 59.11,
      vatAmount: 8.87,
      vatRate: 15,
      total: 67.98,
      paymentMethod: "cash",
      confidence: { merchantName: 0.4, subtotal: 0.95, vatAmount: 0.95, total: 0.95 },
    });
    await renderScanner();
    await pickFile(jpeg());
    expect(readReceiptOnDevice).toHaveBeenCalledTimes(1);
    expect(document.querySelector('input[value="SHOPRITE CHE I 10"]')).not.toBeNull();
    expect(document.querySelector('input[value="59.11"]')).not.toBeNull();
    expect(document.querySelector('input[value="8.87"]')).not.toBeNull();
    expect(document.querySelector('input[value="67.98"]')).not.toBeNull();
    expect(document.querySelector('input[value="100.00"]')).toBeNull();
  });

  it("upload failed → Try again resumes without re-picking the file", async () => {
    service.uploadReceiptOriginal.mockRejectedValueOnce(new ReceiptApiError("We couldn't upload this receipt.", { code: "UPLOAD_FAILED", network: true }));
    await renderScanner();
    await pickFile(jpeg());
    expect(text()).toContain("We couldn't upload this receipt.");
    await click(button("Try again"));
    expect(service.uploadReceiptOriginal).toHaveBeenCalledTimes(2);
    expect(text()).toContain("Review receipt");
  });

  it("OCR failed → Enter manually keeps the receipt and shows an empty form", async () => {
    service.extractReceiptOnServer.mockResolvedValueOnce({ ok: false, available: true, code: "EXTRACTION_FAILED" });
    readReceiptOnDevice.mockRejectedValueOnce(new Error("ocr crashed"));
    await renderScanner();
    await pickFile(jpeg());
    expect(text()).toContain("We couldn't read this receipt clearly.");
    await click(button("Enter manually"));
    expect(text()).toContain("Review receipt");
    expect(text()).toContain("Receipt attached.");
    expect(text()).not.toContain("Needs review");
    expect(service.discardReceiptUpload).not.toHaveBeenCalled();
  });

  it("PDF the server couldn't read → says PDF (not a photo problem), manual entry keeps it attached", async () => {
    service.extractReceiptOnServer.mockResolvedValueOnce({ ok: false, available: true, code: "EXTRACTION_FAILED" });
    const pdf = new File([new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF")], "receipt.pdf", { type: "application/pdf" });
    await renderScanner();
    await pickFile(pdf);
    expect(text()).toContain("We couldn't read this PDF.");
    expect(text()).not.toContain("For a clearer photo");
    expect(readReceiptOnDevice).not.toHaveBeenCalled(); // on-device OCR never pretends to read PDFs
    await click(button("Enter manually"));
    expect(text()).toContain("Receipt attached.");
  });

  it("unreadable photo → retake guidance", async () => {
    service.extractReceiptOnServer.mockResolvedValueOnce({ ok: false, available: true, code: "EXTRACTION_FAILED" });
    readReceiptOnDevice.mockResolvedValueOnce({});
    await renderScanner();
    await pickFile(jpeg());
    expect(text()).toContain("We couldn't read this receipt clearly.");
    expect(text()).toContain("keep all four edges in the photo");
  });

  it("not a receipt → Retake / Upload another", async () => {
    service.extractReceiptOnServer.mockResolvedValueOnce({ ok: false, available: true, code: "NOT_A_RECEIPT" });
    await renderScanner();
    await pickFile(jpeg());
    expect(text()).toContain("This image doesn't appear to contain a readable receipt.");
    expect(button("Retake")).toBeTruthy();
    expect(button("Upload another")).toBeTruthy();
  });

  it("network failure while saving keeps everything for a retry with the same operation id", async () => {
    service.confirmReceiptExpense.mockRejectedValueOnce(
      new ReceiptApiError("You seem to be offline or the connection dropped. Check your connection and try again.", { code: "NETWORK", network: true })
    );
    await renderScanner();
    await pickFile(jpeg());
    await click(button("Save expense"));
    expect(text()).toContain("You seem to be offline");
    await click(button("Save expense"));
    const [first, second] = service.confirmReceiptExpense.mock.calls.map((c) => c[0].client_operation_id);
    expect(first).toBe(second);
    expect(text()).toContain("Expense added");
  });

  it("closing mid-review asks first, then removes the pending upload", async () => {
    const onCancel = vi.fn();
    await renderScanner({ onCancel });
    await pickFile(jpeg());
    await click(button("Cancel"));
    expect(text()).toContain("Discard this receipt?");
    await click(button("Discard"));
    expect(service.discardReceiptUpload).toHaveBeenCalledWith(PATH);
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("review form rules", () => {
  const baseInfo = { suppliers: [], supplierMatch: null, duplicates: [], canManageSuppliers: false };

  async function renderForm(props) {
    const onSave = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ReceiptReviewForm
            formId="f"
            receipt={{ kind: "image", previewUrl: "blob:x" }}
            extraction={EXTRACTION}
            source="server"
            reviewInfo={baseInfo}
            saving={false}
            saveError={null}
            onSave={onSave}
            {...props}
          />
          <button type="submit" form="f">
            Save expense
          </button>
        </MemoryRouter>
      );
    });
    return onSave;
  }

  it("VAT mismatch must be confirmed before saving", async () => {
    const onSave = await renderForm({ extraction: { ...EXTRACTION, total: 500, confidence: {} } });
    expect(text()).toContain("VAT needs review.");
    await click(button("Save expense"));
    expect(onSave).not.toHaveBeenCalled();
    await click(document.querySelector("[data-vat-ack]"));
    await click(button("Save expense"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ total: "500.00" }), expect.objectContaining({ vatAcknowledged: true }));
  });

  it("missing VAT is flagged, never filled in", async () => {
    await renderForm({ extraction: { ...EXTRACTION, subtotal: undefined, vatAmount: undefined, vatRate: undefined } });
    expect(text()).toContain("VAT needs review.");
    expect(text()).toContain("We couldn't find VAT on this receipt.");
    expect(document.getElementById(document.querySelector('label[for$="-vat"]').htmlFor).value).toBe("");
  });

  it("possible duplicate blocks save until Continue anyway", async () => {
    const onSave = await renderForm({
      reviewInfo: { ...baseInfo, duplicates: [{ id: "e0", vendor: "Woolworths", date: "2026-09-30", amount: 483, reason: "same_details" }] },
    });
    expect(text()).toContain("Possible duplicate.");
    expect(button("View existing expense")).toBeUndefined(); // no handler passed
    await click(button("Save expense"));
    expect(onSave).not.toHaveBeenCalled();
    await click(button("Continue anyway"));
    await click(button("Save expense"));
    expect(onSave).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duplicateAcknowledged: true }));
  });

  it("every field is editable and edits are reported", async () => {
    const onSave = await renderForm();
    const total = document.getElementById(document.querySelector('label[for$="-total"]').htmlFor);
    await typeInto(total, "484.00");
    await click(document.querySelector("[data-vat-ack]") || button("Save expense"));
    if (onSave.mock.calls.length === 0) await click(button("Save expense"));
    const [, flags] = onSave.mock.calls.at(-1);
    expect(flags.editedFields).toContain("total");
  });

  it("headline says what was actually read — no fake success", async () => {
    await renderForm({});
    expect(document.querySelector('[data-read-level]').dataset.readLevel).toBe("complete");
    expect(text()).toContain("Receipt read.");

    await renderForm({ extraction: { ...EXTRACTION, total: undefined, confidence: {} }, source: "on_device" });
    expect(document.querySelector('[data-read-level]').dataset.readLevel).toBe("partial");
    expect(text()).toContain("We could only read part of this receipt.");
    expect(text()).toContain("Fill in the total");
    expect(text()).toContain("Read on this device");
    expect(text()).not.toContain("Receipt read.");

    // The bug-report case: only a garbled merchant line came back.
    await renderForm({ extraction: { isReceipt: true, merchantName: "SHOPRITE CHE I 10" }, source: "on_device" });
    expect(document.querySelector('[data-read-level]').dataset.readLevel).toBe("none");
    expect(text()).toContain("we couldn't read the amounts");
  });

  it("invalid date shows a field error and does not save", async () => {
    const onSave = await renderForm({ extraction: { ...EXTRACTION, transactionDate: undefined } });
    await click(button("Save expense"));
    expect(onSave).not.toHaveBeenCalled();
    expect(text()).toContain("Enter the receipt date.");
    const date = document.getElementById(document.querySelector('label[for$="-date"]').htmlFor);
    expect(date.getAttribute("aria-invalid")).toBe("true");
  });

  it("new supplier detected is shown to people who can manage suppliers", async () => {
    await renderForm({ reviewInfo: { ...baseInfo, canManageSuppliers: true, supplierMatch: { kind: "none", supplier: null } } });
    expect(text()).toContain("New supplier detected");
    expect(button("Add as supplier")).toBeTruthy();
  });
});
