import { Component, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useConnectionLifecycle } from "@/contexts/ConnectionLifecycleContext";
import { useInactivitySessionTimeout } from "@/hooks/useInactivitySessionTimeout";
import { navigateTo } from "@/lib/navigationService";
import { requestSessionRefresh } from "@/lib/session/sessionRefreshScheduler";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";
import { settleWithin } from "@/lib/session/settleWithin";
import { refreshSupabaseSessionWithRecovery } from "@/lib/supabaseAuthRefresh";
import { supabase } from "@/lib/supabaseClient";
import { SESSION_STATUS, setSessionHealthStatus } from "@/stores/sessionHealthStore";

// 18 min of no activity triggers the warning; 2 min warning countdown, then a session check.
const IDLE_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MS || 18 * 60 * 1000);
const WARNING_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_WARNING_TIMEOUT_MS || 2 * 60 * 1000);
// 4-minute keep-alive interval: Supabase JWTs last 1 hour; autoRefreshToken handles routine refresh.
const KEEP_ALIVE_INTERVAL_MS = Number(import.meta.env.VITE_SESSION_KEEPALIVE_MS || 4 * 60 * 1000);

/** Upper bounds so no session step can leave the screen waiting forever. */
const REFRESH_LIMIT_MS = 30_000;
const MIRROR_LIMIT_MS = 10_000;
const TEARDOWN_LIMIT_MS = 5_000;

export const SESSION_EXPIRED_REASON_KEY = "paidly_session_expired_reason";
export const SESSION_EXPIRED_LOGIN_URL = "/login?reason=session_expired";

/**
 * Is there still a usable session after a refresh that did not succeed?
 * Only a definite "no session" counts as expired; an unreadable state fails open.
 */
async function sessionStillPresent() {
  const read = await settleWithin(() => supabase.auth.getSession(), 5_000, null);
  if (!read) return true;
  return Boolean(read?.data?.session?.user);
}

function InactivitySessionGuardInner() {
  const { isAuthenticated, authReady, session, logout, refreshSession } = useAuth();
  const connectionLifecycle = useConnectionLifecycle();
  // One clean sign-out at most, however many paths ask for it.
  const endedRef = useRef(false);

  const keepAlive = useCallback(async () => {
    if (isRecoveryCircuitOpen()) return;
    const token = session?.accessToken || session?.access_token || null;
    if (!token) return;
    fetch("/api/keep-alive", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Best-effort; network hiccups must not disrupt the UX.
    });
    requestSessionRefresh({ source: "keep_alive", silent: true, debounceMs: 0 });
  }, [session?.accessToken, session?.access_token]);

  /**
   * The session is genuinely gone: tear down within a bounded time, then always leave for login.
   * The hard navigation reloads the app, so nothing from the old session can stay on screen.
   */
  const endSessionCleanly = useCallback(
    async (source) => {
      if (endedRef.current) return;
      endedRef.current = true;
      try {
        window.sessionStorage.setItem(SESSION_EXPIRED_REASON_KEY, "session_expired");
      } catch {
        // ignore storage errors
      }
      await settleWithin(
        async () => {
          try {
            await connectionLifecycle?.transitionToExpired("session_expired", {
              signOutLocal: false,
              clearAuthState: true,
              broadcast: true,
              redirect: false,
              source,
            });
          } catch {
            // The redirect below still happens.
          }
          setSessionHealthStatus(SESSION_STATUS.EXPIRED, "session_expired");
          await logout({ keepExpiredState: true });
        },
        TEARDOWN_LIMIT_MS
      );
      navigateTo(SESSION_EXPIRED_LOGIN_URL, { replace: true });
    },
    [connectionLifecycle, logout]
  );

  /**
   * Refresh through the existing Supabase refresh (coalesced across clicks and tabs), mirror the
   * result into app state, and decide: "continue" keeps the user exactly where they are,
   * "ended" means Supabase rejected the session and the user was signed out.
   */
  const checkSession = useCallback(
    async (source) => {
      const result = await settleWithin(refreshSupabaseSessionWithRecovery, REFRESH_LIMIT_MS, {
        ok: false,
        fatal: false,
        reason: "refresh_timeout",
      });
      if (result?.ok) {
        await settleWithin(
          () => refreshSession?.({ source, silent: true, bypassThrottle: true }),
          MIRROR_LIMIT_MS
        );
        return "continue";
      }
      if (result?.fatal || !(await sessionStillPresent())) {
        await endSessionCleanly(source);
        return "ended";
      }
      // Network or lock trouble: keep the session; the existing reconnect path retries it.
      requestSessionRefresh({ source: `${source}_retry`, silent: true, debounceMs: 0 });
      return "continue";
    },
    [endSessionCleanly, refreshSession]
  );

  const onWarningElapsed = useCallback(() => checkSession("inactivity_check"), [checkSession]);
  const onStayLoggedIn = useCallback(() => checkSession("stay_logged_in"), [checkSession]);
  const onRemoteTimeout = useCallback(() => endSessionCleanly("session_expired_other_tab"), [endSessionCleanly]);

  const { warningOpen, refreshing, countdownSeconds, stayLoggedIn } = useInactivitySessionTimeout({
    enabled: Boolean(authReady && isAuthenticated),
    onWarningElapsed,
    onStayLoggedIn,
    onRemoteTimeout,
    onKeepAlive: keepAlive,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    warningTimeoutMs: WARNING_TIMEOUT_MS,
    keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,
  });

  if (!warningOpen) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-4" role="presentation">
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-inactivity-title"
        aria-describedby="session-inactivity-description"
        aria-busy={refreshing || undefined}
      >
        <h2 id="session-inactivity-title" className="text-lg font-semibold">
          Your session is about to expire due to inactivity.
        </h2>
        <p id="session-inactivity-description" className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          {refreshing ? (
            "Checking your session…"
          ) : (
            <>
              We will log you out in <span className="font-semibold text-foreground">{countdownSeconds}s</span> unless
              you continue working.
            </>
          )}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={stayLoggedIn} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Stay Logged In"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fail open: if the inactivity system itself crashes, render nothing rather than take the
 * dashboard down with it. Supabase's own session handling keeps working underneath.
 */
class InactivityGuardBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env?.DEV) console.warn("[InactivitySessionGuard] disabled after an error", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function InactivitySessionGuard() {
  return (
    <InactivityGuardBoundary>
      <InactivitySessionGuardInner />
    </InactivityGuardBoundary>
  );
}
