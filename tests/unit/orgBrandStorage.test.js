import { describe, expect, it, beforeEach } from "vitest";
import {
  ORG_DEFAULT_BRAND_VALUE,
  normalizeBrandId,
  readActiveBrandId,
  writeActiveBrandId,
  reconcileStoredBrandId,
} from "@/lib/orgBrandStorage";

describe("orgBrandStorage", () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, String(value));
      },
      removeItem: (key) => {
        store.delete(key);
      },
    };
  });

  it("treats the organization-default sentinel as null", () => {
    expect(normalizeBrandId(ORG_DEFAULT_BRAND_VALUE)).toBeNull();
    expect(normalizeBrandId("")).toBeNull();
    expect(normalizeBrandId("brand-a")).toBe("brand-a");
  });

  it("persists the active brand per organization", () => {
    writeActiveBrandId("org-1", "brand-a");
    writeActiveBrandId("org-2", "brand-b");
    expect(readActiveBrandId("org-1")).toBe("brand-a");
    expect(readActiveBrandId("org-2")).toBe("brand-b");
  });

  it("clears storage when switching to organization default", () => {
    writeActiveBrandId("org-1", "brand-a");
    writeActiveBrandId("org-1", null);
    expect(readActiveBrandId("org-1")).toBeNull();
  });

  it("drops a stored id that is no longer in the org brand list", () => {
    expect(reconcileStoredBrandId("brand-a", [{ id: "brand-a" }, { id: "brand-b" }])).toBe(
      "brand-a"
    );
    expect(reconcileStoredBrandId("brand-gone", [{ id: "brand-a" }])).toBeNull();
    expect(reconcileStoredBrandId(ORG_DEFAULT_BRAND_VALUE, [{ id: "brand-a" }])).toBeNull();
  });
});
