import { describe, expect, it, vi } from "vitest";
import { wrapStorageWithCorruptionGuard } from "@/lib/safeAuthStorage";

describe("wrapStorageWithCorruptionGuard", () => {
  it("returns valid JSON for sb auth keys unchanged", () => {
    const inner = {
      store: new Map(),
      getItem(k) {
        return this.store.get(k) ?? null;
      },
      setItem(k, v) {
        this.store.set(k, v);
      },
      removeItem(k) {
        this.store.delete(k);
      },
    };
    const wrapped = wrapStorageWithCorruptionGuard(inner);
    const key = "sb-testproject-auth-token";
    const payload = JSON.stringify({ access_token: "a", refresh_token: "b" });
    wrapped.setItem(key, payload);
    expect(wrapped.getItem(key)).toBe(payload);
  });

  it("removes and returns null for corrupt sb auth token JSON", () => {
    const inner = {
      store: new Map(),
      getItem(k) {
        return this.store.get(k) ?? null;
      },
      setItem(k, v) {
        this.store.set(k, v);
      },
      removeItem: vi.fn(function (k) {
        this.store.delete(k);
      }),
    };
    const wrapped = wrapStorageWithCorruptionGuard(inner);
    const key = "sb-testproject-auth-token";
    wrapped.setItem(key, "{not-json");
    expect(wrapped.getItem(key)).toBe(null);
    expect(inner.removeItem).toHaveBeenCalledWith(key);
  });
});
