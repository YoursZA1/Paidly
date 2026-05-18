# Paidly — Auth Flow Guarantees

> Updated: 2026-05-18

---

## Guarantee 1 — Single-Flight Token Refresh

**What is guaranteed:** At most one `supabase.auth.refreshSession()` call is in flight at any given moment per browser tab.

**How it is enforced:**

All session refresh paths route through `RefreshQueue.enqueue()`:

```
RefreshQueue.enqueue(task, meta)
  ├── halted? → return refreshSkipped("queue_halted")
  ├── inFlightPromise? → join existing promise (OR return refreshRetrying if meta.returnRetryingOnJoin)
  ├── now - lastStartedAt < minGapMs (3s)? → return refreshSkipped("throttled")  [unless bypassThrottle]
  └── execute task → sets inFlightPromise → clears on finally
```

**Paths enforced:**
- `AuthContext.impl.jsx` — `refreshSession()` routes through queue
- `authReconnectEscalation.js` — scheduled recovery routes through queue
- `WakeRecoveryPipeline` — `refreshSession({ bypassThrottle: true })` (bypasses 3s gap, not single-flight)
- Visibility-triggered refresh — `requestSessionRefreshGuarded` → queue

**Invariant:** No code path calls `supabase.auth.refreshSession()` directly except inside `RefreshQueue.enqueue()` task functions.

---

## Guarantee 2 — Single Auth State Listener

**What is guaranteed:** Exactly one `supabase.auth.onAuthStateChange` listener is registered for the lifetime of the app.

**Location:** `src/contexts/AuthContext.impl.jsx` — registered once in the top-level auth context effect.

**Invariant:** No component, hook, or service registers a second `onAuthStateChange` listener. All auth state flows through the single listener which updates `authSessionStore`, `RuntimeCoordinator`, and realtime.

---

## Guarantee 3 — Session State Consistency Across Reads

**What is guaranteed:** All code that reads the session gets a consistent view. Concurrent calls in the same JS turn return the same session object.

**How it is enforced by `SessionCoordinator`:**

```
getStableSession()
  Tier 1 (synchronous): authSessionStore.session if expiresAt > now + 30s
    → 0 network calls; returns immediately
  Tier 2 (cached): _cached snapshot if fetchedAt within 5s
    → 0 network calls; returns from memory
  Tier 3 (single-flighted): supabase.auth.getSession()
    → if _inflight exists: join it (no second Supabase call)
    → otherwise: set _inflight → execute → cache result → clear _inflight
```

**Cache invalidation:** `invalidateSessionSnapshot()` is called on:
- `SIGNED_IN` / `TOKEN_REFRESHED` events (new session is fresher than cache)
- `SIGNED_OUT` events (clears stale session)

---

## Guarantee 4 — No Auth Calls During Recovery

**What is guaranteed:** During `WakeRecoveryPipeline` and `AppRecoveryLock`, no feature code can issue mutations or auth-dependent operations.

**How it is enforced:**

```
AppRecoveryLock.begin() → useWakeRecoveryStore.blockMutations = true
RuntimeCoordinator.beginAuthRecovery() → pauseNonCriticalRequests = true

Guards checking these flags:
  SyncEngine.runOnce()         → checks blockMutations → return
  RequestCoordinator.withSlot() → awaits waitUntilUnpaused()
  SyncEngine.scheduleEntityInvalidation → hasActiveSession() guard
  paidlyRealtimeManager callbacks → recoveryLockBlocksRealtimeDelivery() guard

AppRecoveryLock.end() → blockMutations = false (in finally block — always runs)
RuntimeCoordinator.endAuthRecoverySuccess() → pauseNonCriticalRequests = false
```

**Invariant:** `AppRecoveryLock.begin()` always has a matching `.end()` in a `finally` block.

---

## Guarantee 5 — Terminal Auth States Cannot Self-Resolve

**What is guaranteed:** Once the recovery circuit is open (EXPIRED / REAUTH_REQUIRED), no internal system can exit it. Only external auth events (`SIGNED_IN`, `INITIAL_SESSION`) clear it.

**How it is enforced:**

