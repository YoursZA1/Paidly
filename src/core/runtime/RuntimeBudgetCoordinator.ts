/**
 * Runtime budget coordinator: prevents runaway invalidation cascades and
 * reconnect storms by coalescing, throttling, and budgeting runtime work.
 *
 * Complements (does not replace) the existing layered systems:
 *   - RequestCoordinator  — HTTP concurrency + pause gate
 *   - paidlyRealtimeManager — WebSocket reconnect backoff + circuit breakers
 *   - RefreshQueue         — single-flight auth refresh mutex
 *   - authReconnectEscalation — reconnect ladder with fatal cutoff
 *
 * This coordinator adds:
 *   1. Invalidation deduplication: suppress duplicate invalidation keys within
 *      a coalesce window so bursts of realtime events don't stack refetches.
 *   2. Focus recovery budget: cap how many queries are simultaneously refetched
 *      when the tab regains focus (prevents focus-time request floods).
 *   3. Reconnect throttle: shared cross-path counter that signals when the
 *      runtime has exceeded a safe reconnect rate.
 */

import type { QueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Invalidation deduplication
// ---------------------------------------------------------------------------

const COALESCE_WINDOW_MS = 300;

type InvalidationEntry = {
  timer: ReturnType<typeof setTimeout>;
  scheduledAt: number;
};

const _pending = new Map<string, InvalidationEntry>();

/**
 * Coalesced invalidation: if the same key is invalidated multiple times within
 * `COALESCE_WINDOW_MS`, only one actual invalidateQueries call fires.
 *
 * @param queryClient TanStack QueryClient
 * @param queryKey    Exact key passed to invalidateQueries
 * @param exact       Whether to match exactly (default false)
 */
export function scheduleInvalidation(
  queryClient: QueryClient,
  queryKey: unknown[],
  exact = false
): void {
  const dedupeKey = JSON.stringify(queryKey);
  const existing = _pending.get(dedupeKey);
  if (existing) {
    return; // already scheduled within the window
  }
  const timer = setTimeout(() => {
    _pending.delete(dedupeKey);
    queryClient.invalidateQueries({ queryKey, exact });
  }, COALESCE_WINDOW_MS);
  _pending.set(dedupeKey, { timer, scheduledAt: Date.now() });
}

/** Cancel all pending coalesced invalidations (e.g. on sign-out). */
export function cancelAllPendingInvalidations(): void {
  for (const { timer } of _pending.values()) {
    clearTimeout(timer);
  }
  _pending.clear();
}

// ---------------------------------------------------------------------------
// Focus recovery budget
// ---------------------------------------------------------------------------

/**
 * Max queries that may refetch simultaneously on tab focus.
 * TanStack Query already fires refetches sequentially per its internal
 * scheduler, but this budget prevents an entire stale cache from slamming
 * the server at once when a long-absent tab comes back.
 */
const FOCUS_REFETCH_BUDGET = 8;
let _focusRefetchCount = 0;
let _focusResetTimer: ReturnType<typeof setTimeout> | null = null;
const FOCUS_BUDGET_RESET_MS = 3_000;

/**
 * Returns true if a focus-triggered refetch is within budget.
 * Call before initiating a focus-driven refetch to avoid request floods.
 */
export function consumeFocusRefetchBudget(): boolean {
  if (_focusRefetchCount >= FOCUS_REFETCH_BUDGET) return false;
  _focusRefetchCount += 1;
  if (_focusResetTimer == null) {
    _focusResetTimer = setTimeout(() => {
      _focusRefetchCount = 0;
      _focusResetTimer = null;
    }, FOCUS_BUDGET_RESET_MS);
  }
  return true;
}

export function resetFocusRefetchBudget(): void {
  _focusRefetchCount = 0;
  if (_focusResetTimer != null) {
    clearTimeout(_focusResetTimer);
    _focusResetTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Reconnect rate tracking
// ---------------------------------------------------------------------------

const RECONNECT_RATE_WINDOW_MS = 60_000;
const RECONNECT_RATE_MAX = 15;
let _reconnectTimestamps: number[] = [];

/**
 * Record a reconnect attempt and return whether the rate budget allows it.
 * Returns false when the app has exceeded RECONNECT_RATE_MAX in the last minute.
 */
export function recordAndCheckReconnectRate(): boolean {
  const now = Date.now();
  _reconnectTimestamps = _reconnectTimestamps.filter((t) => now - t <= RECONNECT_RATE_WINDOW_MS);
  if (_reconnectTimestamps.length >= RECONNECT_RATE_MAX) return false;
  _reconnectTimestamps.push(now);
  return true;
}

export function resetReconnectRateTracking(): void {
  _reconnectTimestamps = [];
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export function getRuntimeBudgetSnapshot() {
  return {
    pendingInvalidations: _pending.size,
    focusRefetchCount: _focusRefetchCount,
    reconnectCount: _reconnectTimestamps.length,
  };
}
