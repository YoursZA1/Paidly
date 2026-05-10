import { trackSessionTelemetry } from "@/lib/sessionTelemetry";

const DEFAULT_DEBOUNCE_MS = 400;

let executor =
  /** @type {null | ((opts: { silent: boolean, sources: string[], bypassThrottle?: boolean }) => Promise<void>)} */ (
    null
  );

let debounceTimer = null;
let mergedSilent = true;
let mergedBypassThrottle = false;
const mergedSources = new Set();

/** Ensures overlapping scheduled + immediate flushes run sequentially. */
let flushTail = Promise.resolve();

export function registerSessionRefreshExecutor(fn) {
  executor = fn;
}

export function unregisterSessionRefreshExecutor() {
  executor = null;
  cancelPendingSessionRefresh();
  flushTail = Promise.resolve();
}

export function cancelPendingSessionRefresh() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  mergedSources.clear();
  mergedSilent = true;
  mergedBypassThrottle = false;
}

async function drainMergedOnce() {
  if (!executor || mergedSources.size === 0) return;
  const silent = mergedSilent;
  const bypassThrottle = mergedBypassThrottle;
  const sources = [...mergedSources];
  mergedSources.clear();
  mergedSilent = true;
  mergedBypassThrottle = false;
  trackSessionTelemetry("session_refresh_scheduler_flush", {
    sources,
    silent,
    bypass_throttle: bypassThrottle,
  });
  await executor({ silent, sources, bypassThrottle });
}

/**
 * Coalesced session resync: Supabase refresh + profile + realtime hint + route invariant (see AuthProvider executor).
 * All initiators (visibility, online, heartbeat, keep-alive, tab sync, etc.) should use this instead of calling
 * `refreshSession` directly for background resync.
 *
 * @param {{ source: string, silent?: boolean, debounceMs?: number }} opts
 */
export function requestSessionRefresh(opts = {}) {
  const { source, silent = true, debounceMs = DEFAULT_DEBOUNCE_MS, bypassThrottle = false } = opts;
  if (!executor || !source) return;

  if (bypassThrottle) mergedBypassThrottle = true;
  mergedSilent = mergedSources.size === 0 ? silent : mergedSilent && silent;
  mergedSources.add(source);

  if (debounceMs <= 0) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    flushTail = flushTail.then(() => drainMergedOnce());
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushTail = flushTail.then(() => drainMergedOnce());
  }, debounceMs);
}

/**
 * Same pipeline as {@link requestSessionRefresh}, but runs after cancelling any pending debounce (merges pending sources).
 *
 * @param {{ source: string, silent?: boolean }} opts
 * @returns {Promise<void>}
 */
export async function runSessionRefreshNow(opts = {}) {
  const { source, silent = true, bypassThrottle = false } = opts;
  if (!executor || !source) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (bypassThrottle) mergedBypassThrottle = true;
  mergedSilent = mergedSources.size === 0 ? silent : mergedSilent && silent;
  mergedSources.add(source);
  flushTail = flushTail.then(() => drainMergedOnce());
  await flushTail;
}
