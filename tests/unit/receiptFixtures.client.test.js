/**
 * On-device receipt reading (Tesseract text → parseReceiptOcrText) on representative South African slips.
 * The browser path is the FALLBACK — the server document model is primary — but whatever it returns is put
 * in front of a person, so it must never guess: no "largest number = total", no tendered cash as the total,
 * no invented VAT or date. A field it can't find stays empty for the person to fill in.
 *
 * Fixtures are realistic slip layouts; nothing in the parser knows any merchant name.
 */
import { describe, expect, it } from "vitest";
import { fixOcrAmountConfusions, parseReceiptOcrText } from "@/lib/receipts/ocrTextParser.js";
import { assessExtractionCompleteness, validateReceiptAmounts } from "@shared/expenses/receiptScan.js";

const read = (text, confidence = 85) => parseReceiptOcrText(text, { confidence });

const FIXTURES = {
  // The receipt from the bug report (LiquorShop / Shoprite Checkers): cash R100 tendered on a R67.98 sale.
  liquorShopClean: `LiquorShop
SHOPRITE CHECKERS (PTY) LTD
VOSLOORUS Tel No +27 11 906 9140
Naledi Centre
GLB600000800
VAT No: 4420106777
TAX INVOICE
4TH STREET 1L R44.99
XTRASAVE 4THSTR 1L -R5.00
CIDER 500ML CAN R27.99
TOTAL [2] R67.98
Cash R100.00
Change -R32.10
Cash Rounding R0.08
RATE TAX GROSS NET
15% R8.87 R67.98 R59.11
Today you saved R5.00
on our great deals!`,
  // Same slip as a crumpled photo reads on-device: letters for digits, broken decimals, lost columns.
  liquorShopCrumpled: `Li [¢]
SHOPRITE CHE! [) LTD
VOSLOORUS Tel Ni 1806 9110
VAT No: 06777 4
TAX I
CIDER 500ML CAN
TOTAL [2] A
Cash
Change -R32:10
Cash Rounding \\ RO.08 i
RATE TAX NET i
16% R8 87 RES 11 |`,
  picknPay: `PICK N PAY
FAMILY STORE BRYANSTON
VAT REG NO 4110102345
TAX INVOICE
SLIP NO 0045-0012-118734
DATE 02/10/2026 14:35
WHITE BREAD 700G 18.99
FULL CREAM MILK 2L 36.99
BANANAS LOOSE 1.2KG 29.94
SMART SHOPPER DISCOUNT -5.00
TOTAL DUE 80.92
CARD 80.92
VAT 15% INCLUDED 10.55
TOTAL EXCL VAT 70.37`,
  woolworths: `WOOLWORTHS
V&A WATERFRONT
VAT NO 4500123456
TAX INVOICE
29/09/2026 09:12
FREE RANGE EGGS 6 47.99
GREEK YOGHURT 500ML 54.99
SUBTOTAL 89.55
VAT 15% 13.43
TOTAL R102.98
VISA ************4421 R102.98`,
  spar: `KWIKSPAR SANDTON
TEL 011 555 0101
VAT REG: 4730261718
INV NO: 772119
2026-09-28
COKE 2L 26.99
SIMBA CHIPS 125G 21.99
TOTAL R 48,98
CASH R 50,00
CHANGE R 1,02
VAT INCL @15% R 6,39`,
  restaurant: `OCEAN BASKET MENLYN
TAX INVOICE NO: 18832
TABLE 12 WAITER: THANDI
03/10/2026
2 X HAKE & CHIPS 239.80
1 X COKE ZERO 32.90
SUBTOTAL 272.70
VAT @ 15% 35.57
TOTAL 272.70
TIP 30.00
AMOUNT PAID 302.70
CARD 302.70`,
  fuel: `ENGEN 1-STOP MIDRAND
VAT NO 4560107744
TAX INVOICE
DATE: 01/10/2026 TIME: 06:42
PUMP 04 DIESEL 50PPM
LITRES 45.20 @ R21.87
FUEL R988.52
TOTAL R988.52
VAT R128.94
PAID BY DEBIT CARD`,
  software: `GOOGLE WORKSPACE
INVOICE NUMBER 5123456789
INVOICE DATE 2026-09-01
BUSINESS STARTER 1 USER R 1 234,56
SUBTOTAL R 1 073,53
VAT (15%) R 161,03
TOTAL DUE R 1 234,56`,
  noVat: `JOE'S CORNER CAFE
HAPPY TO SERVE YOU
15/09/26
CAPPUCCINO 32.00
MUFFIN 28.00
TOTAL 60.00
CASH 100.00
CHANGE 40.00`,
};

