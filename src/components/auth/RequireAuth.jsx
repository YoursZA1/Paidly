import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { createPageUrl } from "@/utils";

export default function RequireAuth({ children, roles }) {
  const { isAuthenticated, loading, user, session } = useAuth();
  const location = useLocation();

  // Keep protected pages interactive when we already have a hydrated user
  // and auth is doing a background session/profile reconciliation.
  if (loading && !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-500">Checking session...</div>
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
