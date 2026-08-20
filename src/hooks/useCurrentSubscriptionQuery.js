import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getFocusPolicy } from "@/core/query/queryFocusPolicy";
import { fetchSubscriptionCurrent } from "@/services/subscriptionCheckoutService";

export const SUBSCRIPTION_CURRENT_QUERY_ROOT = "subscription-current";

/**
 * Authoritative SaaS subscription row for dashboard display.
 * Never persisted to localStorage. Does not grant access — server entitlements do that.
 */
export function useCurrentSubscriptionQuery({ enabled = true } = {}) {
  const { user } = useAuth();
  const userId = user?.supabase_id || user?.auth_id || user?.id || null;

  return useQuery({
    queryKey: [SUBSCRIPTION_CURRENT_QUERY_ROOT, userId],
    queryFn: () => fetchSubscriptionCurrent(),
    enabled: Boolean(enabled && userId),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnMount: true,
    refetchOnReconnect: true,
    ...getFocusPolicy(SUBSCRIPTION_CURRENT_QUERY_ROOT),
  });
}
