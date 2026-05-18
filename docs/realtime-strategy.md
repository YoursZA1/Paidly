# Paidly — Realtime Architecture Strategy

> Updated: 2026-05-18

---

## Architecture Overview

All Supabase Realtime postgres_changes events flow through a **single multiplexed channel** (`paidly-sync-realtime`). This eliminates the primary cause of Supabase Realtime channel limits and reconnect storms: multiple components each opening their own channel.

```
Browser Tab
  └── paidly-sync-realtime (one WebSocket)
        ├── postgres_changes: invoices, clients, document_sends, quotes, payments, expenses, payslips
        │     └── SyncBridge → SyncEngine.invalidateForEntity()
        ├── postgres_changes: profiles
        │     └── profileListeners → AuthContext.scheduleRefreshUser()
        ├── postgres_changes: notifications (filter: user_id=eq.{uid})
        │     └── notificationListeners → NotificationBell
        └── postgres_changes: (aux tables via subscribePaidlyAuxPostgres)
              └── auxTableListeners → useSupabaseRealtime hook consumers
```

---

## Key Files

| File | Responsibility |
|------|---------------|
| `src/lib/realtime/paidlyRealtimeManager.js` | Channel lifecycle, reconnect policy, circuit breakers, JWT binding |
| `src/lib/realtime/paidlyRealtimeConnectionMachine.js` | Phase state machine (IDLE→CONNECTING→CONNECTED→FAILED) |
| `src/lib/realtime/paidlyRealtimeStructuredLog.js` | Structured telemetry for all realtime events |
| `src/lib/realtime/authRealtimeCoordinator.js` | JWT rotation → realtime token sync + post-auth rebuild |
| `src/hooks/useSupabaseRealtime.js` | React hook — routes to multiplexed channel, **no direct channel creation** |
| `src/core/realtime/RealtimeManager.ts` | Subscription registry + budget (defined; not yet wired to transport) |

---

## Reconnect Protection (Multi-Layer)

```
Rebuild requested
│
├─ isRecoveryCircuitOpen()? → block (auth terminal)
├─ isBrowserOffline()? → block
├─ realtimeCircuitBreakerOpen()? → block unless JWT-refresh origin (120s cooldown after 5 failures)
├─ isTransportCooldownActive()? → block unless JWT-refresh origin (35s after 4 failures in 12s)
├─ isReconnectHardSuppressed()? → block unless JWT/cooldown-end (90s after 10 rebuilds in 90s)
├─ rebuildInFlight? → queue one rebuild (rebuildQueued flag)
├─ < REBUILD_MIN_INTERVAL_MS (1.4s)? → defer via timer
│
└─ Proceed with rebuild
     ├─ Increment channelSubscribeGeneration (monotonic)
     ├─ destroyMainChannel()
     ├─ createAndSubscribeMainChannel(origin, subscribeGen)
     └─ startSubscribeWatchdog(20s) — resets rebuildInFlight if callback never fires
```

---

## JWT Rotation Protocol

On `TOKEN_REFRESHED` event in `AuthContext`:
1. `reconcileRealtimeJwtFromSupabaseAuthEvent(event, accessToken)` → calls `reconcilePaidlyRealtimeAfterTokenRefresh(accessToken)`
2. `supabase.realtime.setAuth(accessToken)` — pushes new JWT to existing WebSocket
3. Coalesce duplicate signals in the same JS turn via `authRotateCoalesce` flag
4. Throttle channel rebuilds: min 2s between JWT-driven rebuilds
5. **Force rebuild** (bypass most rate limits) — JWT origins bypass circuit breaker, transport cooldown, and hard suppress

---

## Subscription APIs

```js
// SyncEngine entity events (tables: invoices, clients, etc.)
setPaidlySyncRealtimeBridge({ userId, onEntityEvent })

// Profile changes (AuthContext)
subscribePaidlyProfilesRealtime(listener) → unsub()

// Notifications (NotificationBell)
subscribePaidlyNotificationsRealtime(userId, listener) → unsub()

// Aux tables (useSupabaseRealtime hook)
subscribePaidlyAuxPostgres({ schema, table, filter }, listener) → unsub()
```

Guard: `subscribePaidlyAuxPostgres` **rejects** tables in `PAIDLY_REALTIME_SYNC_TABLES` to prevent duplicate subscriptions.

---

## Visibility Behavior

| Context | Behavior |
|---------|---------|
| Tab hidden | Heartbeat skips checks (`visibilityState !== "visible"`) |
| Tab visible (short gap) | `checkPaidlyRealtimeOnVisibilityRestore()` — rate-limited 30s, skipped if channel already joined |
| Tab visible (long gap, wake) | `WakeRecoveryPipeline` — forced realtime rebuild after auth recovery |
| Channel joined → stays visible | No action taken |

---

## Delivery Gate

`recoveryLockBlocksRealtimeDelivery()` checks `useWakeRecoveryStore.getState().blockMutations`. When `true` (during `WakeRecoveryPipeline`), all `postgres_changes` event callbacks return early. This prevents stale events from the pre-wake window from polluting the cache.

---

## `RealtimeManager.ts` — Status and Migration Path

`src/core/realtime/RealtimeManager.ts` defines a subscription registry with:
- Named handles (dedup by name)
- Budget limit (max 12 logical subscriptions)
- `pauseAll()` / `resumeAll()` API

**Current status:** Defined but not wired. The transport is managed entirely by `paidlyRealtimeManager.js`.

**Migration path:**
1. Wrap existing subscribe calls behind `RealtimeManager.register()`:
   ```ts
   mgr.register("sync", () => { setPaidlySyncRealtimeBridge(...); return () => setPaidlySyncRealtimeBridge({ userId: null, onEntityEvent: null }); });
   ```
2. Use `mgr.pauseAll()` / `mgr.resumeAll()` in place of direct recovery lock checks.
3. Long-term: `RealtimeManager` owns visibility-aware pause/resume.

---

## Anti-Patterns

- **Per-component `supabase.channel(...)`** for postgres tables — creates duplicate channels. Use `useSupabaseRealtime` instead.
- **Calling `schedulePaidlyRealtimeRebuild()` directly** from feature code — route through the connection lifecycle manager.
- **Invalidating entire entity lists on every realtime event** — try `reconcileInvoiceRealtimeEvent()` for surgical cache patches first.
- **Adding tables to `PAIDLY_REALTIME_SYNC_TABLES`** without updating SyncEngine's reconciliation handlers.
