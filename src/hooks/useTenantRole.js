import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { hasSessionAccessToken } from "@/lib/authUserId";
import { loadTenantContext, clearTenantContextCache } from "@/services/TenantRoleService";

/** SaaS tenant role from user_roles + get_my_tenant_context (post-auth, read-only). */
export default function useTenantRole() {
  const { authUserId, session, authReady } = useAuth();
  const userId = authUserId || null;
  const tokenReady = authReady !== false && hasSessionAccessToken(session);
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState(null);

  const refresh = useCallback(async ({ invalidateCache = false } = {}) => {
    if (!userId || !tokenReady) {
      setCtx(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (invalidateCache) clearTenantContextCache();
    setLoading(true);
    setError(null);
    try {
      const next = await loadTenantContext(userId);
      setCtx(next);
    } catch (e) {
      setError(e?.message || String(e));
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [userId, tokenReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId || !tokenReady) {
      clearTenantContextCache();
      setCtx(null);
      setLoading(false);
      setError(null);
    }
  }, [userId, tokenReady]);

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
