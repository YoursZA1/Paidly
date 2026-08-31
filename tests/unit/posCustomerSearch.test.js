import { describe, it, expect } from "vitest";
import {
  WALK_IN_CUSTOMER_LABEL,
  filterPosCustomers,
  formatPosCustomerPhone,
  matchPosCustomer,
  mergePosCustomerResults,
  sanitizePosCustomerQuery,
} from "../../src/lib/pos/posCustomerSearch.js";

describe("posCustomerSearch", () => {
  it("keeps the walk-in label stable", () => {
    expect(WALK_IN_CUSTOMER_LABEL).toBe("Walk-in Customer");
  });

  it("matches name and phone only — not email or contact person", () => {
    const client = {
      name: "Ada Khosa",
      email: "ada@shop.test",
      phone: "0821112222",
      contact_person: "Thabo",
      pos_enabled: true,
    };
    expect(matchPosCustomer(client, "khosa")).toBe(true);
    expect(matchPosCustomer(client, "082111")).toBe(true);
    expect(matchPosCustomer(client, "shop.test")).toBe(false);
    expect(matchPosCustomer(client, "thabo")).toBe(false);
    expect(matchPosCustomer(client, "nobody")).toBe(false);
    expect(matchPosCustomer(client, "")).toBe(true);
  });

  it("filters to POS-enabled customers and caps results", () => {
    const clients = [
      { id: "1", name: "Ada", pos_enabled: true },
      { id: "2", name: "Ben", pos_enabled: true },
      { id: "3", name: "Ada Stores", pos_enabled: false },
      { id: "4", name: "Invoice Co", email: "billing@invoice.test" },
    ];
    expect(filterPosCustomers(clients, "ada", 1)).toHaveLength(1);
    expect(filterPosCustomers(clients, "ada").map((row) => row.id)).toEqual(["1"]);
    expect(filterPosCustomers(clients, "invoice")).toEqual([]);
  });

  it("merges remote hits without duplicates", () => {
    const merged = mergePosCustomerResults(
      [{ id: "1", name: "Ada" }],
      [
        { id: "1", name: "Ada" },
        { id: "2", name: "Ben" },
      ]
    );
    expect(merged.map((row) => row.id)).toEqual(["1", "2"]);
  });

  it("strips PostgREST wildcards from search text", () => {
    expect(sanitizePosCustomerQuery("Ada_%(x)*")).toBe("Ada x");
    expect(sanitizePosCustomerQuery('Ada "Ltd"')).toBe("Ada Ltd");
  });

  it("masks POS customer phone numbers in the picker", () => {
    expect(formatPosCustomerPhone("0821234567")).toBe("082 xxx xxxx");
    expect(formatPosCustomerPhone("+27 82 123 4567")).toBe("278 xxx xxxx");
    expect(formatPosCustomerPhone("")).toBe("");
  });
});
