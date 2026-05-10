/**
 * Targeted Supabase Realtime recovery after auth/token refresh or tab wake.
 * Handlers rebuild only their own channel — never removeAllChannels().
 */

/** Stable ids for {@link requestRealtimeRecoveryAfterAuth} `only` filter. */
export const REALTIME_RECOVERY_IDS = {
  /** Main app postgres_changes fan-out (SyncEngine). */
  SYNC_ENGINE: "paidly-sync-realtime",
};

/** @typedef {{ reason: string }} RealtimeRecoveryContext */

/** @type {Map<string, (ctx: RealtimeRecoveryContext) => void | Promise<void>>} */
const handlers = new Map();

let debounceTimer = null;
const DEBOUNCE_MS = 120;

/**
 * @param {string} id — stable id e.g. paidly-sync-realtime, hook:auth-profile-updates
 * @param {(ctx: RealtimeRecoveryContext) => void | Promise<void>} fn
 * @returns {() => void} unregister
 */
export function registerRealtimeRecoveryHandler(id, fn) {
  handlers.set(id, fn);
  return () => {
    handlers.delete(id);
  };
}

function runAll(reason, only) {
  for (const [hid, fn] of handlers) {
    if (only && !only.includes(hid)) continue;
    try {
      void Promise.resolve(fn({ reason }));
    } catch (e) {
      if (import.meta.env?.DEV) {
        console.warn("[RealtimeRecovery] handler error", hid, e?.message || e);
      }
    }
  }
}

/**
 * Run recovery handlers now (no debounce) and await async work. Use after auth is valid so socket rebuild can finish before UI unlock.
 *
 * @param {string} reason
 * @param {{ only?: string[] }} [opts]
 * @returns {Promise<void>}
 */
export async function awaitRealtimeRecoveryHandlers(reason, opts = {}) {
  if (typeof window === "undefined") return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const only = opts.only;
  const tasks = [];
  for (const [hid, fn] of handlers) {
    if (only && !only.includes(hid)) continue;
    tasks.push(
      Promise.resolve()
        .then(() => fn({ reason }))
        .catch((e) => {
          if (import.meta.env?.DEV) {
            console.warn("[RealtimeRecovery] handler error", hid, e?.message || e);
          }
        })
    );
  }
  await Promise.all(tasks);
}

/**
 * Coalesces bursts from TOKEN_REFRESHED + visibility + pageshow + session resync.
 *
 * @param {string} reason
 * @param {{ only?: string[] }} [opts] — limit to specific handler ids (tests / special cases)
 */
export function requestRealtimeRecoveryAfterAuth(reason, opts = {}) {
  if (typeof window === "undefined") return;
  const only = opts.only;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    runAll(reason, only);
  }, DEBOUNCE_MS);
}

/**
 * Same health check + targeted rebuild as the SyncEngine recovery hook, without touching other channels.
 * Prefer {@link requestRealtimeRecoveryAfterAuth} for global post-auth wake.
 */
export function reconnectPaidlySyncRealtimeOnly(reason = "manual") {
  requestRealtimeRecoveryAfterAuth(reason, { only: [REALTIME_RECOVERY_IDS.SYNC_ENGINE] });
}

/** @internal Vitest only — module-level handler map has no production reset. */
export function __clearRealtimeRecoveryRegistryForTests() {
  handlers.clear();
  if (debounceTimer && typeof window !== "undefined") {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}
