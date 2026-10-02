/**
 * Services sold on a mixed till carry no stock: committing a sale never calls the stock RPC for them,
 * so a service line can't fail (and roll back) the sale's inventory. Returns behave the same way.
 */
import { describe, expect, it } from "vitest";
import { commitNativePosInventory } from "../../server/src/pos/posInventorySync.js";

function fakeDb(saleItems = []) {
  const rpc = [];
  return {
    rpc: async (name, args) => {
      rpc.push({ name, product: args.p_product_id, delta: args.p_delta });
      return { data: { new_stock: 10 }, error: null };
    },
    from: () => {
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: { id: "sale-1", inventory_applied: false, items: saleItems }, error: null }),
      };
      return api;
    },
    calls: rpc,
  };
}

const coke = { product_id: "p-coke", name: "Coke", quantity: 1, item_type: "product" };
const wrap = { product_id: "s-wrap", name: "Gift wrapping", quantity: 2, item_type: "service" };

describe("inventory skips services", () => {
  it("only products move stock on a mixed sale", async () => {
    const db = fakeDb();
    const out = await commitNativePosInventory(db, { orgId: "org", saleEventId: "sale-1", items: [wrap, coke] });
    expect(out.failed).toBeNull();
    expect(db.calls.map((c) => c.product)).toEqual(["p-coke"]);
  });

  it("a services-only sale is complete without touching stock (and never falls back to the stored lines)", async () => {
    const db = fakeDb([wrap]);
    const out = await commitNativePosInventory(db, { orgId: "org", saleEventId: "sale-1", items: [wrap] });
    expect(out).toMatchObject({ applied: true, failed: null });
    expect(db.calls).toEqual([]);
  });

  it("returning a service doesn't restock anything", async () => {
    const db = fakeDb();
    await commitNativePosInventory(db, { orgId: "org", saleEventId: "sale-1", items: [wrap, coke], direction: "in" });
    expect(db.calls.map((c) => [c.product, c.delta > 0])).toEqual([["p-coke", true]]);
  });
});
