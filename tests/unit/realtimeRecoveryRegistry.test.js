/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REALTIME_RECOVERY_IDS,
  __clearRealtimeRecoveryRegistryForTests,
  registerRealtimeRecoveryHandler,
  requestRealtimeRecoveryAfterAuth,
  reconnectPaidlySyncRealtimeOnly,
} from "@/lib/realtimeRecoveryRegistry";

describe("realtimeRecoveryRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
    __clearRealtimeRecoveryRegistryForTests();
  });

  it("debounces and runs all handlers", async () => {
    vi.useFakeTimers();
    const calls = [];
    const u1 = registerRealtimeRecoveryHandler("a", () => calls.push("a"));
    const u2 = registerRealtimeRecoveryHandler("b", () => calls.push("b"));
    requestRealtimeRecoveryAfterAuth("r1");
    requestRealtimeRecoveryAfterAuth("r2");
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(calls.sort()).toEqual(["a", "b"]);
  });

  it("reconnectPaidlySyncRealtimeOnly runs only sync handler", async () => {
    vi.useFakeTimers();
    const calls = [];
    registerRealtimeRecoveryHandler(REALTIME_RECOVERY_IDS.SYNC_ENGINE, () => calls.push("sync"));
    registerRealtimeRecoveryHandler("other", () => calls.push("other"));
    reconnectPaidlySyncRealtimeOnly("wake");
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toEqual(["sync"]);
  });
});
