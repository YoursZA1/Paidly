# Paidly — Realtime Budget Compliance

> Updated: 2026-05-18 (final stability pass)

---

## Compliance Summary

| Requirement | Status | Evidence |
|-------------|--------|---------|
| Single multiplex channel | ✅ PASS | `PAIDLY_REALTIME_CHANNEL = "paidly-sync-realtime"` — one channel, four logical domains |
| No duplicate table subscriptions | ✅ PASS | `SYNC_TABLES_SET` blocks aux subscriptions on sync-owned tables |
| No full-store reload on entity events | ✅ PASS | All reconcilers return `true` (patch succeeded); `scheduleGlobalStoreRefresh` only fires on `false` returns |
| Invalidations coalesced under burst | ✅ PASS (fixed) | All reconcilers now use `scheduleInvalidation` for cashflow-page |
| No reconnect storm on focus restore | ✅ PASS | `VISIBILITY_RECONNECT_MIN_MS=30s` rate-limits focus-driven reconnects |
| No rebuild on healthy channel | ✅ PASS | `isPaidlyRealtimeMainChannelJoined()` checked before every JWT-driven rebuild |
| Heartbeat watchdog | ✅ PASS | 22s interval; 5s post-subscribe grace; 45s rate limit between reconnects |
| Circuit breaker on consecutive failures | ✅ PASS | 5 failures → 120s open; transport burst (4 in 12s) → 35s cooldown |
| Cross-system reconnect rate tracked | ✅ PASS (fixed) | `recordAndCheckReconnectRate()` now called in `runChannelRebuild` |

---

## Channel Architecture

```
paidly-sync-realtime  (single Supabase Realtime channel)
│
├─ Domain: sync (PAIDLY_REALTIME_SYNC_TABLES)
│   invoices, clients, document_sends, quotes, payments, expenses, payslips
│   → routed to syncBridge.onEntityEvent → SyncEngine
│
├─ Domain: profiles
│   → profileListeners Set → AuthContext profile refresh
│
├─ Domain: notifications
│   notifications (filtered user_id=eq.userId)
│   message_deliveries (filtered user_id=eq.userId)
│   → notificationListeners Set
│
└─ Domain: aux (extra tables via subscribePaidlyAuxPostgres)
    → auxTableListeners Map (table:schema:filter → listener Set)
    Note: SYNC_TABLES_SET blocks aux registration on sync-owned tables
```

**Max concurrent logical subscriptions:** 12 (RealtimeManager budget)  
**Current active domains:** 4 (sync, profiles, notifications, aux)

---

## Reconnect Pressure Analysis

### Layer 1 — JWT rotation (token refresh)
- `reconcilePaidlyRealtimeAfterTokenRefresh()` called after every session refresh
- `setAuth(accessToken)` pushes new JWT to existing WebSocket — no rebuild needed
- Rebuild only fires if channel is NOT joined after setAuth
- Coalesced: `authRotateCoalesce` flag drops duplicate signals in the same JS turn
- Rate-limited: `JWT_CHANNEL_REBUILD_MIN_MS=2000ms` between JWT-driven rebuilds

### Layer 2 — Visibility restore
- `checkPaidlyRealtimeOnVisibilityRestore()` called when tab becomes visible
- Debounced: 400ms before acting
- Rate-limited: `VISIBILITY_RECONNECT_MIN_MS=30000ms` — at most 1 reconnect per 30s from focus
- Skip if channel already joined

### Layer 3 — Heartbeat watchdog
- Fires every 22s on visible, online tabs
- Rate-limited: `HEARTBEAT_RECONNECT_MIN_MS=45000ms` between reconnects
- 5s post-subscribe grace period ignores transient state mismatch

### Layer 4 — Error recovery backoff
```
Failure 1 → 1s delay
Failure 2 → 2s delay
Failure 3 → 5s delay
Failure 4 → 10s delay
Failure 5+ → 30s delay (cap)
```
Circuit opens at 5 consecutive failures → 120s pause.

### Layer 5 — Transport burst protection
```
≥4 subscribe failures within 12s → transport cooldown armed (35s)
During cooldown: no error-recovery rebuilds (JWT-driven rebuilds still allowed)
After cooldown: one recovery attempt fires
```

### Layer 6 — Hard rate suppression
```
≥10 rebuilds in 90s window → reconnect suppressed for 90s
Bypassed by: jwt_refresh origin, transport_cooldown_end origin
```

### Layer 7 — Cross-system budget (RuntimeBudgetCoordinator)
```
Window: 60s
Max rebuilds: 15
Current implementation: records every actual rebuild (wired 2026-05-18)
Returns false if over budget (not yet enforced — layer 1-6 already prevent storms)
```

---

## Invalidation Budget

### Per-event coalescing (RuntimeBudgetCoordinator.scheduleInvalidation)

| Entity | Cashflow-page method | Notes |
|--------|---------------------|-------|
| invoices | scheduleInvalidation ✅ | delete + insert/update paths |
| clients | scheduleInvalidation ✅ | delete + insert/update paths |
| quotes | scheduleInvalidation ✅ | delete + insert/update paths |
| payments | scheduleInvalidation ✅ | **Fixed this pass** |
| expenses | scheduleInvalidation ✅ | **Fixed this pass** |
| payslips | n/a | no cashflow relationship |

### Invalidation waves per wake recovery
**Before fix:** 3 waves (WakeRecoveryPipeline → onWakeResync direct → onWakeResync via cascade)  
**After fix:** 1 wave (WakeRecoveryPipeline) + 1 targeted wave (onWakeResync invoice domain only)

### Focus refetch budget
| Query root | Focus refetch | Registration |
|-----------|---------------|-------------|
| notifications | ✅ | FOCUS_LIVE_QUERY_ROOTS |
| admin-messages | ✅ | FOCUS_LIVE_QUERY_ROOTS |
| cashflow-page | ✅ | FOCUS_LIVE_QUERY_ROOTS (added this pass) |
| All others | ❌ | global default: refetchOnWindowFocus=false |

`consumeFocusRefetchBudget()` not wired — 3 registered roots are well within the 8-query cap. No protective value at current scale.

---

## Recovery Circuit Integration

All realtime paths respect `isRecoveryCircuitOpen()`:

```
isRecoveryCircuitOpen() = true when:
  - sessionHealthStore.status === EXPIRED
  - sessionHealthStore.status === REAUTH_REQUIRED
  - connectionLifecycleStore.auth.phase === "expired" | "expired_surface"

Gates:
  - schedulePaidlyRealtimeRebuild() → returns early
  - requestPaidlyRealtimeErrorRecovery() → returns early
  - SyncEngine.scheduleEntityInvalidation() → returns early
  - SyncEngine.scheduleGlobalStoreRefresh() → returns early
  - SyncEngine.runOnce() → returns early
  - SyncEngine.onOnline() → returns early
  - SyncEngine bridge: setPaidlySyncRealtimeBridge({ userId: null }) → no events delivered
```

Terminal auth state completely halts all realtime and sync activity.

---

## Entity Subscription Ownership

Each table is owned by exactly one subscriber. Duplicate registrations are blocked:

```
PAIDLY_REALTIME_SYNC_TABLES (SyncEngine owns):
  invoices, clients, document_sends, quotes, payments, expenses, payslips

subscribePaidlyAuxPostgres() guard:
  if (SYNC_TABLES_SET.has(table) && schema === "public") {
    console.warn("Table is handled by SyncEngine")
    return () => {}  ← no-op unsubscribe
  }
```

No entity has duplicate realtime listeners.
