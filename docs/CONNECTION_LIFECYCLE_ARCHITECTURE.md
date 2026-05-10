# Connection lifecycle architecture (Paidly)

This document maps the **target “connection OS” model** to what is implemented today, so new code can converge on one reporting path without a big-bang rewrite.

## Authority (single decision sink)

| Layer | Role |
|--------|------|
| **`createConnectionLifecycleManager`** (`src/lib/connection/ConnectionLifecycleManager.js`) | Operating-style **coordinator**: subsystems **report** signals; it patches the **read model** and forwards allowed effects to **Session Authority** (`createSessionOrchestrator` → `Authority`). |
| **Session Authority** | Only layer that should apply **session health** transitions, **terminal expiry**, and aligned **realtime/refresh** signals. |
| **`reportLifecycleEvent`** (`src/core/session/reportLifecycleEvent.js`) | **Canonical semantic ingress** for new call sites: maps `LifecycleEventType` → existing `connectionLifecycle.*` / `report()` APIs. |

**Rules for contributors**

- **Do not** call `transitionToExpired`, `handleRefreshFatal`, or `signOut` from transport-only code (realtime flicker, offline, visibility). **Report** an event; the lifecycle + decision engine choose recovery vs terminal auth.
- **Do** use `reportLifecycleEvent({ type, payload })` or `getConnectionLifecycleManager()?.report(...)` for new instrumentation.
- **Recovery** must not clear auth by itself; full wake recovery uses `WakeRecoveryPipeline` + `AppRecoveryLock` (see `docs/SESSION_RUNTIME_GUARDS.md`).

## Connection states (target vs current)

| Target `ConnectionState` | Today (approximate mapping) |
|--------------------------|-----------------------------|
| `CONNECTED` | `sessionHealthStore`: `connected`; lifecycle `auth` / `realtime` healthy phases |
| `UNSTABLE` | `reconnecting` / `unstable` session health; lifecycle `realtime.phase` `unstable` |
| `RECOVERING` | `wakeRecoveryStore.blockMutations` + lifecycle `recovery` patch |
| `DEGRADED` | Partial recovery (auth ok, realtime flaky) — use lifecycle read model + UX; avoid terminal |
| `REAUTH_REQUIRED` | Decision engine `reauth_required` before explicit expiry |
| `EXPIRED` | `SESSION_STATUS.EXPIRED` — **terminal**, authority-only |

## Event taxonomy

**`LifecycleEventType`** is defined in `src/core/session/lifecycleTypes.js` and routed in `reportLifecycleEvent.js`.

- **`TOKEN_REFRESH_RETRYING`** / **`REFRESH_RETRYING`**: refresh coalesced while another run holds the queue (read-model `refresh.phase: "retrying"`). Does **not** escalate session. Auth `refreshSession` defaults to **joining** the in-flight promise so wake/resync/reconnect still await a real outcome; opt in with `refreshSession({ coalesceOnly: true })` only when the caller intentionally does not need that await.

Lower-level **policy signals** remain in `LifecycleSignalType` (`src/lib/connection/lifecycleSignalTypes.js`) for realtime/refresh edge cases. New features should prefer **`LifecycleEventType`** at the edge, then add mapping once if needed.

## Coordinators (roadmap)

The spec names **RefreshCoordinator**, **RealtimeCoordinator**, etc. In-repo, their responsibilities are currently split as:

| Spec component | Current home |
|----------------|--------------|
| Refresh coordination | `sessionRefreshScheduler` + `RetryController` (refresh queue) + `runAuthRefreshQueueJob` |
| Realtime coordination | `paidlyRealtimeManager` + `authRealtimeCoordinator` + lifecycle realtime signals |
| Recovery coordination | `WakeRecoveryPipeline` + `AppRecoveryLock` + `reportRecoveryWake` |
| Network / visibility | `ConnectionLifecycleManager.reportNetworkState` / `reportVisibilityState` |

Future refactors can extract classes **without** changing the authority boundary: everything still **reports into** `ConnectionLifecycleManager` / `reportLifecycleEvent`.

## Wake recovery (browser lifecycle events)

`src/core/session/wakeRecoveryLifecycleEvents.js` defines **`WakeRecoveryLifecycleEventType`**: `STARTED`, **`SUCCEEDED`**, **`FAILED`** (`detail` = `WakeRecoveryFailureReason`: `SESSION_INVALID`, `REFRESH_FAILED`, `REALTIME_FAILED`, `UNKNOWN`), and `ENDED`. **`installWakeRecoveryLifecycleTelemetry`** records all four as `wake_recovery_lifecycle` on the session telemetry bus.

After **`AppRecoveryLock.end()`** in `runWakeRecoverySequence`’s **`finally`**: on success, AuthProvider also dispatches **`paidly:wake-recovery-resync`** with `detail: { ok: true }` (store/query resync — **SyncEngine** listens to this DOM event only). **`paidly:wake-recovery-end`** is always dispatched for overlays. **WakeRecoveryOverlay** dismisses on **`FAILED`**, lifecycle **`ENDED`**, and **`paidly:wake-recovery-end`**. **AuthProvider** schedules deferred reconnect escalation on lifecycle **`FAILED`**.

## Telemetry

`reportLifecycleEvent` emits `trackSessionTelemetry("lifecycle_event", { lifecycle_event_type, ... })`. Aggregate in your analytics adapter from the `paidly:session-telemetry` bus (see `sessionTelemetry.js`).

## Related docs

- `docs/SESSION_RUNTIME_GUARDS.md` — auth vs transport reasons; CI matrix.
- `docs/ARCHITECTURE_RUNTIME_MAP.md` — runtime topology.
