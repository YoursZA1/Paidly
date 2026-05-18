# Paidly — System Execution Flow

> Updated: 2026-05-18

---

## Cold Start (First Load)

```
Browser loads app
│
├── QueryClient created (restorePersistedQueryCache from localStorage)
│
├── RuntimeCoordinator phase: BOOTING → pauseNonCriticalRequests = true
│
├── AuthContext mounts → onAuthStateChange listener registered (one listener, forever)
│     INITIAL_SESSION fires:
│       ├── setUser(session.user)
│       ├── authSessionStore.setSession(normalized)
│       ├── invalidateSessionSnapshot()           ← clears SessionCoordinator snapshot
│       ├── RuntimeCoordinator.markBootstrapReady() → SESSION_READY
│       │     pauseNonCriticalRequests = false
│       └── reconcilePaidlyRealtimeAfterTokenRefresh(token)
│             └── supabase.realtime.setAuth(token)
│
├── SyncEngine mounts (after AuthContext)
│     ├── resetStuckJobs()
│     ├── pruneJobsNotForUser(user.id)
│     ├── setPaidlySyncRealtimeBridge({ userId, onEntityEvent })
│     │     └── schedulePaidlyRealtimeRebuild("sync_bridge")
│     └── setInterval(runOnce, 5000)              ← stable interval, deps pinned
│
└── Realtime channel connects
      └── SUBSCRIBED → RealtimeConnectionPhase.CONNECTED
```

---

## Token Refresh Cycle (~55 minutes)

```
Supabase GoTrue fires TOKEN_REFRESHED event
│
├── AuthContext.onAuthStateChange("TOKEN_REFRESHED", session)
│     ├── authSessionStore.setSession(normalized)
│     ├── invalidateSessionSnapshot()              ← forces fresh SessionCoordinator read
│     └── reconcilePaidlyRealtimeAfterTokenRefresh(newToken, "token_refresh")
│           ├── supabase.realtime.setAuth(newToken)   ← always runs; pushes JWT to socket
│           ├── authRotateCoalesce = true              ← coalesces burst signals
│           └── [setTimeout 0] flushJwtRebuild():
│                 ├── authRotateCoalesce = false
│                 ├── isPaidlyRealtimeMainChannelJoined()?
│                 │     YES → log suppressed, return              ← NO rebuild
│                 └── NO  → runChannelRebuild("jwt_refresh:*", { force: true })
│
└── RefreshQueue: if supabase.auth.refreshSession() was called:
      └── single-flight → max 1 concurrent refresh per tab
```

---

## Realtime Entity Event Burst

```
postgres_changes events arrive (e.g., 5 events in 200ms)
│
├── SyncEngine.onEntityEvent(table, payload) × N
│     ├── isRecoveryCircuitOpen()? YES → drop all
│     └── scheduleEntityInvalidation(entity, payload, role)
│           ├── debounce per entity (REALTIME_ENTITY_DEBOUNCE_MS: 900ms)
│           └── coalesces: only last payload per entity fires within window
│
├── After 900ms, for each entity:
│     ├── await whenDocumentVisible()             ← event-driven, no polling
│     ├── hasActiveSession()? NO → return         ← synchronous guard
│     └── invalidateForEntity(entity, payload)
│           ├── invoice  → reconcileInvoiceRealtimeEvent   → scheduleInvalidation(["cashflow-page"])
│           ├── client   → reconcileClientRealtimeEvent    → scheduleInvalidation(["cashflow-page"])
│           ├── quote    → reconcileQuoteRealtimeEvent     → scheduleInvalidation(["cashflow-page"])
│           ├── payment  → reconcilePaymentRealtimeEvent   → scheduleInvalidation(["cashflow-page"])
│           ├── expense  → reconcileExpenseRealtimeEvent   → scheduleInvalidation(["cashflow-page"])
│           └── payslip  → reconcilePayslipRealtimeEvent
│
└── RuntimeBudgetCoordinator:
      ├── All cashflow-page signals arrive within 300ms window
      ├── First scheduleInvalidation() arms timer
      ├── Subsequent calls: existing timer found → no-op
      └── 300ms elapses → one queryClient.invalidateQueries(["cashflow-page"]) fires
```

---

## Tab Focus — Short Absence (< wake threshold)

