import { describe, it, expect } from "vitest";
import {
  parseGenericPosSale,
  parseYocoPosSale,
  parseSquarePosSale,
  parsePosSale,
} from "../../server/src/pos/posSaleParsers.js";

describe("parseGenericPosSale", () => {
  it("parses a completed generic sale with line items", () => {
    const sale = parseGenericPosSale({
      id: "sale-1",
      status: "completed",
      total: 150,
      currency: "zar",
      payment_method: "card",
      occurred_at: "2026-07-09T10:00:00.000Z",
      items: [{ sku: "SKU-1", quantity: 2, unit_price: 75 }],
    });

    expect(sale).toMatchObject({
      externalId: "sale-1",
      totalAmount: 150,
      currency: "ZAR",
      paymentMethod: "card",
      items: [{ sku: "SKU-1", quantity: 2, unitPrice: 75 }],
    });
  });

  it("returns null for non-completed sales", () => {
    expect(parseGenericPosSale({ id: "x", status: "pending", total: 10 })).toBeNull();
  });
});

describe("parseYocoPosSale", () => {
  it("parses Yoco payment.succeeded payloads (amount in cents)", () => {
    const sale = parseYocoPosSale({
      type: "payment.succeeded",
      payload: {
        id: "yoco-99",
        amount: 25000,
        currency: "ZAR",
        metadata: {
          items: [{ sku: "A1", quantity: 1 }],
        },
        created_at: "2026-07-09T11:00:00.000Z",
      },
    });

    expect(sale?.externalId).toBe("yoco-99");
    expect(sale?.totalAmount).toBe(250);
    expect(sale?.items[0]?.sku).toBe("A1");
  });
});

describe("parseSquarePosSale", () => {
  it("parses Square payment.completed payloads", () => {
    const sale = parseSquarePosSale({
      type: "payment.completed",
      data: {
        object: {
          payment: {
            id: "sq-1",
            amount_money: { amount: 9999, currency: "ZAR" },
            line_items: [{ sku: "B2", quantity: "3" }],
            created_at: "2026-07-09T12:00:00.000Z",
          },
        },
      },
    });

    expect(sale?.externalId).toBe("sq-1");
    expect(sale?.totalAmount).toBe(99.99);
    expect(sale?.items[0]?.quantity).toBe(3);
  });
});

describe("parsePosSale", () => {
  it("routes by provider", () => {
    const generic = parsePosSale("generic", {
      id: "g1",
      status: "paid",
      total: 20,
    });
    expect(generic?.externalId).toBe("g1");
  });
});
