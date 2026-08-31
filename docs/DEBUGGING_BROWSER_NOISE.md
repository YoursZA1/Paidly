# Debugging Browser Noise

Some console errors are browser-environment noise, not Paidly app defects.

## Common Non-App Noise

- `A listener indicated an asynchronous response...`
- `Unchecked runtime.lastError...`
- Extension/content-script stack traces from:
  - React DevTools
  - password managers
  - ad blockers
  - other Chrome extensions

These are often emitted by extension message channels and can appear during normal app usage.

Also ignore unless they reproduce without extensions:

- `content.js` / `Error: no ad` — ad blockers
- `Banner not shown: beforeinstallpromptevent.preventDefault()` — Chrome note when install is deferred until the user taps Install Paidly (not a crash)

## Triage Rule

Do **not** open app bug tickets for this class of logs unless reproducible without extensions.

Treat as actionable only if reproduced in:

- Incognito with extensions disabled
- A clean browser profile
- Another browser with no extension overlap

## Quick Isolation Checklist

1. Reproduce in regular Chrome.
2. Reproduce in Incognito (extensions disabled).
3. Reproduce in clean profile.
4. If repro disappears in clean environment, classify as browser noise.
5. Continue incident work on server/app signals (HTTP status, auth transitions, API traces, telemetry).

## What To Prioritize Instead

For Paidly reliability incidents, prioritize:

- terminal auth errors (for example invalid refresh token)
- repeated API `401/403/5xx`
- retry/reconnect loop behavior
- session state transitions (`CONNECTED`/`RECONNECTING`/`EXPIRED`)
- API route availability and rewrite/deployment issues

