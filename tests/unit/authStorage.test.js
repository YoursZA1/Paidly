import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearStoredAuthUser, readStoredAuthUser, writeStoredAuthUser } from "@/utils/authStorage";

function createStorageMock() {
  const store = new Map();
  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    },
  };
}

describe("authStorage", () => {
  let local;
  let session;

  beforeEach(() => {
    local = createStorageMock();
    session = createStorageMock();
    Object.defineProperty(globalThis, "localStorage", {
      value: local,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: session,
      configurable: true,
      writable: true,
    });
  });

  it("returns null for invalid stored auth payload", () => {
    local.setItem("breakapi_user", JSON.stringify({ foo: "bar" }));
    expect(readStoredAuthUser()).toBeNull();
  });

  it("returns null when id is missing even if email exists", () => {
    local.setItem("breakapi_user", JSON.stringify({ email: "mando@paidly.co.za" }));
    expect(readStoredAuthUser()).toBeNull();
  });

  it("returns null when email is malformed even if id exists", () => {
    local.setItem("breakapi_user", JSON.stringify({ id: "user_1", email: "not-an-email" }));
    expect(readStoredAuthUser()).toBeNull();
  });

  it("migrates legacy localStorage auth user to sessionStorage", () => {
    const legacy = { id: "user_1", email: "mando@paidly.co.za", role: "admin" };
    local.setItem("breakapi_user", JSON.stringify(legacy));

    const result = readStoredAuthUser();

    expect(result).toEqual(legacy);
    expect(session.getItem("breakapi_user")).toBe(JSON.stringify(legacy));
    expect(local.getItem("breakapi_user")).toBeNull();
  });

  it("prefers sessionStorage over localStorage when both exist", () => {
    const sessionUser = { id: "session_user", email: "session@paidly.co.za" };
    const localUser = { id: "local_user", email: "local@paidly.co.za" };
    session.setItem("breakapi_user", JSON.stringify(sessionUser));
    local.setItem("breakapi_user", JSON.stringify(localUser));

    const result = readStoredAuthUser();

    expect(result).toEqual(sessionUser);
    expect(local.getItem("breakapi_user")).toBe(JSON.stringify(localUser));
  });

  it("writes auth user to sessionStorage and removes localStorage copy", () => {
    local.setItem("breakapi_user", JSON.stringify({ id: "stale" }));
    const fresh = { id: "new_user", email: "new@paidly.co.za" };

    writeStoredAuthUser(fresh);

    expect(session.getItem("breakapi_user")).toBe(JSON.stringify(fresh));
    expect(local.getItem("breakapi_user")).toBeNull();
  });

  it("does not write invalid auth user payloads", () => {
    writeStoredAuthUser({ id: "missing_email" });
    expect(session.getItem("breakapi_user")).toBeNull();
  });

  it("clears auth user from both storages", () => {
    local.setItem("breakapi_user", JSON.stringify({ id: "local" }));
    session.setItem("breakapi_user", JSON.stringify({ id: "session" }));

    clearStoredAuthUser();

    expect(local.getItem("breakapi_user")).toBeNull();
    expect(session.getItem("breakapi_user")).toBeNull();
  });
});
