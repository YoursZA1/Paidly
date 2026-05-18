# Paidly — Runtime Budgeting Strategy

> Updated: 2026-05-18

---

## Layered Budget System

Runtime budgeting is distributed across several specialized modules. Each handles a different dimension of the problem.

---

## Layer 1 — Auth Refresh Serialization (`RefreshQueue`)

**File:** `src/lib/session/RefreshQueue.js`

| Control | Value |
|---------|-------|
| Concurrent refresh attempts | 1 (single-flight via `inFlightPromise`) |
| Minimum gap between non-bypass refreshes | 3s (`minGapMs`) |
| Cross-tab dedup | `isFreshEnough()` localStorage lock |

No request for `supabase.auth.refreshToken()` should ever bypass this queue.

---

## Layer 2 — HTTP Concurrency (`RequestCoordinator`)

**File:** `src/core/network/RequestCoordinator.ts`

| Control | Value |
|---------|-------|
| Max concurrent HTTP requests | 6 |
| Pause gate | `RuntimeCoordinator.pauseNonCriticalRequests` (auth recovery, reconnecting) |
| Pause resolution | Event-driven Zustand subscription (not polling) |
| Dedup | `dedupe(key, fn)` — returns in-flight promise for duplicate keys |

Axios backend client does not currently use `withSlot()` (known TODO). TanStack Query hooks route through `RequestCoordinator` for new code.

---

## Layer 3 — Reconnect Budgeting (Realtime)

**File:** `src/lib/realtime/paidlyRealtimeManager.js`

| Guard | Threshold | Window |
|-------|-----------|--------|
| Reconnect backoff | 1s → 2s → 5s → 10s → 30s (capped) | Per attempt |
| Transport burst cooldown | ≥4 failures → 35s pause | 12s window |
| Circuit breaker | ≥5 failures → 120s pause | Per reset |
| Hard rate suppress | ≥10 rebuilds → 90s pause | 90s window |
| JWT rebuild min spacing | 2s | Per token rotation |
| Visibility reconnect min | 30s | Per tab focus |
| Heartbeat reconnect min | 45s | Per heartbeat |

JWT refresh origin bypasses most guards (but not circuit breaker under normal conditions).

---

## Layer 4 — Session Reconnect Escalation (`authReconnectEscalation`)

**File:** `src/lib/auth/authReconnectEscalation.js`

| Control | Value |
|---------|-------|
| Circuit states | CLOSED / OPEN / HALF_OPEN |
| Backoff steps | [1.5s, 3s, 6s, 12s, 24s] ±15% jitter |
| Max consecutive failures | 5 → `handleFatal("reconnect_loop_break")` |
| Hidden-tab suppression | Drops `schedule()` when `document.hidden` |

---

## Layer 5 — Query Invalidation Coalescing (`RuntimeBudgetCoordinator`)

**File:** `src/core/runtime/RuntimeBudgetCoordinator.ts`

| Control | Value |
|---------|-------|
| Coalesce window | 300ms |
| Behavior | First call in window schedules the invalidation; duplicates within window are dropped |
| Focus refetch budget | 8 simultaneous refetches per 3s window |
| Reconnect rate tracking | 15 reconnects per 60s |

`scheduleInvalidation(queryClient, queryKey)` is the coalesced alternative to `queryClient.invalidateQueries()`. Use for invalidations triggered by realtime events where bursts are expected.

---

## Layer 6 — Query Focus Policy

**File:** `src/core/query/queryFocusPolicy.ts`

Global `refetchOnWindowFocus: false`. Opt in via `FocusRefetch.LIVE` for queries that need live focus refresh. Currently enabled for:
- `notifications`
- `admin-messages`
- `services catalog`

---

## Request Flow Under Recovery

```
RuntimeCoordinator phase: AUTH_RECOVERING or RECONNECTING
  └── pauseNonCriticalRequests = true
        └── RequestCoordinator.waitUntilUnpaused()  (event-driven, not polling)
              └── all HTTP requests pause
              └── resume when phase returns to SESSION_READY
```

Auth recovery does NOT pause:
- Critical auth calls (token refresh itself)
- Supabase Realtime WebSocket (manages its own reconnect)
- Sync queue checks (`runOnce` reads from store; actual job execution requires `!blockMutations`)

---

## Completed Improvements (this session)

- [x] `scheduleInvalidation()` used in all realtime reconcilers (`realtimeEntityReconciliation.js`, `realtimeInvoiceReconciliation.js`, `realtimeClientReconciliation.js`)
- [x] `scheduleGlobalStoreRefresh` fallback replaced with targeted `invalidateQueries` per entity domain — eliminates full `fetchAllFromStore` on unrecognized event types
- [x] `getStableSession()` adopted in `connectionHealth.js`, `rpcSessionPolicy.js`, `PaymentReminderService.jsx`
- [x] `queryFocusPolicy.ts` adopted in `CashFlow.jsx` via `getFocusPolicy("cashflow-page")`

## Remaining Improvements

- [ ] Wrap Axios backend client in `RequestCoordinator.withSlot()` for unified concurrency
- [ ] Expose `RuntimeBudgetCoordinator.getRuntimeBudgetSnapshot()` in dev overlay
- [ ] Add per-route refetch budgets for heavy dashboard pages
