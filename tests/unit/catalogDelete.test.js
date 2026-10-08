import { describe, expect, it } from "vitest";
import { catalogDeleteFailureMessage, deleteCatalogItem, isDocumentCatalogFk } from "@/services/catalogDelete";

function clientWith(steps) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        update(values) {
          return {
            eq(column, id) {
              calls.push({ op: "update", table, column, id, values });
              const step = steps.shift();
              return Promise.resolve(step || { error: null });
            },
          };
        },
        delete() {
          const filters = [];
          const query = {
            eq(column, id) {
              filters.push([column, id]);
              return query;
            },
            then(resolve, reject) {
              calls.push({ op: "delete", table, filters });
              const step = steps.shift();
              return Promise.resolve(step || { error: null }).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
}

describe("deleteCatalogItem", () => {
  it("deletes a catalog row that is not on a document", async () => {
    const client = clientWith([{ error: null }]);
    const result = await deleteCatalogItem(client, { id: "svc-1", orgId: "org-1" });
    expect(result.detached).toBe(false);
    expect(client.calls).toEqual([
      { op: "delete", table: "services", filters: [["id", "svc-1"], ["org_id", "org-1"]] },
    ]);
  });

  it("clears invoice and quote links, then deletes", async () => {
    const fk = {
      code: "23503",
      message: 'update or delete on table "services" violates foreign key constraint "invoice_items_service_id_fkey" on table "invoice_items"',
    };
    const client = clientWith([
      { error: fk },
      { error: null },
      { error: null },
      { error: null },
      { error: null },
      { error: null },
    ]);
    const result = await deleteCatalogItem(client, { id: "svc-1", orgId: "org-1" });
    expect(result.detached).toBe(true);
    expect(client.calls.filter((call) => call.op === "update").map((call) => `${call.table}.${call.column}`)).toEqual([
      "invoice_items.service_id",
      "invoice_items.catalog_item_id",
      "quote_items.service_id",
      "quote_items.catalog_item_id",
    ]);
    expect(client.calls.filter((call) => call.op === "delete")).toHaveLength(2);
  });

  it("does not report success when a purchase order still blocks the delete", async () => {
    const fk = {
      code: "23503",
      message: 'violates foreign key constraint "purchase_order_items_product_id_fkey" on table "purchase_order_items"',
    };
    const client = clientWith([{ error: fk }]);
    await expect(deleteCatalogItem(client, { id: "svc-1", orgId: "org-1" })).rejects.toThrow(
      "This item is on a purchase order, so it stays in your catalog."
    );
    expect(isDocumentCatalogFk(fk)).toBe(false);
    expect(catalogDeleteFailureMessage(fk)).toMatch(/purchase order/);
  });
});
