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
import { useSessionHealthStore } from "@/stores/sessionHealthStore";
import {
  __resetPaidlyRealtimeManagerForTests,
  getPaidlyRealtimeConnectionPhase,
  getPaidlyRealtimeConnectionSnapshot,
  reconcilePaidlyRealtimeAfterTokenRefresh,
  subscribePaidlyAuxPostgres,
  subscribePaidlyMainChannelStatus,
  subscribePaidlyProfilesRealtime,
  validatePaidlyRealtime,
  PAIDLY_REALTIME_CHANNEL,
  REALTIME_DOMAINS,
  setPaidlySyncRealtimeBridge,
  waitForPaidlyMainChannelJoined,
} from "@/lib/realtime/paidlyRealtimeManager";
import { RealtimeConnectionPhase } from "@/lib/realtime/paidlyRealtimeConnectionMachine";

async function flushRealtimeRebuild() {
  await new Promise((r) => queueMicrotask(r));
  await new Promise((r) => setTimeout(r, 0));
}

/** Supabase-js calls the subscribe callback asynchronously; release rebuild locks like production. */
function completeLastSubscribe(status = "SUBSCRIBED") {
  const calls = subscribeMock.mock.calls;
  if (!calls.length) return;
  const cb = calls[calls.length - 1][0];
  cb(status);
}

async function flushAndCompleteSubscribe(status = "SUBSCRIBED") {
  await flushRealtimeRebuild();
  completeLastSubscribe(status);
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
    await flushAndCompleteSubscribe();
    expect(supabase.channel).toHaveBeenCalledWith(PAIDLY_REALTIME_CHANNEL);
    expect(subscribeMock).toHaveBeenCalled();
    unsub();
  });

  it("rebuilds when sync bridge and profiles are both active", async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    subscribePaidlyProfilesRealtime(() => {});
    await flushAndCompleteSubscribe();
    expect(supabase.channel).toHaveBeenCalledTimes(1);
    setPaidlySyncRealtimeBridge({
      userId: "11111111-1111-4111-8111-111111111111",
      onEntityEvent: () => {},
    });
    await flushAndCompleteSubscribe();
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
    await flushAndCompleteSubscribe();
    expect(statuses).toContain("SUBSCRIBED");
    unsubStatus();
  });

  it("waitForPaidlyMainChannelJoined resolves true when subscribe reports SUBSCRIBED and channel is joined", async () => {
    subscribePaidlyProfilesRealtime(() => {});
    const p = waitForPaidlyMainChannelJoined({ timeoutMs: 2000 });
    await flushAndCompleteSubscribe();
    await expect(p).resolves.toBe(true);
  });

  it("validatePaidlyRealtime reports ok when no realtime work is registered", () => {
    expect(validatePaidlyRealtime()).toEqual({ ok: true, hasWork: false, joined: false });
  });

  it("reconcilePaidlyRealtimeAfterTokenRefresh calls realtime.setAuth and skips rebuild when channel is healthy", async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    subscribePaidlyProfilesRealtime(() => {});
    await flushAndCompleteSubscribe(); // channel is now joined (state: "joined" from mock)
    const channelCallsBefore = vi.mocked(supabase.channel).mock.calls.length;
    const removeCallsBefore = vi.mocked(removeChannelMock).mock.calls.length;
    await reconcilePaidlyRealtimeAfterTokenRefresh("eyJhbGciOiJIUzI1NiIs.test.jwt", "unit_test");
    await flushAndCompleteSubscribe();
    // setAuth must always be called — JWT must reach the existing socket
    expect(setAuthMock).toHaveBeenCalledWith("eyJhbGciOiJIUzI1NiIs.test.jwt");
    // Healthy channel: rebuild must be suppressed (teardown-free JWT rotation)
    expect(vi.mocked(supabase.channel).mock.calls.length).toBe(channelCallsBefore);
    expect(vi.mocked(removeChannelMock).mock.calls.length).toBe(removeCallsBefore);
  });

  it("reconcilePaidlyRealtimeAfterTokenRefresh rebuilds when channel is not joined", async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    // Simulate a non-joined channel by overriding the mock state before subscribe
    vi.mocked(supabase.channel).mockReturnValueOnce({
      on: channelOnMock,
      subscribe: subscribeMock,
      state: "errored", // not joined
    });
    subscribePaidlyProfilesRealtime(() => {});
    await flushAndCompleteSubscribe("CHANNEL_ERROR"); // subscribe fails
    const channelCallsBefore = vi.mocked(supabase.channel).mock.calls.length;
    await reconcilePaidlyRealtimeAfterTokenRefresh("eyJhbGciOiJIUzI1NiIs.test.jwt2", "unit_test_unhealthy");
    await flushAndCompleteSubscribe();
    expect(setAuthMock).toHaveBeenCalledWith("eyJhbGciOiJIUzI1NiIs.test.jwt2");
    // Unhealthy channel: rebuild must happen
    expect(vi.mocked(supabase.channel).mock.calls.length).toBeGreaterThan(channelCallsBefore);
  });

  it("exposes connection phase snapshot after subscribe", async () => {
    subscribePaidlyProfilesRealtime(() => {});
    await flushAndCompleteSubscribe();
    expect(getPaidlyRealtimeConnectionPhase()).toBe(RealtimeConnectionPhase.CONNECTED);
    expect(getPaidlyRealtimeConnectionSnapshot().phase).toBe(RealtimeConnectionPhase.CONNECTED);
  });
});
