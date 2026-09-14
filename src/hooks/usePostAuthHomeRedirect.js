import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useTenantRole from "@/hooks/useTenantRole";
import useCompanyContext from "@/hooks/useCompanyContext";
import { staffDashboardHomePath } from "@/lib/staffDashboard";
import { createPageUrl } from "@/utils";
import { isPosTerminalPage } from "@/lib/posNavAccess";
import {
  isWorkforceGenericHomePath,
  resolveWorkforceHomePath,
} from "@/lib/workforceExperience.js";

const REDIRECT_FLAG = "paidly_tenant_home_redirected";

/**
 * After authentication, redirect once per browser session from generic homes.
 * Uses CompanyContext (membership role + job function), not SaaS company_admin.
 * Does not steal deep links such as /Invoices.
 */
export default function usePostAuthHomeRedirect({ enabled = true, posOnlyStaff = false } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { authUserId, loading: authLoading } = useAuth();
  const { loading: tenantLoading, saasRole } = useTenantRole();
  const { loading: companyLoading, ctx } = useCompanyContext();
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

    if (saasRole === "platform_admin") {
      ranRef.current = true;
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

    if (companyLoading) return;

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

    if (!isWorkforceGenericHomePath(location.pathname)) return;

    const target = resolveWorkforceHomePath(ctx);
    if (!target || path === target.toLowerCase()) return;

    try {
      window.sessionStorage.setItem(REDIRECT_FLAG, "1");
    } catch {
      /* ignore */
    }
    navigate(target, { replace: true });
  }, [
    enabled,
    authLoading,
    tenantLoading,
    companyLoading,
    authUserId,
    saasRole,
    ctx,
    location.pathname,
    navigate,
    posOnlyStaff,
  ]);
}
