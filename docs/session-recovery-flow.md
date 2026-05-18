# Paidly — Session Recovery Flow

> Updated: 2026-05-18

---

## Recovery Taxonomy

Three classes of failure require different recovery strategies:

| Class | Examples | Recovery | Terminal? |
|-------|----------|----------|-----------|
| **Transport** | WebSocket closed, DNS flake, 503 | Backoff + reconnect; never sign-out | No |
| **Auth (recoverable)** | Token expired, clock skew | Token refresh via mutex | No |
| **Auth (fatal)** | Invalid refresh token, session revoked, MFA forced | Sign-out + redirect to login | Yes |

**Critical rule:** Transport failures must **never** trigger sign-out. Only explicit fatal auth evidence triggers terminal transitions.

---

## Recovery Entry Points

All recovery initiators funnel through `requestSessionRefresh()` (via `sessionRefreshScheduler.js`):

| Trigger | Source | Notes |
|---------|--------|-------|
| Tab becomes visible (short gap) | `AuthContext` visibility handler | Throttled by `RefreshQueue.minGapMs` |
| Tab becomes visible (long gap) | `WakeRecoveryPipeline` | Bypasses throttle; full recovery sequence |
| `navigator.online` event | `AuthContext` online handler | `bypassThrottle: true` |
| Session heartbeat (60s) | `AuthContext` interval | Visibility + network gated |
| Back-forward cache restore | `pageshow` handler | `bypassThrottle: true` |
| Cross-tab sync message | `authTabSync` channel | `AUTH_SESSION_UPDATED` message |
| `TOKEN_REFRESHED` / `USER_UPDATED` Supabase event | `onAuthStateChange` | Already refreshed; reconciles realtime JWT |
| Proactive (55s before expiry) | Timer in `AuthContext` | `silent: true` |
| Realtime channel unstable | `ConnectionLifecycleManager` | Escalation only if believed signed in |
| Unauthorized API response (401/403) | `setUnauthorizedSessionHandler` | Classified → recovery or fatal |

---

## Refresh Mutex (Single-Flight)

`RefreshQueue` (`src/lib/session/RefreshQueue.js`) ensures at most one refresh runs at a time:

```
requestSessionRefresh(opts)
  └── RefreshQueue.enqueue(task, meta)
        ├── halted? → refreshSkipped("queue_halted")
        ├── inFlightPromise? → join or return refreshRetrying("joined_in_flight")
        ├── < minGapMs (3s) && !bypassThrottle? → refreshSkipped("throttled")
        └── run task → return result
```

Cross-tab guard in `supabaseAuthRefresh.js`:
- `isFreshEnough()` checks token expiry before calling GoTrue (avoids consuming a rotation already applied by another tab)
- `localStorage` lock prevents concurrent refresh across tabs

---

## Wake Recovery Pipeline

Triggered when tab becomes visible after `shouldEnterWakeRecoveryMode()` returns true (heartbeat gap exceeded).

```
runWakeRecoverySequence({ hiddenAtMs, reason })
  ├── guard: wakeRecoveryInFlightRef || isRecoveryCircuitOpen() → skip
  ├── AppRecoveryLock.begin(reason) — blockMutations = true
  ├── connectionLifecycle.reportRecoveryWake("wake_recovery", { blockingMutations: true })
  │
  ├── Phase 1 (auth): refreshSession({ source: "wake_recovery", bypassThrottle: true })
  │     └── ok? → Phase 2
  │         !ok? → FAILED → reconnectEscalationController.schedule()
  │
  ├── Phase 2 (realtime): awaitRealtimeRecoveryAndMainChannel({ timeoutMs: 12s })
  │     └── ok? → Phase 3
  │         !ok? → FAILED
  │
  ├── Phase 3 (resync): refreshUser() + enforceRouteInvariant()
  │
  └── finally:
        AppRecoveryLock.end() — blockMutations = false
        dispatch WakeRecoveryLifecycleEventType.SUCCEEDED / FAILED / ENDED
```

During the pipeline: `recoveryLockBlocksRealtimeDelivery()` silently drops all `postgres_changes` events.

---

## Auth Circuit Breaker

`isRecoveryCircuitOpen()` returns `true` when:
- `sessionHealthStore.status === "expired"`, OR
- `sessionHealthStore.status === "reauth_required"`, OR
- `ConnectionLifecycleManager` has marked auth invalid

When the circuit is open:
- `requestSessionRefresh()` is a no-op
- `useSyncQueueStore.pendingJobs()` are not processed
- `paidlyRealtimeManager.runChannelRebuild()` returns immediately
- `WakeRecoveryPipeline` exits without starting
- `refreshSession()` returns `refreshSkipped("session_health_expired")`

**Exiting the terminal state:** Only `supabase.auth.onAuthStateChange` with `SIGNED_IN` / `INITIAL_SESSION` event can reset the circuit.

---

## Reconnect Escalation Controller

`createReconnectEscalationController` provides a debounced, single-flight reconnect attempt that falls back to the escalation ladder:

```
reconnectEscalationCtlRef.current.schedule()
  └── debounced refresh via supabaseRefreshSession() (routes through mutex)
        ├── ok → connectionLifecycle.markConnected("reconnect_escalation_ok")
        ├── transient error → sessionManager.RefreshManager.escalateRecoverableSession()
        └── fatal → sessionManager.RefreshManager.handleFatal()
```

All paths route through `refreshSupabaseSessionWithRecovery()` — never raw `supabase.auth.refreshSession()`.

---

## Unauthorized Handler

`setUnauthorizedSessionHandler(handleUnauthorizedSession)` in AuthContext handles API 401/403 responses:

```
handleUnauthorizedSession(reason, context)
  │
  ├── isFatalUnauthorized? (refreshFatal, invalid_refresh_token, session_revoked, etc.)
  │     ├── AppRecoveryLock.begin("refresh_token_invalid")
  │     ├── User.logout()
  │     ├── sessionManager.RefreshManager.handleFatal(reason)
  │     └── purgeSupabaseAuthStorage() + purgeQueryClientAfterLogout()
  │
  ├── shouldRequireReauth(reason)?
  │     └── No → reportVisibilityRecover() (transient)
  │
  └── escalateRecoverableSession(reason)
        ├── forceTerminalLogout? → full logout flow
        └── !forceTerminalLogout → requestSessionRefreshGuarded()
```

---

## Multi-Tab Behavior

`createAuthTabSyncChannel()` uses `BroadcastChannel` to synchronize:

| Message | Trigger | Effect in other tabs |
|---------|---------|---------------------|
| `AUTH_SIGNED_OUT` | Manual logout | `transitionToExpired("signed_out_in_another_tab")` → redirect |
| `AUTH_SESSION_UPDATED` | `SIGNED_IN` / `TOKEN_REFRESHED` | `requestSessionRefreshGuarded({ source: "auth_tab_sync" })` |
| `AUTH_REAUTH_REQUIRED` | Terminal auth in one tab | `transitionToExpired(reason)` → redirect in all tabs |

---

## Invariants (do not violate)

1. All refresh paths route through `RefreshQueue.enqueue()` — never call `supabase.auth.refreshSession()` directly.
2. Terminal `EXPIRED` state can only be exited by `SIGNED_IN` or `INITIAL_SESSION` Supabase events.
3. `AppRecoveryLock.begin()` must always have a matching `AppRecoveryLock.end()` in `finally`.
4. Never add a second `onAuthStateChange` listener — one instance only in `AuthContext.impl.jsx`.
5. Do not call `signOut()` from transport-error handlers unless `isRefreshTokenFatalError()` returns true.
