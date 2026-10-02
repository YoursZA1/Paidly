/**
 * Business type → what the POS front shows. Service: no till. Retail: products only. Mixed: products
 * and services, no hospitality. Restaurant / café / bar: the full floor → kitchen → orders flow.
 */
import { describe, expect, it } from "vitest";
import { posExperienceFor } from "../../shared/businessType.js";
import { buildCheckoutLines } from "../../server/src/pos/posCheckoutMath.js";
import { addPosCartLine, isPosService, posProductStock, posStockLabel, setPosCartQty } from "../../src/lib/pos/posCart.js";

describe("posExperienceFor", () => {
  it.each([
    ["service", { pos: false, restaurant: false, services: false }],
    ["retail", { pos: true, restaurant: false, services: false }],
    ["mixed", { pos: true, restaurant: false, services: true }],
    ["restaurant", { pos: true, restaurant: true, services: false }],
    ["café", { pos: true, restaurant: true, services: false }],
    [null, { pos: false, restaurant: false, services: false }],
  ])("%s", (type, expected) => {
    expect(posExperienceFor(type)).toMatchObject(expected);
  });
});

const product = { id: "p1", name: "10 Pack Pads", item_type: "product", price: 35, stock_quantity: 2, is_active: true };
const service = { id: "s1", name: "Gift wrapping", item_type: "service", price: 20, stock_quantity: null, is_active: true };
const catalog = new Map([
  [product.id, product],
  [service.id, service],
]);

describe("services at the till (mixed)", () => {
  it("checkout refuses services unless the business sells them at the till", () => {
    const no = buildCheckoutLines([{ product_id: "s1", quantity: 1 }], catalog, { requireStock: true });
    expect(no.ok).toBe(false);
    const yes = buildCheckoutLines(
      [
        { product_id: "s1", quantity: 3 },
        { product_id: "p1", quantity: 2 },
      ],
      catalog,
      { requireStock: true, allowServices: true }
    );
    expect(yes.ok).toBe(true);
    expect(yes.subtotal).toBe(130);
    expect(yes.lines.map((l) => [l.name, l.item_type, l.stock_on_hand])).toEqual([
      ["Gift wrapping", "service", null],
      ["10 Pack Pads", "product", 2],
    ]);
  });

  it("services never run out of stock; products still do", () => {
    const over = buildCheckoutLines([{ product_id: "p1", quantity: 3 }], catalog, { requireStock: true, allowServices: true });
    expect(over.code).toBe("INSUFFICIENT_STOCK");
    expect(isPosService(service)).toBe(true);
    expect(posStockLabel(posProductStock(service), { compact: true, service: true })).toEqual({ text: "Service", tone: "ok" });
    let { cart, error } = addPosCartLine([], service, 5);
    expect(error).toBeNull();
    cart = setPosCartQty(cart, "s1", 40);
    expect(cart[0].quantity).toBe(40);
    // A held cart round-trips through JSON without losing the quantity.
    expect(setPosCartQty(JSON.parse(JSON.stringify(cart)), "s1", 41)[0].quantity).toBe(41);
  });
});
