# Paidly — Session Coordination Architecture

> Updated: 2026-05-18

---

## Problem

`supabase.auth.getSession()` was called independently by multiple subsystems on every tab focus, realtime event, and sync cycle. While GoTrue's internal lock prevents concurrent token refreshes, it does not deduplicate concurrent read calls — they all queue and execute sequentially under the same lock.

On a single tab focus event, up to 4 calls could fire within milliseconds:
1. AuthContext visibility handler
2. ConnectionMonitor health check
3. SyncEngine entity invalidation (one per debounced entity)
4. SyncEngine global store refresh

---

## Solution: SessionCoordinator (`src/core/auth/SessionCoordinator.ts`)

### API

| Export | Signature | Use |
|--------|-----------|-----|
| `getStableSession()` | `async () => RawSession \| null` | Full session object; single-flighted + snapshot-cached |
| `hasActiveSession()` | `() => boolean` | Synchronous guard — checks auth store without Supabase call |
| `invalidateSessionSnapshot()` | `() => void` | Clear snapshot after sign-out or explicit refresh |

### Priority Tiers (in order)

```
1. authSessionStore (in-memory, synchronous)
   └── Session present + expires >30s from now → return immediately, zero async overhead

2. Snapshot cache (5-second TTL)
   └── One prior supabase.auth.getSession() result shared across concurrent callers

3. Single-flighted supabase.auth.getSession()
   └── Only one GoTrue call in flight at a time; all concurrent callers join the same promise
```

### When to use which

| Caller | Use |
|--------|-----|
| SyncEngine pre-flight guards | `hasActiveSession()` — synchronous, no GoTrue overhead |
| SyncEngine runOnce (needs null-session detection) | `getStableSession()` — needs the actual session object |
| connectionHealth.js | `getStableSession()` — UID only used for PostgREST probe; 5s cache acceptable; deduplicates concurrent focus/online events |
| rpcSessionPolicy.js (hot path) | `getStableSession()` for pre-flight check; `invalidateSessionSnapshot()` + `getStableSession()` after rotation |
| PaymentReminderService (interval) | `getStableSession()` — avoids raw call on every reminder interval tick |
| AuthContext lifecycle | Direct `supabase.auth.getSession()` — auth provider owns session lifecycle; must not use its own cache |
| supabaseAuthRefresh.js | Direct calls — refresh engine itself; cache would be stale by definition |

### What `hasActiveSession()` does NOT guarantee

It checks `useAuthSessionStore.getState().session != null`. It does NOT verify:
- The token is still accepted by the server
- The session has not been revoked by another tab
- The refresh token is still valid

Use it only as a "gate: skip this work if we're definitely not signed in." For work that requires the access token to be valid (actual API calls), use `getStableSession()` or the existing auth-gated fetch helpers.

---

## What SessionCoordinator does NOT replace

SessionCoordinator is a read-layer optimization. It does NOT:
- Replace `RefreshQueue` (session refresh mutex)
- Replace `requestSessionRefresh()` (refresh scheduler)
- Replace `AuthContext.refreshSession()` (the actual refresh executor)
- Handle `onAuthStateChange` events
- Interact with token rotation logic

The refresh path is: **RefreshQueue → RefreshQueue.enqueue → authRefreshQueueJob → supabaseAuthRefresh → GoTrue**. SessionCoordinator is only called to read an already-valid session.

---

## Multi-Tab Behavior

`authSessionStore` is not shared across tabs (it lives in JS heap). Each tab's `hasActiveSession()` reflects its own session state. Tabs that have been in the background for >TTL (5s) will fall through to `getStableSession()` which calls GoTrue — this is correct, as GoTrue reads from localStorage where session state is shared.

The existing `BroadcastChannel` (`createAuthTabSyncChannel`) continues to handle cross-tab sign-out and token update propagation.
