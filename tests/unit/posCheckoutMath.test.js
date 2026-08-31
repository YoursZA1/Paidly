import { describe, it, expect } from "vitest";
import {
  applyPosSaleDiscount,
  buildCheckoutLines,
  catalogUnitPrice,
  computeCashChange,
  makeReceiptNumber,
  normalizePaymentMethod,
  paymentIntentMatchesPayable,
  POS_PAYMENT_METHODS,
  quotedCheckoutMoneyConflict,
  remainingReturnQuantities,
  roundMoney,
  posSaleCompletesWhenPaid,
  clientBelongsToCheckoutOrg,
  posCustomerEligibleForTill,
} from "../../server/src/pos/posCheckoutMath.js";

function product(overrides = {}) {
  return {
    id: "p1",
    name: "Coffee",
    item_type: "product",
    is_active: true,
    price: 25,
    stock_quantity: 10,
    sku: "COF",
    ...overrides,
  };
}

describe("posCheckoutMath", () => {
  it("rounds money to cents", () => {
    expect(roundMoney(10.555)).toBe(10.56);
  });

  it("prefers catalog price over default_rate", () => {
    expect(catalogUnitPrice({ price: 12, default_rate: 99 })).toBe(12);
  });

  it("builds merged cart lines and subtotal", () => {
    const catalog = new Map([["p1", product()]]);
    const result = buildCheckoutLines(
      [
        { product_id: "p1", quantity: 2 },
        { product_id: "p1", quantity: 1 },
      ],
      catalog
    );
    expect(result.ok).toBe(true);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].quantity).toBe(3);
    expect(result.lines[0].line_id).toBe("line-1-p1");
    expect(result.subtotal).toBe(75);
  });

  it("rejects insufficient stock", () => {
    const catalog = new Map([["p1", product({ stock_quantity: 1 })]]);
    const result = buildCheckoutLines([{ product_id: "p1", quantity: 2 }], catalog);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INSUFFICIENT_STOCK");
  });

  it("rejects services that are not products", () => {
    const catalog = new Map([["p1", product({ item_type: "service" })]]);
    const result = buildCheckoutLines([{ product_id: "p1", quantity: 1 }], catalog);
    expect(result.ok).toBe(false);
  });

  it("applies cart discount without adding tax on listed prices", () => {
    const payable = applyPosSaleDiscount(200, 50);
    expect(payable).toEqual({
      subtotal: 200,
      discount_amount: 50,
      tax_amount: 0,
      tax_rate: 0,
      total: 150,
    });
    expect(applyPosSaleDiscount(80, 100).discount_amount).toBe(80);
    expect(applyPosSaleDiscount(80, 100).total).toBe(0);
  });

  it("computes cash change against payable total", () => {
    expect(computeCashChange(350, 500)).toEqual({
      ok: true,
      amountTendered: 500,
      changeDue: 150,
    });
    expect(computeCashChange(80, 100)).toEqual({
      ok: true,
      amountTendered: 100,
      changeDue: 20,
    });
    expect(computeCashChange(80, 50).ok).toBe(false);
  });

  it("normalizes payment methods", () => {
    expect(normalizePaymentMethod("CASH")).toBe("cash");
    expect(normalizePaymentMethod("card")).toBe("card");
    expect(normalizePaymentMethod("digital")).toBe("digital");
    expect(POS_PAYMENT_METHODS).toEqual(["cash", "card", "digital", "other"]);
    expect(normalizePaymentMethod("eft")).toBeNull();
  });

  it("builds receipt numbers", () => {
    expect(makeReceiptNumber("sale")).toMatch(/^POS-\d{8}-[A-Z0-9]+$/);
    expect(makeReceiptNumber("return")).toMatch(/^RET-\d{8}-[A-Z0-9]+$/);
  });

  it("tracks remaining return quantities", () => {
    const remaining = remainingReturnQuantities(
      [{ product_id: "p1", quantity: 3 }],
      [{ product_id: "p1", quantity: 1 }]
    );
    expect(remaining.get("p1")).toBe(2);
  });

  it("ignores client unit prices and uses the catalog", () => {
    const catalog = new Map([["p1", product({ price: 25 })]]);
    const result = buildCheckoutLines(
      [{ product_id: "p1", quantity: 2, unit_price: 1 }],
      catalog
    );
    expect(result.ok).toBe(true);
    expect(result.lines[0].unit_price).toBe(25);
    expect(result.subtotal).toBe(50);
  });

  it("rejects client totals that do not match the server payable", () => {
    const payable = applyPosSaleDiscount(100, 10);
    expect(quotedCheckoutMoneyConflict({}, payable).ok).toBe(true);
    expect(quotedCheckoutMoneyConflict({ total: 90 }, payable).ok).toBe(true);
    expect(quotedCheckoutMoneyConflict({ total_amount: 1 }, payable)).toMatchObject({
      ok: false,
      code: "TOTALS_MISMATCH",
    });
    expect(quotedCheckoutMoneyConflict({ tax_amount: 15 }, payable).ok).toBe(false);
  });

  it("requires the payment intent amount and org to match the sale", () => {
    const payable = applyPosSaleDiscount(80, 0);
    expect(
      paymentIntentMatchesPayable(
        { id: "i1", org_id: "org-1", amount: 80, currency: "ZAR" },
        payable,
        { orgId: "org-1", currency: "ZAR" }
      ).ok
    ).toBe(true);
    expect(
      paymentIntentMatchesPayable(
        { id: "i1", org_id: "org-2", amount: 80, currency: "ZAR" },
        payable,
        { orgId: "org-1", currency: "ZAR" }
      ).code
    ).toBe("TENANT_MISMATCH");
    expect(
      paymentIntentMatchesPayable(
        { id: "i1", org_id: "org-1", amount: 10, currency: "ZAR" },
        payable,
        { orgId: "org-1", currency: "ZAR" }
      ).code
    ).toBe("AMOUNT_MISMATCH");
  });

  it("completes a sale only when the payment intent is paid", () => {
    expect(posSaleCompletesWhenPaid({ status: "paid" })).toBe(true);
    expect(posSaleCompletesWhenPaid({ status: "pending" })).toBe(false);
    expect(posSaleCompletesWhenPaid({ status: "failed" })).toBe(false);
  });

  it("rejects customers that belong to another organization", () => {
    expect(clientBelongsToCheckoutOrg({ id: "c1", org_id: "org-1" }, "org-1")).toBe(true);
    expect(clientBelongsToCheckoutOrg({ id: "c1", org_id: "org-2" }, "org-1")).toBe(false);
  });

  it("allows till attach only for POS-enabled org customers", () => {
    expect(posCustomerEligibleForTill({ id: "c1", org_id: "org-1", pos_enabled: true }, "org-1")).toBe(true);
    expect(posCustomerEligibleForTill({ id: "c1", org_id: "org-1", pos_enabled: false }, "org-1")).toBe(false);
    expect(posCustomerEligibleForTill({ id: "c1", org_id: "org-1" }, "org-1")).toBe(false);
    expect(posCustomerEligibleForTill({ id: "c1", org_id: "org-2", pos_enabled: true }, "org-1")).toBe(false);
  });
});
