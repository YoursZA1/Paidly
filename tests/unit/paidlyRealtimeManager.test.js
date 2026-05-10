/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

const { subscribeMock, removeChannelMock, channelOnMock, setAuthMock } = vi.hoisted(() => {
  const subscribe = vi.fn();
  const removeChannel = vi.fn();
  const setAuth = vi.fn().mockResolvedValue(undefined);
  const channelOn = vi.fn(function chain() {
    return this;
  });
  return {
    subscribeMock: subscribe,
    removeChannelMock: removeChannel,
    channelOnMock: channelOn,
    setAuthMock: setAuth,
  };
});

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    realtime: { setAuth: setAuthMock },
    channel: vi.fn(() => ({
      on: channelOnMock,
      subscribe: subscribeMock,
      state: "joined",
    })),
    removeChannel: removeChannelMock,
  },
}));

import {
  __resetConnectionLifecycleStoreForTests,
  useConnectionLifecycleStore,
} from "@/lib/connection/connectionLifecycleStore";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import {
  __resetPaidlyRealtimeManagerForTests,
  REALTIME_DOMAINS,
  reconcilePaidlyRealtimeAfterTokenRefresh,
  repairStalePaidlyRealtimeOnTabVisible,
  subscribePaidlyAuxPostgres,
  subscribePaidlyMainChannelStatus,
  subscribePaidlyProfilesRealtime,
  validatePaidlyRealtime,
  PAIDLY_REALTIME_CHANNEL,
  setPaidlySyncRealtimeBridge,
  waitForPaidlyMainChannelJoined,
} from "@/lib/realtime/paidlyRealtimeManager";

async function flushRealtimeRebuild() {
  await new Promise((r) => queueMicrotask(r));
}

describe("paidlyRealtimeManager", () => {
  afterEach(async () => {
    __resetPaidlyRealtimeManagerForTests();
    __resetConnectionLifecycleStoreForTests();
    useSessionHealthStore.getState().reset();
    vi.mocked(subscribeMock).mockClear();
    vi.mocked(removeChannelMock).mockClear();
    vi.mocked(channelOnMock).mockClear();
    vi.mocked(setAuthMock).mockClear();
    const { supabase } = await import("@/lib/supabaseClient");
    vi.mocked(supabase.channel).mockClear();
  });

  it("uses one channel name for postgres subscriptions", async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    const unsub = subscribePaidlyProfilesRealtime(() => {});
    await flushRealtimeRebuild();
    expect(supabase.channel).toHaveBeenCalledWith(PAIDLY_REALTIME_CHANNEL);
    expect(subscribeMock).toHaveBeenCalled();
    unsub();
  });

  it("rebuilds when sync bridge and profiles are both active", async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    subscribePaidlyProfilesRealtime(() => {});
    await flushRealtimeRebuild();
    expect(supabase.channel).toHaveBeenCalledTimes(1);
    setPaidlySyncRealtimeBridge({
      userId: "11111111-1111-4111-8111-111111111111",
      onEntityEvent: () => {},
    });
    await flushRealtimeRebuild();
    expect(removeChannelMock).toHaveBeenCalled();
    expect(supabase.channel).toHaveBeenCalledTimes(2);
  });

  it("warns and no-ops aux subscribe for SyncEngine-reserved tables in dev", () => {
    if (!import.meta.env.DEV) return;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const u = subscribePaidlyAuxPostgres({ schema: "public", table: "invoices" }, () => {});
    expect(warn).toHaveBeenCalled();
    u();
    warn.mockRestore();
  });

  it("exposes REALTIME_DOMAINS", () => {
    expect(REALTIME_DOMAINS.sync).toBe("sync");
    expect(REALTIME_DOMAINS.profiles).toBe("profiles");
    expect(REALTIME_DOMAINS.notifications).toBe("notifications");
    expect(REALTIME_DOMAINS.aux).toBe("aux");
  });

  it("notifies subscribePaidlyMainChannelStatus when the channel subscribe callback runs", async () => {
    const statuses = [];
    const unsubStatus = subscribePaidlyMainChannelStatus((s) => statuses.push(s));
    subscribePaidlyProfilesRealtime(() => {});
    await flushRealtimeRebuild();
    const statusCb = subscribeMock.mock.calls[subscribeMock.mock.calls.length - 1][0];
    statusCb("SUBSCRIBED");
    expect(statuses).toContain("SUBSCRIBED");
    unsubStatus();
  });

  it("waitForPaidlyMainChannelJoined resolves true when subscribe reports SUBSCRIBED and channel is joined", async () => {
    subscribePaidlyProfilesRealtime(() => {});
    await flushRealtimeRebuild();
    const statusCb = subscribeMock.mock.calls[subscribeMock.mock.calls.length - 1][0];
    const p = waitForPaidlyMainChannelJoined({ timeoutMs: 2000 });
    statusCb("SUBSCRIBED");
    await expect(p).resolves.toBe(true);
  });

  it("validatePaidlyRealtime reports ok when no realtime work is registered", () => {
    expect(validatePaidlyRealtime()).toEqual({ ok: true, hasWork: false, joined: false });
  });

  it("reconcilePaidlyRealtimeAfterTokenRefresh calls realtime.setAuth and rebuilds the multiplex channel", async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    subscribePaidlyProfilesRealtime(() => {});
    await flushRealtimeRebuild();
    const channelCallsBefore = vi.mocked(supabase.channel).mock.calls.length;
    await reconcilePaidlyRealtimeAfterTokenRefresh("eyJhbGciOiJIUzI1NiIs.test.jwt", "unit_test");
    expect(setAuthMock).toHaveBeenCalledWith("eyJhbGciOiJIUzI1NiIs.test.jwt");
    expect(vi.mocked(supabase.channel).mock.calls.length).toBeGreaterThan(channelCallsBefore);
  });

  it("repairStalePaidlyRealtimeOnTabVisible skips when lifecycle and channel are healthy", async () => {
    useConnectionLifecycleStore.getState().patch({
      realtime: { phase: "subscribed", lastReason: "SUBSCRIBED" },
    });
    const r = await repairStalePaidlyRealtimeOnTabVisible({ believedSignedIn: true });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("not_stale");
  });

  it("repairStalePaidlyRealtimeOnTabVisible skips when guest", async () => {
    const r = await repairStalePaidlyRealtimeOnTabVisible({ believedSignedIn: false });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("guest");
  });

  it("repairStalePaidlyRealtimeOnTabVisible skips when session health is EXPIRED", async () => {
    useSessionHealthStore.setState({
      status: SESSION_STATUS.EXPIRED,
      reason: "test",
      lastTransitionAt: Date.now(),
    });
    useConnectionLifecycleStore.getState().patch({
      realtime: { phase: "unstable", lastReason: "CLOSED" },
    });
    const r = await repairStalePaidlyRealtimeOnTabVisible({ believedSignedIn: true });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("expired");
  });
});
