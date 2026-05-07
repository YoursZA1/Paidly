import { describe, expect, it, vi } from "vitest";
import { createSessionManager } from "@/lib/session/SessionManager";
import { SESSION_STATUS } from "@/stores/sessionHealthStore";

function makeDeps(overrides = {}) {
  let currentStatus = SESSION_STATUS.CONNECTED;
  const calls = {
    setSessionHealth: [],
    patchAuthSession: [],
    publish: [],
    clearReconnectLoops: 0,
    clearVolatileCaches: 0,
    signOutLocalSafe: 0,
  };
  const deps = {
    getBelievedSignedIn: () => true,
    getOnline: () => true,
    getSessionHealthStatus: () => currentStatus,
    setSessionHealth: (status, reason) => {
      currentStatus = status;
      calls.setSessionHealth.push({ status, reason });
    },
    patchAuthSession: (partial) => calls.patchAuthSession.push(partial),
    publish: (type, payload) => calls.publish.push({ type, payload }),
    clearError: vi.fn(),
    clearReconnectLoops: () => {
      calls.clearReconnectLoops += 1;
    },
    clearVolatileCaches: () => {
      calls.clearVolatileCaches += 1;
    },
    signOutLocalSafe: async () => {
      calls.signOutLocalSafe += 1;
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("SessionManager transitionToExpired", () => {
  it("transitions once and blocks duplicate EXPIRED transitions", async () => {
    const { deps, calls } = makeDeps();
    const manager = createSessionManager(deps);

    const first = await manager.AuthManager.transitionToExpired("inactivity_timeout", {
      signOutLocal: true,
      clearAuthState: true,
      broadcast: true,
      redirect: true,
      source: "test",
    });
    const second = await manager.AuthManager.transitionToExpired("inactivity_timeout", {
      signOutLocal: true,
      clearAuthState: true,
      broadcast: true,
      redirect: true,
      source: "test",
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(calls.setSessionHealth.at(-1)).toEqual({
      status: SESSION_STATUS.EXPIRED,
      reason: "inactivity_timeout",
    });
    expect(calls.signOutLocalSafe).toBe(1);
    expect(calls.clearReconnectLoops).toBe(1);
    expect(calls.clearVolatileCaches).toBe(1);
    expect(calls.publish).toEqual([
      { type: "AUTH_REAUTH_REQUIRED", payload: { reason: "inactivity_timeout" } },
    ]);
  });

  it("uses centralized transition from fatal refresh flow", async () => {
    const { deps, calls } = makeDeps();
    const manager = createSessionManager(deps);

    const out = await manager.RefreshManager.handleFatal("fatal_refresh_token");
    expect(out).toBe(false);
    expect(calls.signOutLocalSafe).toBe(1);
    expect(calls.setSessionHealth.at(-1)?.status).toBe(SESSION_STATUS.EXPIRED);
    expect(calls.publish.at(-1)).toEqual({
      type: "AUTH_REAUTH_REQUIRED",
      payload: { reason: "fatal_refresh_token" },
    });
  });
});
