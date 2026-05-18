# Paidly — Runtime Architecture Audit (Phase 2 — Current State)

**Date:** 2026-05-18  
**Scope:** Full runtime audit of React + Vite SPA, Zustand, TanStack Query, Supabase Auth/Postgres/Realtime, offline sync queue, session orchestration.  
**Methodology:** Full static analysis of all runtime-critical paths. No production traffic data.

---

## Executive Summary

Paidly's runtime is significantly more mature than a typical MVP. The auth lifecycle, realtime channel management, and session recovery machinery are production-grade. The `src/core/` layer has been scaffolded with the right abstractions. The gaps are **integration completeness** and **a small set of correctness bugs** — not architectural rot.

| Area | Status | Risk | Primary gap |
|------|--------|------|-------------|
| Auth lifecycle | ✅ Mature | Low | `refreshUser` missing early circuit-breaker guard |
| Session state machine | ✅ Mature | Low | Terminal `EXPIRED` lock solid |
| Realtime multiplex channel | ✅ Mature | Low | `RealtimeManager.ts` orphaned (not wired) |
| Session refresh queue | ✅ Mature | Low | Well-guarded with mutex + cross-tab lock |
| RuntimeCoordinator | ✅ Implemented | Low | Bridge feeds it correctly via lifecycle signals |
| RequestCoordinator | ⚠️ Partial | Medium | `waitUntilUnpaused` polls every 100ms — should be event-driven |
| MutationCoordinator | ✅ Implemented | Low | Wired into syncJobProcessor for operationId dedup |
| Sync queue | ⚠️ Bugs | Medium | Stuck `"processing"` jobs survive restart; no user-scoping |
| TanStack Query keys | ✅ Migrated | Low | New hooks use `queryPolicies.ts`; legacy broad roots still in `queryInvalidation.js` |
| Persistent cache | ✅ Dual-layer | Low | localStorage + IDB with allowlist; auth keys blocked |
| Query retry policy | ⚠️ Inconsistent | Low | `useSupabaseQuery` overrides global `retry:false` with `retry:1` |
| Reconnect storm protection | ✅ Multi-layer | Low | Circuit breaker, transport cooldown, hard suppress all wired |
| Wake recovery | ✅ Implemented | Low | `WakeRecoveryPipeline` blocks mutations during recovery |

---

## 1. Auth Lifecycle

**Files:** `src/contexts/AuthContext.impl.jsx`, `src/lib/session/sessionRefreshScheduler.js`, `src/lib/supabaseAuthRefresh.js`, `src/lib/auth/authRefreshQueueJob.js`, `src/lib/session/RefreshQueue.js`

### What's working correctly

- **Single `onAuthStateChange` listener** — no duplicate subscriptions.
- **`RefreshQueue` mutex** — `inFlightPromise` single-flight with 3s throttle (`minGapMs`). Concurrent callers join the existing promise instead of launching parallel refresh attempts.
- **Cross-tab localStorage lock** in `refreshSupabaseSessionWithRecovery()` with `isFreshEnough()` guard — prevents token double-consumption between tabs.
- **`isRecoveryCircuitOpen()`** checks both `EXPIRED` and `REAUTH_REQUIRED` before any recovery attempt; checked at every entry point.
- **Terminal `EXPIRED` state lock** in `sessionHealthStore` — only explicit `"signed_in"` / `"initial_session"` reasons can exit the terminal state.
- **`AppRecoveryLock`** — blocks mutations and realtime delivery during wake recovery; clears cleanly in `finally`.
- **Reconnect escalation** routes through `refreshSupabaseSessionWithRecovery()` (not raw `supabase.auth.refreshSession()`), preventing refresh-token double-consumption that caused forced logouts.
- **Multi-tab sync** via `BroadcastChannel` (`authTabSync`): sign-out and session updates propagate to all tabs.
- **Back-forward cache** (`pageshow` with `persisted`) and **visibility** events both handled; routes to wake recovery pipeline when gap threshold exceeded.
- **Session heartbeat** (60s, visibility-gated) coalesces via `requestSessionRefreshGuarded` — no parallel polling loops.

