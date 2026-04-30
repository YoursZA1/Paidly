import { useQuery } from "@tanstack/react-query";
import {
  dashboardInvoicesQueryKey,
  dashboardPayslipsQueryKey,
  fetchDashboardInvoicesSummary,
  fetchDashboardPayslipsSummary,
} from "@/services/DashboardDataService";

export function useDashboardInvoicesQuery(userId) {
  return useQuery({
    queryKey: dashboardInvoicesQueryKey(userId),
    queryFn: () => fetchDashboardInvoicesSummary(),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useDashboardPayslipsQuery(userId) {
  return useQuery({
    queryKey: dashboardPayslipsQueryKey(userId),
    queryFn: () => fetchDashboardPayslipsSummary(),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

