# Paidly — Reconnect Storm Root Cause Analysis

> Audit date: 2026-05-18

---

## Summary

Three root causes drove non-stop reconnecting and app-wide slowness. All three have been fixed.

---

## Root Cause 1 — JWT refresh forced WebSocket teardown on every token rotation

**File:** `src/lib/realtime/paidlyRealtimeManager.js`

**Mechanism:**

Every `TOKEN_REFRESHED` Supabase auth event triggered `reconcilePaidlyRealtimeAfterTokenRefresh()`. That function correctly called `supabase.realtime.setAuth(accessToken)` — which pushes the new JWT to the existing WebSocket. But it then unconditionally called `runChannelRebuild(force: true)`, tearing down and recreating the entire channel.

GoTrue fires `TOKEN_REFRESHED` roughly every 55–60 minutes (proactive refresh) and again when the token is actually exchanged. With the default 1-hour token lifetime, the channel rebuilt itself at minimum once per hour under normal operation — more often when visibility events triggered additional refreshes.

**Symptoms:**
- Non-stop "connecting…" indicator in the status bar after every token rotation
- Brief gap in realtime events while the channel teardown/rebuild completed
- `CHANNEL_ERROR` → backoff cycle if the rebuild arrived at a bad moment

**Fix:**
Added `isPaidlyRealtimeMainChannelJoined()` guard in `flushJwtRebuild`. When the channel is in `joined` state, `setAuth` is sufficient — no rebuild occurs. The rebuild path only activates when the channel is actually unhealthy.

```js
// Before: always rebuilt
runChannelRebuild(`jwt_refresh:${reason}`, { force: true });

// After: skip if healthy
if (isPaidlyRealtimeMainChannelJoined()) {
  paidlyRealtimeLog("reconnect_suppressed", { kind: "jwt_refresh_channel_healthy" });
  return;
}
runChannelRebuild(`jwt_refresh:${reason}`, { force: true });
```

---

## Root Cause 2 — SyncEngine interval reset on every sync job state transition

**File:** `src/components/sync/SyncEngine.jsx`

**Mechanism:**

`runOnce` had the entire `queue` array (from `useSyncQueueStore`) in its `useCallback` dependency array. Zustand's default behavior returns a new array reference on every `set()` call. Every job status transition (`pending→processing`, `processing→done`, `done→pruned`) created a new array → new `runOnce` reference → the `setInterval` effect saw a changed dep → teardown + recreate the 5-second interval.

The same churn applied to the online/focus event listener effect which also had `runOnce` in its deps. During active sync with 3–5 jobs:
- Each job completion cycled through 2 status changes (→processing, →done)
- 6–10 interval teardown/recreate events per sync batch
- Unpredictable interval cadence — the 5-second clock kept resetting
- Constant `addEventListener`/`removeEventListener` thrash in DevTools

**Fix:**
Removed `queue` from component state entirely. `runOnce` now reads `useSyncQueueStore.getState().queue` as a snapshot at call time. The interval and event listeners are now stable for the component's lifetime.

---

## Root Cause 3 — Hidden-tab polling storm from concurrent `setInterval` loops

**File:** `src/lib/paidlyRealtimeReconciliationEngine.js`

**Mechanism:**

`whenDocumentVisible()` and `runWhenDocumentVisible()` used a 600ms `window.setInterval` to poll `document.visibilityState`. Every debounced realtime entity event that arrived while the tab was hidden created its own polling interval. On an active account with 7 entity types (invoices, clients, quotes, payments, expenses, payslips, document_sends) all active, a burst of realtime events could spawn 7+ simultaneous 600ms intervals, all running in parallel, all reading the DOM every 600ms.

**Fix:**
Both functions now register a single `visibilitychange` event listener per call, with a `setTimeout` fallback. Zero CPU usage while hidden; resolves instantly on the next tab focus event.

---

## Secondary Issues (Not Bugs, But Risk Areas)

### Multiple `getSession()` calls on tab focus

On every tab becoming visible, up to 4 concurrent `supabase.auth.getSession()` calls were issued from:
1. `AuthContext` visibility handler (direct call)
2. `ConnectionMonitor.runCheck()` → `runSupabaseHealthCheck()` (direct call)
3. `SyncEngine.scheduleEntityInvalidation()` (per pending entity event)
4. `SyncEngine.scheduleGlobalStoreRefresh()` (fallback path)

GoTrue's in-memory session cache means these rarely cause network traffic, but they do represent lock contention on GoTrue's internal `_acquireLock`, especially when one of them triggers a token refresh.

**Fix:** `SessionCoordinator.ts` provides a single-flight `getStableSession()` and a synchronous `hasActiveSession()` guard. SyncEngine now uses these instead of raw `supabase.auth.getSession()` calls.

### Full-store reloads on non-invoice realtime events

Quotes, payments, expenses, payslips, and document_sends all returned `false` from `invalidateForEntity`, triggering `scheduleGlobalStoreRefresh()` → `fetchAllFromStore(user)`. A full data reload on a `payment` row change is disproportionate.

**Fix:** `realtimeEntityReconciliation.js` adds patch-first reconcilers for all five entity types, returning `true` to skip the global reload.

### Global `refetchOnWindowFocus: true`

The `QueryClient` global default allowed any mounted stale query to refetch on tab focus. Combined with the realtime recovery path and session refresh, this created a triple-whammy on focus: realtime rebuild + session check + all stale queries refetching simultaneously.

**Fix:** Global default changed to `false`. Queries that genuinely need focus refresh use `FocusRefetch.LIVE` from `queryFocusPolicy.ts`.

---

## Reconnect Loop That Cannot Happen (by design)

The following feedback loop was audited and confirmed safe:

```
CHANNEL_ERROR
  → recordRealtimeSubscribeFailure()  (max 5 before circuit opens)
  → requestPaidlyRealtimeErrorRecovery() (exponential backoff 1s→30s)
  → runChannelRebuild()
  → SUBSCRIBED  → resetReconnectBackoffAndFailures()
```

The 5-failure circuit breaker, 120s cooldown, 35s transport burst cooldown, and 90s hard rate suppress together prevent this loop from running unbounded. These were confirmed correct and were NOT modified.
