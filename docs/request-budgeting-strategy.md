# Request budgeting strategy

## Objectives

- Cap **in-flight identical** requests (dedupe).
- Cap **concurrent** domain requests (fairness under slow 3G).
- **Pause** non-critical fetches during `RECONNECTING` / `AUTH_RECOVERING` (coordinator).
- Centralize **retry + backoff** (`retryWithBudget`) for hand-rolled fetch paths (Axios alignment optional).

## Implementation

**Module:** `src/core/network/RequestCoordinator.ts`

| API | Behavior |
|-----|----------|
| `shouldPause()` | Reads `RuntimeCoordinator.pauseNonCriticalRequests` |
| `withSlot(fn)` | Waits while paused; limits concurrent executions |
| `dedupe(key, fn)` | Shares one promise per `key` while in flight |
| `retryWithBudget(fn, { maxAttempts, isRetryable, baseDelayMs? })` | **Exported** helper — exponential backoff + jitter between attempts |

**Cancel stale requests:** pass `AbortSignal` from your caller and abort when navigation or a new “generation” supersedes work; the coordinator does not cancel promises automatically.

## Axios alignment

Today: `src/api/installBackendApiResilience.js` handles **429** specially.

Tomorrow:

- Optional Axios request interceptor consults **`shouldPause()`** and queues or rejects with typed error (`src/core/errors`).

## Server-side coupling

Express **`globalExpressRateLimit`** + **`apiAbuseLimiter`** — per-IP. See `docs/API_RATE_LIMIT_BUDGET.md` and `docs/API_DEPLOYMENT_MODEL.md`.

Client budgeting **does not replace** server limits; it reduces self-DDoS and duplicate work.
