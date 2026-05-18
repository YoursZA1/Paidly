# Paidly — System Execution Flow

> Updated: 2026-05-18 (final stability pass)

---

## Overview

The runtime is composed of 6 coordinated layers. Each layer has a single responsibility and communicates upward/downward through explicit interfaces, not shared state.

```
┌─────────────────────────────────────────────────────────┐
│  Layer 6 — UI / React components                        │
│  reads: useAuth(), useQuery(), useAppStore()             │
└────────────────────┬────────────────────────────────────┘
                     │ React context / Zustand
┌────────────────────▼────────────────────────────────────┐
│  Layer 5 — SyncEngine (React component, no UI)          │
│  Drives: sync queue processing, realtime fan-out,       │
│  entity-specific reconciliation, wake resync events     │
└────────────────────┬────────────────────────────────────┘
                     │ queryClient + store references
┌────────────────────▼────────────────────────────────────┐
│  Layer 4 — RuntimeBudgetCoordinator                     │
│  Coalesces invalidations (300ms), tracks reconnect rate,│
│  governs focus refetch budget                           │
└────────────────────┬────────────────────────────────────┘
                     │ scheduleInvalidation(), recordRate()
┌────────────────────▼────────────────────────────────────┐
│  Layer 3 — Session / Connection Authority               │
│  SessionCoordinator: single-flight getSession()         │
│  RefreshQueue: single-flight mutex, 3s throttle         │
│  sessionRefreshScheduler: coalesced debounce            │
│  ConnectionLifecycleManager: signal → plan routing      │
│  RuntimeCoordinator: 8-phase state machine              │
└────────────────────┬────────────────────────────────────┘
                     │ supabase.auth.*, lifecycle signals
┌────────────────────▼────────────────────────────────────┐
│  Layer 2 — Transport                                    │
│  paidlyRealtimeManager: single multiplex WS channel,    │
│  multi-layer rate limiting, circuit breaker, watchdog   │
│  RequestCoordinator: HTTP concurrency + pause gate      │
└────────────────────┬────────────────────────────────────┘
                     │ WebSocket / HTTP
┌────────────────────▼────────────────────────────────────┐
│  Layer 1 — Supabase                                     │
│  Auth service, postgres_changes, RPC endpoints          │
└─────────────────────────────────────────────────────────┘
```

---

## Boot Sequence

```
1. App mounts
   └─ AuthContext.impl.jsx initializes
       ├─ createSessionOrchestrator() + registerSessionAuthority()
       ├─ createConnectionLifecycleManager() + registerConnectionLifecycleManager()
       ├─ initRuntimeCoordinatorTelemetry()
       ├─ registerSessionRefreshExecutor(runSessionRefreshExecutorPipeline)
       └─ supabase.auth.getSession() → bootstrap
           ├─ success → patchAuthSession(), notifyAuthBootstrapComplete()
           │   └─ RuntimeCoordinator: BOOTING → SESSION_READY
           └─ failure → retry + fallback session attempt

2. SyncEngine mounts (renders null)
   ├─ resetStuckJobs() + pruneJobsNotForUser(userId)  ← crash recovery
   ├─ setInterval(runOnce, 5000)  ← sync queue poller
   ├─ addEventListener("online", ...), ("focus", ...)
   └─ setPaidlySyncRealtimeBridge({ userId, onEntityEvent })
       └─ schedulePaidlyRealtimeRebuild("sync_bridge")

3. paidlyRealtimeManager builds channel
   └─ createAndSubscribeMainChannel()
       ├─ .on("postgres_changes", ...) for each table in PAIDLY_REALTIME_SYNC_TABLES
       ├─ startSubscribeWatchdog(20s)
       └─ subscribe callback:
           ├─ SUBSCRIBED → resetBackoff, notify lifecycle, mark CONNECTED
           └─ error → recordFailure, requestErrorRecovery, bumpBackoff
```

---

## Session Refresh Flow

```
Trigger (any of):
  - proactive heartbeat (60s timer in AuthContext)
  - visibility restore (document.visibilityState becomes "visible")
  - online event
  - sync queue finds no session
  - auth state change event

         ▼
sessionRefreshScheduler.requestSessionRefresh({ source, debounceMs=400 })
  │ Merges concurrent callers into a single debounced flush
  │ isRecoveryCircuitOpen() → if true, cancel and return
  ▼
executor = runSessionRefreshExecutorPipeline()
  │
  ▼
RefreshQueue.enqueue(task)
  │ inFlightPromise? → join existing promise (no parallel refresh)
  │ < 3s since last start? → return "throttled"
  ▼
refreshSupabaseSessionWithRecovery()
  │ Cross-tab localStorage lock → only one tab refreshes at a time
  │ isFreshEnough() check → skip if token not near expiry
  ▼
supabase.auth.refreshSession()
  │
  ├─ Success:
  │   ├─ patchAuthSession({ session })
  │   ├─ reconcilePaidlyRealtimeAfterTokenRefresh(accessToken)
  │   │   └─ setAuth() → rebuild only if channel not joined
  │   ├─ SessionCoordinator: store updated → fast path serves fresh token
  │   └─ connectionLifecycle.reportRefreshOk()
  │
  └─ Fatal error:
      ├─ isRefreshTokenFatalError(error)? → handleFatal()
      ├─ connectionLifecycle.handleRefreshFatal()
      └─ isRecoveryCircuitOpen() → true from this point
```

