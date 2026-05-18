# Paidly — Auth Flow Guarantees

> Updated: 2026-05-18 (final stability pass)

---

## Core Guarantees

The following guarantees are enforced by code structure, not convention. Each guarantee lists the mechanism that enforces it.

---

### G-01: No parallel session refresh

**Guarantee:** At most one `supabase.auth.refreshSession()` call is in flight at any time within a tab.

**Mechanism:**
```
RefreshQueue.enqueue(task)
  └─ if (inFlightPromise) return inFlightPromise   ← concurrent callers join, not start
  └─ else { inFlightPromise = task(); ... }         ← only one task starts
```

**Secondary guard:** `refreshSupabaseSessionWithRecovery()` checks `isFreshEnough()` before initiating — if the token has been refreshed within the last N seconds, the call returns without hitting Supabase.

**Cross-tab guard:** `authTabSync` localStorage lock — only the tab that acquires the lock executes the refresh. Other tabs read the updated session from storage.

**Validated:** RefreshQueue does not expose a way to bypass `inFlightPromise` except through `bypassThrottle` (which bypasses the 3s throttle, not the in-flight guard).

---

### G-02: No direct supabase.auth.refreshSession() calls outside the refresh pipeline

**Guarantee:** `supabase.auth.refreshSession()` is only called from `supabaseAuthRefresh.js` → `refreshSupabaseSessionWithRecovery()`.

**Mechanism:** The `authReconnectEscalation.js` runProbe path calls `supabaseRefreshSession` which is injected via `getDeps()` — this injection is set to the safe wrapper in AuthContext, not the raw Supabase method.

**Known exception:** `supabaseAuthRefresh.js` itself calls `supabase.auth.refreshSession()` at lines 157 and 162 — this IS the implementation, so it's correct.

**Validation:** No `supabase.auth.refreshSession()` calls exist outside `supabaseAuthRefresh.js`.

---

### G-03: Single onAuthStateChange listener

**Guarantee:** Exactly one `supabase.auth.onAuthStateChange` listener is registered per tab.

**Mechanism:** Registered once in `AuthContext.impl.jsx`, never in other components. Memory note explicitly warns against adding a second listener.

**Validated:** `grep "onAuthStateChange"` finds only one registration site in the app code.

---

### G-04: Terminal auth states permanently halt recovery

**Guarantee:** Once the session enters EXPIRED or REAUTH_REQUIRED state, all refresh and reconnect attempts cease immediately.

**Mechanism:**
```
isRecoveryCircuitOpen() returns true when:
  - sessionHealthStore.status === EXPIRED
  - sessionHealthStore.status === REAUTH_REQUIRED
  - connectionLifecycleStore.auth.phase === "expired" | "expired_surface"

Gates (all check isRecoveryCircuitOpen() first):
  - sessionRefreshScheduler.requestSessionRefresh()  → cancel + return
  - SyncEngine.runOnce()                             → return
  - SyncEngine.scheduleEntityInvalidation()          → return
  - schedulePaidlyRealtimeRebuild()                  → return
  - requestPaidlyRealtimeErrorRecovery()             → return
  - authReconnectEscalation.schedule()               → terminalizing = true, return
```

**EXPIRED is terminal:** `SESSION_STATUS.EXPIRED` is set only by `transitionToExpired()` which also calls sign-out. There is no transition FROM EXPIRED back to CONNECTED.

---

### G-05: Session reads are coordinated through SessionCoordinator for all runtime paths

**Guarantee:** SyncEngine, realtime reconcilers, and wake recovery all read session through SessionCoordinator's single-flight/cached path.

**Mechanism:**
- `SyncEngine.runOnce()` calls `getStableSession()` before processing jobs
- `SyncEngine.scheduleEntityInvalidation()` calls `hasActiveSession()` before reconciling
- `SyncEngine.scheduleGlobalStoreRefresh()` calls `hasActiveSession()` before fetching
- `WakeRecoveryPipeline` reads session via `readSessionSafe()` (injected from AuthContext, which wraps the same coordinator path)

**Known gap (R-01 in remaining-risk-analysis.md):** Feature components (pages, services) call `supabase.auth.getSession()` directly for ad-hoc token grabs. These are generally safe (sequential single calls, not loops) but bypass the 5s snapshot cache.

---

### G-06: Realtime JWT is always current after token refresh

