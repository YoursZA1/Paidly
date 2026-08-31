import { describe, it, expect, vi } from "vitest";
import {
  applyNativePosInventory,
  applyPosSaleInventory,
  canCommitPosInventory,
  commitNativePosInventory,
  nativeInventoryDelta,
} from "../../server/src/pos/posInventorySync.js";
import { buildCheckoutLines } from "../../server/src/pos/posCheckoutMath.js";

function product(overrides = {}) {
  return {
    id: "p1",
    name: "Coffee",
    item_type: "product",
    is_active: true,
    price: 25,
    stock_quantity: 10,
    ...overrides,
  };
}

describe("POS inventory commit point", () => {
  it("plans sale out and return in deltas", () => {
    expect(nativeInventoryDelta("out", 3)).toEqual({ quantity: 3, type: "out", delta: -3 });
    expect(nativeInventoryDelta("in", 2)).toEqual({ quantity: 2, type: "in", delta: 2 });
  });

  it("refuses inventory without a recorded sale or before settlement", () => {
    expect(canCommitPosInventory({}).ok).toBe(false);
    expect(canCommitPosInventory({ saleEventId: "sale-1", paymentSettled: false }).code).toBe(
      "PAYMENT_NOT_SETTLED"
    );
    expect(canCommitPosInventory({ saleEventId: "sale-1", paymentSettled: true }).ok).toBe(true);
  });

  it("validates cart stock without mutating catalog quantity", () => {
    const row = product({ stock_quantity: 4 });
    const built = buildCheckoutLines([{ product_id: "p1", quantity: 2 }], new Map([["p1", row]]));
    expect(built.ok).toBe(true);
    expect(row.stock_quantity).toBe(4);
  });

  it("does not call adjust_inventory_stock without a sale event id", async () => {
    const supabase = { rpc: vi.fn() };
    const native = await applyNativePosInventory(
      supabase,
      "org-1",
      "",
      [{ product_id: "p1", quantity: 1 }],
      "out"
    );
    const webhook = await applyPosSaleInventory(supabase, "org-1", null, [
      { sku: "COF", quantity: 1 },
    ]);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(native.failed).toBeTruthy();
    expect(webhook.failed).toBeTruthy();
  });

  it("does not commit inventory when payment is not settled", async () => {
    const supabase = { rpc: vi.fn(), from: vi.fn() };
    const result = await commitNativePosInventory(supabase, {
      orgId: "org-1",
      saleEventId: "sale-1",
      items: [{ product_id: "p1", quantity: 1 }],
      paymentSettled: false,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.code).toBe("PAYMENT_NOT_SETTLED");
  });

  it("skips RPC when the sale already has inventory_applied", async () => {
    const supabase = {
      rpc: vi.fn(),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "sale-1",
                inventory_applied: true,
                inventory_result: [{ product_id: "p1", status: "applied" }],
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    const result = await commitNativePosInventory(supabase, {
      orgId: "org-1",
      saleEventId: "sale-1",
      items: [{ product_id: "p1", quantity: 2 }],
      paymentSettled: true,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.duplicate).toBe(true);
    expect(result.applied).toBe(true);
  });

  it("decrements via adjust_inventory_stock after a recorded sale", async () => {
    const rpc = vi.fn(async (_name, args) => {
      expect(args.p_source).toBe("pos");
      expect(args.p_reference_id).toBe("sale-1");
      expect(args.p_delta).toBe(-2);
      expect(args.p_type).toBe("out");
      return { data: [{ new_stock: 8 }], error: null };
    });
    const result = await applyNativePosInventory(
      { rpc },
      "org-1",
      "sale-1",
      [{ product_id: "p1", name: "Coffee", quantity: 2 }],
      "out"
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(true);
    expect(result.failed).toBeNull();
    expect(result.results[0].new_stock).toBe(8);
  });

  it("reverses applied lines if a later line fails so stock is not left half-moved", async () => {
    const rpc = vi.fn(async (_name, args) => {
      if (args.p_product_id === "p2" && args.p_type === "out") {
        return { data: null, error: { message: "insufficient stock" } };
      }
      return { data: [{ new_stock: 1 }], error: null };
    });
    const result = await applyNativePosInventory(
      { rpc },
      "org-1",
      "sale-1",
      [
        { product_id: "p1", quantity: 1 },
        { product_id: "p2", quantity: 1 },
      ],
      "out"
    );
    expect(result.applied).toBe(false);
    expect(result.failed).toBeTruthy();
    const reverse = rpc.mock.calls.find(([, args]) => args.p_product_id === "p1" && args.p_type === "in");
    expect(reverse).toBeTruthy();
    expect(reverse[1].p_delta).toBe(1);
  });
});
