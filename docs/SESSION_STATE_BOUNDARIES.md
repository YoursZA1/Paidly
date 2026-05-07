# Session State Boundaries

This document defines hard boundaries between auth validity and connection health.

## Core Rule

- **Auth state** answers: "Is this identity/session valid?"
  - `authenticated`, `refreshing`, `expired`
- **Connection state** answers: "Can transport channels currently reach backend/realtime?"
  - `connected`, `reconnecting`, `offline`, `degraded`

Connection instability must never directly force auth expiry/logout.

## Allowed vs Forbidden in Connection Modules

Connection modules (realtime/monitor/sync connectivity code) may:

- Set connection store state.
- Set session health to `RECONNECTING` when transport is unstable.
- Trigger non-terminal checks/retries.

Connection modules must **not**:

- Call `logout(...)` or `signOut(...)`.
- Call `setSessionHealthStatus(SESSION_STATUS.EXPIRED, ...)`.
- Call `patchAuthSession(...)` directly.
- Call `triggerUnauthorizedSession(...)` directly.

## Terminal Auth Transitions (Allowed Locations)

Only auth policy paths may force terminal transitions:

- `SessionDecisionEngine` outcomes with `reauth_required`.
- `rpcSessionPolicy` + `unauthorizedSessionHandler`.
- explicit user sign out.
- explicit inactivity timeout policy.

## Guardrail in CI

Run:

```bash
npm run check:session-boundaries
```

The script scans connection/realtime modules and fails if forbidden auth mutations appear.

