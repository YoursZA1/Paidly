/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __clearRealtimeRecoveryRegistryForTests,
  awaitRealtimeRecoveryHandlers,
  registerRealtimeRecoveryHandler,
} from "@/lib/realtimeRecoveryRegistry";

describe("awaitRealtimeRecoveryHandlers", () => {
  afterEach(() => {
    __clearRealtimeRecoveryRegistryForTests();
  });

  it("runs registered handlers and clears debounced timer", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    registerRealtimeRecoveryHandler("test-handler", fn);
    await awaitRealtimeRecoveryHandlers("wake");
    expect(fn).toHaveBeenCalledWith({ reason: "wake" });
  });

  it("does not throw when a handler rejects", async () => {
    const bad = vi.fn().mockRejectedValue(new Error("boom"));
    registerRealtimeRecoveryHandler("bad", bad);
    await expect(awaitRealtimeRecoveryHandlers("x")).resolves.toBeUndefined();
  });
});
