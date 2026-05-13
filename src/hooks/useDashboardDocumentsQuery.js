import { useQuery } from "@tanstack/react-query";
import {
  dashboardInvoicesQueryKey,
  dashboardPayslipsQueryKey,
  fetchDashboardInvoicesSummary,
  fetchDashboardPayslipsSummary,
} from "@/services/DashboardDataService";
import { PAIDLY_STALE_MS } from "@/lib/paidlyClientCachePolicy";

export function useDashboardInvoicesQuery(userId) {
  return useQuery({
    queryKey: dashboardInvoicesQueryKey(userId),
    queryFn: () => fetchDashboardInvoicesSummary(),
    enabled: Boolean(userId),
    staleTime: PAIDLY_STALE_MS.dashboard,
    gcTime: 15 * 60 * 1000,
    /** Global defaults already disable retries; keep explicit so PostgREST 400 never multiplies requests. */
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}

export function useDashboardPayslipsQuery(userId) {
  return useQuery({
    queryKey: dashboardPayslipsQueryKey(userId),
    queryFn: () => fetchDashboardPayslipsSummary(),
    enabled: Boolean(userId),
    staleTime: PAIDLY_STALE_MS.dashboard,
    gcTime: 15 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}