### Findings and risks

**LOW — `refreshUser` missing early circuit-breaker check:**  
`refreshUser` checks `isTerminalRefreshFailure` mid-execution but does not call `isRecoveryCircuitOpen()` at the top. If `refreshUser` is invoked during or after a terminal state, it can attempt session restores unnecessarily. The `isTerminalRefreshFailure` catch path handles the fatal case, but adds round-trips.

**LOW — `session` in `AuthContext` value `useMemo` deps:**  
`session` is included in the `useMemo` dependency array. Every token refresh (every ~55 min or on reconnect) emits a `TOKEN_REFRESHED` event, updates `session`, and invalidates the memo — causing all `useAuth()` consumers to receive a new context object and re-render, even when only the access token changed and no user-visible data changed.

**INFORMATIONAL — `proactive refresh` double-guards:**  
The proactive JWT timer in `AuthContext` (fires ~55s before expiry) re-checks `getSession()` before requesting a refresh. Combined with GoTrue's own `autoRefreshToken`, there are two proactive refresh mechanisms. The `RefreshQueue` mutex absorbs the duplication safely, but it's worth monitoring refresh telemetry for redundant `throttled` events.

---

## 2. Session State Machine

**Files:** `src/stores/sessionHealthStore.js`, `src/lib/session/SessionOrchestrator.js`, `src/lib/connection/ConnectionLifecycleManager.js`

### What's working correctly

The four-state model (`ACTIVE / REFRESHING / DEGRADED / EXPIRED`) with `RECONNECTING` debounce is solid:

```
CONNECTED → RECONNECTING (debounced 2s from CONNECTED only)
         → DEGRADED (from RECONNECTING if recovery fails)
         → EXPIRED (terminal — only sign_in can exit)
         → REAUTH_REQUIRED (terminal — same)
```

`applySessionHealthFromAuthority` enforces:
- `EXPIRED` cannot be exited except by `"signed_in"` / `"initial_session"` reason.
- `REAUTH_REQUIRED` cannot flip directly to `CONNECTED` without re-auth.
- `RECONNECTING` is debounced (2s) when coming from `CONNECTED` to prevent flicker.

The `ConnectionLifecycleManager` acts as the semantic signal bus between subsystems (auth, refresh, realtime, network, visibility, wake) and the `SessionOrchestrator`. It routes signals via `buildLifecyclePlan` without coupling subsystems directly.

### Findings

**INFORMATIONAL — Two overlapping state machines:**  
`sessionHealthStore` (5-state: `CONNECTED / RECONNECTING / DEGRADED / REAUTH_REQUIRED / EXPIRED`) and `RuntimeCoordinator` (8-state: `BOOTING / AUTH_RECOVERING / SESSION_READY / OFFLINE / RECONNECTING / SYNCING / DEGRADED / ERROR`) coexist. `RuntimeCoordinator` is correctly fed via the bridge (`runtimeCoordinatorBridge.js`) but is **read** by `RequestCoordinator` only. `sessionHealthStore` drives UI state (indicators, overlays). Keep them separate — they serve different consumers.

---

## 3. Realtime Architecture

**Files:** `src/lib/realtime/paidlyRealtimeManager.js`, `src/lib/realtime/authRealtimeCoordinator.js`, `src/lib/realtime/paidlyRealtimeConnectionMachine.js`, `src/core/realtime/RealtimeManager.ts`

### What's working correctly

The multiplexed channel architecture (`paidly-sync-realtime`) is production-grade:

- **Monotonic generation counter** (`channelSubscribeGeneration`) — stale subscribe callbacks are silently discarded. Eliminates the class of bug where a slow subscribe resolves after a newer rebuild started.
- **Multi-layer reconnect suppression:**
  - `REBUILD_MIN_INTERVAL_MS` (1.4s) — min spacing between rebuilds
  - `reconnectHardSuppressUntilMs` (90s) — hard rate cap after 10 rebuilds / 90s window
  - Transport burst cooldown (35s) — 4 failures in 12s window
  - Circuit breaker (120s) — 5 consecutive subscribe failures
