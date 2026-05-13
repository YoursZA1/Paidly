/**
 * Prefetch TanStack Query data for main nav targets so the next route feels instant (SWR + warm cache).
 */
import { Client } from "@/api/entities";
import {
  dashboardInvoicesQueryKey,
  dashboardPayslipsQueryKey,
  fetchDashboardInvoicesSummary,
  fetchDashboardPayslipsSummary,
} from "@/services/DashboardDataService";
import {
  fetchInvoiceListPage,
  getInvoiceListQueryKey,
  INVOICE_LIST_PAGE_SIZE,
  normalizeInvoiceListFilters,
} from "@/services/InvoiceListService";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";
import { PAIDLY_STALE_MS } from "@/lib/paidlyClientCachePolicy";

const CLIENT_LIST_PAGE_SIZE = 40;
const CLIENT_LIST_OPTS = { maxWaitMs: 60000 };
const CLIENT_PAGE_TIMEOUT_MS = 120000;
const CLIENT_PAGE_RETRIES = 1;

async function fetchClientListPage(offset) {
  const rows = await withTimeoutRetry(
    () => Client.list("-created_date", { ...CLIENT_LIST_OPTS, limit: CLIENT_LIST_PAGE_SIZE, offset }),
    CLIENT_PAGE_TIMEOUT_MS,
    CLIENT_PAGE_RETRIES
  );
  return Array.isArray(rows) ? rows : [];
}

const lastPrefetchAt = new Map();
const PREFETCH_COOLDOWN_MS = 2500;

function shouldThrottle(navId) {
  const now = Date.now();
  const prev = lastPrefetchAt.get(navId) || 0;
  if (now - prev < PREFETCH_COOLDOWN_MS) return true;
  lastPrefetchAt.set(navId, now);
  return false;
}

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string | null} userId
 */
function prefetchDashboard(queryClient, userId) {
  if (!userId) return;
  void queryClient.prefetchQuery({
    queryKey: dashboardInvoicesQueryKey(userId),
    queryFn: () => fetchDashboardInvoicesSummary(),
    staleTime: PAIDLY_STALE_MS.dashboard,
  });
  void queryClient.prefetchQuery({
    queryKey: dashboardPayslipsQueryKey(userId),
    queryFn: () => fetchDashboardPayslipsSummary(),
    staleTime: PAIDLY_STALE_MS.dashboard,
  });
}

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string | null} userId
 */
function prefetchInvoicesList(queryClient, userId) {
  if (!userId) return;
  const filters = normalizeInvoiceListFilters({});
  const queryKey = getInvoiceListQueryKey(filters, userId);
  void queryClient.prefetchInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => fetchInvoiceListPage(pageParam, filters, userId),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.length || lastPage.length < INVOICE_LIST_PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    staleTime: PAIDLY_STALE_MS.invoices,
  });
}

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string | null} userId
 */
function prefetchClientsList(queryClient, userId) {
  if (!userId) return;
  void queryClient.prefetchInfiniteQuery({
    queryKey: ["clients", "list", userId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => fetchClientListPage(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.length || lastPage.length < CLIENT_LIST_PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    staleTime: PAIDLY_STALE_MS.clients,
  });
}

/**
 * Hover / focus prefetch for primary sidebar routes.
 * @param {{ navId?: string, userId?: string | null, queryClient?: import("@tanstack/react-query").QueryClient | null }} ctx
 */
export function schedulePrimaryNavPrefetch(ctx) {
  const navId = ctx?.navId;
  const userId = ctx?.userId ?? null;
  const queryClient = ctx?.queryClient;
  if (!navId || !userId || !queryClient) return;
  if (shouldThrottle(navId)) return;

  try {
    if (navId === "nav-dashboard") {
      prefetchDashboard(queryClient, userId);
      return;
    }
    if (navId === "nav-invoices") {
      prefetchInvoicesList(queryClient, userId);
      return;
    }
    if (navId === "nav-clients") {
      prefetchClientsList(queryClient, userId);
      return;
    }
  } catch {
    /* ignore prefetch failures */
  }
}

export function __resetNavPrefetchThrottleForTests() {
  lastPrefetchAt.clear();
}
