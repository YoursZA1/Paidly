/**
 * IndexedDB persistence for whitelisted TanStack Query snapshots.
 * Complements `localStorage` in `query-client.js` (larger quota, survives tab close the same way,
 * but better for growth). Hydration merges by newest `updatedAt`.
 */
import { getPaidlyIdbKvCache, stableSerializeQueryKey } from "@/lib/paidlyIdbKvCache";
import { shouldPersistReactQueryKey } from "@/lib/paidlyPersistedQueryRootKeys";
import { paidlyDataLayerLog } from "@/lib/paidlyDataLayerInstrumentation";

const QUERY_CACHE_STORAGE_KEY = "paidly_query_cache_v1";
const MIGRATION_FLAG = "paidly_query_idb_migrated_v1";

function shouldPersistQueryKey(queryKey) {
  return shouldPersistReactQueryKey(queryKey);
}

export async function migrateLocalStorageQuerySnapshotsToIdb() {
  const db = getPaidlyIdbKvCache();
  if (!db || typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === "1") return;
    const raw = localStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATION_FLAG, "1");
      return;
    }
    const parsed = JSON.parse(raw);
    const queries = Array.isArray(parsed?.queries) ? parsed.queries : [];
    await db.transaction("rw", db.kv, async () => {
      for (const q of queries) {
        if (!Array.isArray(q?.queryKey)) continue;
        if (!shouldPersistQueryKey(q.queryKey)) continue;
        const key = stableSerializeQueryKey(q.queryKey);
        const updatedAt = Number(q.updatedAt) || Date.now();
        await db.kv.put({
          key,
          payload: { queryKey: q.queryKey, data: q.data, updatedAt },
          updatedAt,
        });
      }
    });
    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    /* ignore malformed / quota */
  }
}

/**
 * Merge IndexedDB snapshots into the QueryClient (newer `updatedAt` wins over existing cache).
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 */
export async function hydrateQueryClientFromIdb(queryClient) {
  const db = getPaidlyIdbKvCache();
  if (!db || !queryClient) return;
  await migrateLocalStorageQuerySnapshotsToIdb();
  let rows;
  try {
    rows = await db.kv.where("key").startsWith("rq:").toArray();
  } catch {
    return;
  }
  let merged = 0;
  for (const row of rows) {
    const p = row?.payload;
    if (!p || !Array.isArray(p.queryKey)) continue;
    if (!shouldPersistQueryKey(p.queryKey)) continue;
    const idbAt = Number(p.updatedAt) || Number(row.updatedAt) || 0;
    const prev = queryClient.getQueryState(p.queryKey);
    const prevAt = Number(prev?.dataUpdatedAt) || 0;
    if (idbAt >= prevAt) {
      queryClient.setQueryData(p.queryKey, p.data, { updatedAt: idbAt });
      merged += 1;
    }
  }
  if (merged > 0) {
    paidlyDataLayerLog("cache_restore_idb", { queries: merged });
  }
}

/**
 * @param {Array<{ queryKey: unknown[], data: unknown, updatedAt: number }>} snapshots
 */
export async function saveReactQuerySnapshotsToIdb(snapshots) {
  const db = getPaidlyIdbKvCache();
  if (!db || !Array.isArray(snapshots)) return;
  try {
    await db.transaction("rw", db.kv, async () => {
      for (const q of snapshots) {
        if (!Array.isArray(q?.queryKey)) continue;
        if (!shouldPersistQueryKey(q.queryKey)) continue;
        const key = stableSerializeQueryKey(q.queryKey);
        const updatedAt = Number(q.updatedAt) || Date.now();
        await db.kv.put({
          key,
          payload: { queryKey: q.queryKey, data: q.data, updatedAt },
          updatedAt,
        });
      }
    });
  } catch {
    /* ignore quota / Safari private mode */
  }
}
