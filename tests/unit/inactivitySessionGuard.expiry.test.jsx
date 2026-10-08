/** @vitest-environment jsdom */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logoutMock = vi.fn(async () => {});
const refreshSessionMock = vi.fn(async () => ({ status: "success" }));
const transitionToExpiredMock = vi.fn(async () => true);
const refreshMock = vi.fn(async () => ({ ok: true }));
const getSessionMock = vi.fn(async () => ({ data: { session: { user: { id: "u" } } } }));
const requestRefreshMock = vi.fn();
const navGoMock = vi.fn();
let hookOpts = null;
let hookState = { warningOpen: false, refreshing: false, countdownSeconds: 0, stayLoggedIn: vi.fn() };

vi.mock("@/lib/navigationService", () => ({ navigateTo: (...args) => navGoMock(...args) }));
vi.mock("@/lib/supabaseAuthRefresh", () => ({ refreshSupabaseSessionWithRecovery: () => refreshMock() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession: () => getSessionMock() } } }));
vi.mock("@/lib/session/sessionRefreshScheduler", () => ({ requestSessionRefresh: (...a) => requestRefreshMock(...a) }));
vi.mock("@/lib/session/recoveryCircuit", () => ({ isRecoveryCircuitOpen: () => false }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    authReady: true,
    session: { accessToken: "tok" },
    logout: logoutMock,
    refreshSession: refreshSessionMock,
  }),
}));
vi.mock("@/contexts/ConnectionLifecycleContext", () => ({
  useConnectionLifecycle: () => ({ transitionToExpired: transitionToExpiredMock }),
}));
vi.mock("@/hooks/useInactivitySessionTimeout", () => ({
  useInactivitySessionTimeout: (opts) => {
    hookOpts = opts;
    return hookState;
  },
}));

import InactivitySessionGuard, { SESSION_EXPIRED_LOGIN_URL } from "@/components/session/InactivitySessionGuard";

describe("InactivitySessionGuard session checks", () => {
  let container;
  let root;

  const render = async () => {
    await act(async () => {
      root.render(<InactivitySessionGuard />);
    });
  };

  beforeEach(async () => {
    for (const m of [logoutMock, refreshSessionMock, transitionToExpiredMock, refreshMock, getSessionMock, requestRefreshMock, navGoMock]) {
      m.mockClear();
    }
    refreshMock.mockImplementation(async () => ({ ok: true }));
    getSessionMock.mockImplementation(async () => ({ data: { session: { user: { id: "u" } } } }));
    logoutMock.mockImplementation(async () => {});
    hookState = { warningOpen: false, refreshing: false, countdownSeconds: 0, stayLoggedIn: vi.fn() };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookOpts = null;
    await render();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("TEST 3: Stay Logged In refreshes through Supabase and mirrors the session — no logout", async () => {
    let outcome;
    await act(async () => {
      outcome = await hookOpts.onStayLoggedIn();
    });
    expect(outcome).toBe("continue");
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionMock).toHaveBeenCalledWith(expect.objectContaining({ source: "stay_logged_in", bypassThrottle: true }));
    expect(logoutMock).not.toHaveBeenCalled();
    expect(navGoMock).not.toHaveBeenCalled();
  });

  it("TEST 4/6: when the countdown ends with a refreshable session, the user stays where they are", async () => {
    let outcome;
    await act(async () => {
      outcome = await hookOpts.onWarningElapsed();
    });
    expect(outcome).toBe("continue");
    expect(navGoMock).not.toHaveBeenCalled();
  });

  it("TEST 7: a rejected refresh token signs out cleanly and goes to login", async () => {
    refreshMock.mockImplementation(async () => ({ ok: false, fatal: true }));
    let outcome;
    await act(async () => {
      outcome = await hookOpts.onWarningElapsed();
    });
    expect(outcome).toBe("ended");
    expect(transitionToExpiredMock).toHaveBeenCalledWith("session_expired", expect.objectContaining({ redirect: false }));
    expect(logoutMock).toHaveBeenCalledWith({ keepExpiredState: true });
    expect(navGoMock).toHaveBeenCalledWith(SESSION_EXPIRED_LOGIN_URL, { replace: true });
    expect(window.sessionStorage.getItem("paidly_session_expired_reason")).toBe("session_expired");
  });

  it("a network failure keeps the session and retries instead of logging out", async () => {
    refreshMock.mockImplementation(async () => ({ ok: false, fatal: false, reason: "network" }));
    let outcome;
    await act(async () => {
      outcome = await hookOpts.onStayLoggedIn();
    });
    expect(outcome).toBe("continue");
    expect(logoutMock).not.toHaveBeenCalled();
    expect(requestRefreshMock).toHaveBeenCalledWith(expect.objectContaining({ source: "stay_logged_in_retry" }));
  });

  it("a failed refresh with no session left at all is treated as expired", async () => {
    refreshMock.mockImplementation(async () => ({ ok: false, fatal: false }));
    getSessionMock.mockImplementation(async () => ({ data: { session: null } }));
    let outcome;
    await act(async () => {
      outcome = await hookOpts.onWarningElapsed();
    });
    expect(outcome).toBe("ended");
    expect(navGoMock).toHaveBeenCalledWith(SESSION_EXPIRED_LOGIN_URL, { replace: true });
  });

  it("TEST 4: still reaches the login page when logout never settles (no frozen screen)", async () => {
    vi.useFakeTimers();
    refreshMock.mockImplementation(async () => ({ ok: false, fatal: true }));
    logoutMock.mockImplementation(() => new Promise(() => {}));
    let done = false;
    await act(async () => {
      void hookOpts.onWarningElapsed().then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(done).toBe(true);
    expect(navGoMock).toHaveBeenCalledWith(SESSION_EXPIRED_LOGIN_URL, { replace: true });
  });

  it("a refresh that hangs is bounded and fails open", async () => {
    vi.useFakeTimers();
    refreshMock.mockImplementation(() => new Promise(() => {}));
    let outcome;
    await act(async () => {
      void hookOpts.onStayLoggedIn().then((o) => {
        outcome = o;
      });
      await vi.advanceTimersByTimeAsync(30_100);
    });
    expect(outcome).toBe("continue");
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("local and remote expiry together sign out exactly once", async () => {
    refreshMock.mockImplementation(async () => ({ ok: false, fatal: true }));
    await act(async () => {
      await Promise.all([hookOpts.onWarningElapsed(), hookOpts.onRemoteTimeout()]);
    });
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navGoMock).toHaveBeenCalledTimes(1);
  });

  it("the modal shows a disabled, busy button while refreshing", async () => {
    hookState = { warningOpen: true, refreshing: true, countdownSeconds: 1, stayLoggedIn: vi.fn() };
    await render();
    const button = container.querySelector("button");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Refreshing…");
    expect(container.textContent).toContain("Checking your session…");
  });

  it("fails open: a crash inside the guard renders nothing instead of taking the app down", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    hookState = null; // destructuring throws during render
    await render();
    expect(container.innerHTML).toBe("");
    error.mockRestore();
  });
});
