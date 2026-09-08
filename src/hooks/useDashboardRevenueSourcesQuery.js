import { useQuery } from "@tanstack/react-query";
import { PAIDLY_STALE_MS } from "@/lib/paidlyClientCachePolicy";
import {
  dashboardRevenueSourcesQueryKey,
  fetchDashboardRevenueSources,
} from "@/lib/dashboard/listDashboardRevenueSources";

export function useDashboardRevenueSourcesQuery(userId, enabled = true) {
  return useQuery({
    queryKey: dashboardRevenueSourcesQueryKey(userId),
    queryFn: () => fetchDashboardRevenueSources(),
    enabled: Boolean(userId) && enabled,
    staleTime: PAIDLY_STALE_MS.dashboard,
    gcTime: 15 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}
