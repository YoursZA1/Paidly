# Paidly — Request Budgeting Strategy

> Updated: 2026-05-18

---

## Goals

1. **Pause non-critical HTTP** during auth recovery and transport reconnect.
2. **Deduplicate inflight identical requests** — one promise per key.
3. **Cap concurrency** — fairness on slow mobile connections.
4. **Bound retries** — exponential backoff + jitter; no infinite chains.

---

## Implementation

### `RequestCoordinator` (`src/core/network/RequestCoordinator.ts`)

| Method | Behavior |
|--------|---------|
| `shouldPause()` | Reads `RuntimeCoordinator.pauseNonCriticalRequests` |
| `waitUntilUnpaused(maxWaitMs?)` | **Event-driven** Zustand subscription (not polling). Resolves when `pauseNonCriticalRequests` clears or timeout elapses (default 120s) |
| `withSlot(fn)` | Waits until paused clears, then acquires one of `maxConcurrent` (6) slots |
| `dedupe(key, fn)` | If a promise for `key` is already inflight, returns it. Otherwise starts a new one via `withSlot` |

**Singleton:** `src/core/network/sharedRequestCoordinator.js` → `getSharedRequestCoordinator()`.

### `retryWithBudget` (`src/core/network/RequestCoordinator.ts`)

```ts
retryWithBudget(fn, {
  maxAttempts: 3,
  isRetryable: (err) => isTransientError(err),
  baseDelayMs: 400,   // default; doubles per attempt + jitter(0–200ms)
})
```

**Behavior:** exponential backoff + jitter (`base × 2^attempt + rand(0, 200ms)`). Throws on the final attempt.

---

## Pause Gate Flow

```
RuntimeCoordinator phase change
  │
  └── pauseNonCriticalRequests = true  (BOOTING | AUTH_RECOVERING | RECONNECTING)
        │
        └── RequestCoordinator.waitUntilUnpaused()
              └── Zustand subscription fires when pauseNonCriticalRequests → false
                    │
                    └── HTTP request proceeds
```

**Non-silent refresh only:** The pause gate activates on non-silent `report_refresh_starting` signals. Background heartbeat / visibility / bfcache refreshes do not pause the gate (by design — they should not stall data fetches for 3s on every tab focus).

---

## Inflight Deduplication

Two systems exist; use consistently:

| System | File | Scope |
|--------|------|-------|
| `RequestCoordinator.dedupe(key, fn)` | `src/core/network/RequestCoordinator.ts` | Per-coordinator, uses concurrency slot |
| `runDedupedAsync(key, fn)` | `src/lib/inflightRequestDedupe.js` | Global module-level dedup, no concurrency limit |

**Use `RequestCoordinator.dedupe`** for new code. `runDedupedAsync` is used in `useInvoicesQuery` for legacy compatibility.

---

## Axios Backend Resilience

`src/api/installBackendApiResilience.js` adds:
- Retry on idempotent methods (GET, HEAD, OPTIONS) for transient errors
- **No retry on mutations** (POST/PUT/PATCH/DELETE)
- **No retry on 429** for mutations (avoids amplifying rate-limit hits)
- One retry on GET 429 only

This is separate from `RequestCoordinator` — Axios requests bypass the concurrency slot. Future improvement: wrap Axios calls with `getSharedRequestCoordinator().withSlot()` for fairness.

---

## Abort / Cancellation

`RequestCoordinator` does not auto-cancel inflight requests. To cancel stale requests:

```js
const controller = new AbortController();
getSharedRequestCoordinator().withSlot(() =>
  fetch(url, { signal: controller.signal })
);
// On navigation or supersession:
controller.abort();
```

TanStack Query handles abort signals automatically for its `queryFn` via `QueryFunctionContext.signal`.

---

## Server-Side Alignment

| Layer | Implementation |
|-------|---------------|
| IP rate limit | Express `globalExpressRateLimit` — 200 req/15min |
| Abuse limiter | Express `apiAbuseLimiter` — stricter for write paths |
| Supabase RLS | Row-level security prevents cross-org data leakage |
| Auth quota | GoTrue shared limits — `isFreshEnough()` guard reduces unnecessary refresh calls |

Client-side budgeting reduces self-inflicted load; it does not replace server limits. See `docs/API_RATE_LIMIT_BUDGET.md`.

---

## Known TODOs

- [ ] Wrap Axios backend client with `withSlot()` for unified concurrency control
- [ ] Add request cancellation on route navigation (currently per-hook only via TanStack Query)
- [ ] Consider exposing `RequestCoordinator` pause state as a React context for UI indicators
