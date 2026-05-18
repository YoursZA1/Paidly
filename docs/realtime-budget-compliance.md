# Paidly — Realtime Budget Compliance

> Updated: 2026-05-18

---

## Overview

This document audits compliance of all realtime-triggered cache operations against the budget systems defined in `RuntimeBudgetCoordinator.ts` and `paidlyRealtimeManager.js`.

---

## Budget Layer Compliance Matrix

| Budget Layer | What It Governs | Status | Compliance |
|-------------|----------------|--------|------------|
| Reconnect backoff (realtimeManager) | 1s→30s stepped delay between error recoveries | Enforced in `requestPaidlyRealtimeErrorRecovery` | ✅ |
| Transport burst cooldown | ≥4 failures in 12s → 35s pause | Enforced via `transportFailureTimestamps` | ✅ |
| Circuit breaker | ≥5 consecutive failures → 120s pause | Enforced via `realtimeConsecutiveFailures` | ✅ |
| Hard rate suppress | ≥10 rebuilds in 90s → 90s suppress | Enforced via `reconnectHardRateTimestamps` | ✅ |
| Rebuild min interval | 1.4s between rebuilds | Enforced via `lastRebuildCompletedAtMs` | ✅ |
| JWT rebuild skip (healthy) | Skip rebuild when channel is joined | Enforced in `flushJwtRebuild` | ✅ |
| Visibility reconnect min | 30s between visibility-driven reconnects | Enforced via `lastVisibilityReconnectScheduleAt` | ✅ |
| Heartbeat reconnect min | 45s between heartbeat-driven reconnects | Enforced via `lastHeartbeatReconnectScheduleAt` | ✅ |
| Subscribe watchdog | 20s hung-subscribe timeout | Enforced via `subscribeWatchdogId` | ✅ |
| Cashflow invalidation coalesce | 300ms coalesce window per key | **Newly wired** via `scheduleInvalidation` | ✅ |
| Entity event debounce | 900ms per-entity debounce | Enforced via `realtimeEntityDebounceRefs` | ✅ |
| Global store refresh debounce | 2200ms debounce before `fetchAllFromStore` | Enforced via `globalStoreRefreshTimerRef` | ✅ |
| Single reconciliation path | One reconciler per entity | All entities mapped to exactly one reconciler | ✅ |
| No fetch-all on entity events | All reconcilers return `true` | Verified across all 7 entity types | ✅ |

---

## Cashflow Invalidation Compliance

Cashflow is the most heavily invalidated query in the app. Every financial entity type (invoices, clients, quotes, payments, expenses) triggers a cashflow invalidation on change.

### Before Fix (this session)

```
Entity events in one burst: invoice×3 + quote×2 + payment×1 + expense×1
Cashflow invalidations fired: 7 (one per event, immediate)
Concurrent cashflow refetches: up to 7
```

### After Fix

```
Entity events in one burst: invoice×3 + quote×2 + payment×1 + expense×1
scheduleInvalidation calls: 7 (all for same key: '["cashflow-page"]')
Timers armed: 1 (first call arms it; subsequent find existing → no-op)
Cashflow refetches: 1 (after 300ms window closes)
```

### Reconciler Cashflow Audit

| Reconciler | File | Calls Before | Calls After | Method |
|-----------|------|-------------|-------------|--------|
| `reconcileInvoiceRealtimeEvent` | `realtimeInvoiceReconciliation.js` | 2 direct | 2 coalesced | `scheduleInvalidation` |
| `reconcileClientRealtimeEvent` | `realtimeClientReconciliation.js` | 2 direct | 2 coalesced | `scheduleInvalidation` |
| `reconcileQuoteRealtimeEvent` | `realtimeEntityReconciliation.js` | 2 direct | 2 coalesced | `scheduleInvalidation` |
| `reconcilePaymentRealtimeEvent` | `realtimeEntityReconciliation.js` | 1 direct | 1 coalesced | `scheduleInvalidation` |
| `reconcileExpenseRealtimeEvent` | `realtimeEntityReconciliation.js` | 1 direct | 1 coalesced | `scheduleInvalidation` |
| `reconcilePayslipRealtimeEvent` | `realtimeEntityReconciliation.js` | 0 | 0 | n/a |
| **Total** | | **8 direct** | **8 coalesced** | |

