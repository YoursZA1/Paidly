import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createReconnectEscalationController } from "@/lib/auth/authReconnectEscalation";

describe("createReconnectEscalationController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("breaks reconnect loop after repeated missing sessions", async () => {
    const handleFatal = vi.fn(async () => false);
    const transitionToExpired = vi.fn(async () => false);
    const handleMissingSession = vi.fn(() => false);
    const supabaseRefreshSession = vi.fn(async () => ({ data: { session: null } }));

    const ctl = createReconnectEscalationController({
      getDeps: () => ({
        connectionLifecycle: {
          reportSessionMissingDuringReconnect: vi.fn(),
          reportRefreshOk: vi.fn(),
          transitionToExpired,
        },
        sessionManager: {
          RefreshManager: {
            handleFatal,
            handleMissingSession,
          },
        },
        isTerminalRefreshFailure: () => false,
        readSessionSafe: async () => null,
        normalizeSessionFromClient: (s) => s,
        isSessionValid: () => false,
        patchAuthSession: vi.fn(),
        supabaseRefreshSession,
        getSessionHealthStatus: () => "connected",
      }),
    });

    ctl.schedule();
    await vi.advanceTimersByTimeAsync(3100);
    ctl.schedule();
    await vi.advanceTimersByTimeAsync(3100);
    ctl.schedule();
    await vi.advanceTimersByTimeAsync(3100);

    expect(supabaseRefreshSession).toHaveBeenCalledTimes(3);
    expect(handleFatal).toHaveBeenCalledWith("reconnect_loop_break");
    expect(transitionToExpired).not.toHaveBeenCalled();

    ctl.schedule();
    await vi.advanceTimersByTimeAsync(3100);
    expect(supabaseRefreshSession).toHaveBeenCalledTimes(3);
  });
});