- **Subscribe watchdog** (20s) — resets `rebuildInFlight` if the subscribe callback never fires (hung WebSocket). Prevents permanent `rebuildInFlight = true` locks.
- **JWT rotation coalescing** (`authRotateCoalesce`) — burst JWT signals in the same JS turn are collapsed to one channel rebuild.
- **Visibility-aware reconnect** — rate-limited at 30s minimum, skipped when channel is already joined, debounced (400ms).
- **`recoveryLockBlocksRealtimeDelivery()`** — during wake recovery, postgres_changes events are silently dropped until recovery completes.
- **`useSupabaseRealtime` hook correctly routes** to the multiplexed channel via `subscribePaidlyProfilesRealtime` / `subscribePaidlyAuxPostgres` — no duplicate channels.

### Findings

**MEDIUM — `RealtimeManager.ts` is orphaned:**  
`src/core/realtime/RealtimeManager.ts` defines a subscription registry with budget limits and pause/resume API. It is not wired to `paidlyRealtimeManager.js`. It exists as a useful façade for a future migration but currently provides no runtime value. Either wire it or document it as a future integration point.

**LOW — Notification subscriptions have no org filter:**  
`subscribePaidlyNotificationsRealtime` adds a `user_id=eq.${notificationUserId}` filter on the `notifications` table. This is correct for user-scoped notifications, but if multi-org support is introduced, org-scoping must be added.

**INFORMATIONAL — `checkRealtimeOnVisibilityRestore` vs `runWakeRecoverySequence`:**  
On tab visibility restore, `AuthContext` calls `checkRealtimeOnVisibilityRestore()` for the non-wake path. This is correctly skipped if the channel is already joined. The wake path calls `awaitRealtimeRecoveryAndMainChannel` directly. The two paths are mutually exclusive via the `needWake` guard.

---

## 4. TanStack Query

**Files:** `src/lib/query-client.js`, `src/core/query/queryPolicies.ts`, `src/lib/queryInvalidation.js`, `src/lib/paidlyClientCachePolicy.js`, `src/lib/paidlyPersistedQueryRootKeys.js`

### What's working correctly

- Fine-grained query keys in `queryPolicies.ts`: `invoiceList(orgId, fingerprint)`, `invoiceDetail(id)`, `clientSummary(id)`, etc.
- `staleTime` per domain in `paidlyClientCachePolicy.js` (invoices: 5m, clients: 10m, dashboard: 60s).
- `retry: false` globally — avoids retry storms on auth/RLS errors.
- `placeholderData: (prev) => prev` — stale-while-revalidate; no layout thrash on navigation.
- Dual-layer persistence: `localStorage` (fast restore) + `IndexedDB` (larger quota, merge by `updatedAt`).
- Auth keys blocklisted from persistence.
- `purgeQueryClientAfterLogout` — clears both in-memory cache and IDB/LS on logout.

### Findings

**LOW — `queryInvalidation.js` retains broad legacy root fallbacks:**  
```js
// Legacy roots — remove after hook migration completes
queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
```
These catch all `["invoices", ...]` variants. New hooks use `queryKeys.invoiceList(scopeKey)` but the legacy root is still in `PAIDLY_PERSISTED_QUERY_ROOT_KEYS`, meaning it may still have active consumers. Safe to remove only after confirming no hook uses bare `["invoices"]` as its primary key.

**LOW — `useSupabaseQuery` overrides `retry: false` with `retry: 1`:**  
The shared `useSupabaseQuery` hook has `retry = 1` as its parameter default, overriding the global `retry: false`. This creates inconsistent retry behavior — queries through this hook will silently retry once on any error, including auth errors. Should be `retry = false`.

**LOW — `refetchOnWindowFocus: true` global default:**  
The global query client default has `refetchOnWindowFocus: true`. Most list hooks override this to `false` via `listQueryDefaults()`. However, any hook that doesn't explicitly override will refetch on every tab focus event. Combined with the visibility-driven session refresh in `AuthContext`, tab focus triggers both a session check and all unguarded queries refetching. This is low risk today (most hooks override) but can surprise when adding new hooks.

