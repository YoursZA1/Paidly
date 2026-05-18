import { QueryClient } from '@tanstack/react-query';
import {
  PAIDLY_PERSISTED_QUERY_ROOT_KEYS,
  shouldPersistReactQueryKey,
} from '@/lib/paidlyPersistedQueryRootKeys';
import { saveReactQuerySnapshotsToIdb } from '@/lib/paidlyIdbQueryPersistence';
import { PAIDLY_STALE_MS } from '@/lib/paidlyClientCachePolicy';
import { paidlyDataLayerLog } from '@/lib/paidlyDataLayerInstrumentation';

const QUERY_CACHE_STORAGE_KEY = "paidly_query_cache_v1";
const QUERY_CACHE_WRITE_DEBOUNCE_MS = 1200;

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function shouldPersistQueryKey(queryKey) {
  return shouldPersistReactQueryKey(queryKey);
}

function restorePersistedQueryCache(queryClient) {
  if (!canUseBrowserStorage()) return;
  try {
    const raw = window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const queries = Array.isArray(parsed?.queries) ? parsed.queries : [];
    let restored = 0;
    for (const q of queries) {
      if (!Array.isArray(q?.queryKey)) continue;
      if (!shouldPersistQueryKey(q.queryKey)) continue;
      queryClient.setQueryData(q.queryKey, q.data, { updatedAt: Number(q.updatedAt) || Date.now() });
      restored += 1;
    }
    if (restored > 0) {
      paidlyDataLayerLog("cache_restore_ls", { queries: restored });
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
      void saveReactQuerySnapshotsToIdb(snapshot);
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
 * Domain-specific overrides use `PAIDLY_STALE_MS` from `paidlyClientCachePolicy.js`.
 */
export function createAppQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: PAIDLY_STALE_MS.invoices,
        gcTime: Math.max(PAIDLY_STALE_MS.clients * 3, 30 * 60 * 1000),
        retry: false,
        /**
         * Off by default — opt in via queryFocusPolicy.ts for queries that truly need live focus refresh.
         * Prevents focus-time request floods when many stale queries are mounted simultaneously.
         */
        refetchOnWindowFocus: false,
        /**
         * Stale-while-revalidate: keep previous successful data visible while a refetch runs
         * (reduces layout thrash / blocking spinners on navigation).
         */
        placeholderData: (previousData) => previousData,
        /**
         * When a mounted query has cached but stale data, refetch in the background while
         * `placeholderData` keeps the last snapshot on screen.
         */
        refetchOnMount: true,
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

export { PAIDLY_PERSISTED_QUERY_ROOT_KEYS, shouldPersistReactQueryKey };
