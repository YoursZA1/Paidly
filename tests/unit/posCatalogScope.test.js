import { describe, expect, it } from "vitest";
import {
  filterCatalogForRegister,
  productVisibleOnRegister,
  saleCompanyIdFromRegister,
} from "../../server/src/pos/posCatalogScope.js";

const shared = { id: "p-shared", name: "Shared mug", company_id: null };
const brandA = { id: "p-a", name: "Brand A tea", company_id: "brand-a" };
const brandB = { id: "p-b", name: "Brand B coffee", company_id: "brand-b" };

describe("POS multi-brand catalog", () => {
  it("lets shared products appear on every register", () => {
    expect(productVisibleOnRegister(shared, "brand-a")).toBe(true);
    expect(productVisibleOnRegister(shared, "brand-b")).toBe(true);
    expect(productVisibleOnRegister(shared, null)).toBe(true);
  });

  it("hides Company B private products from Company A's till", () => {
    expect(productVisibleOnRegister(brandB, "brand-a")).toBe(false);
    expect(productVisibleOnRegister(brandA, "brand-a")).toBe(true);
    expect(productVisibleOnRegister(brandA, "brand-b")).toBe(false);
  });

  it("does not expose private products on a brandless register", () => {
    expect(productVisibleOnRegister(brandA, null)).toBe(false);
    expect(productVisibleOnRegister(brandB, "")).toBe(false);
  });

  it("filters a catalog to the register brand plus shared items", () => {
    const visible = filterCatalogForRegister([shared, brandA, brandB], "brand-a").map((row) => row.id);
    expect(visible).toEqual(["p-shared", "p-a"]);
  });

  it("stamps the sale brand from the register, not a spoofed body id", () => {
    expect(saleCompanyIdFromRegister({ company_id: "brand-a" })).toBe("brand-a");
    expect(saleCompanyIdFromRegister({ company_id: null })).toBe(null);
    expect(saleCompanyIdFromRegister(null)).toBe(null);
  });
});
