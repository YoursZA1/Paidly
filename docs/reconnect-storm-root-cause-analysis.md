# Reconnect Storm Root Cause Analysis

> Audit date: 2026-05-18 | Last updated: 2026-05-18

---

## Storm 1 — SyncEngine interval churn from reactive queue dependency

**Root cause:** `runOnce` closed over the `queue` array reference. Every queue mutation recreated `runOnce`, which caused the `setInterval` effect to tear down and recreate the interval — sometimes dozens of times per second during sync bursts.

**Effect:** Constant interval/listener churn, non-deterministic sync cadence, elevated CPU.

**Fix:** Queue state read inside the callback via `useSyncQueueStore.getState()`. `queue` removed from deps. Interval created once, lives until unmount.

---

## Storm 2 — Healthy WebSocket destroyed on token refresh

**Root cause:** JWT rotation handler called `setAuth()` correctly but then unconditionally triggered a full channel rebuild, even when the channel was `SUBSCRIBED` and healthy.

**Effect:** WebSocket torn down on every 30–60 min token rotation. Brief CDC event gap during rebuild. Backoff could compound on flaky networks.

**Fix:** `isPaidlyRealtimeMainChannelJoined()` guard added. Healthy channels skip rebuilds. Only `CLOSED`/`CHANNEL_ERROR`/`TIMED_OUT` trigger rebuilds.

---

## Storm 3 — Hidden-tab polling loop multiplication

**Root cause:** Each realtime event received while hidden created a new 600ms polling interval to re-check visibility. Events arrived faster than intervals fired, compounding to dozens of concurrent loops.

**Effect:** 32+ JS event loop wakeups/second in background tabs. Battery drain, thermal throttling.

**Fix:** Single `visibilitychange` listener replaces all polling. 120s timeout fallback. Zero hidden-tab CPU.

---

## Storm 4 — `runOnce` interval unstable on auth state changes

**Root cause:** `runOnce` closed over `user?.id` to build `scopeKey`. User object changes (login/logout/profile update) recreated `runOnce` and destroyed/recreated the 5s sync interval.

**Effect:** Interval gap at auth state boundaries. Brief window where sync jobs could be missed.

**Fix:** `user?.id` moved to a `userIdRef` updated by a side-effect. `runOnce` reads `userIdRef.current` at call time. Interval is now stable across all auth transitions.

---

## Storm 5 — Concurrent `getSession()` flood on tab focus

**Root cause:** Three independent systems each called `supabase.auth.getSession()` on focus/online events: `AuthContext` visibility handler, `ConnectionMonitor.runCheck()`, and `PaymentReminderService`. On a cold tab focus, all three fired in the same JS turn with no coordination. If the token was expired, each could independently initiate a refresh via different code paths.

**Effect:** 3–5 concurrent raw session reads per focus event. Parallel refresh races risking duplicate token rotation attempts.

**Fix:** All three now route through `SessionCoordinator.getStableSession()` — 5s snapshot cache + single-flight mutex. Concurrent callers within the cache window join the same in-flight promise. `invalidateSessionSnapshot()` called after explicit token rotation to guarantee post-refresh reads are always fresh.

---

## Storm 6 — Full store reloads on realtime fallback path

**Root cause:** When `reconcileXRealtimeEvent()` returned `false` (malformed payload, unknown event type), `scheduleGlobalStoreRefresh` called `fetchAllFromStore(user)` — a full network round-trip reloading all entities.

**Effect:** Every unrecognized realtime event triggered a full dataset reload. On busy accounts, multiple realtime events in quick succession could stack multiple full reloads.

**Fix:** `scheduleGlobalStoreRefresh` now issues targeted `invalidateQueries` per entity domain. TanStack refetches lazily on next render. No synchronous full-store network call. Debounce window (2.2s) coalesces burst events into a single invalidation pass.

---

## Remaining managed risk

| Path | Mitigation |
|------|-----------|
| Realtime burst during reconnect | 900ms per-entity debounce + 2.2s global coalesce window |
| Focus refetch storm | `refetchOnWindowFocus: false` globally; opt-in via `queryFocusPolicy.ts` |
| WebSocket rebuild loop | Circuit breaker: 5 failures → 120s pause in `paidlyRealtimeManager` |
| Concurrent RPC token reads | `getStableSession()` in `rpcSessionPolicy.js` deduplicates concurrent token acquisitions |
| Wake recovery refetch flood | `whenDocumentVisible()` gate + `hasActiveSession()` check before any invalidation |
