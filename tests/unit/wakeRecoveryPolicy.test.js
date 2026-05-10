import { describe, expect, it } from "vitest";
import { shouldEnterWakeRecoveryMode } from "@/lib/wakeRecoveryPolicy";
import { WAKE_RECOVERY_THRESHOLD_MS } from "@/stores/wakeRecoveryStore";

describe("shouldEnterWakeRecoveryMode", () => {
  it("returns false when never heartbeated", () => {
    expect(
      shouldEnterWakeRecoveryMode({ lastHeartbeatAt: null, hiddenAtMs: null, now: 1_000_000 })
    ).toBe(false);
  });

  it("returns true when wall clock gap since heartbeat exceeds threshold", () => {
    const now = 200_000;
    const last = now - WAKE_RECOVERY_THRESHOLD_MS - 1_000;
    expect(shouldEnterWakeRecoveryMode({ lastHeartbeatAt: last, hiddenAtMs: null, now })).toBe(true);
  });

  it("returns false when gap under threshold", () => {
    const now = 200_000;
    const last = now - 30_000;
    expect(shouldEnterWakeRecoveryMode({ lastHeartbeatAt: last, hiddenAtMs: null, now })).toBe(false);
  });

  it("returns true when tab was hidden longer than threshold even if heartbeat is recent", () => {
    const now = 500_000;
    const hiddenAt = now - WAKE_RECOVERY_THRESHOLD_MS - 5_000;
    expect(
      shouldEnterWakeRecoveryMode({ lastHeartbeatAt: now - 1_000, hiddenAtMs: hiddenAt, now })
    ).toBe(true);
  });
});
