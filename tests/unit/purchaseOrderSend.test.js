/**
 * Send to Supplier: the PO PDF is attached through the canonical document email transport (never the
 * invoice-only /api/send-invoice fallback); the full-order email is used only when the PDF cannot be
 * generated; a transport failure is an error, not a silent send without the document.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchDocumentEmail: vi.fn(),
  SendEmail: vi.fn(),
  generatePdfBlobFromElement: vi.fn(),
  update: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/document-engine/send/email", () => ({ dispatchDocumentEmail: mocks.dispatchDocumentEmail }));
vi.mock("@/document-engine/send/adapter", () => ({
  pdfBlobToBase64: async () => "JVBERi0xLjQ=",
}));
vi.mock("@/utils/generatePdfFromElement", () => ({ generatePdfBlobFromElement: mocks.generatePdfBlobFromElement }));
vi.mock("@/api/integrations", () => ({ SendEmail: mocks.SendEmail }));
vi.mock("@/api/entities", () => ({ PurchaseOrder: { update: mocks.update } }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }) },
}));
vi.mock("@/core/auth/SessionCoordinator", () => ({ getStableSession: async () => null }));
vi.mock("@/api/auth/ensureUserOrganization", () => ({ ensureUserHasOrganization: async () => null }));
vi.mock("@/api/entity/entityShared", () => ({ getSelectColumns: () => "*" }));

const { sendPurchaseOrderToSupplier } = await import("../../src/services/PurchaseOrderService.js");
const { buildPurchaseOrderAttachmentEmailHtml } = await import("../../src/components/purchaseOrders/purchaseOrderEmail.js");

const po = {
  id: "po-1",
  po_number: "PO-1001",
  status: "approved",
  currency: "ZAR",
  total_amount: 2000,
  subtotal: 2000,
  vat_total: 0,
  payment_terms: "30 days",
  order_date: "2026-10-06",
};
const items = [{ id: "i1", description: "Product A", quantity_ordered: 10, unit_cost: 100, line_total: 1000, sort_order: 0 }];
const base = {
  purchaseOrder: po,
  items,
  supplier: { name: "Sup_test", email: "orders@sup.test" },
  business: { name: "Mavelele Trading" },
  productsById: new Map(),
  to: "orders@sup.test",
  message: "Hi",
  pdfElement: {},
  idempotencyKey: "po-send:po-1:abc",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generatePdfBlobFromElement.mockResolvedValue(new Blob(["%PDF-1.4"]));
  mocks.dispatchDocumentEmail.mockResolvedValue({ success: true, channel: "edge" });
  mocks.SendEmail.mockResolvedValue({ success: true });
  mocks.update.mockResolvedValue({});
  mocks.single.mockResolvedValue({ data: { ...po, sent_at: "now" }, error: null });
});

describe("sendPurchaseOrderToSupplier", () => {
  it("attaches PO-1001.pdf with a short summary, without the invoice fallback, and stamps sent", async () => {
    const res = await sendPurchaseOrderToSupplier(base);
    expect(res).toMatchObject({ demo: false, attached: true });
    expect(mocks.dispatchDocumentEmail).toHaveBeenCalledTimes(1);
    const args = mocks.dispatchDocumentEmail.mock.calls[0][0];
    expect(args).toMatchObject({
      pdfBase64: "JVBERi0xLjQ=",
      email: "orders@sup.test",
      filename: "PO-1001.pdf",
      subject: "Purchase Order PO-1001 — Mavelele Trading",
      idempotencyKey: "po-send:po-1:abc",
      invoiceApiFallback: false,
    });
    expect(args.html).toContain("Order Total");
    expect(args.html).toContain("Please confirm receipt of the order.");
    expect(args.html).toContain("Regards,<br/>Mavelele Trading");
    expect(args.html).not.toMatch(/paid|outstanding|received/i);
    expect(args.html).not.toContain("<table width=\"100%\" border=\"0\" cellpadding=\"6\""); // not the full order
    expect(mocks.SendEmail).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith("po-1", expect.objectContaining({ sent_to_email: "orders@sup.test" }));
  });

  it("falls back to the full-order email only when the PDF cannot be generated", async () => {
    mocks.generatePdfBlobFromElement.mockRejectedValue(new Error("canvas tainted"));
    const res = await sendPurchaseOrderToSupplier(base);
    expect(res).toMatchObject({ attached: false, pdfError: "canvas tainted" });
    expect(mocks.dispatchDocumentEmail).not.toHaveBeenCalled();
    expect(mocks.SendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.SendEmail.mock.calls[0][0].body).toContain("PURCHASE ORDER PO-1001");
  });

  it("a transport failure is an error: no fallback email, not marked sent", async () => {
    mocks.dispatchDocumentEmail.mockRejectedValue(new Error("Email service rejected the request."));
    await expect(sendPurchaseOrderToSupplier(base)).rejects.toThrow(/rejected/);
    expect(mocks.SendEmail).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("refuses drafts, pending and cancelled orders", async () => {
    for (const status of ["draft", "pending_approval", "cancelled"]) {
      await expect(sendPurchaseOrderToSupplier({ ...base, purchaseOrder: { ...po, status } })).rejects.toThrow();
    }
    expect(mocks.dispatchDocumentEmail).not.toHaveBeenCalled();
  });

  it("demo mode sends nothing and does not stamp sent", async () => {
    mocks.dispatchDocumentEmail.mockResolvedValue({ success: true, demo: true, sent: false });
    const res = await sendPurchaseOrderToSupplier(base);
    expect(res.demo).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("covering email", () => {
  it("escapes supplier-facing values", () => {
    const html = buildPurchaseOrderAttachmentEmailHtml({
      purchaseOrder: po,
      items,
      supplier: { name: "Sup" },
      business: { name: "<script>alert(1)</script>" },
      productsById: new Map(),
      message: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});
