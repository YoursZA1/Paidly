import { describe, it, expect } from "vitest";
import {
  WALK_IN_CUSTOMER_LABEL,
  filterPosCustomers,
  matchPosCustomer,
  mergePosCustomerResults,
  sanitizePosCustomerQuery,
} from "../../src/lib/pos/posCustomerSearch.js";

describe("posCustomerSearch", () => {
  it("keeps the walk-in label stable", () => {
    expect(WALK_IN_CUSTOMER_LABEL).toBe("Walk-in Customer");
  });

  it("matches name, email, phone, and contact person", () => {
    const client = { name: "Ada Khosa", email: "ada@shop.test", phone: "0821112222", contact_person: "Thabo" };
    expect(matchPosCustomer(client, "khosa")).toBe(true);
    expect(matchPosCustomer(client, "shop.test")).toBe(true);
    expect(matchPosCustomer(client, "082111")).toBe(true);
    expect(matchPosCustomer(client, "thabo")).toBe(true);
    expect(matchPosCustomer(client, "nobody")).toBe(false);
    expect(matchPosCustomer(client, "")).toBe(true);
  });

  it("filters and caps results", () => {
    const clients = [
      { id: "1", name: "Ada" },
      { id: "2", name: "Ben" },
      { id: "3", name: "Ada Stores" },
    ];
    expect(filterPosCustomers(clients, "ada", 1)).toHaveLength(1);
    expect(filterPosCustomers(clients, "ada").map((row) => row.id)).toEqual(["1", "3"]);
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
});
