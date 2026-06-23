import { useQuery } from "@tanstack/react-query";
import {
  fetchSelfWorkspaceSummary,
  fetchCompanyWorkspaceSummary,
} from "@/services/MemberDashboardService";
import { PAIDLY_STALE_MS } from "@/lib/paidlyClientCachePolicy";

export function selfWorkspaceQueryKey(userId, companyId) {
  return ["dashboard", "member-self", userId ?? null, companyId ?? null];
}

export function companyWorkspaceQueryKey(companyId) {
  return ["dashboard", "member-company", companyId ?? null];
}

/** The signed-in user's own payslips / leave / documents within their company. */
export function useSelfWorkspaceSummary(userId, companyId) {
  return useQuery({
    queryKey: selfWorkspaceQueryKey(userId, companyId),
    queryFn: () => fetchSelfWorkspaceSummary({ userId, companyId }),
    enabled: Boolean(userId && companyId),
    staleTime: PAIDLY_STALE_MS.dashboard,
    gcTime: 15 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}

/**
 * Company-wide overview (roster + record counts) for managers/admins.
 * Pass `enabled` from the caller's permission check so employees never issue the query.
 */
export function useCompanyWorkspaceSummary(ctx, { enabled = true } = {}) {
  const companyId = ctx?.companyId ?? null;
  return useQuery({
    queryKey: companyWorkspaceQueryKey(companyId),
    queryFn: () => fetchCompanyWorkspaceSummary(ctx),
    enabled: Boolean(companyId) && enabled,
    staleTime: PAIDLY_STALE_MS.dashboard,
    gcTime: 15 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}
