import { describe, expect, it, beforeEach } from "vitest";
import { useRuntimeCoordinator } from "../../src/core/runtime/RuntimeCoordinator";
import {
  notifyRuntimeFromLifecycle,
  notifyAuthBootstrapComplete,
} from "../../src/core/runtime/runtimeCoordinatorBridge";

describe("runtimeCoordinatorBridge", () => {
  beforeEach(() => {
    useRuntimeCoordinator.getState().resetForColdStart();
  });

  it("moves BOOTING → SESSION_READY on bootstrap complete", () => {
    notifyAuthBootstrapComplete();
    expect(useRuntimeCoordinator.getState().phase).toBe("SESSION_READY");
  });

  it("enters AUTH_RECOVERING on refresh starting", () => {
    notifyRuntimeFromLifecycle({ type: "report_refresh_starting" });
    expect(useRuntimeCoordinator.getState().phase).toBe("AUTH_RECOVERING");
    expect(useRuntimeCoordinator.getState().pauseNonCriticalRequests).toBe(true);
  });

  it("returns to SESSION_READY on refresh ok after recovery", () => {
    notifyRuntimeFromLifecycle({ type: "report_refresh_starting" });
    notifyRuntimeFromLifecycle({ type: "report_refresh_ok" });
    expect(useRuntimeCoordinator.getState().phase).toBe("SESSION_READY");
    expect(useRuntimeCoordinator.getState().pauseNonCriticalRequests).toBe(false);
  });

  it("schedules reconnecting from mark_reconnecting", () => {
    notifyRuntimeFromLifecycle({ type: "mark_reconnecting", reason: "test" });
    expect(useRuntimeCoordinator.getState().reconnectTimerId).not.toBeNull();
  });
});
