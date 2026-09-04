import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  hasCompanyPermission,
  canViewEmployee,
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
import { businessTypeIncludesPos } from "@shared/businessType.js";
import { formatCompanyMemberRoleLabel } from "@/lib/companyJobFunctions";
import {
  loadCompanyAccessContext,
  clearCompanyAccessContextCache,
} from "@/services/CompanyContextService";

const CompanyContext = createContext(null);

function companyContextValue({ loading, error, ctx, hasPermission, refresh }) {
  return {
    loading,
    error,
    ctx,
    companyId: ctx?.companyId ?? null,
    companyRole: ctx?.companyRole ?? null,
    companyRoleLabel: formatCompanyMemberRoleLabel(ctx?.companyRole, ctx?.jobFunction),
    jobFunction: ctx?.jobFunction ?? null,
    hasPermission,
    canViewEmployee: (targetUserId) => canViewEmployee(ctx, targetUserId),
    canManageEmployees: () => canManageEmployees(ctx),
    canViewPayroll: () => canViewPayroll(ctx),
    canManageCompany: () => canManageCompany(ctx),
    canApproveLeave: () => canApproveLeave(ctx),
    canViewCompanyReports: () => canViewCompanyReports(ctx),
    isOrgOwner: Boolean(ctx?.isOrgOwner),
    businessType: ctx?.businessType ?? null,
    posEnabled: businessTypeIncludesPos(ctx?.businessType),
    showBusinessDashboard: showBusinessOwnerDashboard(ctx),
    canCreateDocumentType: (typeKey) => canCreateDocumentType(ctx, typeKey),
    canApproveDocument: (docType, docOwnerUserId) =>
      canApproveDocument(ctx, docType, docOwnerUserId),
    dataScope: dataScopeForContext(ctx),
    refresh,
  };
}

export function CompanyContextProvider({ children, forcedContext = null }) {
  const { user, authUserId } = useAuth() || {};
  const userId = forcedContext?.userId || authUserId || user?.id || null;
  const [ctx, setCtx] = useState(forcedContext || null);
  const [loading, setLoading] = useState(Boolean(userId) && !forcedContext);
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ invalidateCache = false } = {}) => {
    if (forcedContext) {
      setCtx(forcedContext);
      setLoading(false);
      setError(null);
      return;
    }
    if (!userId) {
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
  }, [userId, forcedContext]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (forcedContext) return;
    if (!userId) {
      clearCompanyAccessContextCache();
      setCtx(null);
      setLoading(false);
      setError(null);
    }
  }, [userId, forcedContext]);

  const hasPermission = useCallback(
    (permission) => hasCompanyPermission(ctx, permission),
    [ctx]
  );

  const value = useMemo(
    () => companyContextValue({ loading, error, ctx, hasPermission, refresh }),
    [loading, error, ctx, hasPermission, refresh]
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
