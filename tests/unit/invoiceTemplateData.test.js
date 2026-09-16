import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVOICE_TEMPLATE,
  DOCUMENT_TEMPLATE_KEY,
  HISTORICAL_INVOICE_TEMPLATE_KEYS,
  SELECTABLE_INVOICE_TEMPLATE_KEYS,
  isDocumentStyleTemplateKey,
  normalizeInvoiceTemplateKey,
  resolveInvoiceTemplateKey,
  resolveRenderTemplateKey,
  toSelectableInvoiceTemplateKey,
} from "@/utils/invoiceTemplateData";

describe("invoice template catalogue", () => {
  it("defaults new users to Paidly (document)", () => {
    expect(DEFAULT_INVOICE_TEMPLATE).toBe("document");
    expect(DOCUMENT_TEMPLATE_KEY).toBe("document");
    expect(resolveInvoiceTemplateKey()).toBe("document");
    expect(resolveInvoiceTemplateKey(null, undefined, "")).toBe("document");
  });

  it("exposes exactly four selectable templates", () => {
    expect([...SELECTABLE_INVOICE_TEMPLATE_KEYS]).toEqual([
      "document",
      "classic",
      "modern",
      "paidlypro",
    ]);
  });

  it("keeps historical keys valid without deleting them", () => {
    for (const key of ["document", "classic", "modern", "minimal", "bold", "paidlypro", "paidly"]) {
      expect(normalizeInvoiceTemplateKey(key)).toBe(key);
      expect(HISTORICAL_INVOICE_TEMPLATE_KEYS).toContain(key);
    }
  });

  it("maps legacy minimal → Paidly document and bold → modern", () => {
    expect(resolveRenderTemplateKey("minimal")).toBe("document");
    expect(resolveInvoiceTemplateKey("minimal")).toBe("document");
    expect(isDocumentStyleTemplateKey("minimal")).toBe(true);

    expect(resolveRenderTemplateKey("bold")).toBe("modern");
    expect(resolveInvoiceTemplateKey("bold")).toBe("modern");
    expect(isDocumentStyleTemplateKey("bold")).toBe(false);
  });

  it("accepts paidly as an alias of document", () => {
    expect(resolveInvoiceTemplateKey("paidly")).toBe("document");
    expect(toSelectableInvoiceTemplateKey("paidly")).toBe("document");
  });

  it("preserves classic, modern, and paidlypro as-is for render", () => {
    expect(resolveInvoiceTemplateKey("classic")).toBe("classic");
    expect(resolveInvoiceTemplateKey("modern")).toBe("modern");
    expect(resolveInvoiceTemplateKey("paidlypro")).toBe("paidlypro");
  });

  it("highlights the correct selectable card for legacy stored values", () => {
    expect(toSelectableInvoiceTemplateKey("minimal")).toBe("document");
    expect(toSelectableInvoiceTemplateKey("bold")).toBe("modern");
    expect(toSelectableInvoiceTemplateKey("document")).toBe("document");
  });
});
