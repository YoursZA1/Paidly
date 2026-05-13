# Runtime scalability initiative — phase checklist

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | `docs/runtime-audit-report.md` | Done |
| 2 | `src/core/runtime/RuntimeCoordinator.ts` (states, listeners, single-flight, **exponential reconnect backoff**) | Done — **wire from `AuthContext` / `navigator` next** |
| 3 | `src/core/query/queryPolicies.ts` + broad invalidation audit | Policies done — **hook migration incremental** |
| 4 | `src/core/query/persistedQueryClient.ts` + IDB | Helpers done — app still uses `createAppQueryClient` + `paidlyIdbQueryPersistence`; optional **`@tanstack/react-query-persist-client`** |
| 5 | `src/core/realtime/RealtimeManager.ts` | Registry done — **delegate from `paidlyRealtimeManager`** |
| 6 | `src/core/sync/MutationCoordinator.ts` + **`operationId` on sync queue jobs** | Coordinator done — **`operationId` in `syncQueueActions` / merge in store** |
| 7 | `src/core/network/RequestCoordinator.ts` + **`retryWithBudget`** | Done — **Axios integration optional** |
| 8 | `src/core/errors/*` | `classifyPaidlyError` done — **replace string checks incrementally** |
| 9 | Render perf audit + hot-path memo | Checklist in `architecture-improvement-plan.md` — **code passes optional** |
| 10 | Strategy docs (7 files) | Done |

Supporting: `docs/architecture-improvement-plan.md`, `docs/query-cache-strategy.md`, `docs/realtime-strategy.md`, `docs/session-recovery-flow.md`, `docs/request-budgeting-strategy.md`, `src/core/index.ts`, `tests/unit/core/runtimeCoordinator.test.ts`.
