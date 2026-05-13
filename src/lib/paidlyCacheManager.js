/**
 * Central facade over TanStack Query + existing persistence/dedupe helpers.
 * Prefer this for imperative cache reads/writes outside of hooks when consolidating sync code.
 */
import { getOrCreateAppQueryClient } from "@/lib/query-client";
import { hydrateQueryClientFromIdb } from "@/lib/paidlyIdbQueryPersistence";
import { runDedupedAsync } from "@/lib/inflightRequestDedupe";
import { recordQueryCacheRead, recordQueryInvalidationBatch } from "@/lib/paidlyPerformanceMetrics";

function qc() {
  return getOrCreateAppQueryClient();
}

export const paidlyCacheManager = {
  /**
   * @template T
   * @param {import('@tanstack/react-query').QueryKey} queryKey
   * @returns {T | undefined}
   */
  get(queryKey) {
    const data = qc().getQueryData(queryKey);
    recordQueryCacheRead(data !== undefined);
    return data;
  },

  /**
   * @template T
   * @param {import('@tanstack/react-query').QueryKey} queryKey
   * @param {T} data
   * @param {import('@tanstack/react-query').SetDataOptions} [opts]
   */
  set(queryKey, data, opts) {
    return qc().setQueryData(queryKey, data, opts);
  },

  /**
   * @template T
   * @param {import('@tanstack/react-query').QueryKey} queryKey
   * @param {import('@tanstack/react-query').Updater<T | undefined, T | undefined>} updater
   * @param {import('@tanstack/react-query').SetDataOptions} [opts]
   */
  patch(queryKey, updater, opts) {
    return qc().setQueryData(queryKey, updater, opts);
  },

  /**
   * @param {import('@tanstack/react-query').InvalidateQueryFilters} [filters]
   * @returns {Promise<void>}
   */
  invalidate(filters) {
    recordQueryInvalidationBatch();
    return qc().invalidateQueries(filters ?? {});
  },

  /** Merge Dexie snapshots into the live QueryClient (cold boot). */
  async hydrate() {
    await hydrateQueryClientFromIdb(qc());
  },

  /**
   * Persistence is handled automatically by `createAppQueryClient` (debounced localStorage + IDB).
   * This is a no-op placeholder for explicit “flush now” call sites if added later.
   */
  persist() {
    /* query cache subscriber owns debounced flush */
  },

  /**
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} fn
   */
  dedupe(key, fn) {
    return runDedupedAsync(key, fn);
  },
};
