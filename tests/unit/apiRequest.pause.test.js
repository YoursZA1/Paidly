import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rpcSessionPolicy", () => ({
  runRpcUnauthorizedPolicy: vi.fn(async () => null),
}));
vi.mock("@/lib/unauthorizedSessionHandler", () => ({
  triggerUnauthorizedSession: vi.fn(async () => {}),
}));
vi.mock("@/lib/session/recoveryCircuit", () => ({
  isRecoveryCircuitOpen: vi.fn(() => false),
}));

async function clearRuntimePause() {
  const { useRuntimeCoordinator } = await import("@/core/runtime/RuntimeCoordinator");
  const rc = useRuntimeCoordinator.getState();
  rc.resetForColdStart();
  rc.markBootstrapReady();
}

describe("safeFetch RuntimeCoordinator pause", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    await clearRuntimePause();
  });

  it("waits until pause clears before fetching", async () => {
    const { useRuntimeCoordinator } = await import("@/core/runtime/RuntimeCoordinator");
    useRuntimeCoordinator.getState().resetForColdStart();
    useRuntimeCoordinator.getState().beginAuthRecovery();

    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { safeFetch } = await import("@/utils/apiRequest");
    const pending = safeFetch("/api/health");

    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();

    useRuntimeCoordinator.getState().endAuthRecoverySuccess();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses pause when __paidlyCritical is set", async () => {
    const { useRuntimeCoordinator } = await import("@/core/runtime/RuntimeCoordinator");
    useRuntimeCoordinator.getState().resetForColdStart();
    useRuntimeCoordinator.getState().beginAuthRecovery();

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { safeFetch } = await import("@/utils/apiRequest");
    try {
      const res = await safeFetch("/api/auth/login", { __paidlyCritical: true, method: "POST" });
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      useRuntimeCoordinator.getState().endAuthRecoverySuccess();
    }
  });
});
