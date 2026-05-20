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
    const handleRefreshFatal = vi.fn(async () => false);
    const transitionToExpired = vi.fn(async () => false);
    const handleMissingSession = vi.fn(() => false);

    const ctl = createReconnectEscalationController({
      getDeps: () => ({
        connectionLifecycle: {
          reportSessionMissingDuringReconnect: vi.fn(),
          reportRefreshOk: vi.fn(),
          transitionToExpired,
          handleMissingSession,
        },
        isTerminalRefreshFailure: () => false,
        readSessionSafe: async () => null,
        isSessionValid: () => false,
        patchAuthSession: vi.fn(),
        handleRefreshFatal,
        getSessionHealthStatus: () => "connected",
      }),
    });

    for (let i = 0; i < 10 && handleRefreshFatal.mock.calls.length === 0; i += 1) {
      ctl.schedule();
      await vi.advanceTimersByTimeAsync(25_000);
    }

    expect(handleRefreshFatal).toHaveBeenCalledWith("reconnect_loop_break");
    expect(transitionToExpired).not.toHaveBeenCalled();
  });
});
