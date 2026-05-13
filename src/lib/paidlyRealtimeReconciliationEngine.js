/**
 * Central tuning + helpers for SyncEngine realtime → cache reconciliation.
 * Patch-first paths live in `realtimeInvoiceReconciliation.js` / `realtimeClientReconciliation.js`.
 */

/** Coalesce bursty postgres_changes per table before touching React Query / Zustand. */
export const REALTIME_ENTITY_DEBOUNCE_MS = 900;

/** Debounce global `fetchAll` when realtime cannot patch-only reconcile. */
export const REALTIME_GLOBAL_STORE_REFRESH_DEBOUNCE_MS = 2200;

/**
 * Resolve when the tab becomes visible (or immediately if already visible / no DOM).
 */
export function whenDocumentVisible({ pollMs = 600, maxWaitMs = 120_000 } = {}) {
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - started > maxWaitMs) {
        window.clearInterval(id);
        resolve();
        return;
      }
      if (document.visibilityState !== "visible") return;
      window.clearInterval(id);
      resolve();
    }, pollMs);
  });
}

/**
 * Defer work until the tab is visible so background tabs do not stack invalidations / fetches.
 * @param {() => void} fn
 * @returns {() => void} cancel
 */
export function runWhenDocumentVisible(fn, { pollMs = 600, maxWaitMs = 120_000 } = {}) {
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    fn();
    return () => {};
  }
  const started = Date.now();
  const id = window.setInterval(() => {
    if (Date.now() - started > maxWaitMs) {
      window.clearInterval(id);
      return;
    }
    if (document.visibilityState !== "visible") return;
    window.clearInterval(id);
    try {
      fn();
    } catch {
      /* ignore */
    }
  }, pollMs);
  return () => window.clearInterval(id);
}
