# Architecture improvement plan (runtime scalability)

This plan turns **audit findings** (`docs/runtime-audit-report.md`) into **incremental** engineering work without a risky big-bang rewrite.

## Principles (non-negotiable)

1. **Auth recovery ≠ transport recovery** — different state, different UX, different retries.
2. **One recovery flight** at a time — `RuntimeCoordinator` single-flags (`src/core/runtime/RuntimeCoordinator.ts`).
3. **No unscoped `invalidateQueries(['invoices'])`** for routine realtime — prefer targeted keys (`src/core/query/queryPolicies.ts`).
4. **Idempotent mutations** — `operationId` + DB constraints (`src/core/sync/MutationCoordinator.ts`).
5. **Pause HTTP work** while `RECONNECTING` / `AUTH_RECOVERING` when safe (`src/core/network/RequestCoordinator.ts`).

## Phase map

| Phase | Deliverable | Integration strategy |
|-------|-------------|------------------------|
| 1 | `docs/runtime-audit-report.md` | Done — living document |
| 2 | `src/core/runtime/RuntimeCoordinator.ts` | **Subscribe** from `ConnectionLifecycleManager` / `AuthContext` to *feed* state first; later *drive* decisions |
| 3 | `src/core/query/queryPolicies.ts` | Migrate hooks **file-by-file** off broad keys |
| 4 | `src/core/query/persistedQueryClient.ts` | Align naming with existing `createAppQueryClient` + IDB; optional `@tanstack/react-query-persist-client` later |
| 5 | `src/core/realtime/RealtimeManager.ts` | Wrap / delegate to `paidlyRealtimeManager.js` — avoid duplicate channels |
| 6 | `src/core/sync/MutationCoordinator.ts` | Wrap `Invoice.create` / queue enqueue paths |
| 7 | `src/core/network/RequestCoordinator.ts` | Optional Axios adapter; pause during coordinator `RECONNECTING` |
| 8 | `src/core/errors/*` | Replace ad-hoc string checks incrementally |
| 9 | Render perf | Zustand selector pass + memoization in hot lists |
| 10 | Diagram / strategy docs | Linked from `HOW_EVERYTHING_CONNECTS.md` |

## Phase 9 — Render performance (audit checklist)

- [ ] Replace broad `useAppStore()` with **selectors** / `useShallow` on hot routes (`Dashboard`, `Layout`).
- [ ] Ensure list **row components** are `memo`’d; avoid inline object/array props.
- [ ] Audit **realtime → invalidate** paths: keep debounced; prefer **patch** over full list refetch where possible.
- [ ] Defer non-critical `useEffect` fetches until `SESSION_READY` (via `RuntimeCoordinator` once wired).

## Milestones (suggested order)

1. **Telemetry:** log `RuntimePhase` transitions + Supabase error codes in one pipeline.
2. **Query keys:** introduce `queryPolicies` in **new** hooks first; ban broad invalidation in lint rule (future).
3. **Sync:** plumb `operationId` from `queueCreateInvoice` through `processSyncJob`.
4. **Realtime:** expose pause/resume API on coordinator; call from visibility handler.

## Success criteria (measurable)

- p95 **duplicate identical GET** count per session ↓
- p99 **Realtime full channel rebuilds** per hour per user ↓
- **Stuck sync job** count (pending > 10m with network up) ↓
- **Fatal refresh** rate not increased vs baseline

## Related docs

- `docs/runtime-state-diagram.md`
- `docs/query-cache-strategy.md`
- `docs/realtime-strategy.md`
- `docs/session-recovery-flow.md`
- `docs/request-budgeting-strategy.md`
- `docs/HOW_EVERYTHING_CONNECTS.md`
