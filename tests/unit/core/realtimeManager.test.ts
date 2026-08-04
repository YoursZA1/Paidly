import { beforeEach, describe, expect, it } from "vitest";
import { RealtimeManager } from "@/core/realtime/RealtimeManager";
import {
  getSharedRealtimeManager,
  __resetSharedRealtimeManagerForTests,
} from "@/core/realtime/sharedRealtimeManager";

describe("RealtimeManager logical registry", () => {
  beforeEach(() => {
    __resetSharedRealtimeManagerForTests();
  });

  it("tracks and untracks logical families under budget", () => {
    const rm = new RealtimeManager({ maxLogicalSubscriptions: 2 });
    expect(rm.trackLogical("sync")).toBe(true);
    expect(rm.trackLogical("profiles")).toBe(true);
    expect(rm.trackLogical("notifications")).toBe(false);
    expect(rm.activeCount()).toBe(2);
    rm.untrackLogical("sync");
    expect(rm.trackLogical("notifications")).toBe(true);
    expect(rm.activeNames().sort()).toEqual(["notifications", "profiles"]);
  });

  it("soft pause blocks new trackLogical without clearing existing names", () => {
    const rm = getSharedRealtimeManager();
    expect(rm.trackLogical("sync")).toBe(true);
    rm.setPaused(true);
    expect(rm.trackLogical("profiles")).toBe(false);
    expect(rm.activeNames()).toEqual(["sync"]);
    rm.setPaused(false);
    expect(rm.trackLogical("profiles")).toBe(true);
  });
});
