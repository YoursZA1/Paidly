/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { User } from "@/api/entities";
import SupabaseAuthService from "@/services/SupabaseAuthService";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { createPageUrl } from "@/utils";
import { backendApi, clearNodeAuthUnreachable } from "@/api/backendClient";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { redirectToLoginIfProtectedPath } from "@/utils/sessionGuard";
import { enforceProtectedRouteSessionInvariant } from "@/lib/authProtectedSessionInvariant";
import { processPendingAffiliateReferral } from "@/api/affiliateClient";
import Button from "@/components/ui/button";
import { isAbortError } from "@/utils/retryOnAbort";
import { resolveUserRoleFromSessionAndProfile } from "@/lib/staffDashboard";
import { clearStoredAuthUser } from "@/utils/authStorage";
import {
  reportSupabaseGetSessionFailure,
  reportSupabaseGetSessionRecovered,
} from "@/lib/authSessionReconnectToast";
import { msUntilProactiveRefresh, isRefreshTokenFatalError, refreshSupabaseSessionWithRecovery } from "@/lib/supabaseAuthRefresh";
import { resetApp } from "@/utils/resetApp";
import { AUTH_BOOTSTRAP_FAILSAFE_MS } from "@/hooks/useLoadingFailSafe";
import { patchAuthSession, useAuthSessionStore } from "@/stores/authSessionStore";
import { setUnauthorizedSessionHandler } from "@/lib/unauthorizedSessionHandler";
import { getAuthUserId } from "@/lib/authUserId";
import { SESSION_STATUS, applySessionHealthFromAuthority, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { createAuthTabSyncChannel } from "@/lib/authTabSync";
import { createSessionOrchestrator } from "@/lib/session/SessionOrchestrator";
import { SessionManagerContext } from "@/contexts/SessionManagerContext";
import { registerSessionAuthority } from "@/lib/session/sessionAuthorityRegistry";
import { createConnectionLifecycleManager } from "@/lib/connection/ConnectionLifecycleManager";
import { registerConnectionLifecycleManager } from "@/lib/connection/connectionLifecycleRegistry";
import { ConnectionLifecycleContext } from "@/contexts/ConnectionLifecycleContext";
import { AppRecoveryLock, AppRecoveryPhase } from "@/lib/recovery/appRecoveryLock";
import {
  awaitRealtimeRecoveryAndMainChannel,
  reconcileRealtimeJwt,
  reconcileRealtimeJwtFromSupabaseAuthEvent,
  scheduleRealtimeRecoveryAfterAuth,
  checkRealtimeOnVisibilityRestore,
} from "@/lib/realtime/authRealtimeCoordinator";
import { createReconnectEscalationController } from "@/lib/auth/authReconnectEscalation";
import { runAuthRefreshQueueJob } from "@/lib/auth/authRefreshQueueJob";
import { runSessionRefreshExecutorPipeline } from "@/lib/auth/authSessionResyncPipeline";
import {
  refreshFailed,
  refreshFatal,
  refreshSkipped,
  refreshSuccess,
  isRefreshSkipped,
  isRefreshRetrying,
} from "@/lib/session/refreshResult";
import {
  cancelPendingSessionRefresh,
  registerSessionRefreshExecutor,
  requestSessionRefresh,
  unregisterSessionRefreshExecutor,
} from "@/lib/session/sessionRefreshScheduler";
import { LifecycleSignalType } from "@/lib/connection/lifecycleSignalTypes";
import { shouldEnterWakeRecoveryMode } from "@/lib/wakeRecoveryPolicy";
import { useWakeRecoveryStore } from "@/stores/wakeRecoveryStore";
import WakeRecoveryOverlay from "@/components/session/WakeRecoveryOverlay";
import {
  runWakeRecoveryPipeline,
  WakeRecoveryFailureReason,
} from "@/lib/session/WakeRecoveryPipeline";
import {
  WakeRecoveryLifecycleEventType,
  dispatchWakeRecoveryLifecycleEvent,
  installWakeRecoveryLifecycleTelemetry,
} from "@/core/session/wakeRecoveryLifecycleEvents";

/** Same shape as SupabaseAuthService.normalizeSession — used when the wrapper throws or returns null during races. */
function normalizeSessionFromClient(session) {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: session.user,
  };
}

/** Seconds of slack before expiry so clock skew / refresh races do not log users out spuriously. */
const SESSION_EXPIRY_SKEW_SEC = 90;
const SESSION_HEARTBEAT_MS = 60_000;

function isSessionValid(sessionNorm) {
  if (!sessionNorm?.user?.id) return false;
  if (!sessionNorm?.accessToken || !sessionNorm?.refreshToken) return false;
  if (typeof sessionNorm.expiresAt !== "number") return false;
  const now = Math.floor(Date.now() / 1000);
  return sessionNorm.expiresAt > now - SESSION_EXPIRY_SKEW_SEC;
}

/** Advance wake heartbeat when the tab is visible and JWT is healthy (timers pause while hidden / asleep). */
function touchAuthHeartbeatIfValid(sessionNorm) {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  if (sessionNorm?.user && isSessionValid(sessionNorm)) {
    useWakeRecoveryStore.getState().touchHeartbeat();
  }
}

function isDocumentHidden() {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "hidden";
}

/**
 * Prefer the typed getSession(); on failure (network, refresh race), fall back to the raw client so we
 * don't clear the app user and trigger RequireAuth → Login after mutations or token refresh.
 */
async function readSessionSafe(reportSessionHealth = false) {
  try {
    const s = await SupabaseAuthService.getSession();
    if (s?.user) {
      if (reportSessionHealth) reportSupabaseGetSessionRecovered();
      return s;
    }
  } catch (e) {
    if (import.meta.env?.DEV) {
      console.warn("[Auth] SupabaseAuthService.getSession failed; using raw session:", e?.message || e);
    }
  }
  const { data, error } = await supabase.auth.getSession();
  if (reportSessionHealth) {
    if (error) reportSupabaseGetSessionFailure();
    else reportSupabaseGetSessionRecovered();
  }
  if (error || !data?.session?.user) return null;
  return normalizeSessionFromClient(data.session);
}

/** Sentinel for Promise.race — must never be mistaken for “no Supabase session”. */
const SESSION_READ_TIMEOUT = Symbol("sessionReadTimeout");

function minimalUserFromJwtUser(su) {
  if (!su?.id) return null;
  const email = (su.email || "").toLowerCase();
  const fullName = su.user_metadata?.full_name || email.split("@")[0] || "User";
  return {
    id: su.id,
    supabase_id: su.id,
    auth_id: su.id,
    email,
    role: resolveUserRoleFromSessionAndProfile(su, {}),
    full_name: fullName,
    display_name: fullName,
    company_name: "",
    company_address: "",
    currency: "ZAR",
    logo_url: "",
    timezone: "UTC",
  };
}

