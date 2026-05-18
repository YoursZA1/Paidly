# Sync State Root Cause Analysis

**Date:** 2026-05-18  
**Scope:** Issue 2 — Perpetual "Syncing…" status indicator

---

## Symptom

The top-status bar showed "Syncing…" constantly, even when the app was idle, the queue was empty, the WebSocket was healthy, and no pending mutations existed.

---

## Components Involved

| Component | File | Role |
|---|---|---|
| `SyncStatus` | `src/components/common/SyncStatus.jsx` | Unified status indicator (desktop) |
| `ConnectionStatusIndicator` | `src/components/connection/ConnectionStatusIndicator.jsx` | Transport-layer status (mobile header) |
| `SyncStatusIndicator` | `src/components/sync/SyncStatusIndicator.jsx` | Queue count badge (mobile header) |
| `SyncEngine` | `src/components/sync/SyncEngine.jsx` | Background job processor |
| `useSyncQueueStore` | `src/stores/useSyncQueueStore.js` | Persistent queue (localStorage) |
| `useConnectionStore` | `src/stores/useConnectionStore.js` | Transport connectivity state |
| `useSessionHealthStore` | `src/stores/sessionHealthStore.js` | Session health state machine |

---

## Root Causes Found

### RC-1: `ConnectionStatusIndicator` labeled RECONNECTING as "Syncing…"

The label string `"Syncing…"` was used for the `CONNECTION_STATUS.RECONNECTING` state in `ConnectionStatusIndicator.jsx`. This state fires whenever the realtime channel closes and re-opens (Supabase keepalive, tab backgrounding, token refresh). It has **nothing to do with the sync queue** — it is a transport-layer event. The correct label is `"Reconnecting…"`.

**Impact:** Every realtime reconnect (which happens on every token refresh, ~every hour, plus tab focus events) briefly displayed "Syncing…" in the mobile header.

**Fix:** Changed label string from `"Syncing…"` → `"Reconnecting…"` and tooltip from `"Syncing data…"` → `"Reconnecting to Paidly…"`.

---

### RC-2: Hung `processSyncJob` calls kept jobs in "processing" indefinitely

`SyncEngine.runOnce()` calls `await processSyncJob(nextJob)` without a timeout. If the underlying API call stalls (network blip, server-side hang, AWS Lambda cold start exceeding function timeout), the promise never settles. `runningRef.current = true` prevents any new job from starting, and the job remains in `status: "processing"` in the queue.

`SyncStatus.deriveState` returns `S.SYNCING` whenever `processingCount > 0`, so the indicator stays in "Syncing…" indefinitely.

**Impact:** Any network-hung job (even a single one) caused perpetual "Syncing…" until the user reloaded the page.

**Fix:**
1. Wrapped `processSyncJob` in `withJobTimeout(promise, 30_000)` — force-fails the job after 30 seconds.
2. Added a `STUCK_JOB_SWEEP_MS = 60_000` interval that resets any job still in `"processing"` with `updatedAt` older than 30 seconds back to `"pending"`. Guards against edge cases where the timeout's `finally` block is skipped (HMR re-mounts, future refactors).

---

### RC-3: No UI-level safety net for persistent "Syncing…"

`SyncStatus` has a `MIN_SYNCING_MS = 1500` minimum hold to prevent flash, but no upper-bound cap. If jobs continuously cycle through `pending → processing → pending` (due to repeated failures and retry backoff), the indicator could stay in "Syncing…" for the entire backoff window (up to `~62 s` for 5 retries at exponential backoff).

**Fix:** Added `MAX_SYNCING_MS = 90_000` — after 90 continuous seconds in SYNCING, the UI forcibly transitions to SYNCED. At that point the queue has either resolved on its own (from the 30 s job timeout) or is in a failed state (which `deriveState` maps to `S.ERROR`).

---

## What Was NOT the Root Cause

- **Realtime subscription loops:** The single multiplex channel `paidly-sync-realtime` is correctly managed; no duplicate subscriptions.
- **Duplicate intervals/listeners:** All timers are properly cleaned up in `useEffect` return functions.
- **`processingCount` never resetting:** The `useSyncQueueStore.resetStuckJobs()` call on SyncEngine mount correctly resets crash-persisted "processing" jobs. The gap was *runtime* stalls, not cross-reload state.
- **Hidden tab behavior:** `whenDocumentVisible()` is already used in realtime reconciliation; doesn't affect sync queue processing.
- **Auth refresh triggering fake syncing:** `refreshSupabaseSessionWithRecovery()` is routed through the mutex; no interaction with the sync queue.

---

## State Diagram After Fixes

```
SyncStatus rawState derivation (priority order):

navigator.offline OR session REAUTH_REQUIRED/EXPIRED
  → OFFLINE

failedCount > 0
  → ERROR

session NOT healthy AND connectionStore RECONNECTING
  → RECONNECTING

session NOT healthy AND connectionStore DISCONNECTED
  → OFFLINE

pendingCount > 0 OR processingCount > 0
  → SYNCING  (capped at MAX_SYNCING_MS = 90 s by escape hatch)

default (connected, queue empty, session healthy)
  → SYNCED   (hidden from UI when failedCount === 0)
```
