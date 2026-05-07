/** Fired after SyncEngine-driven `fetchAll` settles (non-admin) so dashboards can refresh derived state (e.g. business goals). */
export const PAIDLY_APP_FETCH_ALL_SETTLED_EVENT = "paidly:app-fetch-all-settled";

export function dispatchAppFetchAllSettled(detail = {}) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(PAIDLY_APP_FETCH_ALL_SETTLED_EVENT, {
        detail: { source: "sync-engine-realtime", ...detail },
      })
    );
  } catch {
    /* ignore */
  }
}

let adminDashboardRefresh = null;

/**
 * Admin dashboard loads platform aggregates into local React state (`loadAdminData`).
 * Register while the admin dashboard is mounted so SyncEngine can debounce-refetch on DB changes.
 * @param {() => void | Promise<void>} fn
 * @returns {() => void} unregister
 */
export function registerAdminDashboardRealtimeRefresh(fn) {
  adminDashboardRefresh = typeof fn === "function" ? fn : null;
  return () => {
    adminDashboardRefresh = null;
  };
}

export function notifyAdminDashboardRealtimeStale() {
  if (!adminDashboardRefresh) return;
  try {
    const out = adminDashboardRefresh();
    if (out && typeof out.then === "function") void out;
  } catch (e) {
    console.warn("[Paidly][Realtime] admin dashboard refresh failed:", e?.message || e);
  }
}
