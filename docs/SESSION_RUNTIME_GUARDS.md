# Session Runtime Guards

This guard matrix is the runtime contract for session behavior.

Do not blur auth validity and transport health.

## Decision Matrix

| Signal / Reason | Class | Required State | Forbidden State |
|---|---|---|---|
| `refresh_token_invalid`, `auth_expired`, `signed_out`, `session_revoked` | Auth-terminal | `SESSION_STATUS.EXPIRED` | `RECONNECTING` loops |
| `offline`, `network timeout`, websocket disconnect, slow API | Connection/transport | `SESSION_STATUS.RECONNECTING` (or connection degraded) | `EXPIRED` / forced logout |
| slow query / empty cache timeout | Query/runtime | loading fallback + cached UI | logout / auth reset |

## Required Runtime Rules

- Only explicit auth-terminal evidence may call `transitionToExpired(...)`.
- Network/transport reasons must route through reconnect/degraded paths.
- Query slowness must never mutate auth state.
- Reconnect and refresh loops must halt once session becomes `EXPIRED`.

## CI Enforcement

CI includes `check:session-reason-matrix` which fails when code introduces:

- `transitionToExpired("...")` with network/transport reason tokens
- `setSessionHealthStatus(SESSION_STATUS.EXPIRED, "...")` with network/transport reason tokens

Use these reason classes consistently:

- **Auth-terminal reasons**: `refresh_token_invalid`, `auth_expired`, `signed_out`, `session_revoked`, `forced_sign_out`
- **Transport reasons**: `offline`, `network`, `timeout`, `reconnect`, `session_missing`, `background_sync`

