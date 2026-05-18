# Paidly — Runtime Final Stability Report

> Updated: 2026-05-18 (final stability pass)

---

## Audit Scope

Full cross-system inspection of every runtime layer:
- `src/core/auth/SessionCoordinator.ts`
- `src/core/runtime/RuntimeBudgetCoordinator.ts`
- `src/core/runtime/RuntimeCoordinator.ts`
- `src/core/realtime/RealtimeManager.ts`
- `src/core/query/queryFocusPolicy.ts`, `queryPolicies.ts`
- `src/lib/realtime/paidlyRealtimeManager.js`
- `src/lib/connection/ConnectionLifecycleManager.js`
- `src/lib/session/RefreshQueue.js`, `sessionRefreshScheduler.js`, `WakeRecoveryPipeline.js`
- `src/lib/auth/authReconnectEscalation.js`
- `src/lib/queryInvalidation.js`, `realtimeEntityReconciliation.js`, `realtimeInvoiceReconciliation.js`, `realtimeClientReconciliation.js`
- `src/components/sync/SyncEngine.jsx`
- `src/lib/query-client.js`

---

## Bugs Fixed (this pass — 2026-05-18)

### BUG-01 — Expense reconciler bypassed scheduleInvalidation coalescing

**File:** `src/lib/realtimeEntityReconciliation.js`

`reconcileExpenseRealtimeEvent` called `queryClient.invalidateQueries({ queryKey: ["cashflow-page"] })` directly. Every other reconciler (invoice, client, quote, payslip) routes cashflow-page invalidations through `scheduleInvalidation(queryClient, ["cashflow-page"])` which coalesces within a 300ms window. During payroll runs or bank import bursts, many expense postgres_changes events fire in a tight sequence. Each bypassed call triggered a separate full refetch of the cashflow-page query (which runs 3 parallel list fetches).

**Fix:** `reconcileExpenseRealtimeEvent` now calls `scheduleInvalidation(queryClient, ["cashflow-page"])`.

---

### BUG-02 — Payment reconciler bypassed scheduleInvalidation for cashflow-page

**File:** `src/lib/realtimeEntityReconciliation.js`

`reconcilePaymentRealtimeEvent` also called `queryClient.invalidateQueries({ queryKey: ["cashflow-page"] })` directly at line 137. Same burst risk as BUG-01 during payment recording sessions.

**Fix:** Now uses `scheduleInvalidation(queryClient, ["cashflow-page"])`.

---

### BUG-03 — onWakeResync double-fired invoice invalidations

**File:** `src/components/sync/SyncEngine.jsx`

The `WAKE_RECOVERY_RESYNC` event handler called:
```js
invalidateInvoiceDomain(queryClient, { scopeKey })   // → ["invoice-list", scopeKey], ["invoices","list"], ["invoices"], ["cashflow-page"]
...
invalidateClientDomain(queryClient, { scopeKey })    // → ["client-list", scopeKey], ["clients"], then CALLS invalidateInvoiceDomain AGAIN
```

`invalidateClientDomain` always cascades into `invalidateInvoiceDomain` by design — invoice list items display client names, so a client update makes invoice caches stale. This cascade is correct in the realtime reconciliation path. In the wake recovery resync path however, invoice caches were already being invalidated 3 lines earlier. The `invalidateClientDomain` call re-fired every invoice invalidation.

At the same time, `invalidateWakeRecoveryWorkspaceQueries()` in WakeRecoveryPipeline had already invalidated `["invoices"]` before dispatching the resync event. Total invoice invalidation count per wake: **3 waves**.

**Fix:** In `onWakeResync`, replaced `invalidateClientDomain(queryClient, { scopeKey })` with direct client-only invalidations:
```js
if (scopeKey) queryClient.invalidateQueries({ queryKey: ["client-list", scopeKey], exact: false });
queryClient.invalidateQueries({ queryKey: ["clients"], exact: false });
```
Invoice invalidations now fire exactly **once** from the `invalidateInvoiceDomain` call.

---

### BUG-04 — FocusRefetch.EAGER and FocusRefetch.LIVE were identical

**File:** `src/core/query/queryFocusPolicy.ts`

