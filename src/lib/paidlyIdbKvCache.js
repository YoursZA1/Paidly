/**
 * IndexedDB key-value store for Paidly durable cache (Layer 2).
 * Do not store auth tokens, refresh tokens, or derived sensitive totals here.
 */
import Dexie from "dexie";

const DB_NAME = "paidly_persistent_cache";
const DB_VERSION = 1;

export class PaidlyIdbKvCache extends Dexie {
  /** @type {import("dexie").Table<{ key: string, payload: unknown, updatedAt: number }, string>} */
  kv;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      kv: "&key, updatedAt",
    });
    this.kv = this.table("kv");
  }
}

let singleton = null;

export function getPaidlyIdbKvCache() {
  if (typeof indexedDB === "undefined") return null;
  if (!singleton) singleton = new PaidlyIdbKvCache();
  return singleton;
}

export function stableSerializeQueryKey(queryKey) {
  return `rq:${JSON.stringify(queryKey)}`;
}

/** Vitest: drop singleton + wipe DB so persistence tests start clean. */
export async function __resetPaidlyIdbCacheForTests() {
  singleton = null;
  try {
    if (typeof indexedDB !== "undefined") {
      await Dexie.delete(DB_NAME);
    }
  } catch {
    /* ignore */
  }
}

/** Reserved prefixes for non–React Query blobs (settings, profile snapshot, currency prefs). */
export const PAIDLY_IDB_DOMAIN_PREFIX = {
  profile: "domain:profile:",
  settings: "domain:settings:",
  currency: "domain:currency:",
};

export async function paidlyIdbPutJsonKey(key, body) {
  const db = getPaidlyIdbKvCache();
  if (!db || body === undefined) return;
  const now = Date.now();
  await db.kv.put({
    key: String(key),
    payload: { body, updatedAt: now },
    updatedAt: now,
  });
}

export async function paidlyIdbGetJsonKey(key) {
  const db = getPaidlyIdbKvCache();
  if (!db) return null;
  try {
    const row = await db.kv.get(String(key));
    return row?.payload?.body ?? null;
  } catch {
    return null;
  }
}
