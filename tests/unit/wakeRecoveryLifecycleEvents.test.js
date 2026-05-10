/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  WakeRecoveryLifecycleEventType,
  WakeRecoveryLifecyclePhase,
  dispatchWakeRecoveryLifecycleEvent,
  installWakeRecoveryLifecycleTelemetry,
} from "@/core/session/wakeRecoveryLifecycleEvents";
import { getSessionTelemetryCounters } from "@/lib/sessionTelemetry";

describe("wakeRecoveryLifecycleEvents", () => {
  let unsub = /** @type {null | (() => void)} */ (null);
  afterEach(() => {
    unsub?.();
    unsub = null;
  });

  it("dispatches typed CustomEvents", () => {
    const seen = [];
    const handler = (e) => seen.push(e.detail);
    window.addEventListener(WakeRecoveryLifecycleEventType.FAILED, handler);
    dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.FAILED, "REALTIME_FAILED");
    window.removeEventListener(WakeRecoveryLifecycleEventType.FAILED, handler);
    expect(seen).toEqual(["REALTIME_FAILED"]);
  });

  it("telemetry listener records lifecycle phases", () => {
    unsub = installWakeRecoveryLifecycleTelemetry();
    const before = getSessionTelemetryCounters()["wake_recovery_lifecycle"] || 0;
    dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.STARTED, { reason: "t" });
    dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.SUCCEEDED);
    dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.FAILED, "SESSION_INVALID");
    dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.ENDED, { reason: "t" });
    const after = getSessionTelemetryCounters()["wake_recovery_lifecycle"] || 0;
    expect(after - before).toBe(4);
  });

  it("exports stable phase labels for analytics", () => {
    expect(WakeRecoveryLifecyclePhase.WAKE_RECOVERY_SUCCEEDED).toBe("WAKE_RECOVERY_SUCCEEDED");
    expect(WakeRecoveryLifecyclePhase.WAKE_RECOVERY_FAILED).toBe("WAKE_RECOVERY_FAILED");
  });
});
