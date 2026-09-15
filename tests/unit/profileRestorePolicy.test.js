import { describe, expect, it } from "vitest";
import {
  deferAfterAuthLock,
  isProfileReady,
  isTransientSessionReadFailure,
  resolveSessionForProfileRestore,
  shouldKeepHydratedUserOnSessionReadFailure,
  shouldWaitForProfileRestore,
} from "../../src/lib/auth/profileRestorePolicy.js";

describe("profileRestorePolicy", () => {
  it("keeps a hydrated login when getSession is aborted", () => {
    expect(
      shouldKeepHydratedUserOnSessionReadFailure({
        storeSession: { user: { id: "u1" }, accessToken: "tok" },
        storeUser: { id: "u1" },
        error: { name: "AbortError", message: "signal is aborted without reason" },
      })
    ).toBe(true);
  });

  it("keeps the in-memory session when getSession fails after login", () => {
    expect(
      shouldKeepHydratedUserOnSessionReadFailure({
        storeSession: { user: { id: "u1" }, accessToken: "tok" },
        storeUser: null,
        error: { message: "Failed to fetch" },
      })
    ).toBe(true);
  });

  it("does not keep a user when there is no store session", () => {
    expect(
      shouldKeepHydratedUserOnSessionReadFailure({
        storeSession: null,
        storeUser: null,
        error: { name: "AbortError" },
      })
    ).toBe(false);
  });

  it("prefers a live session then falls back to the store", () => {
    const live = { user: { id: "live" } };
    const stored = { user: { id: "stored" }, accessToken: "tok" };
    expect(resolveSessionForProfileRestore(live, stored)?.user?.id).toBe("live");
    expect(resolveSessionForProfileRestore(null, stored)?.user?.id).toBe("stored");
    expect(resolveSessionForProfileRestore(null, null)).toBe(null);
  });

  it("does not treat a JWT-only user as dashboard-ready", () => {
    expect(isProfileReady({ id: "u1" }, false)).toBe(false);
    expect(isProfileReady({ id: "u1", profileReady: true }, false)).toBe(true);
    expect(isProfileReady({ id: "u1" }, true)).toBe(true);
  });

  it("waits for profiles before mounting the authenticated shell", () => {
    expect(shouldWaitForProfileRestore("u1", { id: "u1" }, false)).toBe(true);
    expect(shouldWaitForProfileRestore("u1", { id: "u1", profileReady: true }, false)).toBe(false);
    expect(shouldWaitForProfileRestore(null, { id: "u1" }, false)).toBe(false);
  });

  it("treats abort and failed-to-fetch as transient session reads", () => {
    expect(isTransientSessionReadFailure({ name: "AbortError" })).toBe(true);
    expect(isTransientSessionReadFailure({ message: "Failed to fetch" })).toBe(true);
    expect(isTransientSessionReadFailure({ message: "Invalid login credentials" })).toBe(false);
  });

  it("defers work with setTimeout so it is not inside the GoTrue lock", async () => {
    const order = [];
    order.push("sync");
    const id = deferAfterAuthLock(() => {
      order.push("deferred");
    });
    expect(order).toEqual(["sync"]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(order).toEqual(["sync", "deferred"]);
    clearTimeout(id);
  });
});
