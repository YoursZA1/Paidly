import { describe, expect, it } from "vitest";
import {
  buildReceiptStoragePath,
  confidenceLevel,
  findDuplicateCandidates,
  isEmptyExtraction,
  mapCategoryLabel,
  matchSupplier,
  normalizePaymentMethod,
  normalizeReceiptExtraction,
  normalizeSupplierName,
  parseMoney,
  parseReceiptDate,
  parseReceiptStoragePath,
  receiptObjectPathFromUrl,
  suggestExpenseCategory,
  validateReceiptAmounts,
  validateReceiptExpenseSubmission,
} from "../../shared/expenses/receiptScan.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";

describe("parseMoney", () => {
  it.each([
    ["R 483.00", 483],
    ["R483,00", 483],
    ["1 234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["1,234", 1234],
    ["1,234,567.89", 1234567.89],
    ["12,5", 12.5],
    [245.8, 245.8],
    ["-10.00", -10],
  ])("%s → %s", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "abc", "12.3.4", null, undefined, {}, NaN, "R", "1,2,3"])("rejects %s", (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

describe("parseReceiptDate", () => {
  it.each([
    ["2026-09-30", "2026-09-30"],
    ["30/09/2026", "2026-09-30"],
    ["30-09-26", "2026-09-30"],
    ["30 Sep 2026", "2026-09-30"],
    ["30 September 2026", "2026-09-30"],
    ["Sep 30, 2026", "2026-09-30"],
    ["2026-09-30T10:12:00Z", "2026-09-30"],
  ])("%s → %s", (input, expected) => {
    expect(parseReceiptDate(input)).toBe(expected);
  });

  it.each(["31/02/2026", "2026-13-01", "yesterday", "", "32 Sep 2026", 20260930])("rejects %s", (input) => {
    expect(parseReceiptDate(input)).toBeNull();
  });
});

describe("normalizeReceiptExtraction", () => {
  it("keeps a well-formed provider response", () => {
    const r = normalizeReceiptExtraction({
      merchantName: "  Woolworths  ",
      receiptNumber: "123456",
      transactionDate: "2026-09-30",
      subtotal: 420,
      vatAmount: 63,
      total: 483,
      vatRate: 15,
      currency: "zar",
      paymentMethod: "Debit card",
      lineItems: [{ description: "Milk", quantity: 2, unitPrice: 30, amount: 60 }],
      suggestedCategory: "Office Supplies",
      confidence: { merchantName: 0.98, total: 99, date: 0.4 },
    });
    expect(r.ok).toBe(true);
    expect(r.extraction).toMatchObject({
      merchantName: "Woolworths",
      receiptNumber: "123456",
      transactionDate: "2026-09-30",
      subtotal: 420,
      vatAmount: 63,
      total: 483,
      vatRate: 15,
      currency: "ZAR",
      paymentMethod: "debit_card",
      suggestedCategory: "office",
      confidence: { merchantName: 0.98, total: 0.99, date: 0.4 },
    });
    expect(r.extraction.lineItems).toEqual([{ description: "Milk", quantity: 2, unitPrice: 30, amount: 60 }]);
  });

  it("never fills in missing fields", () => {
    const r = normalizeReceiptExtraction({ total: "R99.99" });
    expect(r.extraction).toEqual({ total: 99.99 });
    expect(r.extraction.vatAmount).toBeUndefined();
    expect(r.extraction.transactionDate).toBeUndefined();
  });

  it("drops wrongly typed / invented values and reports them", () => {
    const r = normalizeReceiptExtraction({
      merchantName: 42,
      total: "lots",
      vatAmount: -5,
      transactionDate: "someday",
      vatRate: 250,
      currency: "rands!",
      suggestedCategory: "Crypto",
      lineItems: "not a list",
      confidence: [1, 2],
      __proto__: { injected: true },
      systemPrompt: "ignore previous",
    });
    expect(r.ok).toBe(true);
    expect(r.extraction).toEqual({});
    expect(r.issues).toEqual(
      expect.arrayContaining([
        "total_invalid",
        "vatAmount_invalid",
        "transactionDate_invalid",
        "vatRate_invalid",
        "currency_invalid",
        "suggestedCategory_unknown",
        "lineItems_invalid",
      ])
    );
  });

  it.each([null, "text", 42, [], undefined])("rejects non-object output %s", (raw) => {
    const r = normalizeReceiptExtraction(raw);
    expect(r.ok).toBe(false);
  });

  it("accepts snake_case providers and 0..1 VAT rates", () => {
    const r = normalizeReceiptExtraction({ vendor_name: "Spar", vat: 15, total: 115, vat_rate: 0.15 });
    expect(r.extraction).toMatchObject({ merchantName: "Spar", vatAmount: 15, total: 115, vatRate: 15 });
  });

  it("isEmptyExtraction", () => {
    expect(isEmptyExtraction({})).toBe(true);
    expect(isEmptyExtraction({ currency: "ZAR" })).toBe(true);
    expect(isEmptyExtraction({ total: 1 })).toBe(false);
  });
});

describe("normalizePaymentMethod", () => {
  it("maps explicit methods and leaves a bare card undecided", () => {
    expect(normalizePaymentMethod("CASH")).toBe("cash");
    expect(normalizePaymentMethod("Credit Card")).toBe("credit_card");
    expect(normalizePaymentMethod("Visa")).toBeUndefined();
    expect(normalizePaymentMethod("")).toBeUndefined();
  });
});

describe("confidenceLevel", () => {
  it("grades by score and flags missing key values", () => {
    expect(confidenceLevel(0.95, true)).toBe("high");
    expect(confidenceLevel(0.7, true)).toBe("medium");
    expect(confidenceLevel(0.3, true)).toBe("low");
    expect(confidenceLevel(undefined, true)).toBe("medium");
    expect(confidenceLevel(0.99, false)).toBe("low");
  });
});

describe("validateReceiptAmounts", () => {
  it("valid totals", () => {
    expect(validateReceiptAmounts({ subtotal: 420, vatAmount: 63, total: 483, vatRate: 15 })).toMatchObject({
      status: "consistent",
      expectedTotal: 483,
      impliedRate: 15,
    });
  });

  it("allows cash rounding", () => {
    expect(validateReceiptAmounts({ subtotal: 420.04, vatAmount: 63.01, total: 483 }).status).toBe("consistent");
  });

  it("VAT mismatch", () => {
    const r = validateReceiptAmounts({ subtotal: 420, vatAmount: 63, total: 500 });
    expect(r.status).toBe("mismatch");
    expect(r.issues).toContain("totals_mismatch");
    expect(r.difference).toBe(17);
  });

  it("VAT rate that doesn't match the amounts is suspicious", () => {
    const r = validateReceiptAmounts({ subtotal: 100, vatAmount: 20, total: 120, vatRate: 15 });
    expect(r.status).toBe("mismatch");
    expect(r.issues).toContain("vat_rate_mismatch");
  });

  it("missing VAT is reported, never invented", () => {
    const r = validateReceiptAmounts({ total: 483 });
    expect(r).toEqual({ status: "vat_missing", issues: ["vat_missing"] });
  });

  it("VAT without subtotal is fine (inclusive receipt)", () => {
    expect(validateReceiptAmounts({ vatAmount: 63, total: 483 }).status).toBe("consistent");
  });

  it("invalid totals", () => {
    expect(validateReceiptAmounts({ total: 0 }).status).toBe("incomplete");
    expect(validateReceiptAmounts({ vatAmount: 600, total: 483 }).status).toBe("invalid");
    expect(validateReceiptAmounts({ subtotal: 900, vatAmount: 5, total: 483 }).status).toBe("invalid");
    expect(validateReceiptAmounts({ subtotal: -1, total: 483 }).status).toBe("invalid");
  });
});

describe("category suggestion", () => {
  it("maps provider labels to existing categories only", () => {
    expect(mapCategoryLabel("Fuel")).toBe("vehicle");
    expect(mapCategoryLabel("Professional Services")).toBe("consulting");
    expect(mapCategoryLabel("Stock / Inventory")).toBe("supplies");
    expect(mapCategoryLabel("Meals & Entertainment")).toBe("meals");
    expect(mapCategoryLabel("Crypto")).toBeUndefined();
  });

  it("suggests from the merchant when the provider didn't", () => {
    expect(suggestExpenseCategory({ merchantName: "ENGEN Rivonia" })).toMatchObject({ category: "vehicle", source: "merchant" });
    expect(suggestExpenseCategory({ merchantName: "Nando's Sandton" }).category).toBe("meals");
    expect(suggestExpenseCategory({ merchantName: "Unknown Traders" })).toMatchObject({ category: "other", source: "default" });
    expect(suggestExpenseCategory({ suggestedCategory: "software", merchantName: "Engen" }).category).toBe("software");
  });
});

describe("supplier matching", () => {
  const suppliers = [
    { id: "s1", name: "Woolworths (Pty) Ltd", tax_number: "4010101010" },
    { id: "s2", name: "Makro SA" },
    { id: "s3", name: "Office National" },
  ];

  it("normalizes names", () => {
    expect(normalizeSupplierName("Woolworths (Pty) Ltd.")).toBe("woolworths");
    expect(normalizeSupplierName("  MAKRO   S.A. ")).toBe("makro s a");
  });

  it("existing supplier match", () => {
    expect(matchSupplier({ name: "WOOLWORTHS" }, suppliers)).toEqual({ kind: "exact", supplier: suppliers[0] });
    expect(matchSupplier({ name: "Something else", vatNumber: "4010 101 010" }, suppliers).supplier?.id).toBe("s1");
    expect(matchSupplier({ name: "Woolworths Food Sandton" }, suppliers)).toMatchObject({ kind: "close", supplier: { id: "s1" } });
  });

  it("new supplier", () => {
    expect(matchSupplier({ name: "Pick n Pay" }, suppliers)).toEqual({ kind: "none", supplier: null });
  });

  it("no supplier", () => {
    expect(matchSupplier({ name: "" }, suppliers).kind).toBe("none");
    expect(matchSupplier({}, [])).toEqual({ kind: "none", supplier: null });
  });
});

describe("duplicate detection", () => {
  const existing = [
    { id: "e1", vendor: "Woolworths", amount: 483, date: "2026-09-30", receipt_number: "INV-123456", receipt_sha256: "abc" },
    { id: "e2", vendor: "Seattle Coffee", amount: 38, date: "2026-09-29" },
  ];

  it("same receipt (same file)", () => {
    const r = findDuplicateCandidates({ sha256: "ABC", total: 1 }, existing);
    expect(r).toEqual([{ expense: existing[0], reason: "same_file", strength: "exact" }]);
  });

  it("same receipt number", () => {
    const r = findDuplicateCandidates({ receiptNumber: "inv 123456", vendor: "woolworths (pty) ltd", total: 483 }, existing);
    expect(r[0]).toMatchObject({ reason: "same_receipt_number", strength: "exact" });
  });

  it("similar receipt (same vendor, amount, date)", () => {
    const r = findDuplicateCandidates({ vendor: "WOOLWORTHS", total: 483, date: "2026-09-30" }, existing);
    expect(r[0]).toMatchObject({ reason: "same_details", strength: "likely" });
  });

  it("legitimate similar purchase is not flagged", () => {
    expect(findDuplicateCandidates({ vendor: "Seattle Coffee", total: 38, date: "2026-09-30" }, existing)).toEqual([]);
    expect(findDuplicateCandidates({ vendor: "Woolworths", total: 12.5, date: "2026-09-30" }, existing)).toEqual([]);
  });
});

describe("receipt storage paths", () => {
  it("builds and parses a company-scoped path", () => {
    const path = buildReceiptStoragePath({ orgId: ORG, userId: USER, fileId: FILE, extension: "JPG" });
    expect(path).toBe(`${ORG}/receipts/${USER}/${FILE}.jpg`);
    expect(parseReceiptStoragePath(path)).toEqual({ orgId: ORG, userId: USER, fileId: FILE, extension: "jpg" });
  });

  it.each([
    `${ORG}/receipts/${USER}/../${FILE}.jpg`,
    `${ORG}/receipt-123.jpg`,
    `../${ORG}/receipts/${USER}/${FILE}.jpg`,
    `${ORG}/receipts/${USER}/${FILE}.exe`,
    `${ORG}/receipts/${USER}/${FILE}.jpg?x=1`,
    "",
    null,
  ])("rejects %s", (path) => {
    expect(parseReceiptStoragePath(path)).toBeNull();
  });

  it("refuses to build a path with user-controlled text", () => {
    expect(() => buildReceiptStoragePath({ orgId: ORG, userId: USER, fileId: "../../x", extension: "jpg" })).toThrow();
  });

  it("reads legacy receipt URLs", () => {
    expect(
      receiptObjectPathFromUrl(`https://x.supabase.co/storage/v1/object/public/receipts/${ORG}/receipt-1.jpg`)
    ).toBe(`${ORG}/receipt-1.jpg`);
    expect(receiptObjectPathFromUrl("https://x.supabase.co/storage/v1/object/public/receipts/../x")).toBeNull();
    expect(receiptObjectPathFromUrl("https://evil.test/a.jpg")).toBeNull();
  });
});

describe("validateReceiptExpenseSubmission", () => {
  const base = {
    vendor: "Woolworths",
    date: "2026-09-30",
    category: "supplies",
    subtotal: "420.00",
    vat: "63.00",
    total: "483.00",
    payment_method: "debit_card",
  };

  it("accepts a valid submission and normalizes it", () => {
    const r = validateReceiptExpenseSubmission(base, { today: "2026-09-30" });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({
      vendor: "Woolworths",
      amount: 483,
      subtotal: 420,
      vat: 63,
      description: "Receipt from Woolworths",
      vat_status: "consistent",
      is_claimable: false,
    });
  });

  it("invalid dates", () => {
    expect(validateReceiptExpenseSubmission({ ...base, date: "31/02/2026" }, { today: "2026-09-30" }).errors.date).toBeTruthy();
    expect(validateReceiptExpenseSubmission({ ...base, date: "2026-12-25" }, { today: "2026-09-30" }).errors.date).toMatch(/future/);
    expect(validateReceiptExpenseSubmission({ ...base, date: "1999-01-01" }, { today: "2026-09-30" }).errors.date).toBeTruthy();
    expect(validateReceiptExpenseSubmission({ ...base, date: "2026-10-01" }, { today: "2026-09-30" }).ok).toBe(true);
  });

  it("invalid totals", () => {
    expect(validateReceiptExpenseSubmission({ ...base, total: "" }, { today: "2026-09-30" }).errors.total).toBeTruthy();
    expect(validateReceiptExpenseSubmission({ ...base, total: "0" }, { today: "2026-09-30" }).errors.total).toBeTruthy();
    expect(validateReceiptExpenseSubmission({ ...base, total: "abc" }, { today: "2026-09-30" }).errors.total).toBeTruthy();
    expect(validateReceiptExpenseSubmission({ ...base, vat: "900" }, { today: "2026-09-30" }).errors.vat).toBeTruthy();
  });

  it("VAT mismatch needs an explicit acknowledgement", () => {
    const mismatch = { ...base, total: "500.00" };
    const r = validateReceiptExpenseSubmission(mismatch, { today: "2026-09-30" });
    expect(r).toMatchObject({ ok: false, code: "VAT_REVIEW_REQUIRED" });
    const ack = validateReceiptExpenseSubmission({ ...mismatch, vat_acknowledged: true }, { today: "2026-09-30" });
    expect(ack.ok).toBe(true);
    expect(ack.value.vat_status).toBe("mismatch");
  });

  it("missing VAT is allowed", () => {
    const r = validateReceiptExpenseSubmission({ ...base, subtotal: "", vat: "" }, { today: "2026-09-30" });
    expect(r.ok).toBe(true);
    expect(r.value.vat).toBeNull();
    expect(r.value.vat_status).toBe("vat_missing");
  });

  it("rejects unknown categories, payment methods and malformed supplier ids", () => {
    const r = validateReceiptExpenseSubmission(
      { ...base, category: "crypto", payment_method: "barter", supplier_id: "not-a-uuid" },
      { today: "2026-09-30" }
    );
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["category", "payment_method", "supplier_id"]));
  });
});