**INFORMATIONAL — Dual persistence writes on every cache update:**  
Every query cache event triggers a debounced (1.2s) write to both `localStorage` and `IndexedDB`. Under high realtime activity (e.g. many invoice updates), the write frequency could produce quota pressure. The debounce window limits this effectively for normal load.

---

## 5. Sync Queue + Offline Handling

**Files:** `src/stores/useSyncQueueStore.js`, `src/lib/syncJobProcessor.js`, `src/lib/syncQueueActions.js`, `src/lib/syncMutationCoordinator.js`

### What's working correctly

- Conflict key merging (`meta.conflictKey`) — duplicate pending jobs for the same entity are merged, not duplicated.
- `operationId` propagated to `client_operation_id` in `CREATE_INVOICE` — server can deduplicate via unique constraint on this field.
- `syncMutationCoordinator.runOnce(operationId, ...)` — inflight dedup via `MutationCoordinator.ts`.
- Exponential backoff capped at 60s; max 5 retries per job.
- Queue gated by `isRecoveryCircuitOpen()` — jobs don't run during terminal auth states.
- `AppRecoveryLock` blocks sync queue execution during wake recovery.

### Findings — Confirmed Bugs

**HIGH — Stuck `"processing"` jobs survive app restart:**  
When a job is marked `"processing"` and the app crashes or is force-closed, the job remains `"processing"` in localStorage. On next launch, `pendingJobs()` filters for `status === "pending" || status === "processing"`, so stuck processing jobs appear in the processing list — but since `runningRef.current` starts as `false` and no one resets them, they never get retried. The fix: on SyncEngine mount, reset all `"processing"` jobs to `"pending"`.

**MEDIUM — Sync queue not user-scoped:**  
Storage key `paidly_sync_queue_v1` has no user prefix. On a shared device where User A creates offline invoices, logs out, and User B logs in, User B's session would attempt to process User A's queue items. RLS would reject these, producing spurious errors. The fix: each job should carry `meta.userId`; on login, prune jobs not belonging to the current user.

**LOW — No queue max-size limit:**  
The queue can grow unbounded if jobs keep failing past `maxRetries`. Jobs with `status: "failed"` are retained (up to `MAX_RECENT_DONE = 40` done jobs are trimmed, but failed jobs are kept indefinitely). Consider capping total queue length or pruning failed jobs older than N days.

---

## 6. Request Coordination

**Files:** `src/core/network/RequestCoordinator.ts`, `src/core/network/sharedRequestCoordinator.js`, `src/api/installBackendApiResilience.js`, `src/lib/inflightRequestDedupe.js`

### What's working correctly

- `RequestCoordinator` with concurrency limit (6 slots) and inflight dedup by key.
- `retryWithBudget` with exponential backoff + jitter.
- `shouldPause()` reads `RuntimeCoordinator.pauseNonCriticalRequests` — correctly paused during `AUTH_RECOVERING` / `RECONNECTING` / `BOOTING`.
- `RuntimeCoordinator` is fed from the auth pipeline via `runtimeCoordinatorBridge.js` correctly — `report_refresh_starting` from `authRefreshQueueJob.js` (non-silent path only) triggers `beginAuthRecovery()` → `pauseNonCriticalRequests: true`.
- Axios backend client has retry resilience via `installBackendApiResilience.js`.

### Findings

**MEDIUM — `waitUntilUnpaused` uses a 100ms polling loop:**  
```ts
while (getRuntimeCoordinatorSnapshot().pauseNonCriticalRequests) {
  if (Date.now() - start >= maxWaitMs) return;
  await new Promise((r) => globalThis.setTimeout(r, 100));
}
```
This polls the runtime coordinator every 100ms, keeping at least one microtask chain alive per waiting request. Under concurrent requests during auth recovery, this creates N×10 setTimeout firings per second. The fix: replace with a Zustand subscription that resolves on the next state change.

**LOW — `inflightRequestDedupe.js` and `RequestCoordinator.dedupe` are parallel dedup systems:**  
`inflightRequestDedupe.js` provides global request dedup by string key. `RequestCoordinator.dedupe` provides the same per-coordinator. They're used in different places (the former in `useInvoicesQuery.js`, the latter available for direct use). No conflicts, but consolidating would simplify the mental model.

