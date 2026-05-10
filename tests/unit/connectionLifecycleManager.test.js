/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createConnectionLifecycleManager } from "@/lib/connection/ConnectionLifecycleManager";
import { LifecycleSignalType } from "@/lib/connection/lifecycleSignalTypes";
import { __resetConnectionLifecycleStoreForTests } from "@/lib/connection/connectionLifecycleStore";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";

function createMockAuthority() {
  return {
    markConnected: vi.fn(),
    markReconnecting: vi.fn(),
    markExpiredSurface: vi.fn(),
    transitionToExpired: vi.fn(),
    getDecision: vi.fn(() => ({ action: "noop" })),
    shouldRequireReauth: vi.fn(() => false),
    handleRefreshFatal: vi.fn(),
    handleMissingSession: vi.fn(() => false),
    escalateRecoverableSession: vi.fn(() => ({ forceTerminalLogout: false })),
    reportRealtimeUnstable: vi.fn(),
    reportRealtimeRecovered: vi.fn(),
    reportVisibilityRecover: vi.fn(),
    reportOffline: vi.fn(),
    reportRefreshRequiredVisible: vi.fn(),
    reportRefreshStarting: vi.fn(),
    reportRefreshOk: vi.fn(),
    reportSessionMissingDuringReconnect: vi.fn(),
    markManualLogoutReset: vi.fn(),
  };
}

describe("createConnectionLifecycleManager", () => {
  let sink;
  let clm;

  beforeEach(() => {
    __resetConnectionLifecycleStoreForTests();
    sink = createMockAuthority();
    clm = createConnectionLifecycleManager({ sessionManager: { Authority: sink } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getReadModelSnapshot reflects patches from report", () => {
    clm.reportNetworkState(false, "offline");
    const snap = clm.getReadModelSnapshot();
    expect(snap.network.online).toBe(false);
    expect(snap.network.updatedAt).toBeTypeOf("number");
  });

  it("subscribeReadModel notifies after patch", () => {
    const received = [];
    const unsub = clm.subscribeReadModel((s) => received.push(s.visibility));
    clm.reportVisibilityState("hidden", 12345);
    expect(received.at(-1)).toBe("hidden");
    unsub();
  });

  it("REALTIME_SUBSCRIBED runs authority markConnected and updates realtime read model", () => {
    clm.report({ type: LifecycleSignalType.REALTIME_SUBSCRIBED });
    expect(sink.markConnected).toHaveBeenCalledWith("sync_realtime_ready");
    expect(clm.getReadModelSnapshot().realtime.phase).toBe("subscribed");
  });

  it("REALTIME_SUBSCRIBED may reportRealtimeRecovered when session health hints recovery", () => {
    const prev = useSessionHealthStore.getState();
    useSessionHealthStore.setState({ status: SESSION_STATUS.RECONNECTING, reason: "x" });
    try {
      clm.report({ type: LifecycleSignalType.REALTIME_SUBSCRIBED });
      expect(sink.reportRealtimeRecovered).toHaveBeenCalledWith("realtime_recovered");
    } finally {
      useSessionHealthStore.setState(prev);
    }
  });

  it("toSessionAuthorityAdapter forwards to the same sink", () => {
    const adapter = clm.toSessionAuthorityAdapter();
    adapter.markConnected("via_adapter");
    expect(sink.markConnected).toHaveBeenCalledWith("via_adapter");
  });
});
