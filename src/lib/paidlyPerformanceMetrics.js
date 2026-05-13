/**
 * Lightweight client-side performance counters (dev + optional prod sampling via getSnapshot).
 * Not a full APM — complements `[PaidlyDataLayer]` / `[PaidlyRealtime]` logs.
 */

const metrics = {
  inflightDedupeHits: 0,
  realtimeReconnects: 0,
  /** Reads via {@link paidlyCacheManager}.get — for approximate cache hit ratio. */
  cacheReads: 0,
  cacheHits: 0,
  /** Calls to {@link paidlyCacheManager}.invalidate (TanStack invalidations). */
  queryInvalidations: 0,
  /** Rolling window of recent fetch durations (ms). */
  fetchDurationsMs: /** @type {number[]} */ ([]),
};

const FETCH_DURATION_WINDOW = 80;

export function recordInflightDedupeHit() {
  metrics.inflightDedupeHits += 1;
}

export function recordRealtimeReconnect() {
  metrics.realtimeReconnects += 1;
}

/** Record a single HTTP-ish duration sample (e.g. bootstrap round-trip). */
export function recordFetchDurationMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return;
  metrics.fetchDurationsMs.push(n);
  while (metrics.fetchDurationsMs.length > FETCH_DURATION_WINDOW) {
    metrics.fetchDurationsMs.shift();
  }
}

/** @param {boolean} hit */
export function recordQueryCacheRead(hit) {
  metrics.cacheReads += 1;
  if (hit) metrics.cacheHits += 1;
}

export function recordQueryInvalidationBatch() {
  metrics.queryInvalidations += 1;
}

export function getPaidlyPerformanceMetricsSnapshot() {
  const arr = metrics.fetchDurationsMs;
  const sum = arr.reduce((a, b) => a + b, 0);
  const reads = metrics.cacheReads;
  return {
    inflightDedupeHits: metrics.inflightDedupeHits,
    realtimeReconnects: metrics.realtimeReconnects,
    duplicateRequestPreventCount: metrics.inflightDedupeHits,
    fetchSamples: arr.length,
    fetchDurationAvgMs: arr.length ? sum / arr.length : 0,
    fetchDurationP95Ms: arr.length ? percentile(arr, 0.95) : 0,
    cacheReads: reads,
    cacheHitRatio: reads ? metrics.cacheHits / reads : 0,
    queryInvalidations: metrics.queryInvalidations,
    queryFrequencyApprox: metrics.queryInvalidations,
  };
}

function percentile(sortedInput, p) {
  const arr = [...sortedInput].sort((a, b) => a - b);
  if (arr.length === 0) return 0;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))));
  return arr[idx];
}

export function __resetPaidlyPerformanceMetricsForTests() {
  metrics.inflightDedupeHits = 0;
  metrics.realtimeReconnects = 0;
  metrics.cacheReads = 0;
  metrics.cacheHits = 0;
  metrics.queryInvalidations = 0;
  metrics.fetchDurationsMs.length = 0;
}