**INFORMATIONAL — Silent refreshes don't trigger `pauseNonCriticalRequests`:**  
Only non-silent refresh calls (direct user-triggered recovery, not heartbeat/visibility/bfcache) emit `report_refresh_starting`. This is correct by design — background token renewal should not stall UI data fetches. Documented here for clarity.

---

## 7. React Performance

**Files:** `src/stores/useAppStore.js`, `src/contexts/AuthContext.impl.jsx`, `src/components/sync/SyncEngine.jsx`

### Findings

**MEDIUM — `useAppStore` persists large collections synchronously to localStorage:**  
`useAppStore` uses Zustand `persist` middleware writing to `localStorage`. Each invoice/client list update writes the full store. For users with 500+ invoices, each realtime-triggered store update serializes and writes kilobytes synchronously on the main thread. Consider debouncing the persist write or migrating large collections to IDB-only (async).

**LOW — `SyncEngine` subscribes to the entire queue array:**  
```js
const queue = useSyncQueueStore((s) => s.queue);
```
This re-renders `SyncEngine` on every queue change (every job update). `SyncEngine` only needs to know if there are pending jobs to process. Selector should be `(s) => s.queue.some(j => j.status === 'pending')` or use a selector for the pending count.

**LOW — `AuthContext` value memo includes `session`:**  
`session` changes on every token refresh. All `useAuth()` consumers receive a new context reference, even when `user`, `loading`, and other visible state haven't changed. Split stable auth state (user, loading, login/logout functions) from volatile session state (token, expiresAt) into separate stores or context objects.

---

## 8. Confirmed Code Bugs (Priority Order)

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | `useSyncQueueStore.js` | `"processing"` jobs survive restart and are never retried | Add `resetStuckJobs()`, call on SyncEngine mount |
| 2 | `useSyncQueueStore.js` | Queue not user-scoped — other users' jobs processed on login | Add `pruneJobsNotForUser(userId)`, call after login |
| 3 | `RequestCoordinator.ts` | `waitUntilUnpaused` polls every 100ms | Replace with Zustand event-driven subscription |
| 4 | `useSupabaseQuery.js` | `retry=1` overrides global `retry:false` | Change default to `retry=false` |

---

## 9. Architecture Strengths (Do Not Change)

- Single multiplexed realtime channel with multi-layer storm protection.
- `RefreshQueue` single-flight mutex with cross-tab localStorage lock.
- `isRecoveryCircuitOpen()` checked at all recovery entry points.
- `WakeRecoveryPipeline` + `AppRecoveryLock` blocking mutations during recovery.
- Terminal `EXPIRED` state lock — only explicit re-auth clears it.
- `ConnectionLifecycleManager` as semantic signal bus (no subsystem coupling).
- Dual-layer query persistence with auth-key blocklist.
- `MutationCoordinator` operationId dedup for idempotent queue replay.

---

## 10. Implementation Priority

**Immediate (correctness bugs):**
1. `useSyncQueueStore.resetStuckJobs()` + `SyncEngine` mount call
2. `useSyncQueueStore.pruneJobsNotForUser(userId)` + `SyncEngine` mount call
3. `RequestCoordinator.waitUntilUnpaused` → event-driven
4. `useSupabaseQuery` retry default fix

**Near-term (quality improvements):**
5. Wire `RealtimeManager.ts` as a façade over `paidlyRealtimeManager.js` (or remove it)
6. Remove legacy broad `["invoices"]` root from `queryInvalidation.js` (after confirming no hook uses it)
7. Debounce `useAppStore` persist write to prevent synchronous main-thread writes on realtime events

**Long-term (scale):**
8. Split `AuthContext` value into stable/volatile contexts to prevent token-refresh-driven re-renders
9. Migrate `useAppStore` large collections to IDB-only persistence
10. Add queue max-size cap and failed-job pruning

---

*Last updated: 2026-05-18. Update when major runtime paths change.*