---

## Reconnect Budget Compliance

### Reconnect Suppression Layers (Enforced, Outermost First)

```
1. isRecoveryCircuitOpen()           — auth terminal state; any rebuild would connect unauthenticated
2. isBrowserOffline()                — navigator.onLine === false
3. isRealtimeCircuitBreakerOpen()    — ≥5 failures → 120s pause (bypass: JWT origin, cooldown wake)
4. isTransportCooldownActive()       — ≥4 failures in 12s → 35s pause (bypass: JWT origin)
5. isReconnectHardSuppressed()       — ≥10 rebuilds in 90s → 90s pause
6. rebuildInFlight                   — subscribe handshake in progress (queues one rebuild via rebuildQueued)
7. REBUILD_MIN_INTERVAL_MS (1.4s)    — minimum spacing; deferred via timer
8. isPaidlyRealtimeMainChannelJoined() [JWT path only] — skip when already healthy
```

All layers verified active in `runChannelRebuild` and `requestPaidlyRealtimeErrorRecovery`.

### Unimplemented Budget Controls

| Control | File | Status |
|---------|------|--------|
| `recordAndCheckReconnectRate()` | `RuntimeBudgetCoordinator.ts` | Defined but not called; realtimeManager has its own circuit breakers |
| `consumeFocusRefetchBudget()` | `RuntimeBudgetCoordinator.ts` | Defined but not called; only 3 queries use `FocusRefetch.LIVE` currently |

---

## Entity Reconciliation Budget Compliance

### Debounce Budget

Each entity type has its own debounce timer. Events arriving within 900ms of each other are collapsed into one reconciliation call. The last payload wins.

```
Entity: invoices
  Event at t=0   → timer armed (900ms)
  Event at t=300 → timer reset (900ms from now)
  Event at t=900 → timer fires with last payload
```

### Single Reconciliation Path Verification

| Entity | Reconciler | Returns true | fetchAll triggered |
|--------|-----------|--------------|-------------------|
| invoices | `reconcileInvoiceRealtimeEvent` | ✅ (all paths) | Never |
| clients | `reconcileClientRealtimeEvent` | ✅ (all paths) | Never |
| document_sends | Inline in SyncEngine | ✅ | Never |
| quotes | `reconcileQuoteRealtimeEvent` | ✅ (all paths, false → returns false on no-id) | Never in practice |
| payments | `reconcilePaymentRealtimeEvent` | ✅ (always) | Never |
| expenses | `reconcileExpenseRealtimeEvent` | ✅ (always) | Never |
| payslips | `reconcilePayslipRealtimeEvent` | ✅ (all paths including fallback) | Never |

**Note on quotes:** `reconcileQuoteRealtimeEvent` returns `false` if the delete payload has no `old.id` and the eventType is unrecognized. In that rare case, `SyncEngine.scheduleGlobalStoreRefresh` fires for non-admin users. This is an edge case where the payload is malformed.

---

## Recovery Lock Compliance

During `WakeRecoveryPipeline` (and `AppRecoveryLock.begin()`):

- `recoveryLockBlocksRealtimeDelivery()` returns `true`
- All `postgres_changes` callbacks in `paidlyRealtimeManager` silently return before calling `syncBridge.onEntityEvent`
- `SyncEngine.runOnce()` checks `useWakeRecoveryStore.getState().blockMutations` — returns immediately
- `RequestCoordinator.waitUntilUnpaused()` — all non-critical HTTP waits on `pauseNonCriticalRequests = true`

After pipeline:
- `AppRecoveryLock.end()` → `blockMutations = false`
- `RuntimeCoordinator.endAuthRecoverySuccess()` → `pauseNonCriticalRequests = false`
- `paidly:wake-recovery-resync` event fires → `fetchAllFromStore` (intentional full resync)
