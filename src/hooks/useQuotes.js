import { useInfiniteQuery } from "@tanstack/react-query";
import { Quote } from "@/api/entities";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";

const PAGE_SIZE = 40;
const LIST_OPTS = { maxWaitMs: 60000 };
const PER_PAGE_TIMEOUT_MS = 120000;
const PER_PAGE_RETRIES = 1;

async function fetchQuotePage(offset) {
  const rows = await withTimeoutRetry(
    () => Quote.list("-created_date", { ...LIST_OPTS, limit: PAGE_SIZE, offset }),
    PER_PAGE_TIMEOUT_MS,
    PER_PAGE_RETRIES
  );
  return Array.isArray(rows) ? rows : [];
}

/**
 * Paginated quotes list for the Quotes page (TanStack Query infinite cache).
 */
export function useQuotes(user) {
  const userId = user?.id ?? null;

  const query = useInfiniteQuery({
    queryKey: ["quotes", "list", userId],
    enabled: Boolean(userId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => fetchQuotePage(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.length || lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    staleTime: 2 * 60 * 1000,
  });

  const quotes = query.data?.pages.flat() ?? [];

  return {
    quotes,
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
