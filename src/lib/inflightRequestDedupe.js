/**
 * Coalesce concurrent identical async work (same string key) into a single in-flight promise.
 * TanStack Query already dedupes per `queryKey`; use this for raw `Entity.*.list()` wrappers,
 * dashboard bootstrap, and other imperative callers that can fire in parallel with the same parameters.
 */
import { paidlyDataLayerLog } from "@/lib/paidlyDataLayerInstrumentation";
import { recordInflightDedupeHit } from "@/lib/paidlyPerformanceMetrics";

const inflight = new Map();

/** Debug / diagnostics — number of distinct keys currently sharing one in-flight promise. */
export function inflightDedupeSize() {
  return inflight.size;
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function runDedupedAsync(key, fn) {
  const k = String(key);
  if (inflight.has(k)) {
    recordInflightDedupeHit();
    const prefix = k.includes(":") ? k.slice(0, k.indexOf(":")) : k.slice(0, 48);
    paidlyDataLayerLog("inflight_dedupe_hit", { keyKind: prefix });
    return /** @type {Promise<T>} */ (inflight.get(k));
  }
  const p = Promise.resolve()
    .then(() => fn())
    .finally(() => {
      inflight.delete(k);
    });
  inflight.set(k, p);
  return /** @type {Promise<T>} */ (p);
}

export function __resetInflightDedupeForTests() {
  inflight.clear();
}
