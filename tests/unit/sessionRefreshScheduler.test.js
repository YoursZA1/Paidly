import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

let recoveryCircuitOpen = false;

vi.mock("@/lib/sessionTelemetry", () => ({
  trackSessionTelemetry: vi.fn(),
}));

vi.mock("@/lib/session/recoveryCircuit", () => ({
  isRecoveryCircuitOpen: () => recoveryCircuitOpen,
}));

import {
  registerSessionRefreshExecutor,
  unregisterSessionRefreshExecutor,
  requestSessionRefresh,
  cancelPendingSessionRefresh,
} from "@/lib/session/sessionRefreshScheduler";

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("sessionRefreshScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recoveryCircuitOpen = false;
  });

  afterEach(() => {
    unregisterSessionRefreshExecutor();
    vi.useRealTimers();
  });

  it("does nothing without a registered executor", () => {
    expect(() =>
      requestSessionRefresh({ source: "visibility", silent: true, debounceMs: 0 }),
    ).not.toThrow();
  });

  it("coalesces immediate (debounce 0) requests into one executor call", async () => {
    const calls = [];
    registerSessionRefreshExecutor(async (opts) => {
      calls.push(opts);
    });

    requestSessionRefresh({ source: "a", silent: true, debounceMs: 0 });
    requestSessionRefresh({ source: "b", silent: true, debounceMs: 0 });
    await flushMicrotasks();

    expect(calls).toHaveLength(1);
    expect(calls[0].sources).toEqual(expect.arrayContaining(["a", "b"]));
    expect(calls[0].sources.length).toBe(2);
    expect(calls[0].silent).toBe(true);
  });

  it("debounces and merges sources into a single flush", async () => {
    const calls = [];
    registerSessionRefreshExecutor(async (opts) => {
      calls.push(opts);
    });

    requestSessionRefresh({ source: "visibility", silent: true });
    requestSessionRefresh({ source: "online", silent: true });
    await vi.advanceTimersByTimeAsync(399);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();

    expect(calls).toHaveLength(1);
    expect(calls[0].sources).toEqual(expect.arrayContaining(["visibility", "online"]));
  });

  it("cancelPendingSessionRefresh drops a scheduled debounced flush", async () => {
    const calls = [];
    registerSessionRefreshExecutor(async (opts) => {
      calls.push(opts);
    });

    requestSessionRefresh({ source: "heartbeat", silent: true });
    cancelPendingSessionRefresh();
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    expect(calls).toHaveLength(0);
  });

  it("merges silent=false if any request is non-silent", async () => {
    const calls = [];
    registerSessionRefreshExecutor(async (opts) => {
      calls.push(opts);
    });

    requestSessionRefresh({ source: "a", silent: true, debounceMs: 0 });
    requestSessionRefresh({ source: "b", silent: false, debounceMs: 0 });
    await flushMicrotasks();

    expect(calls).toHaveLength(1);
    expect(calls[0].silent).toBe(false);
  });

  it("does not call executor when status is reauth_required (circuit open)", async () => {
    const calls = [];
    registerSessionRefreshExecutor(async (opts) => {
      calls.push(opts);
    });
    recoveryCircuitOpen = true;

    requestSessionRefresh({ source: "guard-test", silent: true, debounceMs: 0 });
    await flushMicrotasks();

    expect(calls).toHaveLength(0);
  });
});
