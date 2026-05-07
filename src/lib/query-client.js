import { QueryClient } from '@tanstack/react-query';

const QUERY_CACHE_STORAGE_KEY = "paidly_query_cache_v1";
const QUERY_CACHE_WRITE_DEBOUNCE_MS = 1200;
const PERSISTED_QUERY_ROOT_KEYS = new Set([
  "invoices",
  "invoice",
  "clients",
  "quotes",
  "cashflow-page",
  "dashboard",
  "dashboard-invoices",
  "dashboard-payslips",
  "admin-settings",
]);

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function shouldPersistQueryKey(queryKey) {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const root = String(queryKey[0] || "");
  return PERSISTED_QUERY_ROOT_KEYS.has(root);
}

function restorePersistedQueryCache(queryClient) {
  if (!canUseBrowserStorage()) return;
  try {
    const raw = window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const queries = Array.isArray(parsed?.queries) ? parsed.queries : [];
    for (const q of queries) {
      if (!Array.isArray(q?.queryKey)) continue;
      queryClient.setQueryData(q.queryKey, q.data, { updatedAt: Number(q.updatedAt) || Date.now() });
    }
  } catch {
    // ignore malformed cache payloads
  }
}

function attachQueryCachePersistence(queryClient) {
  if (!canUseBrowserStorage()) return;
  let writeTimer = null;
  const flush = () => {
    writeTimer = null;
    try {
      const snapshot = queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => shouldPersistQueryKey(q.queryKey) && q.state?.status === "success")
        .map((q) => ({
          queryKey: q.queryKey,
          data: q.state.data,
          updatedAt: q.state.dataUpdatedAt || Date.now(),
        }));
      window.localStorage.setItem(
        QUERY_CACHE_STORAGE_KEY,
        JSON.stringify({ savedAt: Date.now(), queries: snapshot })
      );
    } catch {
      // ignore storage quota/serialization failures
    }
  };

  queryClient.getQueryCache().subscribe(() => {
    if (writeTimer) window.clearTimeout(writeTimer);
    writeTimer = window.setTimeout(flush, QUERY_CACHE_WRITE_DEBOUNCE_MS);
  });
}

/**
 * Single factory for the app QueryClient — same defaults everywhere (dev entry, tests, future SSR).
 * Keeps stale/gc windows aligned with navigation patterns (cache hits when moving between main screens).
 */
export function createAppQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: false,
        /** Tab / window visible again → refetch active queries (staleTime still applies). */
        refetchOnWindowFocus: true,
        refetchOnMount: false,
      },
      mutations: {
        retry: false,
        // Mutations should settle; avoid infinite retry loops that keep buttons “loading”.
      },
    },
  });

  restorePersistedQueryCache(queryClient);
  attachQueryCachePersistence(queryClient);
  return queryClient;
}

let appQueryClient = null;

export function getOrCreateAppQueryClient() {
  if (!appQueryClient) {
    appQueryClient = createAppQueryClient();
  }
  return appQueryClient;
}
