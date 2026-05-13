import { useCallback } from "react";
import Button from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useConnectionLifecycle } from "@/contexts/ConnectionLifecycleContext";
import { useInactivitySessionTimeout } from "@/hooks/useInactivitySessionTimeout";
import { navigateTo } from "@/lib/navigationService";
import { requestSessionRefresh } from "@/lib/session/sessionRefreshScheduler";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";
import { SESSION_STATUS, setSessionHealthStatus } from "@/stores/sessionHealthStore";

// 18 min of no activity triggers the warning; 2 min warning countdown → logout = 20 min total.
const IDLE_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MS || 18 * 60 * 1000);
const WARNING_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_WARNING_TIMEOUT_MS || 2 * 60 * 1000);
// 4-minute keep-alive interval: Supabase JWTs last 1 hour; autoRefreshToken handles routine refresh.
// The server endpoint validates the token and the scheduler queues a Supabase refresh.
const KEEP_ALIVE_INTERVAL_MS = Number(import.meta.env.VITE_SESSION_KEEPALIVE_MS || 4 * 60 * 1000);

export default function InactivitySessionGuard() {
  const { isAuthenticated, authReady, session, logout } = useAuth();
  const connectionLifecycle = useConnectionLifecycle();

  const keepAlive = useCallback(async () => {
    if (isRecoveryCircuitOpen()) return;
    const token = session?.accessToken || session?.access_token || null;
    if (!token) return;

    // Fire-and-forget: server validates the JWT and returns a heartbeat.
    // Non-blocking so a slow response never delays the Supabase refresh below.
    fetch("/api/keep-alive", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Best-effort; network hiccups must not disrupt the UX.
    });

    // Supabase token refresh is the authoritative keep-alive mechanism.
    requestSessionRefresh({ source: "keep_alive", silent: true, debounceMs: 0 });
  }, [session?.accessToken, session?.access_token]);

  const onTimeout = useCallback(async () => {
    try {
      await connectionLifecycle?.transitionToExpired("inactivity_timeout", {
        signOutLocal: false,
        clearAuthState: true,
        broadcast: true,
        redirect: false,
        source: "inactivity_timeout",
      });
      // Safety net: ensure EXPIRED status is always set even if connectionLifecycle is null or
      // its guard short-circuited (e.g. another path already set a non-EXPIRED terminal state).
      // SessionExpiredModal and RequireAuth both rely on this status being terminal.
      setSessionHealthStatus(SESSION_STATUS.EXPIRED, "inactivity_timeout");
      await logout({ keepExpiredState: true });
    } finally {
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("paidly_session_expired_reason", "inactivity_timeout");
        } catch {
          // ignore storage errors
        }
        navigateTo("/login?reason=inactivity");
      }
    }
  }, [connectionLifecycle, logout]);

  const onRemoteTimeout = useCallback(async () => {
    await connectionLifecycle?.transitionToExpired("inactivity_timeout", {
      signOutLocal: true,
      clearAuthState: true,
      broadcast: true,
      redirect: false,
      source: "inactivity_remote_timeout",
    });
    // Safety net: same guarantee as onTimeout — SessionExpiredModal relies on EXPIRED status.
    setSessionHealthStatus(SESSION_STATUS.EXPIRED, "inactivity_timeout");
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("paidly_session_expired_reason", "inactivity_timeout");
      } catch {
        // ignore storage errors
      }
      navigateTo("/login?reason=inactivity");
    }
  }, [connectionLifecycle]);

  const { warningOpen, countdownSeconds, stayLoggedIn } = useInactivitySessionTimeout({
    enabled: Boolean(authReady && isAuthenticated),
    onTimeout,
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
      >
        <h2 id="session-inactivity-title" className="text-lg font-semibold">
          Your session is about to expire due to inactivity.
        </h2>
        <p id="session-inactivity-description" className="mt-2 text-sm text-muted-foreground">
          We will log you out in <span className="font-semibold text-foreground">{countdownSeconds}s</span> unless
          you continue working.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={stayLoggedIn}>Stay Logged In</Button>
        </div>
      </div>
    </div>
  );
}
