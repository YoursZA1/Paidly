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
import { formatCompanyMemberRoleLabel } from "@/lib/companyJobFunctions";
import {
  loadCompanyAccessContext,
  clearCompanyAccessContextCache,
} from "@/services/CompanyContextService";

const CompanyContext = createContext(null);

export function CompanyContextProvider({ children }) {
  const { user, authUserId } = useAuth();
  const userId = authUserId || user?.id || null;
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ invalidateCache = false } = {}) => {
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
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) {
      clearCompanyAccessContextCache();
      setCtx(null);
      setLoading(false);
      setError(null);
    }
  }, [userId]);

  const hasPermission = useCallback(
    (permission) => hasCompanyPermission(ctx, permission),
    [ctx]
  );

  const value = useMemo(
    () => ({
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
      showBusinessDashboard: showBusinessOwnerDashboard(ctx),
      canCreateDocumentType: (typeKey) => canCreateDocumentType(ctx, typeKey),
      canApproveDocument: (docType, docOwnerUserId) =>
        canApproveDocument(ctx, docType, docOwnerUserId),
      dataScope: dataScopeForContext(ctx),
      refresh,
    }),
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
