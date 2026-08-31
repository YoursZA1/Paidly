import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/src/pos/posAudit.js", () => ({
  recordPosAuditEvents: vi.fn(async () => {}),
}));

vi.mock("../../server/src/pos/posInventorySync.js", () => ({
  applyPosSaleInventory: vi.fn(async () => ({
    applied: true,
    failed: null,
    results: [{ sku: "COF", status: "applied" }],
  })),
}));

import { processPosWebhookSale } from "../../server/src/pos/posSaleProcessor.js";
import { applyPosSaleInventory } from "../../server/src/pos/posInventorySync.js";

const payload = {
  id: "ext-sale-1",
  status: "completed",
  total: 80,
  currency: "ZAR",
  payment_method: "card",
  occurred_at: "2026-08-28T12:00:00.000Z",
  items: [{ sku: "COF", quantity: 2, unit_price: 40 }],
};

const connection = { id: "conn-a", org_id: "org-a", provider: "generic" };

function createSupabase({ existing = null, insertId = "sale-new", insertError = null } = {}) {
  const inserts = [];
  const updates = [];
  return {
    inserts,
    updates,
    from(table) {
      return {
        select() {
          const chain = {
            eq() {
              return chain;
            },
            maybeSingle: async () => ({ data: existing, error: null }),
          };
          return chain;
        },
        insert(row) {
          inserts.push({ table, row });
          return {
            select() {
              return {
                single: async () =>
                  insertError
                    ? { data: null, error: insertError }
                    : { data: { id: insertId }, error: null },
              };
            },
          };
        },
        update(row) {
          updates.push({ table, row });
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  };
}

describe("processPosWebhookSale", () => {
  beforeEach(() => {
    applyPosSaleInventory.mockClear();
  });

  it("inserts one sale for the connection org on first payment event", async () => {
    const supabase = createSupabase({ existing: null, insertId: "sale-1" });
    const result = await processPosWebhookSale(supabase, { connection, payload });
    expect(result).toMatchObject({ ok: true, status: 201, saleEventId: "sale-1" });
    expect(result.duplicate).toBeFalsy();
    expect(supabase.inserts).toHaveLength(1);
    expect(supabase.inserts[0].row).toMatchObject({
      org_id: "org-a",
      connection_id: "conn-a",
      external_id: "ext-sale-1",
      inventory_applied: false,
    });
    expect(applyPosSaleInventory).toHaveBeenCalledTimes(1);
    expect(applyPosSaleInventory.mock.calls[0][1]).toBe("org-a");
    expect(applyPosSaleInventory.mock.calls[0][2]).toBe("sale-1");
  });

  it("does not insert a second sale or re-decrement stock on a duplicate event", async () => {
    const supabase = createSupabase({
      existing: { id: "sale-1", inventory_applied: true, items: payload.items },
    });
    const result = await processPosWebhookSale(supabase, { connection, payload });
    expect(result).toEqual({
      ok: true,
      status: 200,
      duplicate: true,
      saleEventId: "sale-1",
      inventoryApplied: true,
    });
    expect(supabase.inserts).toHaveLength(0);
    expect(applyPosSaleInventory).not.toHaveBeenCalled();
  });

  it("does not write another tenant's org_id onto the sale", async () => {
    const other = { ...connection, org_id: "org-b", id: "conn-b" };
    const supabase = createSupabase({ insertId: "sale-b" });
    await processPosWebhookSale(supabase, { connection: other, payload });
    expect(supabase.inserts[0].row.org_id).toBe("org-b");
    expect(supabase.inserts[0].row.org_id).not.toBe("org-a");
  });
});
