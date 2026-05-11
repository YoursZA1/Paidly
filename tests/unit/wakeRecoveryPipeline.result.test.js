import { describe, expect, it, vi } from "vitest";
import {
  WakeRecoveryFailureReason,
  runWakeRecoveryPipeline,
} from "@/lib/session/WakeRecoveryPipeline";
import { refreshFatal, refreshSuccess } from "@/lib/session/refreshResult";

function baseCtx(overrides = {}) {
  return {
    reason: "test",
    refreshSession: vi.fn(async () => refreshSuccess()),
    readSessionSafe: vi.fn(async () => ({ user: { id: "u1" }, expiresAt: Math.floor(Date.now() / 1000) + 3600 })),
    isSessionValid: vi.fn(() => true),
    patchAuthSession: vi.fn(),
    setRecoveryPhase: vi.fn(),
    awaitRealtimeRecovery: vi.fn(async () => {}),
    refreshUser: vi.fn(async () => {}),
    enforceRouteInvariant: vi.fn(async () => {}),
    connectionLifecycle: {
      markConnected: vi.fn(),
      markReconnecting: vi.fn(),
      reportSessionMissingDuringReconnect: vi.fn(),
    },
    requestSessionRefresh: vi.fn(),
    touchHeartbeatIfValid: vi.fn(),
    ...overrides,
  };
}

describe("runWakeRecoveryPipeline WakeRecoveryResult", () => {
  it("returns { ok: true } on full success", async () => {
    const ctx = baseCtx();
    const out = await runWakeRecoveryPipeline(ctx);
    expect(out).toEqual({ ok: true });
  });

  it("returns REFRESH_FAILED on fatal refresh", async () => {
    const ctx = baseCtx({
      refreshSession: vi.fn(async () => refreshFatal("invalid")),
    });
    const out = await runWakeRecoveryPipeline(ctx);
    expect(out).toEqual({ ok: false, reason: WakeRecoveryFailureReason.REFRESH_FAILED });
  });

  it("returns SESSION_INVALID when session missing after refresh", async () => {
    const ctx = baseCtx({
      readSessionSafe: vi.fn(async () => null),
      isSessionValid: vi.fn(() => false),
    });
    const out = await runWakeRecoveryPipeline(ctx);
    expect(out).toEqual({ ok: false, reason: WakeRecoveryFailureReason.SESSION_INVALID });
  });

  it("returns REALTIME_FAILED when realtime step throws", async () => {
    const ctx = baseCtx({
      awaitRealtimeRecovery: vi.fn(async () => {
        throw new Error("join timeout");
      }),
    });
    const out = await runWakeRecoveryPipeline(ctx);
    expect(out).toEqual({ ok: false, reason: WakeRecoveryFailureReason.REALTIME_FAILED });
  });

  it("returns UNKNOWN on unexpected throw after session ok", async () => {
    const ctx = baseCtx({
      refreshUser: vi.fn(async () => {
        throw new Error("profile boom");
      }),
    });
    const out = await runWakeRecoveryPipeline(ctx);
    expect(out).toEqual({ ok: false, reason: WakeRecoveryFailureReason.UNKNOWN });
  });

  it("hard-stops follow-up refresh scheduling when circuit is open", async () => {
    const requestSessionRefresh = vi.fn();
    const ctx = baseCtx({
      readSessionSafe: vi.fn(async () => null),
      isSessionValid: vi.fn(() => false),
      requestSessionRefresh,
      isCircuitOpen: () => true,
    });
    const out = await runWakeRecoveryPipeline(ctx);
    expect(out).toEqual({ ok: false, reason: WakeRecoveryFailureReason.REFRESH_FAILED });
    expect(requestSessionRefresh).not.toHaveBeenCalled();
  });
});
