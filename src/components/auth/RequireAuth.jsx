import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createPageUrl } from "@/utils";
import { getAuthUserId } from "@/lib/authUserId";
import AuthBootstrapShell from "@/components/auth/AuthBootstrapShell";

/**
 * Rare edge: Supabase session exists but the app user object has not hydrated yet.
 * Recover with refreshUser instead of rendering protected children with user === null.
 */
function SessionProfileHydrating() {
  const { refreshUser, session } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser, session?.user?.id]);

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), 12_000);
    return () => window.clearTimeout(t);
  }, []);

  if (timedOut) {
    return (
      <Navigate
        to={`${createPageUrl("Home")}#sign-in`}
        replace
      />
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
  const { loading, user, session } = useAuth();
  const location = useLocation();
  const authUserId = getAuthUserId(user);
  const sessionUserId = session?.user?.id ?? null;

  // Keep protected pages interactive when we already have a hydrated user
  // and auth is doing a background session/profile reconciliation.
  if (loading && !authUserId) {
    return <AuthBootstrapShell />;
  }

  // Never render protected routes without a stable app user id (avoids null.id crashes).
  if (!authUserId) {
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