---

## Wake Recovery Flow

Triggers: tab becomes visible after long absence, `shouldEnterWakeRecoveryMode()` returns true.

```
AuthContext detects visibility change
  └─ shouldEnterWakeRecoveryMode(hiddenDuration, sessionAge) → true
      ▼
AppRecoveryLock.acquire()   ← prevents concurrent wake pipelines
  └─ wakeRecoveryStore.blockMutations = true   ← halts realtime delivery
      ▼
runWakeRecoveryPipeline(ctx)
  │
  ├─ Phase AUTH_RESTORING:
  │   └─ refreshSession({ bypassThrottle: true })
  │       └─ RefreshQueue.enqueue()  (same single-flight path as above)
  │
  ├─ Phase REALTIME_RESTORING:
  │   ├─ resetPaidlyRealtimeForUserRecovery()   ← clears all circuit breakers
  │   └─ awaitRealtimeRecovery(12s timeout)
  │       └─ waitForPaidlyMainChannelJoined()
  │
  ├─ Phase RESYNCING:
  │   ├─ refreshUser()
  │   ├─ clearSessionOrgIdCache()
  │   ├─ invalidateWakeRecoveryWorkspaceQueries()   ← 10 query roots invalidated
  │   └─ enforceRouteInvariant()
  │
  └─ finally: setPipelineState(IDLE), AppRecoveryLock.release()
      └─ wakeRecoveryStore.blockMutations = false
          └─ SyncEngine onWakeResync fires:
              ├─ fetchAllFromStore(user)
              ├─ invalidateInvoiceDomain()   ← 1 invoice invalidation wave
              ├─ invalidateQueries(["quotes"])
              ├─ invalidateQueries(["client-list", scopeKey])   ← clients only, no invoice cascade
              ├─ invalidateQueries(["clients"])
              └─ invalidateQueries(["payslips"])
```

---

## Realtime Event Flow

```
Supabase postgres_changes fires on PAIDLY_REALTIME_CHANNEL
  │
  └─ recoveryLockBlocksRealtimeDelivery()? → drop event (recovery in progress)
      ▼
syncBridge.onEntityEvent(table, payload)
  │
  └─ SyncEngine.onEntityEvent()
      └─ scheduleEntityInvalidation(entity, payload, role)
          │ isRecoveryCircuitOpen()? → return
          │ debounce timer per entity (900ms) → coalesces burst events
          │ whenDocumentVisible()  → defers to tab visibility
          │ hasActiveSession()? → SessionCoordinator fast path
          ▼
          invalidateForEntity(entity, payload)
            ├─ "invoices" → reconcileInvoiceRealtimeEvent()
            │   ├─ patch: setQueryData (list, infinite, detail)
            │   └─ scheduleInvalidation(["cashflow-page"])
            ├─ "clients" → reconcileClientRealtimeEvent()
            │   ├─ patch: setQueriesData (infinite list)
            │   └─ scheduleInvalidation(["cashflow-page"])
            ├─ "quotes" → reconcileQuoteRealtimeEvent()
            │   ├─ patch: setQueriesData (infinite + legacy flat)
            │   └─ scheduleInvalidation(["cashflow-page"])
            ├─ "payments" → reconcilePaymentRealtimeEvent()
            │   ├─ setQueriesData (affected invoice)
            │   ├─ invalidateQueries(["invoice", invoiceId]) ← targeted
            │   ├─ invalidateQueries(["invoice-list", scopeKey]) ← targeted
            │   └─ scheduleInvalidation(["cashflow-page"])
            ├─ "expenses" → reconcileExpenseRealtimeEvent()
            │   └─ scheduleInvalidation(["cashflow-page"])
            ├─ "payslips" → reconcilePayslipRealtimeEvent()
            │   └─ setQueriesData (patch) or invalidateQueries (fallback)
            └─ "document_sends" → invalidateQueries(["admin-messages"])
```

---

## Offline → Online Recovery

```
navigator "online" event
  │
  ├─ ConnectionLifecycleManager.reportNetworkState(true)
  │   └─ runtimeCoordinatorBridge → rc.setOnline(true)
  │       └─ rc.scheduleReconnecting() (400ms debounce)
  │
  ├─ paidlyRealtimeManager.notifyPaidlyRealtimeNavigatorOnline()
  │   └─ isPaidlyRealtimeMainChannelJoined()? → skip
  │       else → requestPaidlyRealtimeErrorRecovery("navigator_online")
  │               └─ runChannelRebuild after backoff delay
  │
  └─ SyncEngine.onOnline()
      ├─ isRecoveryCircuitOpen()? → return
      ├─ retryAllFailed()    ← clears "failed" sync queue jobs
      └─ runOnce()           ← processes next pending job
```

---

## Invalidation Coalescing (RuntimeBudgetCoordinator)

All reconciler-driven invalidations for `["cashflow-page"]` route through:

```
scheduleInvalidation(queryClient, queryKey)
  │ Already scheduled within 300ms window? → no-op (deduped)
  └─ setTimeout(300ms) → queryClient.invalidateQueries(queryKey)
```

A burst of 20 expense events within 300ms produces **1** cashflow-page invalidation, not 20.

The 300ms coalesce window is intentionally shorter than the entity debounce (900ms in SyncEngine) so that by the time the debounced invalidation runs, the budget coordinator timer has usually already fired.
