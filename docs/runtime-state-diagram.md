# Runtime state diagram

Canonical phases for **`RuntimeCoordinator`** (`src/core/runtime/RuntimeCoordinator.ts`).

## State machine (Mermaid)

```mermaid
stateDiagram-v2
  [*] --> BOOTING
  BOOTING --> AUTH_RECOVERING: auth_uncertain_or_refresh
  BOOTING --> SESSION_READY: auth_hydrated_ok
  BOOTING --> OFFLINE: navigator_offline

  SESSION_READY --> OFFLINE: navigator_offline
  OFFLINE --> RECONNECTING: navigator_online
  RECONNECTING --> SESSION_READY: transport_stable
  RECONNECTING --> DEGRADED: partial_recovery

  SESSION_READY --> AUTH_RECOVERING: refresh_or_session_risk
  AUTH_RECOVERING --> SESSION_READY: refresh_ok
  AUTH_RECOVERING --> ERROR: fatal_refresh

  SESSION_READY --> SYNCING: sync_queue_active
  SYNCING --> SESSION_READY: sync_idle

  SESSION_READY --> DEGRADED: realtime_circuit_or_slow_supabase
  DEGRADED --> SESSION_READY: health_restored

  ERROR --> BOOTING: user_relogin_or_hard_reset
```

## Orthogonal axes (conceptual)

The coordinator **compresses** multiple booleans into one **phase** for UI + policy, while still allowing internal flags:

| Axis | Source of truth (today → target) |
|------|----------------------------------|
| Auth JWT validity | Supabase client + `AuthContext` → feed **RuntimeCoordinator** |
| Network | `navigator.onLine` + fetch errors → **OFFLINE / RECONNECTING** |
| Realtime transport | `paidlyRealtimeManager` → **DEGRADED** when circuit open |
| Sync | `useSyncQueueStore` → **SYNCING** when pending/processing |

## Tab / multi-tab

- **Single coordinator instance per tab** (Zustand store module singleton).
- Cross-tab: reuse existing **`authTabSync`** / storage locks; coordinator listens to duplicated signals but **debounces** transitions.

## Reconnect backoff

`scheduleReconnecting()` waits **`reconnectDelayMs(reconnectAttempt)`** — exponential from **`RECONNECT_DEBOUNCE_MS`** (400ms) up to a **30s cap**, with the attempt counter incremented on **`completeReconnecting(false)`** and cleared on success or when entering **OFFLINE** (fresh backoff curve after a real outage).
