# Paidly — Runtime Consistency Report

> Updated: 2026-05-18

---

## Scope

This audit examines interactions between:
- `SessionCoordinator` (auth session reads)
- `RuntimeBudgetCoordinator` (invalidation coalescing, reconnect tracking)
- `SyncEngine` (queue, entity fan-out)
- `paidlyRealtimeManager` (WebSocket lifecycle)
- TanStack Query (cache, invalidations)
- Visibility handlers (focus recovery)
- `WakeRecoveryPipeline` (long-absence recovery)

---

## Cross-System Interaction Map

```
┌─────────────────────────────────────────────────────────────┐
│                       AuthContext                           │
│  onAuthStateChange → authSessionStore → SessionCoordinator  │
│  TOKEN_REFRESHED   → reconcilePaidlyRealtime → setAuth       │
│  SIGNED_IN/OUT     → recoveryCircuit state                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   RuntimeCoordinator  SyncEngine     RealtimeManager
   (phase machine)     (queue tick)   (WebSocket lifecycle)
          │                │                │
          ▼                ▼                ▼
   RequestCoordinator  TanStack Query  RuntimeBudgetCoordinator
   (HTTP concurrency)  (cache patches) (invalidation coalescing)
```

---

## Identified Interactions and Consistency Assessment

### 1. SessionCoordinator ↔ SyncEngine

**Interaction:** `SyncEngine.runOnce()` calls `getStableSession()` before each job. Five inline `supabase.auth.getSession()` calls were replaced in the prior session.

**Assessment:** ✅ Consistent. SyncEngine now reads through the three-tier coordinator. No race condition: the coordinator's `_inflight` guard prevents duplicate concurrent reads.

**Residual:** `scheduleGlobalStoreRefresh` and `scheduleEntityInvalidation` use `hasActiveSession()` (synchronous guard), which is the correct lightweight check for pre-flight guards.

---

### 2. SessionCoordinator ↔ AuthContext

**Interaction:** `AuthContext.impl.jsx` calls `supabase.auth.getSession()` directly in 9 places (initialization, health checks, recovery flows). `SessionCoordinator.invalidateSessionSnapshot()` is called when a new session arrives.

**Assessment:** ✅ No conflict. AuthContext is the authoritative source of auth state — it should call Supabase directly as it owns the session lifecycle. SessionCoordinator is for consuming code; the auth layer is exempt. The key consistency point is that `invalidateSessionSnapshot()` fires on `SIGNED_IN`, `TOKEN_REFRESHED`, and `SIGNED_OUT` so subsequent coordinator reads get fresh data.

**Residual:** Feature-layer code (reminders, PDF generation, API clients) still calls `getSession()` directly. Not a consistency issue for the auth layer, but may stack additional reads during burst scenarios.

---

### 3. RuntimeBudgetCoordinator ↔ All Reconcilers

**Interaction:** `scheduleInvalidation(queryClient, ["cashflow-page"])` is now called from all 4 reconciler files when a financial entity event arrives.

**Assessment:** ✅ Consistent after this session's fix. Before: 8 direct `invalidateQueries` calls per burst. After: 1 per 300ms window. The `queryClient` instance passed to reconcilers is the same singleton from `getOrCreateAppQueryClient()`, so the dedup key `'["cashflow-page"]'` resolves correctly across all callers.

**Note:** `scheduleInvalidation` uses a module-level `_pending` Map, so concurrent calls from different reconcilers see the same pending state. This is intentional and correct.

---

### 4. RuntimeCoordinator ↔ RequestCoordinator

**Interaction:** `RequestCoordinator.waitUntilUnpaused()` subscribes to `useRuntimeCoordinator` and unblocks when `pauseNonCriticalRequests` becomes `false`.

**Assessment:** ✅ Consistent. The Zustand `subscribe` listener is event-driven (fixed from prior polling bug). Phase transitions that set `pauseNonCriticalRequests = false` (e.g., `endAuthRecoverySuccess`, `completeReconnecting(true)`) immediately notify the subscriber, which resolves all waiting HTTP slots.

**Residual:** Axios requests do not use `withSlot()` and are not subject to the pause gate. This is a known gap (see `remaining-risk-analysis.md`).

---

### 5. SyncEngine ↔ RealtimeManager (via Bridge)

**Interaction:** `setPaidlySyncRealtimeBridge({ userId, onEntityEvent })` is called when `user?.id` changes. `onEntityEvent` is a stable `useCallback` whose deps include `user?.id` and `user?.role`.

**Assessment:** ✅ No duplicate bridge registration. The bridge is a single object reference; `schedulePaidlyRealtimeRebuild` fires when the bridge changes (user signs in/out), which is correct.

**Residual:** The bridge's `onEntityEvent` is recreated when `user?.role` changes, which triggers a bridge update and a rebuild. This is a very rare case (role change requires admin action) and is acceptable.

