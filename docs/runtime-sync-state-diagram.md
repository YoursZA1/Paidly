# Runtime Sync State Diagram

**Date:** 2026-05-18  
**Scope:** How sync state flows from stores → `SyncStatus` UI component.

---

## Store Inputs

```
useConnectionStore.status       → "connected" | "reconnecting" | "disconnected"
useSessionHealthStore.status    → "connected" | "reconnecting" | "degraded" | "reauth_required" | "expired"
useSyncQueueStore.queue         → Job[] (persisted to localStorage)
  pendingCount   = queue.filter(j => j.status === "pending").length
  processingCount = queue.filter(j => j.status === "processing").length
  failedCount    = queue.filter(j => j.status === "failed").length
navigator.onLine                → boolean
```

---

## `deriveState` Priority Ladder

```
                    ┌─────────────────────────────────────────────────┐
                    │  Inputs: connectionStatus, sessionStatus,        │
                    │          pendingCount, processingCount,           │
                    │          failedCount, navigator.onLine           │
                    └──────────────────┬──────────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────────┐
                    │  navigator.offline                               │
                    │  OR sessionStatus ∈ {REAUTH_REQUIRED, EXPIRED}  │
                    └──────────────────┬──────────────────────────────┘
                                 YES   │   NO
                                       │
                         ┌─────────────▼──────────────────────┐
                         │  rawState = OFFLINE                 │
                         └─────────────────────────────────────┘
                                       │ (NO branch continues)
                    ┌──────────────────▼──────────────────────────────┐
                    │  failedCount > 0                                 │
                    └──────────────────┬──────────────────────────────┘
                                 YES   │   NO
                                       │
                         ┌─────────────▼──────────────────────┐
                         │  rawState = ERROR                   │
                         └─────────────────────────────────────┘
                                       │ (NO branch continues)
                    ┌──────────────────▼──────────────────────────────┐
                    │  session NOT healthy (not CONNECTED)             │
                    │  AND connectionStatus === RECONNECTING           │
                    └──────────────────┬──────────────────────────────┘
                                 YES   │   NO
                                       │
                         ┌─────────────▼──────────────────────┐
                         │  rawState = RECONNECTING            │
                         └─────────────────────────────────────┘
                                       │ (NO branch continues)
                    ┌──────────────────▼──────────────────────────────┐
                    │  session NOT healthy                             │
                    │  AND connectionStatus === DISCONNECTED           │
                    └──────────────────┬──────────────────────────────┘
                                 YES   │   NO
                                       │
                         ┌─────────────▼──────────────────────┐
                         │  rawState = OFFLINE                 │
                         └─────────────────────────────────────┘
                                       │ (NO branch continues)
                    ┌──────────────────▼──────────────────────────────┐
                    │  pendingCount > 0  OR  processingCount > 0      │
                    └──────────────────┬──────────────────────────────┘
                                 YES   │   NO
                                       │
                         ┌─────────────▼──────────────────────┐
                         │  rawState = SYNCING                 │
                         │  (capped at MAX_SYNCING_MS = 90 s)  │
                         └─────────────────────────────────────┘
                                       │ (NO branch = idle)
                         ┌─────────────▼──────────────────────┐
                         │  rawState = SYNCED  (hidden in UI)  │
                         └─────────────────────────────────────┘
```

---

## `visibleState` Timing Rules

```
rawState → SYNCING:
  syncingHeldUntilRef = now + MIN_SYNCING_MS (1.5 s)
  visibleState = SYNCING immediately
  maxSyncingTimer starts (fires after MAX_SYNCING_MS = 90 s if never resolved)

rawState leaves SYNCING → X:
  if syncingHeldUntilRef > now:
    schedule timer to transition after (syncingHeldUntilRef - now) ms
  else:
    visibleState = X immediately
  cancel maxSyncingTimer

maxSyncingTimer fires (safety net):
  if visibleState === SYNCING → force visibleState = SYNCED
  reset syncingStartedAt
```

---

## UI Rendering Rules

| visibleState | Icon | Label | Pill style | Hidden? |
|---|---|---|---|---|
| SYNCED | CheckCircle2 | "All changes synced" | green | YES (when failedCount = 0) |
| SYNCING | Loader2 (spin) | "Syncing…" | sky blue | NO |
| RECONNECTING | Loader2 (spin+pulse) | "Reconnecting…" | amber | NO |
| OFFLINE | WifiOff | "Offline" | red | NO |
| ERROR | AlertTriangle | "Sync issue" + retry btn | red | NO |

---

## SyncEngine → Queue → SyncStatus Flow

```
SyncEngine (setInterval 5 s)
  │
  ├─ runOnce()
  │   ├─ picks nextJob (status=pending OR processing, nextAttemptAt ≤ now)
  │   ├─ markProcessing(job.id)          → processingCount += 1 → SyncStatus shows SYNCING
  │   ├─ withJobTimeout(processSyncJob(job), 30_000)
  │   │   ├─ SUCCESS → markDone()        → processingCount -= 1 → SyncStatus recalculates
  │   │   └─ FAILURE/TIMEOUT → markFailed() → job goes pending/failed → SyncStatus recalculates
  │   └─ finally: runningRef = false, setSyncActive(false)
  │
  └─ stuckJobSweep (setInterval 60 s)
      └─ resets "processing" jobs older than 30 s → "pending"  (safety net)
```

---

## ConnectionStatusIndicator (mobile header only)

Separate from `SyncStatus`. Only shows when session is **not healthy** AND transport is degraded.

```
showProblemPill = !sessionHealthy
                  AND (connectionStatus === RECONNECTING OR DISCONNECTED)

Labels:
  RECONNECTING → "Reconnecting…"   ← FIXED (was incorrectly "Syncing…")
  DISCONNECTED → normalizedError || "Offline"
```
