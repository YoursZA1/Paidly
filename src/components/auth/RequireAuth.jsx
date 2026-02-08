import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { createPageUrl } from "@/utils";

export default function RequireAuth({ children, roles }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-500">Checking session...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={createPageUrl("Login")}
        replace
        state={{ from: location }}
      />
    );
  }

  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
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
