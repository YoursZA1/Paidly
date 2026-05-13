# Realtime strategy (Supabase)

## Current architecture

- **Single multiplex channel** — `src/lib/realtime/paidlyRealtimeManager.js` (`PAIDLY_REALTIME_CHANNEL`)
- **JWT binding** — refresh triggers `setAuth` + controlled channel rebuild (see blueprint realtime section)
- **Defensive tooling** — circuit breaker, transport cooldown, subscribe timeout, debounced invalidation in `SyncEngine.jsx`

## Goals of `src/core/realtime/RealtimeManager.ts`

1. **Registry** — logical subscription name → teardown handle (prevent duplicates).
2. **Budget** — max concurrent logical domains; backoff when exceeded.
3. **Visibility** — `pause()` / `resume()` hooks for hidden tabs (integrate with `document.visibilityState`).
4. **Org scope** — channel filters must always include tenant predicates allowed by RLS (never widen in client).

## Anti-patterns

- **Per-component** `supabase.channel(...)` for the same postgres table — duplicates events and reconnect cost.
- **Immediate `fetchAll`** on every postgres_change — causes **DB storms** at scale.

## Migration path

1. Instantiate **`RealtimeManager`** as a thin façade.
2. Move **new** table subscriptions through the registry only.
3. Gradually route `paidlyRealtimeManager` internal tables through registry APIs without changing wire protocol.

## Metrics to watch

- Channel **join** count / hour / user
- **Rebuild** count / hour / user
- postgres_changes **events dropped** (Supabase dashboard)
