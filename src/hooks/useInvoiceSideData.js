import { useQuery } from "@tanstack/react-query";
import { fetchInvoiceSideData } from "@/services/InvoiceListService";

export function useInvoiceSideData(userId, options = {}) {
  const { enabled = false, staleTime = 5 * 60 * 1000 } = options;
  const query = useQuery({
    queryKey: ["invoices", "side-data", userId ?? null],
    enabled: Boolean(userId) && Boolean(enabled),
    queryFn: () => fetchInvoiceSideData({ onMount: true }),
    staleTime,
  });

  return {
    payments: query.data?.payments ?? [],
    invoiceViews: query.data?.invoiceViews ?? [],
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
