import { afterEach, describe, expect, it, vi } from "vitest";
import { registerConnectionLifecycleManager } from "@/lib/connection/connectionLifecycleRegistry";
import { LifecycleEventType } from "@/core/session/lifecycleTypes";
import { reportLifecycleEvent } from "@/core/session/reportLifecycleEvent";

describe("reportLifecycleEvent", () => {
  afterEach(() => {
    registerConnectionLifecycleManager(null);
  });

  it("routes NETWORK_OFFLINE to reportNetworkState(false)", () => {
    const reportNetworkState = vi.fn();
    registerConnectionLifecycleManager({ reportNetworkState });
    reportLifecycleEvent({ type: LifecycleEventType.NETWORK_OFFLINE, payload: { reason: "offline" } });
    expect(reportNetworkState).toHaveBeenCalledWith(false, "offline");
  });

  it("routes TOKEN_REFRESH_SKIPPED to REFRESH_SKIPPED signal", () => {
    const report = vi.fn();
    registerConnectionLifecycleManager({ report });
    reportLifecycleEvent({
      type: LifecycleEventType.TOKEN_REFRESH_SKIPPED,
      payload: { reason: "throttled" },
    });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "REFRESH_SKIPPED",
        reason: "throttled",
      })
    );
  });

  it("routes TOKEN_REFRESH_RETRYING to REFRESH_RETRYING signal", () => {
    const report = vi.fn();
    registerConnectionLifecycleManager({ report });
    reportLifecycleEvent({
      type: LifecycleEventType.TOKEN_REFRESH_RETRYING,
      payload: { reason: "joined_in_flight" },
    });
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "REFRESH_RETRYING",
        reason: "joined_in_flight",
      })
    );
  });
});
