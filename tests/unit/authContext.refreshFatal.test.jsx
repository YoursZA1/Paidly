/** @vitest-environment jsdom */
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshSupabaseSessionWithRecoveryMock = vi.fn();
const supabaseRefreshSessionMock = vi.fn();
const supabaseSignOutLocalMock = vi.fn(async () => ({ error: null }));

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
    getSession: vi.fn(async () => {
      throw new Error("refresh token not found");
    }),
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
      getSession: vi.fn(async () => ({
        data: { session: null },
        error: { message: "refresh token not found", code: "refresh_token_not_found" },
      })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      refreshSession: (...args) => supabaseRefreshSessionMock(...args),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: (...args) => supabaseSignOutLocalMock(...args),
      exchangeCodeForSession: vi.fn(async () => ({ data: null, error: null })),
    },
  },
}));

vi.mock("@/lib/supabaseAuthRefresh", () => ({
  refreshSupabaseSessionWithRecovery: (...args) => refreshSupabaseSessionWithRecoveryMock(...args),
  isRefreshTokenFatalError: vi.fn(() => true),
}));

vi.mock("@/hooks/useSupabaseRealtime", () => ({ useSupabaseRealtime: () => {} }));
vi.mock("@/api/backendClient", () => ({ backendApi: {}, clearNodeAuthUnreachable: vi.fn() }));
vi.mock("@/utils/sessionGuard", () => ({ redirectToLoginIfProtectedPath: vi.fn() }));
vi.mock("@/lib/authProtectedSessionInvariant", () => ({ enforceProtectedRouteSessionInvariant: vi.fn(async () => {}) }));
vi.mock("@/lib/staffDashboard", () => ({ resolveUserRoleFromSessionAndProfile: vi.fn(() => "owner") }));
vi.mock("@/utils/authStorage", () => ({ clearStoredAuthUser: vi.fn() }));
vi.mock("@/lib/authSessionReconnectToast", () => ({
  reportSupabaseGetSessionFailure: vi.fn(),
  reportSupabaseGetSessionRecovered: vi.fn(),
}));
vi.mock("@/utils/resetApp", () => ({ resetApp: vi.fn() }));
vi.mock("@/lib/unauthorizedSessionHandler", () => ({ setUnauthorizedSessionHandler: vi.fn() }));
vi.mock("@/lib/authUserId", () => ({ getAuthUserId: vi.fn(() => "user_1") }));
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

import { AuthProvider, useAuth } from "@/contexts/AuthContext.impl.jsx";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { patchAuthSession } from "@/stores/authSessionStore";

function Probe() {
  const { refreshSession } = useAuth();
  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);
  return null;
}

describe("AuthContext fatal refresh handling", () => {
  let container;
  let root;

  beforeEach(() => {
    refreshSupabaseSessionWithRecoveryMock.mockReset();
    supabaseRefreshSessionMock.mockReset();
    supabaseSignOutLocalMock.mockClear();
    useSessionHealthStore.setState({
      status: SESSION_STATUS.CONNECTED,
      reason: null,
      lastTransitionAt: Date.now(),
    });
    patchAuthSession({
      user: { id: "user_1" },
      session: {
        user: { id: "user_1" },
        accessToken: "a",
        refreshToken: "r",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
      loading: false,
      authLoadingTimedOut: false,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("syncSession mirrors storage only and never calls manual refreshSession()", async () => {
    await act(async () => {
      root.render(
        <AuthProvider>
          <Probe />
        </AuthProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshSupabaseSessionWithRecoveryMock).not.toHaveBeenCalled();
    expect(supabaseRefreshSessionMock).not.toHaveBeenCalled();
  });
});