**Guarantee:** The Supabase Realtime WebSocket connection receives the new JWT within one macrotask of every successful token refresh.

**Mechanism:**
```
refreshSupabaseSessionWithRecovery() success
  └─ AuthContext executor: reconcileRealtimeJwt(accessToken, reason)
      └─ reconcilePaidlyRealtimeAfterTokenRefresh(accessToken, reason)
          ├─ supabase.realtime.setAuth(accessToken)   ← JWT pushed to existing socket
          └─ if (!isPaidlyRealtimeMainChannelJoined()) → rebuild channel
```

`setAuth()` runs even if the channel is already joined (safe no-op on the auth side). The channel is only torn down and rebuilt if it was not in a joined state, preventing unnecessary reconnect storms.

---

### G-07: Wake recovery is non-reentrant

**Guarantee:** At most one wake recovery pipeline runs at a time per tab.

**Mechanism:** `AppRecoveryLock.acquire()` returns false if already locked. The AuthContext wrapper checks this before calling `runWakeRecoveryPipeline()`.

**Secondary effect:** `wakeRecoveryStore.blockMutations = true` during the recovery window. This prevents realtime postgres_changes from being delivered to SyncEngine, preventing cache mutations while the session is in an uncertain state.

---

### G-08: Reconnect escalation has a hard ceiling

**Guarantee:** The reconnect escalation loop stops permanently after 5 consecutive failures.

**Mechanism:** `authReconnectEscalation.createReconnectEscalationController()`:
```
consecutiveFailures >= MAX_RECONNECT_ATTEMPTS (5)
  └─ terminalizing = true
  └─ sessionManager.RefreshManager.handleFatal("reconnect_loop_break")
      └─ → transitions to terminal session state (EXPIRED/REAUTH_REQUIRED)
          └─ isRecoveryCircuitOpen() returns true → all recovery halted
```

Jitter on backoff delays (±15%) prevents multi-tab thundering herd when multiple tabs all hit the same failure condition simultaneously.

---

### G-09: No rebuild of a healthy WebSocket connection

**Guarantee:** The realtime multiplex channel is never torn down and rebuilt if it is already in `joined` state, regardless of how many JWT rotation events or visibility events fire.

**Mechanism:**
```
reconcilePaidlyRealtimeAfterTokenRefresh():
  └─ setAuth(accessToken) pushed unconditionally
  └─ if (isPaidlyRealtimeMainChannelJoined()) {
       paidlyRealtimeLog("reconnect_suppressed", { kind: "jwt_refresh_channel_healthy" });
       return;
     }

runVisibilityReconnectCheckInternal():
  └─ if (isPaidlyRealtimeMainChannelJoined()) {
       paidlyRealtimeLog("reconnect_suppressed", { kind: "visibility_restore_channel_healthy" });
       return;
     }
```

This prevents the most common source of WebSocket reconnect storms: every tab focus + token refresh combination triggering a channel rebuild even when the connection is healthy.

---

## Session State Machine

```
                    bootstrap
                       │
                       ▼
                   CONNECTED
                  /    │    \
          focus  /     │     \ network loss
         resync /      │      \
               /   token OK    \
     UNSTABLE ◄─────────────────► RECONNECTING
        │                              │
        │ attempts failed              │ session missing
        ▼                              ▼
   DEGRADED                    REAUTH_REQUIRED
        │
        │ fatal error
        ▼
     EXPIRED  (terminal — no recovery)
```

All state transitions are mediated through `SessionOrchestrator` / `ConnectionLifecycleManager`. No component or service is permitted to call `transitionToExpired()` directly — this call routes through `connectionLifecycle.transitionToExpired()` which triggers sign-out, clears auth state, and broadcasts to other tabs.

---

## Refresh Token Safety

**Single consumption guarantee:**
1. Only one tab holds the refresh lock at a time (`authTabSync` localStorage lock)
2. Within a tab, `RefreshQueue.inFlightPromise` prevents duplicate consumption
3. The reconnect escalation's `supabaseRefreshSession` is injected from the safe wrapper — not called raw

**Refresh token expiry flow:**
```
supabase.auth.refreshSession() → { error: "refresh_token_not_found" }
  └─ isRefreshTokenFatalError(error) = true
  └─ sessionManager.RefreshManager.handleFatal("refresh_token_invalid")
  └─ transitionToExpired(...)
```

The app will not loop on an expired refresh token. One fatal error permanently opens the recovery circuit.