```
document.visibilityState → "visible"
│
├── AuthContext.handleVisibility
│     ├── reportVisibilityState("visible")
│     ├── shouldEnterWakeRecoveryMode()? NO (short gap)
│     ├── supabase.auth.getSession()               ← auth layer; not routed through coordinator
│     │     ├── has session → markConnected("tab_visible")
│     │     └── no session → VISIBILITY_RESTORE_FAILED signal
│     ├── checkPaidlyRealtimeOnVisibilityRestore()  ← rate-limited (30s min)
│     └── requestSessionRefreshGuarded({ source: "visibility", silent: true })
│           └── RefreshQueue.enqueue() → single-flight, 3s min gap
│
├── ConnectionMonitor.onVisibilityChange
│     └── runCheck() → supabase.auth.getSession() health check (one-shot, in-flight guard)
│
├── SyncEngine.onFocus
│     ├── isRecoveryCircuitOpen()? YES → return
│     └── runOnce()                               ← guarded by runningRef.current
│
└── TanStack Query: refetchOnWindowFocus = false (global)
      └── Only FocusRefetch.LIVE queries refetch: notifications, admin-messages, services
```

---

## Tab Wake — Long Absence (WakeRecoveryPipeline)

```
document.visibilityState → "visible"
│
├── AuthContext.handleVisibility
│     └── shouldEnterWakeRecoveryMode()? YES → runWakeRecoverySequence()
│
└── WakeRecoveryPipeline:
      AppRecoveryLock.begin()                    ← blockMutations = true
      RuntimeCoordinator.beginAuthRecovery()     ← pauseNonCriticalRequests = true
        │
        │ All postgres_changes callbacks: recoveryLockBlocksRealtimeDelivery() → drop
        │ RequestCoordinator.waitUntilUnpaused() → all non-critical HTTP paused
        │
        Phase 1 — Auth:
          refreshSession({ source: "wake_recovery", bypassThrottle: true })
          ok?  → Phase 2
          !ok? → reconnectEscalationController.schedule() → FAILED
        │
        Phase 2 — Realtime:
          awaitRealtimeRecoveryAndMainChannel({ timeoutMs: 12s })
          ok?  → Phase 3
          !ok? → FAILED
        │
        Phase 3 — Resync:
          refreshUser()
          enforceRouteInvariant()
        │
        finally:
          AppRecoveryLock.end()                  ← blockMutations = false
          RuntimeCoordinator.endAuthRecoverySuccess() ← pauseNonCriticalRequests = false
          dispatch paidly:wake-recovery-resync → SyncEngine → fetchAllFromStore() + invalidations
```

---

## Offline → Online Transition

```
navigator.onLine → false
│
├── SyncEngine skips runOnce() (navigator.onLine === false guard)
├── RuntimeCoordinator.setOnline(false) → OFFLINE phase, pauseNonCriticalRequests = true
└── RealtimeManager: isBrowserOffline() guard prevents all rebuild attempts
│
navigator.onLine → true
│
├── SyncEngine.onOnline → retryAllFailed() + runOnce()
│     └── runOnce checks blockMutations, isRecoveryCircuitOpen, navigator.onLine
├── RuntimeCoordinator.setOnline(true) → scheduleReconnecting() → RECONNECTING → SESSION_READY
└── notifyPaidlyRealtimeNavigatorOnline()
      ├── isPaidlyRealtimeMainChannelJoined()? YES → no action
      └── NO → requestPaidlyRealtimeErrorRecovery("navigator_online")
            └── backoff + runChannelRebuild (all suppression layers checked first)
```

---

## Sync Queue Execution

```
setInterval(runOnce, 5000) — stable; interval recreated only when user.id changes
│
runOnce():
  ├── isRecoveryCircuitOpen()?  YES → return
  ├── runningRef.current?       YES → return (single-flight guard)
  ├── blockMutations?           YES → return
  ├── navigator.onLine === false? YES → return
  ├── Read queue snapshot: useSyncQueueStore.getState().queue  (no subscription)
  ├── Find next eligible job (pending|processing, nextAttemptAt <= now)
  ├── No job? → return
  ├── getStableSession()
  │     Tier 1: authSessionStore if expiresAt > now + 30s  (synchronous, no Supabase call)
  │     Tier 2: 5s snapshot cache (one Supabase call shared by all concurrent readers)
  │     Tier 3: single-flighted supabase.auth.getSession()
  ├── No session? → requestSessionRefresh (debounced, 8s min gap) → return
  ├── markProcessing(job.id)
  ├── processSyncJob(job) → API call
  ├── markDone/markFailed
  └── hasActiveSession()? YES → invalidateInvoiceDomain / invalidateClientDomain
```
