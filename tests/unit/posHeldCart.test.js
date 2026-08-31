import { describe, it, expect } from "vitest";
import { hydrateHeldCart } from "../../src/lib/pos/posHeldCart.js";

function product(overrides = {}) {
  return {
    id: "p1",
    name: "Coffee",
    sku: "COF",
    item_type: "product",
    is_active: true,
    price: 25,
    stock_quantity: 10,
    ...overrides,
  };
}

describe("hydrateHeldCart", () => {
  it("restores lines from live catalog stock and listed price", () => {
    const result = hydrateHeldCart(
      {
        cart: [{ product_id: "p1", quantity: 3 }],
        discount_amount: 10,
        client_id: "c1",
        client_query: "Ada",
      },
      [product()]
    );
    expect(result.ok).toBe(true);
    expect(result.cart).toEqual([
      {
        product_id: "p1",
        name: "Coffee",
        sku: "COF",
        quantity: 3,
        unit_price: 25,
        stock: 10,
      },
    ]);
    expect(result.discount_amount).toBe(10);
    expect(result.client_id).toBe("c1");
  });

  it("caps quantity to current stock and discount to restored subtotal", () => {
    const result = hydrateHeldCart(
      {
        cart: [{ product_id: "p1", quantity: 8 }],
        discount_amount: 999,
      },
      [product({ stock_quantity: 2 })]
    );
    expect(result.ok).toBe(true);
    expect(result.cart[0].quantity).toBe(2);
    expect(result.discount_amount).toBe(50);
  });

  it("skips missing or inactive products", () => {
    const result = hydrateHeldCart(
      { cart: [{ product_id: "gone", quantity: 1 }, { product_id: "p1", quantity: 1 }] },
      [product({ is_active: false })]
    );
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(2);
  });
});
