# Runtime scalability initiative — phase checklist

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | `docs/runtime-audit-report.md` | Done |
| 2 | `src/core/runtime/RuntimeCoordinator.ts` (states, listeners, single-flight, **exponential reconnect backoff**) | Done — wired via `runtimeCoordinatorBridge` + CLM + auth pipeline |
| 3 | `src/core/query/queryPolicies.ts` + broad invalidation audit | In progress — `useInvoices` + SyncEngine use scoped invalidation |
| 4 | `src/core/query/persistedQueryClient.ts` + IDB | Done — `purgeQueryClientAfterLogout` on sign-out / fatal auth |
| 5 | `src/core/realtime/RealtimeManager.ts` | Registry done — **delegate from `paidlyRealtimeManager`** |
| 6 | `src/core/sync/MutationCoordinator.ts` + **`operationId` on sync queue jobs** | Done — `syncMutationCoordinator` + `client_operation_id` on invoices (Wave 3) |
| 6b | `customClient.js` modular split | Done — **EntityManager** → `src/api/entity/`; `customClient.js` is thin orchestrator (~120 lines) |
| 7 | `src/core/network/RequestCoordinator.ts` + **`retryWithBudget`** | Done — Axios pauses on recovery; **EntityManager** uses `runtimeMutationGuard` |
| 7b | Shared auth rate limit (Postgres + memory fallback) | Done — `consume_rate_limit_bucket` RPC + `server/src/rateLimit/` |
| 8 | `src/core/errors/*` | `classifyPaidlyError` done — **replace string checks incrementally** |
| 9 | Render perf audit + hot-path memo | Checklist in `architecture-improvement-plan.md` — **code passes optional** |
| 10 | Strategy docs (7 files) | Done |

Supporting: `docs/architecture-improvement-plan.md`, `docs/query-cache-strategy.md`, `docs/realtime-strategy.md`, `docs/session-recovery-flow.md`, `docs/request-budgeting-strategy.md`, `src/core/index.ts`, `tests/unit/core/runtimeCoordinator.test.ts`.
