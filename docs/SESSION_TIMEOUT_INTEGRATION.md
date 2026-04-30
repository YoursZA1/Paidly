# Session Timeout Integration

This document describes the inactivity session manager shipped in Paidly and how to integrate the same pattern in a Next.js app.

## Overview

The implementation consists of:

- `useInactivitySessionTimeout` hook: activity detection, timers, keep-alive, cross-tab sync.
- `InactivitySessionGuard` component: warning UX + logout actions.
- `api/keep-alive.js`: authenticated keep-alive endpoint.
- `sessionInactivitySync` channel: BroadcastChannel/localStorage-backed cross-tab messages.
- `sessionTimeoutControls` utilities: optional critical-operation guards and draft persistence helpers.

## Default Behavior

- Idle threshold: 5 minutes
- Warning countdown: 2 minutes
- Total window: 7 minutes
- Keep-alive: every 90 seconds while active

All durations are configurable via:

- `VITE_SESSION_IDLE_TIMEOUT_MS`
- `VITE_SESSION_WARNING_TIMEOUT_MS`
- `VITE_SESSION_KEEPALIVE_MS`

## Integration in Next.js

1. Place the hook and guard in your client-side app shell:

```tsx
"use client";
import InactivitySessionGuard from "@/components/session/InactivitySessionGuard";

export default function AppLayout({ children }) {
  return (
    <>
      <InactivitySessionGuard />
      {children}
    </>
  );
}
```

2. Expose a keep-alive API route (App Router example):

```ts
// app/api/keep-alive/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
```

3. Ensure your auth layer provides:

- `isAuthenticated`
- `authReady`
- `logout()`
- `session.accessToken` (or equivalent bearer token)

4. (Optional) Wrap critical operations:

```ts
import { beginCriticalSessionOperation, endCriticalSessionOperation } from "@/lib/sessionTimeoutControls";

beginCriticalSessionOperation();
try {
  await uploadFile();
} finally {
  endCriticalSessionOperation();
}
```

## Safety Guarantees

- No timer stacking: one warning timer, one countdown timer, one keep-alive timer.
- Hidden tab pause/resume: inactivity countdown is paused while tab is hidden.
- Cross-tab consistency: activity and forced logout are synchronized.
- Promise failures are caught to avoid unhandled rejections.

## Testing

Unit tests cover:

- warning open/reset behavior
- auto-timeout execution
- cross-tab message synchronization
- hidden-tab pause helper math

Run:

```bash
npm run test:run -- tests/unit/useInactivitySessionTimeout.test.jsx tests/unit/sessionInactivitySync.test.js
```
