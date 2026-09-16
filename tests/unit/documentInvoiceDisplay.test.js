import { describe, expect, it } from "vitest";
import {
  coerceDocumentLineRow,
  formatDocumentLineQuantity,
  isLikelyAccidentalNoise,
  sanitizeDocumentDisplayText,
} from "@/utils/documentInvoiceDisplay";
import {
  formatDocumentPreviewBankingLines,
  formatDocumentPreviewBankingRows,
} from "@/utils/formatDocumentPreviewBankingLines";

describe("formatDocumentLineQuantity", () => {
  it("defaults blank or invalid quantities to 1", () => {
    expect(formatDocumentLineQuantity(null)).toBe("1");
    expect(formatDocumentLineQuantity(undefined)).toBe("1");
    expect(formatDocumentLineQuantity(0)).toBe("1");
    expect(formatDocumentLineQuantity("")).toBe("1");
  });

  it("keeps whole and decimal quantities", () => {
    expect(formatDocumentLineQuantity(5)).toBe("5");
    expect(formatDocumentLineQuantity(1.25)).toBe("1.25");
  });
});

describe("sanitizeDocumentDisplayText", () => {
  it("removes keyboard mash and barcode noise lines", () => {
    expect(sanitizeDocumentDisplayText("gjjjjjiikiikiiukiiiukiii")).toBe("");
    expect(sanitizeDocumentDisplayText("007980861008000200")).toBe("");
    expect(
      sanitizeDocumentDisplayText("Pay within 15 days.\ngjjjjjiikiikiiukiiiukiii\nThanks")
    ).toBe("Pay within 15 days.\nThanks");
  });

  it("keeps normal notes", () => {
    expect(sanitizeDocumentDisplayText("Delivery on Tuesday")).toBe("Delivery on Tuesday");
  });
});

describe("isLikelyAccidentalNoise", () => {
  it("flags mash and long digit strings", () => {
    expect(isLikelyAccidentalNoise("gjjjjjiikiikiiukiiiukiii")).toBe(true);
    expect(isLikelyAccidentalNoise("007980861008000200")).toBe(true);
    expect(isLikelyAccidentalNoise("INV-1004")).toBe(false);
  });
});

describe("coerceDocumentLineRow", () => {
  it("fills missing quantity and computes total", () => {
    expect(coerceDocumentLineRow({ description: "Quick Cook Noodles", unit_price: 15 })).toEqual({
      description: "Quick Cook Noodles",
      quantity: 1,
      unit_price: 15,
      total: 15,
    });
  });
});

describe("formatDocumentPreviewBankingRows", () => {
  it("returns labeled payment instruction rows", () => {
    const rows = formatDocumentPreviewBankingRows({
      bank_name: "Nedbank",
      account_name: "Onthedesign Agency",
      account_number: "2965000000",
      branch_code: "198764",
      additional_info: "Auto-created from Default Bank Details",
    });
    expect(rows).toEqual([
      { label: "Bank", value: "Nedbank" },
      { label: "Account name", value: "Onthedesign Agency" },
      { label: "Account number", value: "2965000000" },
      { label: "Branch / routing", value: "198764" },
      { label: "Payment reference", value: "Auto-created from Default Bank Details" },
    ]);
    expect(formatDocumentPreviewBankingLines({
      bank_name: "Nedbank",
      account_name: "Onthedesign Agency",
      account_number: "2965000000",
      branch_code: "198764",
    })).toContain("Bank: Nedbank");
  });

  it("drops mashed payment reference noise", () => {
    const rows = formatDocumentPreviewBankingRows({
      bank_name: "Nedbank",
      additional_info: "gjjjjjiikiikiiukiiiukiii",
    });
    expect(rows).toEqual([{ label: "Bank", value: "Nedbank" }]);
  });
});
