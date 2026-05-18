# Paidly — Focus Recovery Flow

> Updated: 2026-05-18

---

## Overview

"Focus recovery" is what the app does when a hidden or backgrounded browser tab regains visibility. It is one of the highest-risk moments for request storms because multiple subsystems observe the same `visibilitychange` event simultaneously.

---

## Subsystems That React to Tab Focus

| Subsystem | File | Action |
|-----------|------|--------|
| AuthContext visibility handler | `AuthContext.impl.jsx` | Decides between full WakeRecoveryPipeline or a lightweight session check |
| ConnectionMonitor | `ConnectionMonitor.jsx` | Calls `runCheck()` → health check; calls `onVisible()` on ConnectionManager |
| Session heartbeat | `AuthContext.impl.jsx` | Fires `requestSessionRefreshGuarded` if tab becomes visible with expired heartbeat |
| Realtime visibility restore | `paidlyRealtimeManager.js` | `checkPaidlyRealtimeOnVisibilityRestore()` — checks channel health, rebuilds only if stale |
| SyncEngine entity timers | `SyncEngine.jsx` | Pending entity invalidation timers resume via `whenDocumentVisible()` |

---

## Decision Tree on Tab Becoming Visible

```
document.visibilityState → "visible"
│
├── AuthContext.handleVisibility
│     ├── reportVisibilityState("visible")
│     ├── shouldEnterWakeRecoveryMode()?
│     │     └── YES → runWakeRecoverySequence (blocks mutations, full recovery)
│     └── NO (short gap)
│           ├── supabase.auth.getSession()
│           │     ├── has session → markConnected("tab_visible")
│           │     └── no session → VISIBILITY_RESTORE_FAILED signal
│           ├── checkRealtimeOnVisibilityRestore() — rebuild only if !joined
│           └── requestSessionRefreshGuarded({ source: "visibility", silent: true })
│
└── ConnectionMonitor.onVisibilityChange
      ├── onVisible() — adjusts degradedSince for hidden duration
      └── runCheck() → runSupabaseHealthCheck()
            ├── ok → markConnected()
            └── not ok → scheduleDegradedTransition()
```

---

## WakeRecoveryPipeline (Long-Absence Path)

Triggered when `shouldEnterWakeRecoveryMode()` returns true (heartbeat gap exceeded threshold).

```
AppRecoveryLock.begin()            — blockMutations = true
reportRecoveryWake("wake_recovery")

Phase 1 — Auth:
  refreshSession({ source: "wake_recovery", bypassThrottle: true })
  ok?  → Phase 2
  !ok? → FAILED → reconnectEscalationController.schedule()

Phase 2 — Realtime:
  awaitRealtimeRecoveryAndMainChannel({ timeoutMs: 12s })
  ok?  → Phase 3
  !ok? → FAILED

Phase 3 — Resync:
  refreshUser()
  enforceRouteInvariant()

finally:
  AppRecoveryLock.end()            — blockMutations = false
  dispatch SUCCEEDED / FAILED / ENDED
```

During this pipeline, all `postgres_changes` callbacks are silently dropped (`recoveryLockBlocksRealtimeDelivery()` returns true). This prevents stale pre-wake events from corrupting the cache.

---

## Non-Wake Focus Recovery (Short-Absence Path)

When the tab was hidden briefly (< wake recovery threshold):

1. `getSession()` confirms the session is still valid
2. `checkPaidlyRealtimeOnVisibilityRestore()` checks channel health — no rebuild if `joined`
3. `requestSessionRefreshGuarded({ silent: true })` — 400ms debounced scheduler fires one token check
4. Pending entity invalidation timers in SyncEngine resume via the event-driven `whenDocumentVisible()`
5. TanStack Query: **no focus refetch** (global `refetchOnWindowFocus: false`). Only queries with explicit `FocusRefetch.LIVE` opt-in refetch.

---

## Rate Limits on Focus Recovery

| Path | Rate limit |
|------|-----------|
| Visibility-driven realtime reconnect | Min 30s between attempts (`VISIBILITY_RECONNECT_MIN_MS`) |
| Session refresh scheduler | Min 3s between calls (`RefreshQueue.minGapMs`) |
| Health check | Gated by `inFlightRef` (one at a time) |
| Wake recovery pipeline | `wakeRecoveryInFlightRef` prevents concurrent pipelines |

---

## Focus Recovery and `refetchOnWindowFocus`

**Before:** Global default `true` → every stale query mounted in the app refetched simultaneously on focus. Combined with the above paths, this created a focus burst: health check + session refresh + realtime check + N query refetches.

**After:** Global default `false`. Queries opt in via `queryFocusPolicy.ts`:
```ts
import { FocusRefetch } from "@/core/query/queryFocusPolicy";

useQuery({
  queryKey: ["notifications", userId],
  ...FocusRefetch.LIVE,
});
```

Currently opted in: `notifications`, `admin-messages`, `services catalog`.

---

## Anti-Patterns

- **Calling `requestPaidlyRealtimeErrorRecovery()` directly from visibility handlers** — route through `checkPaidlyRealtimeOnVisibilityRestore()` which has rate limiting
- **Calling `supabase.auth.getSession()` in component `useEffect` visibility handlers** — use `hasActiveSession()` for guard checks, `getStableSession()` if the session object is needed
- **Triggering `fetchAllFromStore(user)` on tab focus** — let realtime events drive incremental updates; `fetchAll` is only appropriate after the wake recovery pipeline
