import { useInfiniteQuery } from "@tanstack/react-query";
import {
  fetchInvoiceListPage,
  getInvoiceListQueryKey,
  INVOICE_LIST_PAGE_SIZE,
  normalizeInvoiceListFilters,
} from "@/services/InvoiceListService";

/**
 * Paginated invoice list for scale: loads in pages via TanStack Query infinite cache.
 * Replaces unbounded Supabase select("*") — grows with user scroll / explicit refetch only.
 */
export function useInvoices({ userId, filters }) {
  const normalizedFilters = normalizeInvoiceListFilters(filters);

  const query = useInfiniteQuery({
    queryKey: getInvoiceListQueryKey(normalizedFilters, userId),
    enabled: Boolean(userId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      fetchInvoiceListPage(pageParam, normalizedFilters, userId),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.length || lastPage.length < INVOICE_LIST_PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    staleTime: 2 * 60 * 1000,
  });

  const invoices = query.data?.pages.flat() ?? [];

  return {
    invoices,
    loading: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
