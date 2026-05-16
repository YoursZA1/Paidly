import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("runtimeMutationGuard", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("throws SESSION_RECOVERING when RuntimeCoordinator pauses mutations", async () => {
    const { useRuntimeCoordinator } = await import("@/core/runtime/RuntimeCoordinator");
    useRuntimeCoordinator.setState({
      phase: "AUTH_RECOVERING",
      pauseNonCriticalRequests: true,
    });
    const { assertRuntimeAllowsMutations } = await import("@/lib/runtimeMutationGuard");
    expect(() => assertRuntimeAllowsMutations()).toThrowError(/reconnecting/i);
    try {
      assertRuntimeAllowsMutations();
    } catch (e) {
      expect(e.code).toBe("SESSION_RECOVERING");
    }
  });

  it("allows mutations when session is ready", async () => {
    const { useRuntimeCoordinator } = await import("@/core/runtime/RuntimeCoordinator");
    useRuntimeCoordinator.setState({
      phase: "SESSION_READY",
      pauseNonCriticalRequests: false,
    });
    const { assertRuntimeAllowsMutations } = await import("@/lib/runtimeMutationGuard");
    expect(() => assertRuntimeAllowsMutations()).not.toThrow();
  });
});