Both `FocusRefetch.EAGER` and `FocusRefetch.LIVE` exported `{ refetchOnWindowFocus: true }`. The EAGER documentation claimed it would "refetch on focus only when data is older than staleTime" — TanStack Query v5 has no such distinction. `refetchOnWindowFocus: true` always refetches on focus regardless of staleTime. Any component using `FocusRefetch.EAGER` expecting conservative behaviour was silently getting aggressive refetch behaviour.

**Fix:** Removed `FocusRefetch.EAGER`. `FocusRefetch` now has only `LIVE` and `NONE`. Added documentation of the TanStack limitation.

---

### BUG-05 — CashFlow.jsx used inline focus policy bypassing the controlled registry

**File:** `src/pages/CashFlow.jsx`, `src/core/query/queryFocusPolicy.ts`

`refetchOnWindowFocus: true` was set inline in the CashFlow useQuery call. This bypassed `FOCUS_LIVE_QUERY_ROOTS` and `getFocusPolicy`. If the policy or the set changed, CashFlow would not pick it up. Additionally, `cashflow-page` was not registered in `FOCUS_LIVE_QUERY_ROOTS`, meaning `getFocusPolicy('cashflow-page')` would have returned `NONE`, contradicting the inline override.

**Fix:**
- Added `cashflow-page` to `FOCUS_LIVE_QUERY_ROOTS`.
- CashFlow now uses `...getFocusPolicy("cashflow-page")` so the policy is centrally controlled.

---

### BUG-06 — RuntimeBudgetCoordinator.recordAndCheckReconnectRate() was dead code

**File:** `src/lib/realtime/paidlyRealtimeManager.js`

`recordAndCheckReconnectRate()` existed in RuntimeBudgetCoordinator but was never called. The shared cross-system reconnect counter always read 0. `getRuntimeBudgetSnapshot().reconnectCount` was useless for diagnostics. paidlyRealtimeManager has its own internal rate limits (REBUILD_HARD_RATE_MAX_IN_WINDOW, transport burst window, circuit breaker) that correctly prevent storms — but the shared budget tracker carried no data.

**Fix:** `recordAndCheckReconnectRate()` is now called in `runChannelRebuild()` after all internal guards pass, just before the WebSocket teardown. Every actual rebuild is now tracked in the shared 60-second rate window. `getRuntimeBudgetSnapshot()` now reports accurate data.

---

## Confirmed Stable (no changes required)

| System | Guarantee |
|--------|-----------|
| SessionCoordinator | 3-tier fast path (store → snapshot → single-flight) correct; snapshot invalidation correctly positioned post-logout |
| RuntimeCoordinator | 8-state machine is non-reentrant; all timers are cancelled before rescheduling |
| RefreshQueue | `inFlightPromise` single-flight absolute; 3s throttle prevents rapid repeat calls |
| sessionRefreshScheduler | `mergedSources` coalesces concurrent callers; `flushTail` chain ensures sequential execution |
| paidlyRealtimeManager | Does NOT rebuild healthy channel on JWT rotation; generation counter prevents stale callbacks |
| authReconnectEscalation | Circuit breaker (OPEN/HALF_OPEN/CLOSED) with backoff ladder and terminal cutoff at 5 consecutive failures |
| WakeRecoveryPipeline | Single orchestration surface; realtime recovery awaited before resync dispatch |
| SyncEngine intervals | `runningRef` prevents reentrant job processing; `SYNC_INTERVAL_MS=5000` stable |
| TanStack global defaults | `refetchOnWindowFocus: false`, `retry: false`, `placeholderData: prev => prev` all confirmed |
| Realtime entity routing | Each entity has exactly ONE reconciliation path; PAIDLY_REALTIME_SYNC_TABLES prevents duplicate subscriptions |

---

## System Health Summary

**Before this pass:**
- Expense/payment event bursts → uncoalesced cashflow-page refetch per event
- Wake recovery → 3 invoice invalidation waves
- FocusRefetch.EAGER misrepresented TanStack behaviour
- CashFlow inline focus policy diverged from the registry
- RuntimeBudgetCoordinator reconnect tracker was always 0

**After this pass:**
- All reconciler invalidations coalesced through RuntimeBudgetCoordinator.scheduleInvalidation
- Wake recovery → 1 invoice invalidation wave
- Focus policy is consistent and centrally governed
- Cross-system reconnect budget tracking is live

**Outstanding risks:** See `remaining-risk-analysis.md`
