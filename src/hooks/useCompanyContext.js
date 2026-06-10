import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "@/lib/companyPermissions";
import { formatCompanyMemberRoleLabel } from "@/lib/companyJobFunctions";
import {
  loadCompanyAccessContext,
  clearCompanyAccessContextCache,
} from "@/services/CompanyContextService";

/**
 * React hook for company-scoped RBAC (org tenancy).
 * @returns {{
 *   loading: boolean,
 *   error: string | null,
 *   ctx: import('@/lib/companyPermissions').CompanyAccessContext | null,
 *   companyId: string | null,
 *   companyRole: string | null,
 *   companyRoleLabel: string,
 *   jobFunction: string | null,
 *   hasPermission: (permission: string) => boolean,
 *   canViewEmployee: (targetUserId: string) => boolean,
 *   canManageEmployees: () => boolean,
 *   canViewPayroll: () => boolean,
 *   canManageCompany: () => boolean,
 *   canApproveLeave: () => boolean,
 *   canViewCompanyReports: () => boolean,
 *   dataScope: ReturnType<typeof dataScopeForContext>,
 *   refresh: () => Promise<void>,
 * }}
 */
export function useCompanyContext() {
  const { user, authUserId } = useAuth();
  const userId = authUserId || user?.id || null;
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCtx(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      clearCompanyAccessContextCache();
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

  const hasPermission = useCallback(
    (permission) => hasCompanyPermission(ctx, permission),
    [ctx]
  );

  return useMemo(
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
      dataScope: dataScopeForContext(ctx),
      refresh,
    }),
    [loading, error, ctx, hasPermission, refresh]
  );
}

export default useCompanyContext;
