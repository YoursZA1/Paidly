import { useCallback } from "react";
import Button from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { setSessionHealthStatus, SESSION_STATUS } from "@/stores/sessionHealthStore";
import { useInactivitySessionTimeout } from "@/hooks/useInactivitySessionTimeout";

const IDLE_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MS || 5 * 60 * 1000);
const WARNING_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_WARNING_TIMEOUT_MS || 2 * 60 * 1000);
const KEEP_ALIVE_INTERVAL_MS = Number(import.meta.env.VITE_SESSION_KEEPALIVE_MS || 90 * 1000);

export default function InactivitySessionGuard() {
  const { isAuthenticated, authReady, session, logout } = useAuth();

  const keepAlive = useCallback(async () => {
    const token = session?.accessToken || session?.access_token || null;
    if (!token) return;
    await fetch("/api/keep-alive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {
      // Keep-alive is best-effort and should not disrupt UX.
    });
  }, [session?.accessToken, session?.access_token]);

  const onTimeout = useCallback(async () => {
    try {
      await logout();
    } finally {
      setSessionHealthStatus(SESSION_STATUS.EXPIRED, "inactivity_timeout");
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("paidly_session_expired_reason", "inactivity_timeout");
        } catch {
          // ignore storage errors
        }
        window.location.assign("/login?reason=inactivity");
      }
    }
  }, [logout]);

  const onRemoteTimeout = useCallback(async () => {
    setSessionHealthStatus(SESSION_STATUS.EXPIRED, "inactivity_timeout");
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("paidly_session_expired_reason", "inactivity_timeout");
      } catch {
        // ignore storage errors
      }
      window.location.assign("/login?reason=inactivity");
    }
  }, []);

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
