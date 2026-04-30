import { useEffect, useMemo, useState } from "react";
import {
  SESSION_STATUS,
  useSessionHealthStore,
  setSessionHealthStatus,
} from "@/stores/sessionHealthStore";
import { useAuth } from "@/contexts/AuthContext";
import { isPathAllowedWithoutSession } from "@/utils/sessionGuard";
import Button from "@/components/ui/button";
import { consumePendingAction, hasPendingAction } from "@/lib/pendingActionQueue";

export default function SessionExpiredModal() {
  const status = useSessionHealthStore((s) => s.status);
  const reason = useSessionHealthStore((s) => s.reason);
  const { refreshSession, login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [resumeNotice, setResumeNotice] = useState("");
  const [inactivityNotice, setInactivityNotice] = useState("");

  const shouldShow = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (status !== SESSION_STATUS.EXPIRED) return false;
    return !isPathAllowedWithoutSession(window.location.pathname);
  }, [status]);

  const handleReconnect = async () => {
    setBusy(true);
    setSessionHealthStatus(SESSION_STATUS.RECONNECTING);
    try {
      const ok = await refreshSession();
      if (!ok) {
        window.location.assign("/login");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleInlineLogin = async () => {
    if (!email.trim() || !password) {
      setFormError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await login({ email: email.trim().toLowerCase(), password });
      setSessionHealthStatus(SESSION_STATUS.CONNECTED, "reauthenticated");
      if (hasPendingAction()) {
        try {
          await consumePendingAction();
          setResumeNotice("Previous action resumed.");
        } catch {
          setResumeNotice("Signed in. Please retry your last action.");
        }
      } else {
        setResumeNotice("");
      }
      setPassword("");
    } catch (err) {
      setFormError(err?.message || "Unable to sign in. Please try again.");
      setSessionHealthStatus(SESSION_STATUS.EXPIRED, "reauth_failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reasonFromQuery = new URLSearchParams(window.location.search).get("reason");
    const reasonFromStorage = window.sessionStorage.getItem("paidly_session_expired_reason");
    if (reasonFromQuery === "inactivity" || reasonFromStorage === "inactivity_timeout") {
      setInactivityNotice("Session expired due to inactivity");
      try {
        window.sessionStorage.removeItem("paidly_session_expired_reason");
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (status !== SESSION_STATUS.EXPIRED) {
      setBusy(false);
      setFormError("");
      setPassword("");
      setResumeNotice("");
    }
  }, [status]);

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">Session expired</h2>
        {inactivityNotice ? (
          <div className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {inactivityNotice}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setInactivityNotice("")}
              aria-label="Dismiss inactivity notice"
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">
          Your session needs to be reconnected. Sign in below to continue exactly where you left off.
        </p>
        {reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {reason}</p> : null}
        <div className="mt-4 space-y-2">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          {formError ? <p className="text-xs text-red-500">{formError}</p> : null}
          {resumeNotice ? <p className="text-xs text-primary">{resumeNotice}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => window.location.assign("/login")} disabled={busy}>
            Go to login
          </Button>
          <Button variant="outline" onClick={() => void handleReconnect()} disabled={busy}>
            {busy ? "Reconnecting…" : "Reconnect"}
          </Button>
          <Button onClick={() => void handleInlineLogin()} disabled={busy}>
            {busy ? "Signing in…" : "Sign in here"}
          </Button>
        </div>
      </div>
    </div>
  );
}