```
isRecoveryCircuitOpen() returns true when recoveryCircuit.state === "OPEN"
  → checked first in:
    SyncEngine.runOnce()
    SyncEngine.scheduleEntityInvalidation()
    SyncEngine.onEntityEvent()
    paidlyRealtimeManager.requestPaidlyRealtimeErrorRecovery()
    paidlyRealtimeManager.schedulePaidlyRealtimeRebuild()
    paidlyRealtimeManager.runChannelRebuild()
    authReconnectEscalation.schedule()

The circuit clears only on: SIGNED_IN or INITIAL_SESSION Supabase auth events.
```

**Invariant:** No timer, network response, or user action can exit the terminal state without a fresh Supabase auth event.

---

## Guarantee 6 — Cross-Tab Sign-Out Propagation

**What is guaranteed:** Signing out in one tab causes all other tabs to sign out as well (no stale sessions in background tabs).

**How it is enforced:**

```
BroadcastChannel "paidly-auth-sync"
  SIGNED_OUT message → received by all other tabs
    → AuthContext.impl.jsx handles → triggers local sign-out flow
    → authSessionStore.clearSession()
    → RuntimeCoordinator.endAuthRecoveryFatal() or recoveryCircuit.open()
```

**Cross-tab token sync:** `TOKEN_REFRESHED` is also broadcast, updating `authSessionStore` in all tabs without each tab individually calling `refreshSession`.

---

## Guarantee 7 — No Stale Auth During Sync Queue Execution

**What is guaranteed:** The sync queue never processes a job with an expired or missing session. If the session disappears mid-queue, the job is deferred (not silently dropped or executed with stale credentials).

**How it is enforced:**

```
SyncEngine.runOnce():
  1. hasActiveSession() check (synchronous) — not shown, redundant guard
  2. getStableSession() (async, three-tier) → returns null if no session
  3. No session? → requestSessionRefresh (debounced, 8s gap) → return without processing
  4. Session found → markProcessing → processSyncJob
  5. Post-job: hasActiveSession() → only then invalidate queries
```

**Protection against mid-job session expiry:** `processSyncJob` uses the token from the session read at step 2–3. If the token expires during a very long job, the API call may fail with a 401. The job is then `markFailed` with `retryable: true` and retried after the next successful session refresh.

---

## Guarantee 8 — Realtime JWT Always Stays Current

**What is guaranteed:** The Supabase Realtime WebSocket always has the most recent JWT, even when the channel is healthy and not being rebuilt.

**How it is enforced:**

```
TOKEN_REFRESHED → reconcilePaidlyRealtimeAfterTokenRefresh(newToken):
  ├── supabase.realtime.setAuth(newToken)   ← ALWAYS runs, regardless of channel state
  └── isPaidlyRealtimeMainChannelJoined()?
        YES → return (no rebuild)           ← token already pushed via setAuth above
        NO  → runChannelRebuild(force: true) ← rebuild with new token
```

`setAuth` pushes the JWT into the existing WebSocket connection. The channel does not need to be torn down for the new token to take effect. Rebuild is only needed if the channel was already unhealthy.

---

## Auth Flow Decision Table

| Scenario | Action |
|----------|--------|
| App cold start | `INITIAL_SESSION` → `SessionCoordinator.invalidateSessionSnapshot()` → realtime connect |
| 55-minute token rotation | `TOKEN_REFRESHED` → `setAuth` → skip rebuild if joined |
| Tab focus (short gap) | `getSession()` confirm → `requestSessionRefreshGuarded` (3s min gap) |
| Tab wake (long gap) | `WakeRecoveryPipeline` → Phase 1 (refresh) → Phase 2 (realtime) → Phase 3 (resync) |
| Refresh failure | `RefreshQueue` → error → `authReconnectEscalation.schedule()` → backoff |
| 5 consecutive escalation failures | `handleFatal("reconnect_loop_break")` → recoveryCircuit opens |
| Sign out | `SIGNED_OUT` → `clearSession()` → BroadcastChannel → all tabs sign out |
| Tab hidden | Session heartbeat skips; realtime heartbeat skips; no refresh triggered |
| Offline | `RefreshQueue` → `PGRST_NETWORK_ERROR` → escalation → defers until online |