---

### 6. WakeRecoveryPipeline ↔ SyncEngine ↔ RealtimeManager

**Interaction:** During recovery, `blockMutations = true` prevents SyncEngine queue ticks and drops realtime deliveries. After recovery, `paidly:wake-recovery-resync` fires, triggering `fetchAllFromStore` + query invalidations.

**Assessment:** ✅ Consistent. No realtime event can corrupt the cache during recovery (dropped at source). `fetchAllFromStore` after recovery is the intentional full-resync that replaces what was lost while events were dropped.

**Residual:** `SyncEngine.onEntityEvent` calls `isRecoveryCircuitOpen()` but NOT `blockMutations` check. However, `scheduleEntityInvalidation` → `hasActiveSession()` catches session loss. The gap: if a realtime event arrives after `AppRecoveryLock.end()` but before `paidly:wake-recovery-resync` fires, it could partially patch a cache that is about to be fully refreshed. This is harmless (fresh data overwrites) but redundant work.

---

### 7. Visibility Handlers ↔ Multiple Systems (Overlap Analysis)

**What fires when the tab becomes visible:**

| System | Action | Rate-Limited? |
|--------|--------|---------------|
| AuthContext.handleVisibility | `getSession()` + `requestSessionRefreshGuarded` | Yes (3s min gap via RefreshQueue) |
| ConnectionMonitor | `runCheck()` → health `getSession()` | Yes (`inFlightRef` single-flight) |
| SyncEngine.onFocus | `runOnce()` | Yes (`runningRef.current` guard) |
| RealtimeManager | `checkPaidlyRealtimeOnVisibilityRestore()` | Yes (30s min, 400ms debounce) |

**Assessment:** ✅ No uncontrolled overlap. Each system has its own rate limiting. The `getSession()` calls from AuthContext visibility handler and ConnectionMonitor can overlap with SessionCoordinator's snapshot — but both read from Supabase's in-memory token cache (not a network call if the token is fresh), so this is low-cost duplication.

---

### 8. Realtime Burst ↔ Entity Debounce ↔ Cashflow Coalesce (Layered Budget)

**Flow for a 5-event burst (3 invoices, 2 quotes):**

```
t=0ms:   invoices event #1 → debounce timer armed (900ms)
t=50ms:  invoices event #2 → debounce timer reset (900ms from t=50)
t=100ms: quotes event #1   → quotes debounce timer armed (900ms)
t=200ms: invoices event #3 → debounce timer reset (900ms from t=200)
t=300ms: quotes event #2   → quotes debounce timer reset (900ms from t=300)

t=1100ms: invoices debounce fires → reconcileInvoiceRealtimeEvent
                                 → scheduleInvalidation(["cashflow-page"])  ← arms 300ms timer
t=1200ms: quotes debounce fires   → reconcileQuoteRealtimeEvent
                                 → scheduleInvalidation(["cashflow-page"])  ← no-op, timer pending
t=1400ms: cashflow timer fires    → queryClient.invalidateQueries(["cashflow-page"])  ← ONE call
```

**Assessment:** ✅ Fully budgeted. Two debounce layers + one coalesce layer = 1 cashflow refetch per burst cycle.

---

## No Circular Dependencies Found

- `SessionCoordinator` imports `supabase` and `authSessionStore` — no AuthContext import
- `RuntimeBudgetCoordinator` imports only TanStack Query types — no circular risk
- `paidlyRealtimeManager` imports `RuntimeCoordinator` state function, not the store hook
- `SyncEngine` imports `SessionCoordinator`, `RuntimeBudgetCoordinator` (via reconcilers), `RuntimeCoordinator` — all one-directional

---

## Summary

| System Pair | Issue Found | Fixed |
|-------------|-------------|-------|
| RuntimeBudgetCoordinator ↔ Reconcilers | Cashflow invalidations not coalesced | ✅ This session |
| SessionCoordinator ↔ SyncEngine | Raw `getSession()` calls | ✅ Prior session |
| RuntimeCoordinator ↔ RequestCoordinator | Polling instead of event subscription | ✅ Prior session |
| WakeRecovery ↔ Realtime delivery | Events dropped during recovery | ✅ Prior session |
| SyncEngine interval ↔ queue subscription | Interval churn on every job | ✅ Prior session |
| JWT rotation ↔ WebSocket rebuild | Every token rotation rebuilt healthy socket | ✅ Prior session |
| Hidden-tab ↔ visibility polling | 600ms polling loop per pending entity | ✅ Prior session |
| Axios ↔ RequestCoordinator | Axios bypasses pause gate | Open (P2) |
| invalidateClientDomain ↔ invalidateInvoiceDomain | Cascade on client change | Open (P1) |
