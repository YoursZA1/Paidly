/**
 * Low-volume, grep-friendly instrumentation for cache + dedupe + realtime patches.
 * Development only — production consoles must not print `[PaidlyDataLayer]` objects.
 */

/**
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
export function paidlyDataLayerLog(event, fields = {}) {
  if (import.meta.env?.VITEST) return;
  if (!import.meta.env?.DEV) return;
  console.info("[PaidlyDataLayer]", { event, ...fields });
}
