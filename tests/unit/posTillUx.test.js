import { describe, expect, it } from "vitest";
import { applyPosCashKey, centsToCashTender } from "../../src/lib/pos/posCashKeypad.js";
import { popularProductIdsFromSales, scopePosCatalog } from "../../src/lib/pos/posPopularProducts.js";

describe("posCashKeypad", () => {
  it("enters cash as cents from the pad", () => {
    let v = "0.00";
    v = applyPosCashKey(v, "4");
    v = applyPosCashKey(v, "0");
    v = applyPosCashKey(v, "0");
    v = applyPosCashKey(v, "0");
    v = applyPosCashKey(v, "0");
    expect(v).toBe("400.00");
  });

  it("backs up and clears", () => {
    expect(applyPosCashKey("12.34", "back")).toBe("1.23");
    expect(applyPosCashKey("12.34", "clear")).toBe("0.00");
    expect(centsToCashTender(5000)).toBe("50.00");
  });
});

describe("posPopularProducts", () => {
  it("ranks today's sold quantities and skips returns", () => {
    const ids = popularProductIdsFromSales([
      { sale_kind: "sale", items: [{ product_id: "a", quantity: 2 }, { product_id: "b", quantity: 1 }] },
      { sale_kind: "sale", items: [{ product_id: "a", quantity: 3 }] },
      { sale_kind: "return", items: [{ product_id: "a", quantity: 9 }] },
    ]);
    expect(ids[0]).toBe("a");
    expect(ids).toEqual(["a", "b"]);
  });

  it("scopes the popular tab without inventing products", () => {
    const catalog = [{ id: "b", name: "B" }, { id: "a", name: "A" }, { id: "c", name: "C" }];
    expect(scopePosCatalog(catalog, "popular", ["a", "c"]).map((p) => p.id)).toEqual(["a", "c"]);
    expect(scopePosCatalog(catalog, "all", ["a"])).toHaveLength(3);
  });
});
