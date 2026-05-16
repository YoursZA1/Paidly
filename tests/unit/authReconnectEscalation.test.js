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

    // MAX_RECONNECT_ATTEMPTS is 5 — drive probes until the circuit opens (backoff has jitter).
    for (let i = 0; i < 10 && handleFatal.mock.calls.length === 0; i += 1) {
      ctl.schedule();
      await vi.advanceTimersByTimeAsync(25_000);
    }

    expect(handleFatal).toHaveBeenCalledWith("reconnect_loop_break");
    expect(transitionToExpired).not.toHaveBeenCalled();
    expect(supabaseRefreshSession.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(supabaseRefreshSession.mock.calls.length).toBeLessThanOrEqual(6);

    const callsBefore = supabaseRefreshSession.mock.calls.length;
    ctl.schedule();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(supabaseRefreshSession.mock.calls.length).toBe(callsBefore);
  });
});
