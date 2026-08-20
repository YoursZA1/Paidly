/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { shouldPersistReactQueryKey, PAIDLY_PERSISTED_QUERY_ROOT_KEYS } from "@/lib/paidlyPersistedQueryRootKeys";

describe("shouldPersistReactQueryKey", () => {
  it("allows exact dashboard and list roots", () => {
    expect(shouldPersistReactQueryKey(["dashboard-invoices", "u1"])).toBe(true);
    expect(shouldPersistReactQueryKey(["clients", "list", "u1"])).toBe(true);
    expect(PAIDLY_PERSISTED_QUERY_ROOT_KEYS.has("clients")).toBe(true);
  });

  it("allows safe settings / organization / currency prefixes", () => {
    expect(shouldPersistReactQueryKey(["settings-activity-log"])).toBe(true);
    expect(shouldPersistReactQueryKey(["organization", "org-1"])).toBe(true);
    expect(shouldPersistReactQueryKey(["currency-profiles", "u1"])).toBe(true);
  });

  it("rejects auth-like roots and live subscription status", () => {
    expect(shouldPersistReactQueryKey(["auth", "me"])).toBe(false);
    expect(shouldPersistReactQueryKey(["auth-config", "x"])).toBe(false);
    expect(shouldPersistReactQueryKey(["session"])).toBe(false);
    expect(shouldPersistReactQueryKey(["secrets", "x"])).toBe(false);
    expect(shouldPersistReactQueryKey(["sb-access-token"])).toBe(false);
    expect(shouldPersistReactQueryKey(["subscription-current", "u1"])).toBe(false);
  });

  it("allows settings-prefixed keys that are not the blocked root \"session\"", () => {
    expect(shouldPersistReactQueryKey(["settings-session", "v1"])).toBe(true);
  });
});
