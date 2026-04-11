import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Runs the narrow “protected route + confirmed empty Supabase session” check on navigation,
 * after auth loading settles (see deps). Guests on public routes are untouched.
 */
export default function AuthProtectedRouteInvariant() {
  const location = useLocation();
  const { loading, verifySessionOnProtectedRoute } = useAuth();

  useEffect(() => {
    verifySessionOnProtectedRoute(location.pathname);
  }, [location.pathname, loading, verifySessionOnProtectedRoute]);

  return null;
}
