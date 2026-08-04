# Paidly — Architecture Improvement Plan (Runtime Scalability)

> **Current status as of 2026-05-18.** The `src/core/` layer is scaffolded and integrated. This document tracks what is complete, what is in progress, and what remains.

---

## Principles (non-negotiable)

1. **Auth recovery ≠ transport recovery** — different state, different UX, different retries. `sessionHealthStore` drives UI; `RuntimeCoordinator` drives request pausing.
2. **One recovery flight at a time** — `RefreshQueue` single-flight mutex + `isRecoveryCircuitOpen()` gate at every entry point.
3. **No unscoped `invalidateQueries(['invoices'])`** for routine realtime — prefer targeted keys from `src/core/query/queryPolicies.ts`.
4. **Idempotent mutations** — `operationId` in every queue item + `MutationCoordinator.runOnce()` + server unique constraint on `client_operation_id`.
5. **Pause HTTP work while `RECONNECTING` / `AUTH_RECOVERING`** — `RequestCoordinator` reads `RuntimeCoordinator.pauseNonCriticalRequests`.
6. **Never add a second `onAuthStateChange` or a second Realtime channel** — single multiplex channel via `paidlyRealtimeManager.js`.

---

## Phase Completion Status

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | `docs/runtime-audit-report.md` | ✅ Updated 2026-05-18 |
| 2 | `RuntimeCoordinator.ts` — 8-state machine, Zustand store | ✅ Complete + wired via bridge |
| 3 | `queryPolicies.ts` — fine-grained key factories + stale tiers | ✅ Complete; new hooks use it |
| 4 | `persistedQueryClient.ts` — logout purge + org-bust helpers | ✅ Complete |
| 5 | `RealtimeManager.ts` — subscription registry + budget | ✅ Wired — logical families tracked from `paidlyRealtimeManager` (`getSharedRealtimeManager`) |
| 6 | `MutationCoordinator.ts` — operationId single-flight dedup | ✅ Complete + wired in syncJobProcessor |
| 7 | `RequestCoordinator.ts` — concurrency + pause gate | ✅ Complete; **polling bug fixed 2026-05-18** |
| 8 | `errors/classify.ts` + `errors/types.ts` | ✅ Complete |
| 9 | Render performance | ⏳ Partial — list hooks use `listQueryDefaults()`; store selectors incomplete |
| 10 | Docs: audit, state diagram, strategy docs | ✅ Updated 2026-05-18 |

---

## Remaining Work

### Immediate (bugs fixed in this pass)

- [x] `useSyncQueueStore.resetStuckJobs()` — call on `SyncEngine` mount
- [x] `useSyncQueueStore.pruneJobsNotForUser(userId)` — call after login
- [x] `RequestCoordinator.waitUntilUnpaused` — replaced polling (100ms) with Zustand event-driven subscription
- [x] `useSupabaseQuery` — `retry=1` → `retry=false` (align with global policy)

### Near-term

- [ ] **Wire `RealtimeManager.ts`** as a thin façade over `paidlyRealtimeManager.js` OR delete it. It currently provides no runtime value. Suggested API:
  ```ts
  const mgr = new RealtimeManager();
  mgr.register("sync", () => setPaidlySyncRealtimeBridge({ ... }));
  mgr.register("profiles", () => subscribePaidlyProfilesRealtime(...));
  ```
- [ ] **Remove legacy broad root from `queryInvalidation.js`**: `queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false })` — audit which hooks still use the bare `["invoices"]` root and migrate them to `queryKeys.invoiceList(scopeKey)` first.
- [ ] **Debounce `useAppStore` persist write** — batch/debounce the Zustand `persist` middleware flush for stores holding large arrays (invoices, clients). 200ms debounce reduces synchronous localStorage writes under realtime churn.

### Long-term

- [ ] **Split `AuthContext` value into stable/volatile** — separate `user`, `loading`, `login/logout` (stable, rare change) from `session` (changes on every token refresh). Consumers that only care about `user` would stop re-rendering on token refreshes.
- [ ] **Migrate large `useAppStore` collections to IDB-only** — `invoices`, `clients` in localStorage grows with usage. Async IDB writes don't block the main thread.
- [ ] **Add sync queue max-size cap and failed-job TTL** — prevent unbounded growth. Failed jobs older than 7 days should be pruned on startup.
- [ ] **`org_id` in sync queue jobs** — once multi-org support lands, add `meta.orgId` to each job for RLS-safe replay across org switches.

---

## Success Criteria (measurable)

| Metric | Target |
|--------|--------|
| Duplicate identical GET per session | ↓ via dedup + `listQueryDefaults.refetchOnWindowFocus=false` |
| Realtime full channel rebuilds per hour | ↓ via circuit breaker + hard suppress |
| Stuck sync jobs (processing > 5m, network up) | 0 — `resetStuckJobs()` on mount |
| Fatal auth refresh rate | No regression vs baseline |
| `waitUntilUnpaused` CPU events per second | Near 0 — event-driven, not polling |

---

## Related Docs

- [`docs/runtime-audit-report.md`](./runtime-audit-report.md) — full findings
- [`docs/runtime-state-diagram.md`](./runtime-state-diagram.md) — state machines
- [`docs/session-recovery-flow.md`](./session-recovery-flow.md) — auth recovery sequencing
- [`docs/realtime-strategy.md`](./realtime-strategy.md) — realtime channel architecture
- [`docs/query-cache-strategy.md`](./query-cache-strategy.md) — TanStack Query policy
- [`docs/request-budgeting-strategy.md`](./request-budgeting-strategy.md) — request coordination
