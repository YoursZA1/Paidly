import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";

export default function RequireAuth({ children, roles }) {
  const {
    isAuthenticated,
    loading,
    user,
    session,
    authLoadingTimedOut,
    retryAuthBootstrap,
  } = useAuth();
  const location = useLocation();

  // Keep protected pages interactive when we already have a hydrated user
  // and auth is doing a background session/profile reconciliation.
  if (loading && !user) {
    if (authLoadingTimedOut) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            We could not finish loading your session in time. This is usually a slow connection or a temporary
            server issue.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button type="button" onClick={() => void retryAuthBootstrap()}>
              Try again
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <div className="text-sm text-muted-foreground">Checking session…</div>
      </div>
    );
  }

  if (!isAuthenticated && !session?.user?.id) {
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
