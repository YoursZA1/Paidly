# Session SLO Checklist

Purpose: verify Paidly session behavior matches professional SaaS standards (Linear/Notion-style) where reconnect and token refresh are mostly invisible to users.

## Scope and Principles

- Separate auth validity from transport instability.
- Reauth prompts should only follow true auth-fatal conditions.
- Realtime disconnects and tab visibility changes should recover without user interruption.
- Query/UI cache should remain stable during reconnect windows.

## SLOs and Alert Thresholds

### 1) User-visible continuity (primary)

- **Silent session continuity:** `>= 99.7%` sessions/day with zero reauth prompts
- **False-expiry rate:** `<= 0.05%` expired prompts not caused by fatal auth
- **Reconnect UX latency:** `p95 <= 8s`, `p99 <= 20s` in reconnecting state
- **Foreground resume success:** `>= 99.5%` tab wake/visibility resumes without forced login

### 2) Token lifecycle health

- **Refresh success rate:** `>= 99.9%`
- **Fatal refresh rate:** `<= 0.03%` of active sessions/day
- **Refresh collision rate:** `<= 0.1%` of refresh attempts
- **401 recovery success:** `>= 98%` of 401s recovered via refresh+retry

### 3) Realtime/transport recovery

- **Realtime auto-recover:** `>= 99%` websocket drops recover without reauth
- **Sleep/wake resubscribe:** `p95 <= 5s`
- **Reconnect storm guard:** average attempts per drop `<= 3`
- **Offline correctness:** `0` forced logout events while offline

### 4) Cache/state continuity

- **Cache survival during reconnect:** `>= 99.9%` reconnect windows without full state reset
- **Replay success after recovery:** `>= 98%` safe replay success
- **Critical view rehydrate:** dashboard/invoices `p95 <= 2.5s` after reconnect

### Alerting

- **Critical**
  - Silent continuity `< 99.0%` (30m window)
  - False-expiry `> 0.2%` (30m)
  - Refresh success `< 99.0%` (15m)
- **High**
  - 401 recovery `< 95%` (30m)
  - Realtime auto-recover `< 97%` (30m)
  - Reconnecting p95 `> 15s` (30m)
- **Medium**
  - Refresh collisions `> 1%` (1h)
  - Replay success `< 95%` (1h)

## Event Taxonomy and Hook Mapping

The table below maps each metric to existing Paidly hooks and where to instrument.

### SessionDecisionEngine (`src/lib/sessionDecisionEngine.js`)

- Emits decision outcomes: `none`, `reconnecting`, `reauth_required`.
- Instrument when `decideSessionAction(...)` returns:
  - `session_decision_made` with fields:
    - `decision_action`
    - `reason`
    - `believed_signed_in`
    - `online`
    - `refresh_fatal`

**Metrics fed**

- False-expiry rate (detect `reauth_required` without fatal context)
- Offline correctness (`online=false` should bias reconnecting, not reauth)
- Reconnect latency baseline (paired with session health transitions)

### RPC session policy (`src/lib/rpcSessionPolicy.js`)

- Core auth recovery path for authenticated requests.
- Instrument:
  - `rpc_unauthorized_detected` at start of `runRpcUnauthorizedPolicy(...)`
  - `session_refresh_attempted` before refresh
  - `session_refresh_result` (`ok|failed|fatal`)
  - `rpc_unauthorized_recovered` when retry succeeds
  - `rpc_reauth_required` when policy escalates
  - `auth_token_missing` in `getSessionAccessTokenOrHandleUnauthorized(...)`

**Metrics fed**

- Refresh success rate
- Fatal refresh rate
- 401 recovery success
- Refresh collision rate (track in-flight dedupe hits)
- Replay success rate (from queued safe replay outcomes)

### Session health store (`src/stores/sessionHealthStore.js`)

- Canonical UX state machine: `connected`, `reconnecting`, `expired`.
- Instrument at `setSessionHealthStatus(...)`:
  - `session_health_transition` with:
    - `from_status`
    - `to_status`
    - `reason`
    - `timestamp`

**Metrics fed**

- Reconnect UX latency (duration in reconnecting)
- Foreground resume success
- False-expiry correlation (expired without fatal auth events)
- Silent continuity (derived from absence of expired/reauth prompts)

## Derived Metrics (How to Calculate)

- **Silent continuity**
  - Numerator: sessions without `rpc_reauth_required` and without `session_health_transition -> expired`
  - Denominator: active sessions/day
- **False-expiry rate**
  - Expired transitions where no prior fatal refresh / explicit signout signal exists within lookback window
- **Reconnect latency**
  - Duration between `session_health_transition -> reconnecting` and next `-> connected`
- **401 recovery success**
  - `rpc_unauthorized_recovered / rpc_unauthorized_detected`

## Required Event Fields

For every event above, include:

- `session_id`
- `user_id_hash` (never raw email)
- `tab_id`
- `network_state` (`online|offline`)
- `visibility_state` (`visible|hidden`)
- `reason`
- `ts_ms`

## Implementation Notes for Current Codebase

- `SessionDecisionEngine` is already used by auth/realtime flows; this is the best place to classify reconnect vs reauth causality.
- `rpcSessionPolicy` already centralizes refresh/retry/replay behavior; instrument there to avoid fragmented auth metrics.
- `sessionHealthStore` provides a single UX truth source; transition events should be emitted from this store, not from UI components.
- Keep UI components read-only regarding auth state ownership; they should render state, not decide auth validity.

## Weekly Ops Review

- Are expired transitions preceded by fatal auth signals?
- Any `offline -> expired` path observed?
- What are top reasons for reconnect durations >20s?
- Which browser/OS segments have elevated refresh failures?

