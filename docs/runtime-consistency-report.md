# Paidly — Runtime Consistency Report

> Updated: 2026-05-18 (final stability pass — replaces initial audit)

---

## Cross-System Interaction Map

```
AuthContext ──────────► SessionOrchestrator / ConnectionLifecycleManager
    │                           │
    │ onAuthStateChange          │ reportRefreshOk, markConnected, etc.
    │ heartbeat timer            ▼
    │                   runtimeCoordinatorBridge
    │                           │
    │                           ▼
    │                   RuntimeCoordinator (8-state Zustand store)
    │                           │
    │                    pauseNonCriticalRequests
    │                           │
    ▼                           ▼
SyncEngine            RequestCoordinator (HTTP pause gate)
    │
    ├─ sync queue poller (5s interval)
    ├─ online event handler
    ├─ focus event handler
    └─ realtime bridge (entity events)
              │
              ▼
    paidlyRealtimeManager (single multiplex WS channel)
              │
              ▼
    entity reconcilers (patch-first, scheduleInvalidation)
              │
              ▼
    RuntimeBudgetCoordinator (coalesce 300ms, track rate)
              │
              ▼
    TanStack QueryClient (invalidateQueries, setQueryData)
```

---

## Interaction Audit

### SessionCoordinator ↔ SyncEngine

SyncEngine reads session via `getStableSession()` (job processing) and `hasActiveSession()` (guard checks). Neither calls `supabase.auth.getSession()` directly.

SyncEngine never initiates a session refresh directly. It calls `requestSessionRefresh({ source: "sync_queue_session" })` when no session is found — routing through the debounced scheduler, not RefreshQueue directly.

If a refresh is in flight while a sync job starts, `getStableSession()` joins the in-flight call via SessionCoordinator's `_inflight` promise. No duplicate. **✅**

### SessionCoordinator ↔ RealtimeManager

paidlyRealtimeManager receives `accessToken` from the auth pipeline via `reconcilePaidlyRealtimeAfterTokenRefresh()`. It does NOT call `supabase.auth.getSession()`. JWT updates are always triggered by AuthContext, not by SyncEngine or UI components. **✅**

### RuntimeCoordinator ↔ ConnectionLifecycleManager

`runtimeCoordinatorBridge.notifyRuntimeFromLifecycle()` translates lifecycle signals into RuntimeCoordinator phase transitions. The bridge is feed-only — RuntimeCoordinator reads from lifecycle but does not write back. All transitions are deterministic (see auth-flow-guarantees.md G-01). **✅**

### RuntimeBudgetCoordinator ↔ paidlyRealtimeManager

`recordAndCheckReconnectRate()` now called in `runChannelRebuild()` after internal guards pass (fixed this pass). The return value is not currently used to gate rebuilds — paidlyRealtimeManager's own rate limits are stricter — but the cross-system tracker now carries accurate data for `getRuntimeBudgetSnapshot()`.

`scheduleInvalidation()` called by all entity reconcilers for cashflow-page invalidations. **✅ (after fix)**

### SyncEngine ↔ WakeRecoveryPipeline

WakeRecoveryPipeline dispatches `paidly:wake-recovery-resync` CustomEvent after unlock. SyncEngine listens to this event and runs `fetchAllFromStore` + targeted invalidations.

**Ordering:** Pipeline finishes → `AppRecoveryLock.release()` → `blockMutations = false` → event dispatched → SyncEngine handler runs.

**Double-invalidation (fixed this pass):** Previously the resync handler called `invalidateClientDomain()` which internally called `invalidateInvoiceDomain()` — duplicating the invoice invalidation already called 3 lines above. Fixed: handler now uses direct client-only invalidations. **✅ (after fix)**

### TanStack QueryClient ↔ RuntimeBudgetCoordinator

Consistency of cashflow-page invalidation routing across all reconcilers:

| Caller | Method | Status |
|--------|--------|--------|
| reconcileInvoiceRealtimeEvent | scheduleInvalidation | ✅ |
| reconcileClientRealtimeEvent | scheduleInvalidation | ✅ |
| reconcileQuoteRealtimeEvent | scheduleInvalidation | ✅ |
| reconcilePaymentRealtimeEvent | scheduleInvalidation | ✅ fixed |
| reconcileExpenseRealtimeEvent | scheduleInvalidation | ✅ fixed |
| invalidateInvoiceDomain direct line | direct invalidateQueries | acceptable — non-realtime, non-burst path |
| InvoiceActions.jsx, ViewInvoice.jsx | direct invalidateQueries | acceptable — user-triggered single events |

**✅ (after fixes)**

---

## Duplicate Trigger Analysis

### Online event
| Handler | Action | Deduplication |
|---------|--------|--------------|
| ConnectionLifecycleManager.reportNetworkState | feeds RuntimeCoordinator.setOnline | 400ms reconnect debounce |
| paidlyRealtimeManager.notifyNavigatorOnline | checks joined before rebuild | skip if healthy |
| SyncEngine.onOnline | retryAllFailed + runOnce | runningRef prevents reentrance |

Each handler owns a distinct concern. No collision. **✅**

### Focus event
| Handler | Action | Deduplication |
|---------|--------|--------------|
| SyncEngine.onFocus | runOnce() | runningRef + visibilityState check |
| authRealtimeCoordinator.checkRealtimeOnVisibilityRestore | stale channel check | 400ms debounce + 30s rate-limit |
| sessionRefreshScheduler.requestSessionRefresh | session freshness check | 400ms debounce + mergedSources coalesce |

No collision — sync, realtime, and session refresh react to focus independently. **✅**

### Token refresh
| Handler | Action | Deduplication |
|---------|--------|--------------|
| AuthContext heartbeat | requestSessionRefresh | scheduler debounce + RefreshQueue single-flight |
| AuthContext visibility | requestSessionRefresh | same path |
| WakeRecoveryPipeline | refreshSession({ bypassThrottle: true }) | RefreshQueue single-flight still applies |
| authReconnectEscalation | supabaseRefreshSession | RefreshQueue single-flight still applies |

All refresh initiators converge at RefreshQueue.inFlightPromise. **✅**

---

## Overlapping Responsibilities

| Concern | Primary Owner | Secondary Touches |
|---------|--------------|-------------------|
| Session read | SessionCoordinator | AuthContext (init), feature components (R-01) |
| Session refresh | RefreshQueue | — |
| Realtime channel lifecycle | paidlyRealtimeManager | — |
| Realtime JWT update | authRealtimeCoordinator | — |
| Online/offline state | ConnectionLifecycleManager | SyncEngine (queue retry only) |
| Invalidation coalescing | RuntimeBudgetCoordinator | — |
| Reconnect rate tracking | paidlyRealtimeManager (internal) + RuntimeBudgetCoordinator (cross-system) | RBC is now a passive observer fed by paidlyRealtimeManager; not a gate |
| Wake recovery | WakeRecoveryPipeline | SyncEngine (post-pipeline resync event) |
| Runtime phase | RuntimeCoordinator | runtimeCoordinatorBridge (feeds only) |

The only overlap is reconnect rate — resolved by making RuntimeBudgetCoordinator a passive tracker.

---

## Verdict

System is internally consistent after this pass. All identified duplications are resolved (double-invalidation in wake resync, bypassed coalescing in expense/payment reconcilers). All identified overlapping triggers are safe parallel handlers with distinct responsibilities (online/focus events).
