import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { loadTenantContext, clearTenantContextCache } from "@/services/TenantRoleService";

/** SaaS tenant role from user_roles + get_my_tenant_context (post-auth, read-only). */
export default function useTenantRole() {
  const { authUserId } = useAuth();
  const userId = authUserId || null;
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
      clearTenantContextCache();
      const next = await loadTenantContext(userId);
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

  return useMemo(
    () => ({
      loading,
      error,
      ctx,
      saasRole: ctx?.saasRole ?? null,
      isPlatformAdmin: ctx?.saasRole === "platform_admin",
      isCompanyAdmin: ctx?.saasRole === "company_admin",
      isEmployee: ctx?.saasRole === "employee",
      homeRoute: ctx?.homeRoute ?? "/Dashboard",
      refresh,
    }),
    [loading, error, ctx, refresh]
  );
}
