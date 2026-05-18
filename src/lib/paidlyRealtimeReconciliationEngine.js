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
export function whenDocumentVisible({ maxWaitMs = 120_000 } = {}) {
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
      resolve();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") finish();
    };
    const timeoutId = setTimeout(finish, maxWaitMs);
    document.addEventListener("visibilitychange", onVisibility);
  });
}

/**
 * Defer work until the tab is visible so background tabs do not stack invalidations / fetches.
 * @param {() => void} fn
 * @returns {() => void} cancel
 */
export function runWhenDocumentVisible(fn, { maxWaitMs = 120_000 } = {}) {
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    fn();
    return () => {};
  }
  let cancelled = false;
  const cleanup = () => {
    cancelled = true;
    clearTimeout(timeoutId);
    document.removeEventListener("visibilitychange", onVisibility);
  };
  const onVisibility = () => {
    if (cancelled || document.visibilityState !== "visible") return;
    cleanup();
    try { fn(); } catch { /* ignore */ }
  };
  const timeoutId = setTimeout(cleanup, maxWaitMs);
  document.addEventListener("visibilitychange", onVisibility);
  return cleanup;
}
