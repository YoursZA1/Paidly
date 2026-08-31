/** @vitest-environment jsdom */
/**
 * Verifies that the visibility-change session recovery effect uses a current (non-stale)
 * requestSessionRefreshGuarded reference and that the circuit breaker correctly suppresses
 * refreshes when the session is in a terminal state.
 *
 * The requestSessionRefreshGuarded useCallback has a stable identity (its only dep,
 * isRecoveryCircuitOpen, has [] deps and reads Zustand at call-time), so adding it to the
 * visibility effect dep array is a correctness/lint fix with no re-registration side effects.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestSessionRefreshMock = vi.fn();

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

vi.mock("@/api/entities", () => ({
  User: {
    restoreFromSupabaseSession: vi.fn(async () => null),
    logout: vi.fn(async () => {}),
    login: vi.fn(async () => {}),
    getCurrentUser: vi.fn(async () => null),
    updateMyUserData: vi.fn(async () => {}),
  },
}));

vi.mock("@/services/SupabaseAuthService", () => ({
  default: {
    getSession: vi.fn(async () => null),
    signInWithEmail: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
    resetPasswordForEmail: vi.fn(async () => true),
    resendSignupEmail: vi.fn(async () => true),
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      refreshSession: vi.fn(async () => ({ data: null, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(async () => ({ error: null })),
      exchangeCodeForSession: vi.fn(async () => ({ data: null, error: null })),
    },
  },
}));

vi.mock("@/lib/supabaseAuthRefresh", () => ({
  msUntilProactiveRefresh: vi.fn(() => null),
  refreshSupabaseSessionWithRecovery: vi.fn(async () => ({ ok: false, reason: "no_session" })),
  isRefreshTokenFatalError: vi.fn(() => false),
}));

vi.mock("@/hooks/useSupabaseRealtime", () => ({ useSupabaseRealtime: () => {} }));
vi.mock("@/api/backendClient", () => ({ backendApi: {}, clearNodeAuthUnreachable: vi.fn() }));
vi.mock("@/utils/sessionGuard", () => ({ redirectToLoginIfProtectedPath: vi.fn() }));
vi.mock("@/lib/authProtectedSessionInvariant", () => ({
  enforceProtectedRouteSessionInvariant: vi.fn(async () => {}),
}));
vi.mock("@/lib/staffDashboard", () => ({
  resolveUserRoleFromSessionAndProfile: vi.fn(() => "owner"),
}));
vi.mock("@/utils/authStorage", () => ({ clearStoredAuthUser: vi.fn() }));
vi.mock("@/lib/authSessionReconnectToast", () => ({
  reportSupabaseGetSessionFailure: vi.fn(),
  reportSupabaseGetSessionRecovered: vi.fn(),
}));
vi.mock("@/utils/resetApp", () => ({ resetApp: vi.fn() }));
vi.mock("@/lib/unauthorizedSessionHandler", () => ({ setUnauthorizedSessionHandler: vi.fn() }));
vi.mock("@/lib/authUserId", () => ({ getAuthUserId: vi.fn(() => null) }));
vi.mock("@/lib/authRefreshTelemetry", () => ({
  recordAuthRefreshFailure: vi.fn(),
  recordAuthRefreshFatal: vi.fn(),
  recordAuthRefreshSuccess: vi.fn(),
}));
vi.mock("@/lib/authTabSync", () => ({
  createAuthTabSyncChannel: vi.fn(() => ({
    publish: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    close: vi.fn(),
  })),
}));

// Primary spy: lets us assert that requestSessionRefresh was/was not called by
// requestSessionRefreshGuarded after a visibility-restore event.
vi.mock("@/lib/session/sessionRefreshScheduler", () => ({
  registerSessionRefreshExecutor: vi.fn(),
  unregisterSessionRefreshExecutor: vi.fn(),
  cancelPendingSessionRefresh: vi.fn(),
  requestSessionRefresh: (...args) => requestSessionRefreshMock(...args),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { AuthProvider } from "@/contexts/AuthContext.impl.jsx";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function setDocumentVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/**
 * Simulate tab becoming visible and wait for the async handleVisibility handler to complete.
 * The handler awaits supabase.auth.getSession() — one Promise microtask — then calls
 * requestSessionRefreshGuarded synchronously, so a macrotask flush is sufficient.
 */
async function simulateTabVisible() {
  await act(async () => {
    setDocumentVisibility("visible");
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AuthContext visibility recovery — requestSessionRefreshGuarded circuit breaker", () => {
  let container;
  let root;

  beforeEach(async () => {
    requestSessionRefreshMock.mockClear();

    useSessionHealthStore.setState({
      status: SESSION_STATUS.CONNECTED,
      reason: null,
      lastTransitionAt: Date.now(),
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    // Mount AuthProvider and let all effects settle (onAuthStateChange, executor registration, etc.)
    await act(async () => {
      root.render(<AuthProvider><div /></AuthProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    // Restore visibility state so other tests are not affected.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  // ── 1. Visibility change recovery ──────────────────────────────────────────

  it("visibility change recovery: calls requestSessionRefresh on tab-visible when session is ACTIVE", async () => {
    await simulateTabVisible();
    expect(requestSessionRefreshMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "visibility", silent: true })
    );
  });

  // ── 2. Refresh suppression correctness ─────────────────────────────────────

  it("refresh suppression: does not call requestSessionRefresh when status is EXPIRED", async () => {
    useSessionHealthStore.setState({ status: SESSION_STATUS.EXPIRED, reason: "test" });
    await simulateTabVisible();
    expect(requestSessionRefreshMock).not.toHaveBeenCalled();
  });

  it("refresh suppression: does not call requestSessionRefresh when status is REAUTH_REQUIRED", async () => {
    useSessionHealthStore.setState({ status: SESSION_STATUS.REAUTH_REQUIRED, reason: "test" });
    await simulateTabVisible();
    expect(requestSessionRefreshMock).not.toHaveBeenCalled();
  });

  // ── 3. Stale closure prevention ─────────────────────────────────────────────

  it("stale closure prevention: reads fresh Zustand state — suppresses while EXPIRED, fires after returning to CONNECTED", async () => {
    // Phase 1: circuit open — refresh must be suppressed.
    useSessionHealthStore.setState({ status: SESSION_STATUS.EXPIRED, reason: "inactivity" });
    await simulateTabVisible();
    expect(requestSessionRefreshMock).not.toHaveBeenCalled();

    // Phase 2: circuit closed again — refresh must fire (fresh state read, not stale closure).
    useSessionHealthStore.setState({ status: SESSION_STATUS.CONNECTED, reason: null });
    await simulateTabVisible();
    expect(requestSessionRefreshMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "visibility", silent: true })
    );
  });

  // ── 4. Circuit breaker transitions ─────────────────────────────────────────

  it("circuit breaker: suppresses across multiple visibility events while status stays EXPIRED", async () => {
    useSessionHealthStore.setState({ status: SESSION_STATUS.EXPIRED, reason: "test" });
    await simulateTabVisible();
    await simulateTabVisible();
    expect(requestSessionRefreshMock).not.toHaveBeenCalled();
  });

  it("circuit breaker: fires exactly once per visibility-restore when CONNECTED", async () => {
    await simulateTabVisible();
    await simulateTabVisible();
    expect(requestSessionRefreshMock).toHaveBeenCalledTimes(2);
  });
});
