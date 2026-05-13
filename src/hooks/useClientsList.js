import { useInfiniteQuery } from "@tanstack/react-query";
import { Client } from "@/api/entities";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { PAIDLY_STALE_MS } from "@/lib/paidlyClientCachePolicy";

const PAGE_SIZE = 40;
const LIST_OPTS = { maxWaitMs: 60000 };
const PER_PAGE_TIMEOUT_MS = 120000;
const PER_PAGE_RETRIES = 1;

async function fetchClientPage(offset) {
  const rows = await withTimeoutRetry(
    () => Client.list("-created_date", { ...LIST_OPTS, limit: PAGE_SIZE, offset }),
    PER_PAGE_TIMEOUT_MS,
    PER_PAGE_RETRIES
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Paginated client list (TanStack Query infinite cache). Same pattern as useInvoices.
 */
export function useClientsList(user) {
  const userId = user?.id ?? null;

  const query = useInfiniteQuery({
    queryKey: ["clients", "list", userId],
    enabled: Boolean(userId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => fetchClientPage(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.length || lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    staleTime: PAIDLY_STALE_MS.clients,
    placeholderData: (previousData) => previousData,
  });

  const clients = query.data?.pages.flat() ?? [];

  return {
    clients,
    loading: query.isPending && !query.data,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
