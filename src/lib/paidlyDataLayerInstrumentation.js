/**
 * Low-volume, grep-friendly instrumentation for cache + dedupe + realtime patches.
 * In production, only allowlisted events log (sampled) so observability does not become noise.
 */

const PRODUCTION_DATA_LAYER_EVENTS = new Set([
  "cache_restore_ls",
  "cache_restore_idb",
  "inflight_dedupe_hit",
  "realtime_patch_invoices",
  "realtime_patch_clients",
]);

/** ~1 in 20 in production for high-churn events; always on in dev. */
const PRODUCTION_SAMPLE = 0.05;

function shouldEmitProduction() {
  if (import.meta.env?.DEV) return true;
  return Math.random() < PRODUCTION_SAMPLE;
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
export function paidlyDataLayerLog(event, fields = {}) {
  if (import.meta.env?.VITEST) return;
  const payload = { event, ...fields };
  if (import.meta.env?.DEV) {
    console.info("[PaidlyDataLayer]", payload);
    return;
  }
  if (!PRODUCTION_DATA_LAYER_EVENTS.has(event)) return;
  if (!shouldEmitProduction()) return;
  console.info("[PaidlyDataLayer]", payload);
}
