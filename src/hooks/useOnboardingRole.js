import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { hasSessionAccessToken } from "@/lib/authUserId";
import {
  loadOnboardingContext,
  clearOnboardingContextCache,
  isAdminOnboardingForm,
} from "@/services/OnboardingRoleService";

/**
 * Resolves post-signup onboarding form from Supabase user_company_roles (RPC).
 */
export default function useOnboardingRole() {
  const { authUserId, session, authReady } = useAuth();
  const userId = authUserId || null;
  const tokenReady = authReady !== false && hasSessionAccessToken(session);
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId || !tokenReady) {
      setCtx(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      clearOnboardingContextCache();
      const next = await loadOnboardingContext(userId);
      setCtx(next);
    } catch (e) {
      setError(e?.message || String(e));
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [userId, tokenReady]);

  useEffect(() => {
    if (!userId || !tokenReady) {
      clearOnboardingContextCache();
      setCtx(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [refresh, userId, tokenReady]);

  return useMemo(
    () => ({
      loading,
      error,
      ctx,
      onboardingForm: ctx?.onboardingForm ?? "admin",
      isAdminOnboarding: isAdminOnboardingForm(ctx),
      isOrgOwner: Boolean(ctx?.isOrgOwner),
      companyRole: ctx?.companyRole ?? null,
      refresh,
    }),
    [loading, error, ctx, refresh]
  );
}
