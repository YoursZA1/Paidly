# Architecture Runtime Map

Purpose: lock Paidly runtime structure and ownership boundaries so product behavior stays consistent as the codebase evolves.

Session incident guardrails (auth vs transport boundaries): see `docs/SESSION_RUNTIME_GUARDS.md`.

## Runtime Topology (Canonical)

### Browser

- **UI Layer**
- **Cache Layer**
- **Session Manager**
- **Realtime Layer**
- **Sync Queue**

### Supabase

- **Auth**
- **Realtime**
- **Postgres**
- **Storage**

### Edge/Server Functions

- **Trial expiration**
- **Email sending**
- **Background jobs**
- **Admin workflows**

## Ownership Boundaries (Non-Negotiable)

## 1) Browser

### UI Layer

- Renders state and triggers user intent.
- Must not decide auth validity from transport failures.

### Cache Layer

- React Query + persisted Zustand/local storage maintain continuity.
- During reconnect, UI must remain populated from cache (no full blank resets).

### Session Manager

- Single source of truth for session decisions:
  - reconnecting vs reauth-required
  - visibility/network/realtime recovery handling
- Auth validity and connection health are separate state machines.

### Realtime Layer

- Handles channel subscribe/reconnect/backoff.
- Websocket disconnect must never directly cause logout.

### Sync Queue

- Handles deferred and replay-safe client operations.
- Retries on transient failures; does not force terminal auth transitions.

## 2) Supabase

### Auth

- Session persistence + refresh token lifecycle.
- Browser uses anon key only.
- Service role key is never exposed client-side.

### Realtime

- Channel events provide live updates and recovery signals.
- Transport instability maps to reconnecting/degraded, not expired auth.

### Postgres

- System-of-record data and RLS enforcement.
- Client may call only non-privileged RPCs.

### Storage

- User/business assets under policy-controlled buckets.
- Any privileged write path belongs in server/edge handlers.

## 3) Edge/Server Functions

### Trial expiration

- Runs as privileged backend job (cron/scheduled), not repeated privileged client RPC.

### Email sending

- Server-side only for secrets and provider credentials.

### Background jobs

- Scheduler/worker style execution for non-interactive tasks.

### Admin workflows

- Service-role guarded endpoints with role checks and auditability.

## Privileged Operation Rules

- Privileged RPCs (for example `bootstrap_user_organization`, `expire_trial_if_due`) must never execute directly from browser code.
- Client must call server/edge routes for privileged workflows.
- CI guardrails must fail if forbidden privileged RPCs are referenced in client call paths.

## Session/Connection State Contract

### Auth state (session validity)

- `authenticated`
- `refreshing`
- `expired`

### Connection state (transport quality)

- `connected`
- `syncing/reconnecting`
- `offline`
- `degraded`

Hard rule: connection state changes must not directly force auth expiry.

## Data-Flow Contract (Browser)

`UI -> Hooks -> Services -> Session/Cache policy -> API/Supabase`

- Hooks/services own retries, error shaping, and policy routing.
- UI remains declarative and does not own terminal auth mutation logic.

## Definition of Done for New Features

- Fits one runtime owner above (Browser, Supabase, or Edge/Server).
- Honors privileged-operation and session-state boundaries.
- Uses Session Manager + unified RPC/session policy for auth-sensitive flows.
- Preserves cached UI during reconnect.

