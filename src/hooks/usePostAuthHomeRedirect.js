import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useTenantRole from "@/hooks/useTenantRole";
import { staffDashboardHomePath } from "@/lib/staffDashboard";
import { createPageUrl } from "@/utils";
import { isPosTerminalPage } from "@/lib/posNavAccess";

const REDIRECT_FLAG = "paidly_tenant_home_redirected";

/**
 * After authentication, redirect once per browser session to the role-appropriate home.
 * Does not alter login/signup — runs only when mounted on protected shell routes.
 */
export default function usePostAuthHomeRedirect({ enabled = true, posOnlyStaff = false } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { authUserId, loading: authLoading } = useAuth();
  const { loading: tenantLoading, saasRole, homeRoute } = useTenantRole();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || ranRef.current || authLoading || tenantLoading || !authUserId) return;

    try {
      if (typeof window !== "undefined" && window.sessionStorage.getItem(REDIRECT_FLAG) === "1") {
        ranRef.current = true;
        return;
      }
    } catch {
      /* ignore */
    }

    const path = location.pathname.toLowerCase();
    const onAuthPage = /\/(login|signup|forgotpassword|resetpassword|home)(\/|$)/i.test(path);
    if (onAuthPage) return;

    ranRef.current = true;

    if (posOnlyStaff) {
      const posHome = createPageUrl("POS");
      if (!isPosTerminalPage(location.pathname.replace(/^\//, "")) && !path.startsWith("/pos")) {
        try {
          window.sessionStorage.setItem(REDIRECT_FLAG, "1");
        } catch {
          /* ignore */
        }
        navigate(posHome, { replace: true });
      }
      return;
    }

    if (saasRole === "platform_admin") {
      const adminHome = staffDashboardHomePath();
      if (!path.startsWith(adminHome.toLowerCase())) {
        try {
          window.sessionStorage.setItem(REDIRECT_FLAG, "1");
        } catch {
          /* ignore */
        }
        navigate(adminHome, { replace: true });
      }
      return;
    }

    const target = homeRoute || createPageUrl("Dashboard");
    const employeeAlias = createPageUrl("EmployeeDashboard").toLowerCase();
    if (
      saasRole === "employee" &&
      path === createPageUrl("Dashboard").toLowerCase() &&
      employeeAlias !== path
    ) {
      try {
        window.sessionStorage.setItem(REDIRECT_FLAG, "1");
      } catch {
        /* ignore */
      }
      navigate(createPageUrl("EmployeeDashboard"), { replace: true });
    }
  }, [
    enabled,
    authLoading,
    tenantLoading,
    authUserId,
    saasRole,
    homeRoute,
    location.pathname,
    navigate,
    posOnlyStaff,
  ]);
}
