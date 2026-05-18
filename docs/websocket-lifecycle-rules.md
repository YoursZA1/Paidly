# Paidly — WebSocket Lifecycle Rules

> Updated: 2026-05-18

---

## The Single Channel Rule

There is exactly one Supabase Realtime channel for the entire app: `paidly-sync-realtime`. All postgres_changes subscriptions (SyncEngine entities, profiles, notifications, aux tables) are multiplexed on this channel. **Never create a second postgres_changes channel from a component.** Use `useSupabaseRealtime` hook or the `subscribePaidly*` APIs.

---

## When to Rebuild vs. When to Use `setAuth`

| Situation | Correct Action |
|-----------|---------------|
| JWT rotated, channel `state === "joined"` | `setAuth(newToken)` only — no rebuild |
| JWT rotated, channel unhealthy / not joined | `setAuth` + `runChannelRebuild` |
| `CHANNEL_ERROR` / `TIMED_OUT` status | `requestPaidlyRealtimeErrorRecovery()` (backoff + rebuild) |
| Tab becomes visible, channel joined | No action — `checkPaidlyRealtimeOnVisibilityRestore()` suppresses rebuild |
| Tab becomes visible, channel stale | `requestPaidlyRealtimeErrorRecovery("visibility_restore")` via rate-limited path |
| Wake recovery pipeline Phase 2 | `awaitRealtimeRecoveryAndMainChannel()` — pipeline owns the rebuild |
| User manually triggers refresh | `resetPaidlyRealtimeForUserRecovery()` — clears all cooldowns + force rebuild |

---

## Rebuild Suppression Layers (outermost first)

```
1. isRecoveryCircuitOpen()
   — auth terminal state; any rebuild would connect an unauthenticated socket
   — exits only on SIGNED_IN / INITIAL_SESSION Supabase event

2. isBrowserOffline()
   — navigator.onLine === false; rebuild deferred until "online" event

3. isRealtimeCircuitBreakerOpen()
   — ≥5 consecutive subscribe failures within 120s cooldown
   — bypass: JWT refresh origin, post-cooldown timer

4. isTransportCooldownActive()
   — ≥4 failures within 12s → 35s cooldown (burst protection)
   — bypass: JWT refresh origin

5. isReconnectHardSuppressed()
   — ≥10 rebuilds in 90s → 90s suppress
   — bypass: JWT refresh origin, post-cooldown wake

6. rebuildInFlight
   — a subscribe handshake is in progress; queue one rebuild via rebuildQueued flag

7. REBUILD_MIN_INTERVAL_MS (1.4s)
   — minimum spacing between rebuilds; defer via timer if too soon

8. isPaidlyRealtimeMainChannelJoined() [JWT path only]
   — skip rebuild entirely when channel is already healthy
```

---

## JWT Rotation Protocol

1. `AuthContext.onAuthStateChange` receives `TOKEN_REFRESHED` with `nextSession`
2. `reconcileRealtimeJwtFromSupabaseAuthEvent(event, accessToken)` is called
3. `reconcilePaidlyRealtimeAfterTokenRefresh(accessToken)`:
   a. `supabase.realtime.setAuth(accessToken)` — pushes new JWT to existing socket (always runs)
   b. Coalesce duplicate signals in the same JS turn (`authRotateCoalesce`)
   c. If `JWT_CHANNEL_REBUILD_MIN_MS` (2s) hasn't elapsed since last JWT rebuild — skip
   d. **If `isPaidlyRealtimeMainChannelJoined()` — skip rebuild** (new behavior)
   e. Otherwise: `runChannelRebuild("jwt_refresh:*", { force: true })`

The result: `setAuth` runs on every rotation, maintaining token freshness in the existing socket. The channel is only rebuilt if it was already unhealthy.

---

## Heartbeat (22s interval)

The 22s heartbeat checks `channelInstance.state`:
- `state === "joined"` → no action
- `state !== "joined"` → log stale, rate-limited trigger of `requestPaidlyRealtimeErrorRecovery`
- `channelInstance == null` → log stale, rate-limited trigger
- Post-subscribe grace: 5s after a successful SUBSCRIBED status is ignored (state catch-up)
- Heartbeat reconnect minimum: 45s between heartbeat-driven reconnects

---

## Subscribe Watchdog (20s)

If the channel's subscribe callback does not fire within 20s of `createAndSubscribeMainChannel()`, the watchdog:
1. Sets `rebuildInFlight = false` (unblocks the in-flight guard)
2. Calls `recordRealtimeSubscribeFailure("subscribe_watchdog_expired")`
3. Calls `requestPaidlyRealtimeErrorRecovery("subscribe_watchdog_expired")` with backoff

This prevents a hung WebSocket handshake from permanently blocking all future rebuilds.

---

## Visibility Rules

| Tab state | Realtime behavior |
|-----------|-----------------|
| Hidden | Heartbeat skips all checks |
| Visible (short gap) | Rate-limited stale check only; no rebuild if joined (VISIBILITY_RECONNECT_MIN_MS: 30s) |
| Visible (long gap, wake) | WakeRecoveryPipeline owns the rebuild (Phase 2) |
| Online event | `notifyPaidlyRealtimeNavigatorOnline()` + optional error recovery if stale |

---

## Invariants

1. **Never call `schedulePaidlyRealtimeRebuild()` directly from feature code.** Route through `ConnectionLifecycleManager.reportRealtimeUnstable()`.
2. **Never create a `supabase.channel()` for a table in `PAIDLY_REALTIME_SYNC_TABLES`.** Use `setPaidlySyncRealtimeBridge()`.
3. **Never bypass the circuit breaker** unless you have a JWT origin or a post-cooldown wake signal.
4. **`rebuildInFlight` must always be reset**, either by the subscribe callback or by the watchdog. Never leave it `true` permanently.
5. **JWT rebuild skips when channel is healthy** — `setAuth()` is sufficient for token rotation.
