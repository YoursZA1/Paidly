import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useRuntimeCoordinator,
  subscribeRuntimeCoordinator,
} from "@/core/runtime/RuntimeCoordinator";
import { MutationCoordinator } from "@/core/sync/MutationCoordinator";

beforeEach(() => {
  useRuntimeCoordinator.getState().resetForColdStart();
});

describe("RuntimeCoordinator", () => {
  it("single-flights beginAuthRecovery", () => {
    expect(useRuntimeCoordinator.getState().beginAuthRecovery()).toBe(true);
    expect(useRuntimeCoordinator.getState().beginAuthRecovery()).toBe(false);
    expect(useRuntimeCoordinator.getState().phase).toBe("AUTH_RECOVERING");
    useRuntimeCoordinator.getState().endAuthRecoverySuccess();
    expect(useRuntimeCoordinator.getState().phase).toBe("SESSION_READY");
  });

  it("notifies listeners on transition", () => {
    const fn = vi.fn();
    const unsub = subscribeRuntimeCoordinator(fn);
    useRuntimeCoordinator.getState().markBootstrapReady();
    expect(fn).toHaveBeenCalled();
    unsub();
  });
});

describe("MutationCoordinator", () => {
  it("dedupes concurrent runOnce by operationId", async () => {
    const m = new MutationCoordinator();
    let calls = 0;
    const p1 = m.runOnce("op-1", async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return "a";
    });
    const p2 = m.runOnce("op-1", async () => {
      calls += 1;
      return "b";
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe("a");
    expect(b).toBe("a");
    expect(calls).toBe(1);
  });
});