async function consumeAuthCallbackFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const hash = String(window.location.hash || "");
  const hasPkceCode = url.searchParams.has("code");
  const hasHashTokens = /access_token=|refresh_token=|type=/.test(hash);
  if (!hasPkceCode && !hasHashTokens) return;

  try {
    if (hasPkceCode) {
      const code = url.searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
    }
  } catch (e) {
    console.warn("[Auth] callback exchange failed:", e?.message || e);
  } finally {
    // Remove callback params/token fragments from URL for reliability and privacy.
    url.searchParams.delete("code");
    url.searchParams.delete("type");
    url.searchParams.delete("error");
    url.searchParams.delete("error_code");
    url.searchParams.delete("error_description");
    const clean = `${url.pathname}${url.search}${url.hash && !hasHashTokens ? url.hash : ""}`;
    window.history.replaceState({}, document.title, clean);
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const user = useAuthSessionStore((s) => s.user);
  const session = useAuthSessionStore((s) => s.session);
  const loading = useAuthSessionStore((s) => s.loading);
  const authLoadingTimedOut = useAuthSessionStore((s) => s.authLoadingTimedOut);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  /** Email for resend when login blocked verification before `user` is hydrated. */
  const [verifyGateEmail, setVerifyGateEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState("");
  const [error, setError] = useState("");
  const refreshUserDebounceRef = useRef(null);
  const userIdRef = useRef(null);
  const sessionUserIdRef = useRef(null);
  const authLoadingFailSafeRef = useRef(null);
  const loadingRef = useRef(loading);
  const routeInvariantTimerRef = useRef(null);
  const manualLogoutRef = useRef(false);
  const reconnectEscalationCtlRef = useRef(null);
  const reconnectEscalationDepsRef = useRef({});
  const authTabSyncRef = useRef(null);
  const bootstrapOrgAttemptedUsersRef = useRef(new Set());
  const documentHiddenAtRef = useRef(null);
  const wakeRecoveryInFlightRef = useRef(false);
  const clearReconnectLoops = useCallback(() => {
    reconnectEscalationCtlRef.current?.cancel();
    cancelPendingSessionRefresh();
    if (refreshUserDebounceRef.current) {
      clearTimeout(refreshUserDebounceRef.current);
      refreshUserDebounceRef.current = null;
    }
    if (routeInvariantTimerRef.current) {
      clearTimeout(routeInvariantTimerRef.current);
      routeInvariantTimerRef.current = null;
    }
  }, []);
  const sessionManager = useMemo(
    () =>
      createSessionOrchestrator({
        getBelievedSignedIn: () => Boolean(userIdRef.current || sessionUserIdRef.current),
        getOnline: () => (typeof navigator !== "undefined" ? navigator.onLine !== false : true),
        setSessionHealth: (status, reason) => applySessionHealthFromAuthority(status, reason),
        getSessionHealthStatus: () => useSessionHealthStore.getState().status,
        patchAuthSession: (partial) => patchAuthSession(partial),
        publish: (type, payload) => authTabSyncRef.current?.publish(type, payload),
        clearError: () => setError(""),
        clearReconnectLoops,
        clearVolatileCaches: () => {
          setShowVerifyDialog(false);
          setVerifyGateEmail("");
          setResendLoading(false);
          setResendSuccess("");
        },
        redirectToLogin: () => redirectToLoginIfProtectedPath(),
        signOutLocalSafe: async () => {
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            /* ignore */
          }
        },
      }),
    [clearReconnectLoops]
  );

  const connectionLifecycle = useMemo(
    () => createConnectionLifecycleManager({ sessionManager }),
    [sessionManager]
  );

  useEffect(() => {
    registerConnectionLifecycleManager(connectionLifecycle);
    registerSessionAuthority(connectionLifecycle.toSessionAuthorityAdapter());
    return () => {
      registerConnectionLifecycleManager(null);
      registerSessionAuthority(null);
    };
  }, [connectionLifecycle]);

  useEffect(() => installWakeRecoveryLifecycleTelemetry(), []);

  /** One listener: wake pipeline failure always enters the same narrow reconnect escalation as transport refresh failures. */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onWakeRecoveryFailed = () => {
      const status = useSessionHealthStore.getState().status;
      if (status === SESSION_STATUS.EXPIRED || status === SESSION_STATUS.REAUTH_REQUIRED) return;
      reconnectEscalationCtlRef.current?.schedule();
    };
    window.addEventListener(WakeRecoveryLifecycleEventType.FAILED, onWakeRecoveryFailed);
    return () => window.removeEventListener(WakeRecoveryLifecycleEventType.FAILED, onWakeRecoveryFailed);
  }, []);

  const isTerminalRefreshFailure = useCallback((errorLike) => {
    if (isRefreshTokenFatalError(errorLike)) return true;
    const msg = String(errorLike?.message || errorLike?.msg || errorLike || "").toLowerCase();
    return (
      msg.includes("invalid refresh token") ||
      msg.includes("refresh token not found") ||
      msg.includes("refresh token") && msg.includes("not found")
    );
  }, []);

  const isRecoveryCircuitOpen = useCallback(() => {
    const status = useSessionHealthStore.getState().status;
    return status === SESSION_STATUS.EXPIRED || status === SESSION_STATUS.REAUTH_REQUIRED;
  }, []);

  const requestSessionRefreshGuarded = useCallback(
    (opts = {}) => {
      if (isRecoveryCircuitOpen()) return;
      requestSessionRefresh(opts);
    },
    [isRecoveryCircuitOpen]
  );

  reconnectEscalationDepsRef.current = {
    connectionLifecycle,
    sessionManager,
    isTerminalRefreshFailure,
    readSessionSafe,
    normalizeSessionFromClient,
    isSessionValid,
    patchAuthSession,
    // Route through refreshSupabaseSessionWithRecovery instead of the raw Supabase client so
    // the escalation shares the in-memory mutex AND the isFreshEnough guard.
    // Without this, a concurrent GoTrue autoRefreshToken rotation would already have consumed
    // the refresh token; the direct call would get "refresh_token_not_found" → handleFatal → forced logout.
    supabaseRefreshSession: async () => {
      const result = await refreshSupabaseSessionWithRecovery();
      const rawSession =
        result.ok && result.session
          ? {
              access_token: result.session.accessToken,
              refresh_token: result.session.refreshToken,
              expires_at: result.session.expiresAt,
              user: result.session.user,
            }
          : null;
      return { data: { session: rawSession }, error: result.error ?? null };
    },
    getSessionHealthStatus: () => useSessionHealthStore.getState().status,
  };
  if (reconnectEscalationCtlRef.current == null) {
    reconnectEscalationCtlRef.current = createReconnectEscalationController({
      getDeps: () => reconnectEscalationDepsRef.current,
    });
  }

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    sessionUserIdRef.current = session?.user?.id ?? null;
  }, [session?.user?.id]);

  const bootstrapOrganizationAfterLogin = useCallback(async (sessionLike) => {
    const userId = sessionLike?.user?.id || null;
    if (!userId) return;
    if (bootstrapOrgAttemptedUsersRef.current.has(userId)) return;
    bootstrapOrgAttemptedUsersRef.current.add(userId);
    // Server-owned bootstrap only. Do not trigger organization bootstrap from frontend auth flows.
  }, []);

  // Drop legacy `breakapi_user` mirror when using Supabase — session + profiles are authoritative.
  useEffect(() => {
    if (isSupabaseConfigured) {
      clearStoredAuthUser();
    }
  }, []);

  // Fail-safe: never spin forever on protected routes; RequireAuth shows retry after this.
  useEffect(() => {
    authLoadingFailSafeRef.current = setTimeout(() => {
      patchAuthSession({
        loading: false,
        authLoadingTimedOut: true,
      });
      authLoadingFailSafeRef.current = null;
    }, AUTH_BOOTSTRAP_FAILSAFE_MS);
    return () => {
      if (authLoadingFailSafeRef.current) {
        clearTimeout(authLoadingFailSafeRef.current);
        authLoadingFailSafeRef.current = null;
      }
    };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const SESSION_READ_MS = 8000;
      const first = await Promise.race([
        readSessionSafe(false),
        new Promise((resolve) => {
          setTimeout(() => resolve(SESSION_READ_TIMEOUT), SESSION_READ_MS);
        }),
      ]);

      let sessionNorm = null;
      if (first === SESSION_READ_TIMEOUT || !first?.user) {
        // Slow or inconclusive read — ask the client once without a fake “empty session” timeout.
        const { data, error } = await supabase.auth.getSession();
        if (error) reportSupabaseGetSessionFailure();
        else reportSupabaseGetSessionRecovered();
        if (!error && data?.session?.user) {
          sessionNorm = normalizeSessionFromClient(data.session);
        }
      } else {
        sessionNorm = first;
        reportSupabaseGetSessionRecovered();
      }

      if (sessionNorm?.user) {
        const PROFILE_RESTORE_MS = 10000;
        const currentUser = await Promise.race([
          User.restoreFromSupabaseSession(sessionNorm),
          new Promise((resolve) => {
            setTimeout(() => resolve(null), PROFILE_RESTORE_MS);
          }),
        ]);
        if (currentUser) {
          patchAuthSession({ user: currentUser });
        } else {
          const min = minimalUserFromJwtUser(sessionNorm.user);
          if (min) patchAuthSession({ user: min });
        }
        setError("");
      } else {
        const { data, error: gsErr } = await supabase.auth.getSession();
        if (gsErr) {
          if (isTerminalRefreshFailure(gsErr) && (userIdRef.current || sessionUserIdRef.current)) {
            AppRecoveryLock.begin("refresh_token_invalid");
            await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
            return;
          }
          reportSupabaseGetSessionFailure();
          setError("");
          return;
        }
        reportSupabaseGetSessionRecovered();
        if (!data?.session?.user) {
          patchAuthSession({ user: null });
          setError("");
        } else {
          const s = normalizeSessionFromClient(data.session);
          if (!isSessionValid(s)) {
            patchAuthSession({ user: null });
            setError("");
            return;
          }
          patchAuthSession({ session: s });
          const PROFILE_RESTORE_MS = 10000;
          const currentUser = await Promise.race([
            User.restoreFromSupabaseSession(s),
            new Promise((resolve) => {
              setTimeout(() => resolve(null), PROFILE_RESTORE_MS);
            }),
          ]);
          if (currentUser) {
            patchAuthSession({ user: currentUser });
          } else {
            const min = minimalUserFromJwtUser(s.user);
            if (min) patchAuthSession({ user: min });
          }
          setError("");
        }
      }
    } catch (e) {
      if (!isAbortError(e)) {
        console.warn("[Auth] refreshUser:", e?.message || e);
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) reportSupabaseGetSessionFailure();
        else reportSupabaseGetSessionRecovered();
        if (error && isTerminalRefreshFailure(error) && (userIdRef.current || sessionUserIdRef.current)) {
          AppRecoveryLock.begin("refresh_token_invalid");
          await sessionManager.RefreshManager.handleFatal("refresh_token_invalid");
          return;
        }
        const su = !error && data?.session?.user ? data.session.user : null;
        if (su) {
          const min = minimalUserFromJwtUser(su);
          if (min) patchAuthSession({ user: min });
        } else {
          patchAuthSession({ user: null });
        }
      } catch {
        reportSupabaseGetSessionFailure();
        patchAuthSession({ user: null });
      }
      setError("");
    } finally {
      patchAuthSession({ loading: false });
    }
  }, [connectionLifecycle, isTerminalRefreshFailure]);

  /** Coalesce TOKEN_REFRESHED + Realtime profile bursts so we don't stack profile restores after writes. */
  const scheduleRefreshUser = useCallback(() => {
    if (refreshUserDebounceRef.current) clearTimeout(refreshUserDebounceRef.current);
    refreshUserDebounceRef.current = setTimeout(() => {
      refreshUserDebounceRef.current = null;
      refreshUser();
    }, 450);
  }, [refreshUser]);

  /** Always latest impl for Supabase listener (subscription is long-lived; avoids stale closures). */
  const refreshUserRef = useRef(refreshUser);
  const scheduleRefreshUserRef = useRef(scheduleRefreshUser);
  refreshUserRef.current = refreshUser;
  scheduleRefreshUserRef.current = scheduleRefreshUser;

  useEffect(
    () => () => {
      if (refreshUserDebounceRef.current) clearTimeout(refreshUserDebounceRef.current);
      reconnectEscalationCtlRef.current?.cancel();
    },
    []
  );

  /** Deferred reconnect (narrow refresh); see {@link createReconnectEscalationController}. */
  const triggerReconnect = useCallback(() => {
    if (isRecoveryCircuitOpen()) return;
    reconnectEscalationCtlRef.current?.schedule();
  }, [isRecoveryCircuitOpen]);

  const refreshSession = useCallback(async (opts = {}) => {
    const silent = Boolean(opts?.silent);
    const bypassThrottle = Boolean(opts?.bypassThrottle);
    /** When true, concurrent callers get `retrying` + REFRESH_RETRYING; default joins the in-flight promise (wake/resync/reconnect must await the real outcome). */
    const coalesceOnly = Boolean(opts?.coalesceOnly);
    const queueSource = typeof opts?.source === "string" ? opts.source : "auth_context_refresh";
    if (isRecoveryCircuitOpen()) {
      const skipped = refreshSkipped("session_health_expired");
      connectionLifecycle.report({
        type: LifecycleSignalType.REFRESH_SKIPPED,
        reason: skipped.reason,
      });
      return skipped;
    }
    const out = await sessionManager.RetryController.enqueue(
      () =>
        runAuthRefreshQueueJob({
          believedSignedIn: Boolean(userIdRef.current || sessionUserIdRef.current),
          silent,
          connectionLifecycle,
          sessionManager,
          isTerminalRefreshFailure,
          readSessionSafe,
          isSessionValid,
          patchAuthSession,
          touchAuthHeartbeatIfValid,
          cancelReconnectEscalation: () => reconnectEscalationCtlRef.current?.cancel(),
          scheduleReconnectEscalation: triggerReconnect,
          enableTerminalMutationLock: (terminalReason = "refresh_token_invalid") => {
            AppRecoveryLock.begin(terminalReason);
          },
          publishAuthTabSync: (type, payload) => authTabSyncRef.current?.publish(type, payload),
          reconcileRealtimeJwt,
        }),
      { source: queueSource, bypassThrottle, returnRetryingOnJoin: coalesceOnly }
    );
    if (isRefreshSkipped(out)) {
      connectionLifecycle.report({
        type: LifecycleSignalType.REFRESH_SKIPPED,
        reason: out.reason,
      });
    } else if (isRefreshRetrying(out)) {
      connectionLifecycle.report({
        type: LifecycleSignalType.REFRESH_RETRYING,
        reason: out.reason,
      });
    }
    return out;
  }, [connectionLifecycle, isRecoveryCircuitOpen, isTerminalRefreshFailure, sessionManager, triggerReconnect]);

  /**
   * Proactive JWT refresh before expiry (tab timers can lag after sleep / backgrounding).
   * Works with GoTrue autoRefreshToken; avoids surprise 401 bursts on API calls.
   */
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const exp = session?.expiresAt;
    const ms = msUntilProactiveRefresh(exp);
    if (ms == null) return undefined;
    const id = window.setTimeout(() => {
      void (async () => {
        const { data: snap } = await supabase.auth.getSession();
        if (!snap?.session?.refresh_token) return;
        requestSessionRefreshGuarded({ source: "proactive", silent: true, debounceMs: 0 });
      })();
    }, ms);
    return () => clearTimeout(id);
  }, [requestSessionRefreshGuarded, session?.expiresAt, session?.accessToken]);

  const retryAuthBootstrap = useCallback(async () => {
    patchAuthSession({ authLoadingTimedOut: false, loading: true });
    try {
      await consumeAuthCallbackFromUrl();
      await refreshSession();
      await refreshUser();
    } finally {
      patchAuthSession({ loading: false });
    }
  }, [refreshSession, refreshUser]);

  // Initialize: one getSession, then restore user from profile (avoids duplicate getSession + User.me round trips)
  useEffect(() => {
    let cancelled = false;
    const SESSION_INIT_MS = 12000;
    (async () => {
      try {
        await consumeAuthCallbackFromUrl();
        let initialSession = null;
        try {
          const first = await Promise.race([
            readSessionSafe(false),
            new Promise((resolve) => {
              setTimeout(() => resolve(SESSION_READ_TIMEOUT), SESSION_INIT_MS);
            }),
          ]);
          if (first === SESSION_READ_TIMEOUT) {
            const { data, error } = await supabase.auth.getSession();
            if (!error && data?.session?.user) {
              initialSession = normalizeSessionFromClient(data.session);
            }
          } else {
            initialSession = first;
          }
        } catch (e) {
          if (!cancelled && import.meta.env?.DEV) {
            console.warn("[Auth] getSession failed during init:", e?.message || e);
          }
          try {
            const { data, error } = await supabase.auth.getSession();
            if (!error && data?.session?.user) {
              initialSession = normalizeSessionFromClient(data.session);
            }
          } catch {
            /* ignore */
          }
        }
        if (cancelled) return;
        const hasValidSession = isSessionValid(initialSession);
        patchAuthSession({ session: hasValidSession ? initialSession : null });
        let currentUser = null;

        // 1) Check session, 2) Validate session
        if (!hasValidSession) {
          patchAuthSession({ user: null });
          setError("");
          redirectToLoginIfProtectedPath();
          return;
        }

        try {
          currentUser = await Promise.race([
            User.restoreFromSupabaseSession(initialSession),
            new Promise((resolve) => {
              setTimeout(() => resolve(null), 10000);
            }),
          ]);
        } catch (restoreErr) {
          console.warn("[Auth] Restore from session failed:", restoreErr);
        }

        if (cancelled) return;
        // 4) Render UI; profile/API may be slow — keep JWT-derived user so we don't bounce to login.
        if (!currentUser) {
          const min = minimalUserFromJwtUser(initialSession.user);
          if (min) {
            patchAuthSession({ user: min });
            setError("");
            touchAuthHeartbeatIfValid(initialSession);
            if (import.meta.env?.DEV) {
              console.info("[Auth] Profile restore deferred; using JWT user until API is reachable.");
            }
          } else {
            patchAuthSession({ user: null });
            setError("Failed to restore session");
            redirectToLoginIfProtectedPath();
          }
          return;
        }
        patchAuthSession({ user: currentUser });
        setError("");
        touchAuthHeartbeatIfValid(initialSession);
      } catch (err) {
        if (!isAbortError(err)) {
          console.warn("[Auth] Auth init error:", err);
        }
        if (!cancelled) {
          try {
            const recovered = await readSessionSafe(false);
            if (recovered?.user && isSessionValid(recovered)) {
              const min = minimalUserFromJwtUser(recovered.user);
              if (min) {
                patchAuthSession({ session: recovered, user: min });
                setError("");
                touchAuthHeartbeatIfValid(recovered);
              } else {
                patchAuthSession({ session: null, user: null });
                setError("");
                redirectToLoginIfProtectedPath();
              }
            } else {
              patchAuthSession({ session: null, user: null });
              setError("");
              redirectToLoginIfProtectedPath();
            }
          } catch {
            patchAuthSession({ session: null, user: null });
            setError("");
            redirectToLoginIfProtectedPath();
          }
        }
      } finally {
        if (authLoadingFailSafeRef.current) {
          clearTimeout(authLoadingFailSafeRef.current);
          authLoadingFailSafeRef.current = null;
        }
        if (!cancelled) {
          patchAuthSession({ loading: false, authLoadingTimedOut: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Intentionally no auto `if (!user && !loading) resetApp()`: that is true for every guest on public routes after
   * bootstrap and would wipe localStorage/sessionStorage (theme, prefs, offline data) for normal visitors.
   * Use {@link resetApp} from the crash screen (ApplicationErrorPage) or `hardResetApp` from support flows.
   */
  const hardResetApp = useCallback(() => {
    resetApp();
  }, []);

  /** Single ingress for background resync (visibility, online, heartbeat, tab sync, …). */
  useEffect(() => {
    registerSessionRefreshExecutor(async ({ silent, bypassThrottle = false }) => {
      if (isRecoveryCircuitOpen()) return;
      const believedSignedIn = Boolean(userIdRef.current || sessionUserIdRef.current);
      await runSessionRefreshExecutorPipeline({
        silent,
        bypassThrottle,
        refreshSession,
        refreshUser,
        afterProfileHydrated: async () => {
          scheduleRealtimeRecoveryAfterAuth("session_resync");
          await enforceProtectedRouteSessionInvariant(
            typeof window !== "undefined" ? window.location.pathname : "",
            {
              loading: loadingRef.current,
              believedSignedIn,
            }
          );
        },
      });
    });
    return () => unregisterSessionRefreshExecutor();
  }, [isRecoveryCircuitOpen, refreshSession, refreshUser]);

  const runWakeRecoverySequence = useCallback(
    async ({ hiddenAtMs: _hiddenAtMs, reason }) => {
      if (wakeRecoveryInFlightRef.current || isRecoveryCircuitOpen()) return;
      wakeRecoveryInFlightRef.current = true;
      const r = reason || "wake";
      let wakeRecoverySucceeded = false;
      /** Set when pipeline returns `{ ok: false }` or outer catch runs (for lifecycle FAILED in `finally`). */
      let wakeFailureReason = /** @type {string | null} */ (null);
      try {
        AppRecoveryLock.begin(r);
        connectionLifecycle.reportRecoveryWake("wake_recovery", {
          blockingMutations: true,
          reason: r,
        });
        dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.STARTED, { reason: r });

        const pipelineResult = await runWakeRecoveryPipeline({
          reason: reason || "wake_recovery",
          refreshSession,
          readSessionSafe,
          isSessionValid,
          patchAuthSession,
          setRecoveryPhase: (phase) => {
            if (phase === "realtime") AppRecoveryLock.setPhase(AppRecoveryPhase.REALTIME);
            else if (phase === "auth") AppRecoveryLock.setPhase(AppRecoveryPhase.AUTH);
            else if (phase === "resync") AppRecoveryLock.setPhase(AppRecoveryPhase.REALTIME);
          },
          awaitRealtimeRecovery: awaitRealtimeRecoveryAndMainChannel,
          refreshUser,
          enforceRouteInvariant: async () => {
            const believedSignedIn = Boolean(userIdRef.current || sessionUserIdRef.current);
            await enforceProtectedRouteSessionInvariant(
              typeof window !== "undefined" ? window.location.pathname : "",
              {
                loading: loadingRef.current,
                believedSignedIn,
              }
            );
          },
          connectionLifecycle,
          requestSessionRefresh: requestSessionRefreshGuarded,
          isCircuitOpen: isRecoveryCircuitOpen,
          touchHeartbeatIfValid: touchAuthHeartbeatIfValid,
        });
        wakeRecoverySucceeded = Boolean(pipelineResult?.ok);
        if (!wakeRecoverySucceeded) {
          wakeFailureReason =
            pipelineResult?.ok === false && pipelineResult.reason != null
              ? String(pipelineResult.reason)
              : WakeRecoveryFailureReason.UNKNOWN;
        }
      } catch (e) {
        if (import.meta.env?.DEV) {
          console.warn("[Auth] wake recovery:", e?.message || e);
        }
        requestSessionRefreshGuarded({
          source: "wake_recovery_error",
          silent: true,
          debounceMs: 0,
          bypassThrottle: true,
        });
        wakeFailureReason = WakeRecoveryFailureReason.UNKNOWN;
      } finally {
        AppRecoveryLock.end();
        connectionLifecycle.reportRecoveryWake("idle", { blockingMutations: false, reason: null });

        if (!wakeRecoverySucceeded && wakeFailureReason != null) {
          dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.FAILED, wakeFailureReason);
        }

        if (wakeRecoverySucceeded && typeof window !== "undefined") {
          dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.SUCCEEDED);
          window.dispatchEvent(
            new CustomEvent("paidly:wake-recovery-resync", { detail: { ok: true } })
          );
        }

        dispatchWakeRecoveryLifecycleEvent(WakeRecoveryLifecycleEventType.ENDED, { reason: r });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("paidly:wake-recovery-end", { detail: { reason: r } }));
        }

        wakeRecoveryInFlightRef.current = false;
      }
    },
    [connectionLifecycle, isRecoveryCircuitOpen, refreshSession, refreshUser, requestSessionRefreshGuarded]
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = createAuthTabSyncChannel();
    authTabSyncRef.current = sync;
    const unsubscribe = sync.subscribe((message) => {
      if (!message?.type) return;
      if (message.type === "AUTH_SIGNED_OUT") {
        void connectionLifecycle.transitionToExpired("signed_out_in_another_tab", {
          signOutLocal: false,
          clearAuthState: true,
          broadcast: false,
          redirect: true,
          source: "tab_sync_signed_out",
        });
        return;
      }
      if (message.type === "AUTH_SESSION_UPDATED") {
        requestSessionRefreshGuarded({ source: "auth_tab_sync", silent: true });
      }
      if (message.type === "AUTH_REAUTH_REQUIRED") {
        void connectionLifecycle.transitionToExpired(
          message?.payload?.reason || "session_expired",
          {
            signOutLocal: false,
            clearAuthState: true,
            broadcast: false,
            redirect: true,
            source: "tab_sync_reauth_required",
          }
        );
      }
    });
    return () => {
      unsubscribe();
      sync.close();
      authTabSyncRef.current = null;
    };
  }, [connectionLifecycle]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleVisibility = async () => {
      if (document.visibilityState === "hidden") {
        const t = Date.now();
        documentHiddenAtRef.current = t;
        connectionLifecycle.reportVisibilityState("hidden", t);
        return;
      }

      connectionLifecycle.reportVisibilityState("visible");
      const hiddenAt = documentHiddenAtRef.current;
      documentHiddenAtRef.current = null;

      const lastHb = useWakeRecoveryStore.getState().lastHeartbeatAt;
      const signedIn = Boolean(sessionUserIdRef.current || userIdRef.current);
      const needWake =
        signedIn &&
        shouldEnterWakeRecoveryMode({
          lastHeartbeatAt: lastHb,
          hiddenAtMs: hiddenAt,
        });

      if (needWake) {
        await runWakeRecoverySequence({ hiddenAtMs: hiddenAt, reason: "visibility_wake" });
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        const hasSession = Boolean(data?.session);

        if (hasSession) {
          connectionLifecycle.markConnected("tab_visible");
        } else {
          // Hidden-tab wake recovery should be silent: avoid terminal escalation from visibility events.
          connectionLifecycle.report({
            type: LifecycleSignalType.VISIBILITY_RESTORE_FAILED,
            reason: "tab_visible_missing_session",
            believedSignedIn: signedIn,
          });
        }
      } catch {
        // Visibility recovery failures are treated as transient until explicit fatal auth evidence appears.
        connectionLifecycle.report({
          type: LifecycleSignalType.VISIBILITY_RESTORE_FAILED,
          reason: "tab_visible_refresh_failed",
          believedSignedIn: signedIn,
        });
      }

      // Fast stale check: rebuilds realtime ONLY if the channel is not joined.
      // Never forces a reconnect when the channel is healthy (requirement 11).
      if (signedIn) {
        checkRealtimeOnVisibilityRestore();
      }

      // Do NOT bypass the throttle here: rapid hide/show cycles must be subject to
      // RefreshQueue's minGapMs guard to prevent successive refresh storms.
      requestSessionRefreshGuarded({ source: "visibility", silent: true });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [connectionLifecycle, runWakeRecoverySequence]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleOnline = () => {
      connectionLifecycle.reportNetworkState(true);
      requestSessionRefreshGuarded({ source: "online", silent: true, bypassThrottle: true });
    };
    const handleOffline = () => {
      connectionLifecycle.reportNetworkState(false, "offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [connectionLifecycle, requestSessionRefreshGuarded]);

  // Single owner periodic session heartbeat.
  // Other root components should subscribe to session/connection stores (no parallel polling loops).
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const id = window.setInterval(() => {
      if (loadingRef.current) return;
      if (document.visibilityState !== "visible") return;
      if (navigator.onLine === false) return;
      if (!sessionUserIdRef.current) return;
      requestSessionRefreshGuarded({ source: "heartbeat", silent: true, debounceMs: 0 });
    }, SESSION_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [requestSessionRefreshGuarded]);

  // Back/forward cache restore: session timers were frozen — same recovery path as visibility.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onPageShow = (e) => {
      if (!e.persisted) return;
      const lastHb = useWakeRecoveryStore.getState().lastHeartbeatAt;
      const signedIn = Boolean(sessionUserIdRef.current || userIdRef.current);
      const needWake =
        signedIn &&
        shouldEnterWakeRecoveryMode({
          lastHeartbeatAt: lastHb,
          hiddenAtMs: null,
        });
      if (needWake) {
        void runWakeRecoverySequence({ hiddenAtMs: null, reason: "bfcache_wake" });
        return;
      }
      requestSessionRefreshGuarded({ source: "bfcache", silent: true, bypassThrottle: true });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [requestSessionRefreshGuarded, runWakeRecoverySequence]);

  /**
   * Third condition: protected route navigation after bootstrap — same invariant as tab resync, without waiting for focus.
   * Debounced; skips public paths and guests (`believedSignedIn` from refs).
   */
  const verifySessionOnProtectedRoute = useCallback((pathname) => {
    if (routeInvariantTimerRef.current) clearTimeout(routeInvariantTimerRef.current);
    routeInvariantTimerRef.current = setTimeout(() => {
      routeInvariantTimerRef.current = null;
      const believedSignedIn = Boolean(userIdRef.current || sessionUserIdRef.current);
      void enforceProtectedRouteSessionInvariant(
        pathname || (typeof window !== "undefined" ? window.location.pathname : ""),
        {
          loading: loadingRef.current,
          believedSignedIn,
        }
      );
    }, 200);
  }, []);

  useEffect(
    () => () => {
      if (routeInvariantTimerRef.current) clearTimeout(routeInvariantTimerRef.current);
    },
    []
  );

  // Listen to Supabase auth state (sign in/out, token refresh) to keep session and user in sync
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === "SIGNED_OUT") {
        useWakeRecoveryStore.getState().reset();
        if (manualLogoutRef.current) {
          manualLogoutRef.current = false;
          connectionLifecycle.markManualLogoutReset();
          patchAuthSession({
            session: null,
            user: null,
            loading: false,
            authLoadingTimedOut: false,
          });
          setError("");
          authTabSyncRef.current?.publish("AUTH_SIGNED_OUT");
          return;
        }
        await connectionLifecycle.transitionToExpired("signed_out", {
          signOutLocal: false,
          clearAuthState: true,
          broadcast: true,
          redirect: true,
          source: "supabase_signed_out",
        });
        authTabSyncRef.current?.publish("AUTH_SIGNED_OUT");
        return;
      }

      if (event === "AUTH_EXPIRED") {
        await connectionLifecycle.transitionToExpired("auth_expired", {
          signOutLocal: true,
          clearAuthState: true,
          broadcast: true,
          redirect: true,
          source: "supabase_auth_expired_event",
        });
        return;
      }

      if (!nextSession) {
        if (event === "INITIAL_SESSION") {
          // INITIAL_SESSION can momentarily be null during startup races; recover once before clearing user state.
          try {
            const recovered = await readSessionSafe(true);
            if (recovered?.user && isSessionValid(recovered)) {
              patchAuthSession({ session: recovered });
              touchAuthHeartbeatIfValid(recovered);
              scheduleRefreshUserRef.current();
              return;
            }
          } catch {
            // ignore and evaluate existing auth state below
          }
          // Only hard-clear when we truly have no session and no hydrated user to avoid route flicker.
          if (!userIdRef.current && !sessionUserIdRef.current) {
            patchAuthSession({ session: null, user: null, loading: false });
            setError("");
            redirectToLoginIfProtectedPath();
          } else {
            scheduleRefreshUserRef.current();
          }
          return;
        }
        try {
          const recovered = await readSessionSafe(true);
          if (recovered?.user && isSessionValid(recovered)) {
            patchAuthSession({ session: recovered });
            touchAuthHeartbeatIfValid(recovered);
            scheduleRefreshUserRef.current();
          }
        } catch {
          /* offline — do not clear */
        }
        return;
      }

      const norm = nextSession
        ? {
            accessToken: nextSession.access_token,
            refreshToken: nextSession.refresh_token,
            expiresAt: nextSession.expires_at,
            user: nextSession.user,
          }
        : null;

      if (event === "SIGNED_IN" && norm) {
        connectionLifecycle.markConnected("signed_in");
        patchAuthSession({ session: norm });
        void bootstrapOrganizationAfterLogin(norm);
        await refreshUserRef.current();
        touchAuthHeartbeatIfValid(norm);
        authTabSyncRef.current?.publish("AUTH_SESSION_UPDATED", { event: "SIGNED_IN" });
      } else if ((event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && norm) {
        if (import.meta.env.DEV && event === "TOKEN_REFRESHED") {
          console.info("[Auth] Session refreshed (TOKEN_REFRESHED)");
        }
        connectionLifecycle.markConnected("token_refreshed");
        patchAuthSession({ session: norm });
        touchAuthHeartbeatIfValid(norm);
        scheduleRefreshUserRef.current();
        reconcileRealtimeJwtFromSupabaseAuthEvent(event, norm.accessToken);
        authTabSyncRef.current?.publish("AUTH_SESSION_UPDATED", { event });
      } else if (event === "INITIAL_SESSION" && norm?.user) {
        connectionLifecycle.markConnected("initial_session");
        patchAuthSession({ session: norm });
        void bootstrapOrganizationAfterLogin(norm);
        await refreshUserRef.current();
        touchAuthHeartbeatIfValid(norm);
        authTabSyncRef.current?.publish("AUTH_SESSION_UPDATED", { event: "INITIAL_SESSION" });
      }
    });
    return () => subscription.unsubscribe();
  }, [bootstrapOrganizationAfterLogin, connectionLifecycle]);

  // Attach pending ?ref= from localStorage once a session exists (OAuth, email link, or after refresh).
  useEffect(() => {
    if (!session?.user?.id) return;
    processPendingAffiliateReferral();
  }, [session?.user?.id]);

  // Auto-update profile (and assets like logo) when the profiles row changes (e.g. Settings save, another tab, or admin)
  useSupabaseRealtime(
    user?.id ? ["profiles"] : [],
    useCallback(() => {
      scheduleRefreshUser();
    }, [scheduleRefreshUser]),
    { channelName: "auth-profile-updates" }
  );

  const login = useCallback(async ({ email, password, role }) => {
    setError("");
    setVerifyGateEmail("");
    const normalizedEmail = (email || "").trim().toLowerCase();
    const session = await SupabaseAuthService.signInWithEmail(normalizedEmail, password);
    if (session?.user && session.user.email_confirmed_at == null) {
      // Defense in depth: do not allow app login for unverified users.
      try {
        await SupabaseAuthService.signOut();
      } catch {
        // ignore
      }
      patchAuthSession({ session: null, user: null });
      setVerifyGateEmail(normalizedEmail);
      setShowVerifyDialog(true);
      throw new Error("Email not verified. Please verify your email before signing in.");
    }
    patchAuthSession({ session, authLoadingTimedOut: false });
    void bootstrapOrganizationAfterLogin(session);

    await User.login({ email: normalizedEmail, password, role: role || undefined });

    // At this point email is verified — surface the session in React state immediately.
    // Do not await profiles upsert: a stuck network/DB write must not freeze the sign-in button or RequireAuth.
    const currentUser = await User.getCurrentUser();
    patchAuthSession({ user: currentUser ?? null });
    const normAfterLogin = useAuthSessionStore.getState().session;
    touchAuthHeartbeatIfValid(normAfterLogin);

    if (session?.user?.id) {
      const patch = {
        supabase_id: session.user.id,
        auth_id: session.user.id,
        role: currentUser?.role || resolveUserRoleFromSessionAndProfile(session.user, {}),
        permissions: session.user.app_metadata?.permissions || [],
      };
      void User.updateMyUserData(patch).catch((e) => {
        console.warn("[Auth] updateMyUserData after login (non-blocking):", e?.message || e);
      });
    }
  }, [bootstrapOrganizationAfterLogin]);

  const purgeSupabaseAuthStorage = useCallback(() => {
    const shouldRemoveKey = (k) =>
      typeof k === "string" && (k === "supabase.auth.token" || /^sb-.*-auth-token$/i.test(k));

    try {
      if (typeof localStorage !== "undefined") {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (shouldRemoveKey(k)) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
      }
    } catch {
      // ignore
    }

    try {
      if (typeof sessionStorage !== "undefined") {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (shouldRemoveKey(k)) keys.push(k);
        }
        keys.forEach((k) => sessionStorage.removeItem(k));
      }
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(
    async (opts = {}) => {
      manualLogoutRef.current = true;
      const keepExpiredState = Boolean(opts?.keepExpiredState);
      // 1. Clear app state immediately so the UI shows logged out and redirect is never blocked.
      clearNodeAuthUnreachable();
      try {
        await User.logout();
      } catch {
        // ignore
      }
      patchAuthSession({
        session: null,
        user: null,
        loading: false,
        authLoadingTimedOut: false,
      });
      useWakeRecoveryStore.getState().reset();
      if (!keepExpiredState) {
        connectionLifecycle.markManualLogoutReset();
      }
      setError("");
      setShowVerifyDialog(false);
      setVerifyGateEmail("");
      setResendLoading(false);
      setResendSuccess("");

      // 2. Revoke Supabase session while tokens still exist in storage — purging before signOut()
      //    causes signOut to hang or time out (no refresh token for the revoke request).
      const SIGNOUT_MS = 8000;
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("signOut timeout")), SIGNOUT_MS);
      });
      const signOutPromise = supabase.auth.signOut({ scope: "global" }).then(({ error }) => {
        if (error) throw error;
      });
      try {
        await Promise.race([signOutPromise, timeoutPromise]);
      } catch (e) {
        if (import.meta.env?.DEV) {
          console.warn("[Auth] Supabase signOut failed or timed out.", e?.message || e);
        }
      } finally {
        clearTimeout(timeoutId);
        // 3. Always remove Supabase auth keys after signOut (or if it failed / timed out).
        purgeSupabaseAuthStorage();
      }
    },
    [purgeSupabaseAuthStorage]
  );

  const handleUnauthorizedSession = useCallback(
    async (reason, context = {}) => {
      const reasonText = String(reason || "").toLowerCase();
      const fatalUnauthorized =
        Boolean(context?.refreshFatal) ||
        reasonText.includes("refresh_token_invalid") ||
        reasonText.includes("fatal_refresh_token") ||
        reasonText.includes("auth_expired") ||
        reasonText.includes("session_revoked") ||
        reasonText.includes("reauth_required");
      if (fatalUnauthorized) {
        AppRecoveryLock.begin("refresh_token_invalid");
        clearNodeAuthUnreachable();
        try {
          await User.logout();
        } catch {
          // ignore
        }
        await sessionManager.RefreshManager.handleFatal(reason || "refresh_token_invalid");
        purgeSupabaseAuthStorage();
        return;
      }

      const shouldRequireReauth = connectionLifecycle.shouldRequireReauth(
        reason || "unauthorized"
      );
      if (!shouldRequireReauth) {
        connectionLifecycle.reportVisibilityRecover(reason || "session_reconnecting");
        return;
      }

      const { forceTerminalLogout } = sessionManager.RefreshManager.escalateRecoverableSession(
        reason || "unauthorized"
      );
      if (!forceTerminalLogout) {
        requestSessionRefreshGuarded({ source: "unauthorized_recovery", silent: true, debounceMs: 0 });
        return;
      }

      clearNodeAuthUnreachable();
      try {
        await User.logout();
      } catch {
        // ignore
      }
      await connectionLifecycle.transitionToExpired(reason || "unauthorized", {
        signOutLocal: true,
        clearAuthState: true,
        broadcast: true,
        redirect: true,
        source: "unauthorized_handler",
      });
      purgeSupabaseAuthStorage();
    },
    [connectionLifecycle, purgeSupabaseAuthStorage, requestSessionRefreshGuarded, sessionManager]
  );

  useEffect(() => {
    setUnauthorizedSessionHandler(handleUnauthorizedSession);
    return () => setUnauthorizedSessionHandler(null);
  }, [handleUnauthorizedSession]);

  /** Supabase-only password reset (no client-side tokens; expiry handled by Supabase). */
  const sendPasswordReset = useCallback(async (email) => {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}${createPageUrl("ResetPassword")}` : undefined;
    await SupabaseAuthService.resetPasswordForEmail((email || "").trim().toLowerCase(), redirectTo);
    return true;
  }, []);

  /**
   * Admin team invite: server calls Supabase Admin API with service role (never in the browser).
   * Requires backend with SUPABASE_SERVICE_ROLE_KEY and admin JWT.
   */
  const sendUserInvite = useCallback(async (email, fullName, role, plan) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error("You must be signed in to send invitations.");
    }
    const token = sessionData.session.access_token;
    const redirect_to = typeof window !== "undefined" ? window.location.origin : undefined;
    try {
      const { data } = await backendApi.post(
        "/api/admin/invite-user",
        {
          email: (email || "").trim().toLowerCase(),
          full_name: fullName,
          role,
          plan,
          redirect_to,
        },
        { headers: { Authorization: `Bearer ${token}` }, __paidlySilent: true }
      );
      if (data?.ok) {
        return `An invitation email was sent to ${email.trim()}. They can use the link in that email to set their password and sign in.`;
      }
      throw new Error("Invite request did not complete.");
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Invite failed. Ensure the backend is running and configured (SUPABASE_SERVICE_ROLE_KEY).";
      throw new Error(msg);
    }
  }, []);

  const handleResendConfirmation = async (email) => {
    setResendLoading(true);
    setResendSuccess("");
    try {
      await SupabaseAuthService.resendSignupEmail((email || "").trim().toLowerCase());
      setResendSuccess(
        "If an account exists for this email, we sent a confirmation message. Please check your inbox."
      );
    } catch (e) {
      setResendSuccess(e?.message || "Failed to resend confirmation email.");
    } finally {
      setResendLoading(false);
    }
  };

  const value = useMemo(() => {
    const authUserId = getAuthUserId(user);
    const userRole = user?.role || session?.user?.app_metadata?.role || null;
    const userPermissions = user?.permissions || session?.user?.app_metadata?.permissions || [];
    return {
      user,
      profile: user,
      loading,
      /** True once initial getSession + profile bootstrap has finished (success or guest). */
      authReady: !loading,
      /** Canonical id for RLS-scoped reads/writes; null when signed out or not yet hydrated. */
      authUserId,
      isAuthenticated: Boolean(authUserId),
      login,
      logout,
      hardResetApp,
      verifySessionOnProtectedRoute,
      refreshUser,
      refreshSession,
      sendPasswordReset,
      sendUserInvite,
      showVerifyDialog,
      setShowVerifyDialog,
      resendLoading,
      resendSuccess,
      handleResendConfirmation,
      error,
      userRole,
      userPermissions,
      session,
      authLoadingTimedOut,
      retryAuthBootstrap,
    };
  }, [
    user,
    loading,
    login,
    logout,
    hardResetApp,
    verifySessionOnProtectedRoute,
    refreshUser,
    refreshSession,
    sendPasswordReset,
    sendUserInvite,
    showVerifyDialog,
    resendLoading,
    resendSuccess,
    error,
    session,
    authLoadingTimedOut,
    retryAuthBootstrap,
  ]);

  return (
    <SessionManagerContext.Provider value={sessionManager}>
      <ConnectionLifecycleContext.Provider value={connectionLifecycle}>
        <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
        <WakeRecoveryOverlay />
      {/* Email not verified dialog (global) — works when user was cleared after blocking unverified sign-in */}
      {showVerifyDialog && (user?.email || verifyGateEmail) ? (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-[2px] px-4">
          <div className="bg-card text-card-foreground rounded-2xl border border-border shadow-xl p-8 max-w-sm w-full text-center">
            <h2 className="text-xl font-semibold mb-2">Confirm your email</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              We need a verified email before you can use Paidly. Check your inbox for the confirmation link,
              or resend the message below.
            </p>
            <Button
              onClick={() => handleResendConfirmation(user?.email || verifyGateEmail)}
              disabled={resendLoading}
              className="w-full mb-2 rounded-xl"
            >
              {resendLoading ? "Sending…" : "Resend confirmation email"}
            </Button>
            {resendSuccess ? (
              <div className="text-sm text-primary mt-2">{resendSuccess}</div>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                setVerifyGateEmail("");
                setShowVerifyDialog(false);
              }}
              className="w-full mt-2 rounded-xl"
            >
              Close
            </Button>
          </div>
        </div>
      ) : null}
      </ConnectionLifecycleContext.Provider>
    </SessionManagerContext.Provider>
  );
}

const AUTH_FALLBACK = {
  user: null,
  profile: null,
  loading: false,
  authReady: false,
  authUserId: null,
  isAuthenticated: false,
  session: null,
  error: "",
  login: async () => {},
  signup: async () => {},
  logout: () => {},
  hardResetApp: () => {},
  verifySessionOnProtectedRoute: () => {},
  refreshUser: async () => {},
  refreshSession: async () => refreshSkipped("no_auth_provider"),
  retryAuthBootstrap: async () => {},
  sendPasswordReset: async () => {},
  sendUserInvite: async () => {},
  setShowVerifyDialog: () => {},
  showVerifyDialog: false,
  resendLoading: false,
  resendSuccess: "",
  handleResendConfirmation: async () => {},
  userRole: null,
  userPermissions: [],
  authLoadingTimedOut: false,
};

let warnedAuthOutsideProvider = false;

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (import.meta.env?.DEV) {
      if (!warnedAuthOutsideProvider) {
        warnedAuthOutsideProvider = true;
        console.warn(
          "[Auth] useAuth called outside AuthProvider (e.g. during HMR). Using fallback. If you see this after a hot reload, refresh the page."
        );
      }
      return AUTH_FALLBACK;
    }
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
