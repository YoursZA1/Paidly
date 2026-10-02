import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { hasSessionAccessToken } from "@/lib/authUserId";
import {
  hasCompanyPermission,
  canViewEmployee,
  canViewEmployeeProfile,
  canManageEmployees,
  canViewPayroll,
  canManageCompany,
  canApproveLeave,
  canViewCompanyReports,
  dataScopeForContext,
  showBusinessOwnerDashboard,
  canCreateDocumentType,
  canApproveDocument,
} from "@/lib/companyPermissions";
import { businessTypeIncludesPos, businessTypeIncludesRestaurant, businessTypeSellsServicesAtTill } from "@shared/businessType.js";
import { formatCompanyMemberRoleLabel } from "@/lib/companyJobFunctions";
import {
  loadCompanyAccessContext,
  clearCompanyAccessContextCache,
} from "@/services/CompanyContextService";
import { getActivePortalSlug, PORTAL_CHANGED_EVENT } from "@/lib/workforcePortal/portalState.js";

const CompanyContext = createContext(null);

function companyContextValue({ loading, error, ctx, hasPermission, refresh, portalSlug }) {
  return {
    loading,
    error,
    ctx,
    companyId: ctx?.companyId ?? null,
    membershipId: ctx?.membershipId ?? null,
    companyRole: ctx?.companyRole ?? null,
    companyRoleLabel: formatCompanyMemberRoleLabel(ctx?.companyRole, ctx?.jobFunction),
    jobFunction: ctx?.jobFunction ?? null,
    hasPermission,
    canViewEmployee: (targetUserId) => canViewEmployee(ctx, targetUserId),
    canViewEmployeeProfile: (employeeMembershipId) => canViewEmployeeProfile(ctx, employeeMembershipId),
    canManageEmployees: () => canManageEmployees(ctx),
    canViewPayroll: () => canViewPayroll(ctx),
    canManageCompany: () => canManageCompany(ctx),
    canApproveLeave: () => canApproveLeave(ctx),
    canViewCompanyReports: () => canViewCompanyReports(ctx),
    isOrgOwner: Boolean(ctx?.isOrgOwner),
    businessType: ctx?.businessType ?? null,
    posEnabled: businessTypeIncludesPos(ctx?.businessType),
    // Floor plan, tables and kitchen — Restaurant / café / bar only.
    restaurantEnabled: businessTypeIncludesRestaurant(ctx?.businessType),
    // Services on the till alongside products — Mixed only.
    sellsServicesAtTill: businessTypeSellsServicesAtTill(ctx?.businessType),
    // Inside /employee/<slug>: business-owner screens only if they own THAT business; unresolved → closed.
    showBusinessDashboard: portalSlug ? Boolean(ctx?.isOrgOwner) : showBusinessOwnerDashboard(ctx),
    /** Employee portal this tab is in ("" = the user's default business context). */
    portalSlug,
    canCreateDocumentType: (typeKey) => canCreateDocumentType(ctx, typeKey),
    canApproveDocument: (docType, docOwnerUserId) =>
      canApproveDocument(ctx, docType, docOwnerUserId),
    dataScope: dataScopeForContext(ctx),
    refresh,
  };
}

export function CompanyContextProvider({ children, forcedContext = null }) {
  const { user, authUserId, session, authReady } = useAuth() || {};
  const userId = forcedContext?.userId || authUserId || user?.id || null;
  const tokenReady = Boolean(forcedContext) || (authReady !== false && hasSessionAccessToken(session));
  const [ctx, setCtx] = useState(forcedContext || null);
  const [loading, setLoading] = useState(Boolean(userId) && !forcedContext);
  const [error, setError] = useState(null);
  const [portalSlug, setPortalSlug] = useState(() => getActivePortalSlug());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onChange = () => setPortalSlug(getActivePortalSlug());
    window.addEventListener(PORTAL_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PORTAL_CHANGED_EVENT, onChange);
  }, []);

  const refresh = useCallback(async ({ invalidateCache = false } = {}) => {
    if (forcedContext) {
      setCtx(forcedContext);
      setLoading(false);
      setError(null);
      return;
    }
    if (!userId || !tokenReady) {
      setCtx(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (invalidateCache) clearCompanyAccessContextCache();
    setLoading(true);
    setError(null);
    try {
      const next = await loadCompanyAccessContext(userId);
      setCtx(next);
    } catch (e) {
      setError(e?.message || String(e));
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [userId, forcedContext, tokenReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (forcedContext) return;
    if (!userId || !tokenReady) {
      clearCompanyAccessContextCache();
      setCtx(null);
      setLoading(false);
      setError(null);
    }
  }, [userId, forcedContext, tokenReady]);

  const hasPermission = useCallback(
    (permission) => hasCompanyPermission(ctx, permission),
    [ctx]
  );

  const value = useMemo(
    () => companyContextValue({ loading, error, ctx, hasPermission, refresh, portalSlug }),
    [loading, error, ctx, hasPermission, refresh, portalSlug]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

/** @returns {ReturnType<typeof CompanyContextProvider> extends never ? never : import('@/hooks/useCompanyContext').CompanyContextValue} */
export function useCompanyContext() {
  const value = useContext(CompanyContext);
  if (!value) {
    throw new Error("useCompanyContext must be used within CompanyContextProvider");
  }
  return value;
}

export default useCompanyContext;
