import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createPageUrl } from "@/utils";
import { getAuthUserId } from "@/lib/authUserId";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";
import { Button } from "@/components/ui/button";
import { useSessionHealthStore, isTerminalSessionStatus } from "@/stores/sessionHealthStore";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { authFlowLog } from "@/lib/auth/authFlowLog";
import { isProfileReady } from "@/lib/auth/profileRestorePolicy";

const PROFILE_RESTORE_ATTEMPTS = 3;
const PROFILE_RESTORE_BACKOFF_MS = [400, 800];

/**
 * Rare edge: Supabase session exists but the app user object has not hydrated yet.
 * Recover with refreshUser. A valid session must not be sent back to login.
 */
function SessionProfileHydrating() {
  const { refreshUser, session } = useAuth();
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFailed(false);
      for (let attempt = 0; attempt < PROFILE_RESTORE_ATTEMPTS; attempt++) {
        if (cancelled) return;
        authFlowLog(
          "PROFILE",
          attempt === 0 ? "restoration started" : `retry ${attempt}/${PROFILE_RESTORE_ATTEMPTS}`,
          {
            stage: "SessionProfileHydrating",
            retry: attempt,
          }
        );
        await refreshUser();
        if (cancelled) return;
        const state = useAuthSessionStore.getState();
        if (isProfileReady(state.user, state.profileReady)) return;
        if (attempt < PROFILE_RESTORE_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, PROFILE_RESTORE_BACKOFF_MS[attempt] || 800));
        }
      }
      if (!cancelled) setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
    // Restore once per session user / explicit retry. Do not loop on refreshUser identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, retryKey]);

  if (failed) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Unable to restore your workspace right now. Please try again.
        </p>
        <Button type="button" onClick={() => setRetryKey((n) => n + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col items-center justify-center gap-3">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden
      />
      <div className="text-sm text-muted-foreground">Restoring your profile…</div>
    </div>
  );
}

export default function RequireAuth({ children, roles }) {
  const { loading, user, session, profileReady } = useAuth();
  const location = useLocation();
  const sessionHealthStatus = useSessionHealthStore((s) => s.status);
  const authUserId = getAuthUserId(user);
  const sessionUserId = session?.user?.id ?? null;
  const restored = isProfileReady(user, profileReady);

  if (loading && !authUserId) {
    return <AuthBootstrapShell />;
  }

  if (isTerminalSessionStatus(sessionHealthStatus)) {
    return (
      <Navigate
        to={`${createPageUrl("Home")}#sign-in`}
        replace
        state={{ from: location }}
      />
    );
  }

  // Never render protected routes without a restored profiles query (JWT-only is not enough).
  if (!authUserId || !restored) {
    if (sessionUserId) {
      return <SessionProfileHydrating />;
    }
    return (
      <Navigate
        to={`${createPageUrl("Home")}#sign-in`}
        replace
        state={{ from: location }}
      />
    );
  }

  const normalizedRole = String(user?.role || "").toLowerCase();
  const normalizedAllowed = Array.isArray(roles) ? roles.map((r) => String(r).toLowerCase()) : [];
  if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(normalizedRole)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-slate-800 mb-2">Access restricted</h1>
          <p className="text-sm text-slate-600">You don’t have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
