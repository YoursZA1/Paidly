import { describe, expect, it } from "vitest";
import { parseReceiptOcrText } from "@/lib/receipts/ocrTextParser.js";
import { enhanceForReading, findReceiptBounds, fitWithin } from "@/lib/receipts/receiptImageProcessing.js";
import { assertReceiptDimensions, inspectReceiptFile, ReceiptFileError, sniffReceiptMime } from "@/lib/receipts/receiptFile.js";

const WOOLWORTHS = `WOOLWORTHS
Sandton City
TAX INVOICE
VAT No: 4010101010
Date: 30/09/2026 14:02
Receipt No: 123456
MILK 2L            35.99
BREAD              24.99
SUBTOTAL          420.00
VAT 15%            63.00
TOTAL             483.00
DEBIT CARD        483.00`;

describe("on-device OCR text parser", () => {
  it("successful OCR: labelled values are read", () => {
    const x = parseReceiptOcrText(WOOLWORTHS, { confidence: 88 });
    expect(x).toMatchObject({
      isReceipt: true,
      merchantName: "WOOLWORTHS",
      supplierVatNumber: "4010101010",
      receiptNumber: "123456",
      transactionDate: "2026-09-30",
      subtotal: 420,
      vatAmount: 63,
      vatRate: 15,
      total: 483,
      paymentMethod: "debit_card",
    });
    // Amounts that add up are trusted more.
    expect(x.confidence.total).toBeGreaterThanOrEqual(0.9);
  });

  it("missing fields stay missing — no total is guessed from the largest number", () => {
    const x = parseReceiptOcrText("CORNER SHOP\n12/09/2026\nBREAD 24.99\nMILK 35.99", { confidence: 90 });
    expect(x.total).toBeUndefined();
    expect(x.vatAmount).toBeUndefined();
    expect(x.transactionDate).toBe("2026-09-12");
  });

  it("incorrect OCR: low confidence is carried through", () => {
    const x = parseReceiptOcrText("W00LW0RTHS\nTOTAL 483.00\n30/09/2026", { confidence: 35 });
    expect(x.total).toBe(483);
    expect(x.confidence.total).toBeLessThan(0.6);
  });

  it("incorrect OCR: a misread label gives no total rather than a guess", () => {
    const x = parseReceiptOcrText("W00LW0RTHS\nT0TAL 483.00\n30/09/2026", { confidence: 35 });
    expect(x.total).toBeUndefined();
  });

  it("doesn't take 'Total VAT' or subtotal lines as the total", () => {
    const x = parseReceiptOcrText("SHOP\n01/09/2026\nSub Total 100.00\nTotal VAT 15.00\nTOTAL DUE 115.00", { confidence: 80 });
    expect(x.total).toBe(115);
    expect(x.subtotal).toBe(100);
    expect(x.vatAmount).toBe(15);
  });

  it("non-receipt text → isReceipt false", () => {
    expect(parseReceiptOcrText("Hello there\nnothing to see", { confidence: 70 })).toEqual({ isReceipt: false });
    expect(parseReceiptOcrText("", {})).toEqual({ isReceipt: false });
  });
});

function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe("receipt image processing", () => {
  it("crops a bright receipt off a dark table", () => {
    const img = image(200, 200, (x, y) => (x >= 60 && x < 140 && y >= 20 && y < 180 ? 235 : 40));
    const b = findReceiptBounds(img);
    expect(b).not.toBeNull();
    expect(b.x).toBeGreaterThanOrEqual(50);
    expect(b.x + b.width).toBeLessThanOrEqual(150);
    expect(b.height).toBeGreaterThan(150);
  });

  it("leaves a scan / white-desk photo uncropped", () => {
    expect(findReceiptBounds(image(200, 200, () => 240))).toBeNull();
    expect(findReceiptBounds(image(200, 200, (x) => (x % 10 === 0 ? 30 : 240)))).toBeNull();
  });

  it("stretches contrast on flat photos only", () => {
    const flat = image(10, 10, (x) => 100 + x * 5);
    expect(enhanceForReading(flat)).toBe(true);
    expect(Math.max(...flat.data)).toBe(255);
    const crisp = image(10, 10, (x) => (x < 5 ? 0 : 255));
    expect(enhanceForReading(crisp)).toBe(false);
  });

  it("resizes oversized images", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

const bytes = (...b) => new Uint8Array(b);

describe("receipt file validation", () => {
  it("sniffs content, not the file name", () => {
    expect(sniffReceiptMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffReceiptMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffReceiptMime(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(sniffReceiptMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffReceiptMime(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("valid receipt", async () => {
    const jpg = new File([bytes(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3)], "r.jpg", { type: "image/jpeg" });
    await expect(inspectReceiptFile(jpg)).resolves.toEqual({ kind: "image", mime: "image/jpeg" });
    const pdf = new File([new TextEncoder().encode("%PDF-1.7\n...\n%%EOF\n")], "r.pdf", { type: "application/pdf" });
    await expect(inspectReceiptFile(pdf)).resolves.toEqual({ kind: "pdf", mime: "application/pdf" });
  });

  it("renamed file is judged by its content", async () => {
    const png = new File([bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)], "photo.jpg", { type: "image/jpeg" });
    await expect(inspectReceiptFile(png)).resolves.toMatchObject({ mime: "image/png" });
  });

  it.each([
    [new File([], "empty.jpg", { type: "image/jpeg" }), "empty"],
    [new File([new TextEncoder().encode("MZ executable")], "r.jpg", { type: "image/jpeg" }), "unsupported"],
    [new File([new TextEncoder().encode("GIF89a....")], "r.gif", { type: "image/gif" }), "unsupported"],
    [new File([new TextEncoder().encode("\0\0\0 ftypheic....")], "IMG_1.HEIC", { type: "image/heic" }), "heic"],
    [new File([new TextEncoder().encode("%PDF-1.7 truncated")], "r.pdf", { type: "application/pdf" }), "corrupt"],
  ])("invalid / corrupt file %#", async (file, code) => {
    await expect(inspectReceiptFile(file)).rejects.toMatchObject({ code });
  });

  it("oversized file", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    const err = await inspectReceiptFile(big).catch((e) => e);
    expect(err).toBeInstanceOf(ReceiptFileError);
    expect(err.code).toBe("too_large");
  });

  it("dimension limits", () => {
    expect(() => assertReceiptDimensions({ width: 120, height: 900 })).toThrow(/too small/);
    expect(() => assertReceiptDimensions({ width: 20000, height: 900 })).toThrow(/too large/);
    expect(() => assertReceiptDimensions({ width: 1200, height: 1600 })).not.toThrow();
  });
});
