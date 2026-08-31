import { describe, expect, it } from "vitest";
import {
  BUSINESS_TYPE,
  businessTypeIncludesInvoices,
  businessTypeIncludesPos,
  normalizeBusinessType,
} from "../../shared/businessType.js";

describe("normalizeBusinessType", () => {
  it("maps aliases and rejects unknown values", () => {
    expect(normalizeBusinessType("Service")).toBe(BUSINESS_TYPE.SERVICE);
    expect(normalizeBusinessType("retail")).toBe(BUSINESS_TYPE.RETAIL);
    expect(normalizeBusinessType("product")).toBe(BUSINESS_TYPE.RETAIL);
    expect(normalizeBusinessType("mixed")).toBe(BUSINESS_TYPE.MIXED);
    expect(normalizeBusinessType("hybrid")).toBe(BUSINESS_TYPE.MIXED);
    expect(normalizeBusinessType("")).toBe(null);
    expect(normalizeBusinessType("consulting")).toBe(null);
  });
});

describe("POS is optional by business type", () => {
  it("keeps POS off for service and unset orgs", () => {
    expect(businessTypeIncludesPos("service")).toBe(false);
    expect(businessTypeIncludesPos(null)).toBe(false);
    expect(businessTypeIncludesPos("")).toBe(false);
  });

  it("turns POS on for retail and mixed only", () => {
    expect(businessTypeIncludesPos("retail")).toBe(true);
    expect(businessTypeIncludesPos("mixed")).toBe(true);
  });

  it("does not hide invoices for any type", () => {
    expect(businessTypeIncludesInvoices("service")).toBe(true);
    expect(businessTypeIncludesInvoices("retail")).toBe(true);
    expect(businessTypeIncludesInvoices("mixed")).toBe(true);
  });
});