describe("money parsing on slips", () => {
  it("fixes thermal OCR confusions inside rand amounts only", () => {
    expect(fixOcrAmountConfusions("Cash Rounding RO.08")).toBe("Cash Rounding R0.08");
    expect(fixOcrAmountConfusions("Change -R32:10")).toBe("Change -R32.10");
    expect(fixOcrAmountConfusions("VAT R8 87")).toBe("VAT R8.87");
    expect(fixOcrAmountConfusions("TOTAL R1 234,56")).toBe("TOTAL R1 234,56"); // thousands grouping untouched
    expect(fixOcrAmountConfusions("TIME 14:35")).toBe("TIME 14:35"); // not money
    expect(fixOcrAmountConfusions("ROOM 12")).toBe("ROOM 12");
  });
});

describe("the bug-report receipt", () => {
  it("clean read: GROSS/NET/TAX summary wins; tendered cash and change are never the total", () => {
    const x = read(FIXTURES.liquorShopClean);
    expect(x).toMatchObject({ total: 67.98, vatAmount: 8.87, subtotal: 59.11, vatRate: 15, currency: "ZAR", paymentMethod: "cash" });
    expect(x.merchantName).toBe("LiquorShop");
    expect(x.supplierVatNumber).toBe("4420106777");
    expect(x.transactionDate).toBeUndefined(); // the slip's date is not in the photo — never "today"
    expect(validateReceiptAmounts(x).status).toBe("consistent");
    expect(x.lineItems.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(67.98, 2);
  });

  it("crumpled read: no invented total, no 'not a receipt' claim — partial, for the person to finish", () => {
    const x = read(FIXTURES.liquorShopCrumpled, 68);
    expect(x.isReceipt).not.toBe(false);
    expect(x.total).toBeUndefined(); // the TOTAL figure was not legible
    expect([32.1, 100, 0.08]).not.toContain(x.total); // change / cash / rounding never become the total
    expect(assessExtractionCompleteness(x).level).not.toBe("complete");
  });
});

describe("South African slips", () => {
  it("Pick n Pay: VAT-inclusive total with 'VAT INCLUDED' footer; bare CARD is not guessed as credit or debit", () => {
    const x = read(FIXTURES.picknPay);
    expect(x).toMatchObject({ total: 80.92, transactionDate: "2026-10-02" });
    expect(x.paymentMethod).toBeUndefined();
    expect(x.merchantName).toMatch(/PICK N PAY/);
    expect(x).toMatchObject({ vatAmount: 10.55, vatRate: 15, subtotal: 70.37 });
    expect(validateReceiptAmounts(x).status).toBe("consistent");
  });

  it("Woolworths: subtotal + VAT = total; masked card number is not an amount", () => {
    const x = read(FIXTURES.woolworths);
    expect(x).toMatchObject({ subtotal: 89.55, vatAmount: 13.43, total: 102.98, vatRate: 15, transactionDate: "2026-09-29" });
    expect(validateReceiptAmounts(x).status).toBe("consistent");
  });

  it("SPAR: comma decimals, cash tendered (R50) is not the total, ISO date", () => {
    const x = read(FIXTURES.spar);
    expect(x).toMatchObject({ total: 48.98, transactionDate: "2026-09-28", paymentMethod: "cash" });
    expect(x.total).not.toBe(50);
    expect(x).toMatchObject({ vatAmount: 6.39, vatRate: 15 }); // "VAT INCL @15% R 6,39"
    expect(x.receiptNumber).toBe("772119");
  });

  it("restaurant: the bill total, not the tip-inclusive amount paid", () => {
    const x = read(FIXTURES.restaurant);
    expect(x.total).toBe(272.7);
    expect(x.total).not.toBe(302.7);
    expect(x).toMatchObject({ vatAmount: 35.57, transactionDate: "2026-10-03" });
  });

  it("fuel: litres × price is not money; total and VAT read", () => {
    const x = read(FIXTURES.fuel);
    expect(x).toMatchObject({ total: 988.52, vatAmount: 128.94, transactionDate: "2026-10-01" });
  });

  it("software invoice: R 1 234,56 thousands + comma decimals", () => {
    const x = read(FIXTURES.software);
    expect(x).toMatchObject({ total: 1234.56, subtotal: 1073.53, vatAmount: 161.03, transactionDate: "2026-09-01" });
    expect(validateReceiptAmounts(x).status).toBe("consistent");
  });

  it("no VAT on the slip: VAT stays unknown (not zero), cash R100 is not the total", () => {
    const x = read(FIXTURES.noVat);
    expect(x.total).toBe(60);
    expect(x.vatAmount).toBeUndefined();
    expect(x.transactionDate).toBe("2026-09-15");
  });
});

describe("completeness drives the review headline", () => {
  it("complete / partial / none", () => {
    expect(assessExtractionCompleteness(read(FIXTURES.woolworths)).level).toBe("complete");
    expect(assessExtractionCompleteness(read(FIXTURES.liquorShopClean))).toEqual({ level: "partial", missing: ["date"] });
    expect(assessExtractionCompleteness({ isReceipt: true, merchantName: "SHOPRITE CHE I 10" }).level).toBe("none");
    expect(assessExtractionCompleteness({}).level).toBe("none");
    expect(assessExtractionCompleteness(null).level).toBe("none");
  });
});
