# Paidly — Runtime audit report (Phase 1)

**Scope:** React + Vite SPA, Zustand, TanStack Query, Supabase Auth/Postgres/Realtime, Vercel `api/*`, optional Express `server/`, offline sync queue, session refresh scheduler.  
**Goal:** Identify coordination risks that show up at modest concurrency (~30 users) and under flaky networks.

---

## Executive summary

| Area | Risk level | Primary symptom |
|------|------------|-----------------|
| Auth + refresh + recovery | **High** | “Random” logout, stuck mutations, terminal circuit |
| Realtime multiplex + invalidation | **High** | Reconnect storms, refetch amplification |
| TanStack Query defaults + broad keys | **Medium** | Duplicate fetches, work on focus |
| Sync queue + `getSession` gate | **High** | Invoices stuck “queued” |
| Axios retries | **Medium** (mitigated) | 429 amplification (see `installBackendApiResilience.js`) |
| Persistence (LS + IDB + sync queue) | **Medium** | Stale org-shaped cache, quota, auth-adjacent keys |
| React render churn | **Medium** | Realtime → `invalidateQueries` / `fetchAll` cascades |

**Cross-user data leakage** via a shared in-browser Supabase singleton is **not** the dominant model (each browser is one signed-in principal). **Coupling** is via **shared IP limits**, **shared Supabase quotas**, and **client-side coordination bugs** (duplicate refresh, duplicate invalidation).

---

## 1. Auth lifecycle

**Implementation touchpoints:** `src/contexts/AuthContext.impl.jsx`, `src/lib/session/sessionRefreshScheduler.js`, `src/lib/supabaseAuthRefresh.js`, `src/lib/supabaseClient.js`, `src/lib/session/recoveryCircuit.js`, `src/lib/rpcSessionPolicy.js`.

**Findings**

- **Multiple initiators** (visibility, online, keep-alive, tab sync, wake) correctly funnel through **`requestSessionRefresh`** — good single entry.
- **Parallel tab refresh** mitigated via **localStorage lock** in `supabaseAuthRefresh.js`; still sensitive to **slow Auth** + **15s refresh attempt cap**.
- **Bounded waits** on session read/init (e.g. `SESSION_READ_MS`, `SESSION_INIT_MS`) can surface as “empty session” under latency; mitigations recently increased timeouts.
- **`SIGNED_IN` / `SIGNED_OUT`** clears **`clearSessionOrgIdCache()`** — reduces org cache leakage across identity changes.

**Risks**

- **Race:** GoTrue auto-refresh vs manual/backend refresh — partially documented; fatal misclassification still possible under load.
- **Session corruption:** Storage corruption guard exists (`wrapStorageWithCorruptionGuard`); rare partial writes still possible.

**Recommendations**

- Treat **transport 429** separately from **invalid refresh token** in telemetry.
- Single-flight at **orchestrator** level (new `RuntimeCoordinator`) should wrap “recovery in progress” for UI + sync + realtime.

---

## 2. Realtime subscriptions

**Touchpoints:** `src/lib/realtime/paidlyRealtimeManager.js`, `src/lib/supabaseClient.js` (`eventsPerSecond`), `src/components/sync/SyncEngine.jsx`, `src/lib/realtime/*`.

**Findings**

- **Single multiplex channel** pattern reduces duplicate channel explosion — good.
- **Circuit breaker / transport cooldown / JWT rebuild debounce** — protects against naive reconnect loops; still risk of **refetch storms** when realtime degrades.
- **RLS** scopes rows per user/org; **client-side filter** in channel config must stay aligned with server policies.

**Risks**

- **Reconnect storm:** many components each triggering rebuild (mitigated in manager; still watch new call sites).
- **Tab hidden:** visibility-driven logic exists; **pause postgres_changes processing** when hidden is not universally enforced at subscription level (debounced invalidation paths exist).

**Recommendations**

- Central **`RealtimeManager`** (registry + budget) as façade over existing manager during migration.
- Explicit **pause/resume** on `document.visibilityState`.

---

## 3. TanStack Query invalidation

**Touchpoints:** `src/lib/query-client.js`, `src/components/sync/SyncEngine.jsx`, hooks under `src/hooks/*`, `invalidateQueries({ queryKey: ["invoices"], exact: false })` patterns.

**Findings**

- **`invalidateQueries` with `exact: false`** on roots like `["invoices"]` fans out to **all** invoice-related keys — intentional for freshness, costly under churn.
- Defaults: **`refetchOnWindowFocus: true`**, **`refetchOnMount: true`** — can multiply requests for mobile tab switching.
- **Persistence:** `localStorage` snapshot + IDB (`paidlyIdbQueryPersistence.js`) with **root key allowlist** — auth keys blocked.

**Risks**

- **Stale cache:** restored LS/IDB data after long offline period until refetch completes.
- **Duplicate fetches:** overlapping invalidations + mount refetch.

**Recommendations**

- **`queryPolicies.ts`** keyed lists: `invoiceList(orgId)`, `invoiceDetail(id)`, narrow invalidation.
- Tiered **`staleTime`** / **`gcTime`** per domain in policy module.

---

## 4. Sync queue execution

**Touchpoints:** `src/stores/useSyncQueueStore.js`, `src/lib/syncJobProcessor.js`, `src/lib/syncQueueActions.js`, `SyncEngine.jsx`.

**Findings**

- **5s tick**, **one job** per pass — simple, predictable; slow under backlog.
- **Session gate:** if `getSession()` empty, job not processed; **`requestSessionRefresh({ source: "sync_queue_session" })`** coalesced (~8s) — recent improvement.

**Risks**

- **Duplicate mutation:** same invoice create retried after partial success without **idempotency key** at DB — business risk.
- **Replay:** queue persisted in **localStorage** — good for UX; requires **operationId** for server dedupe.

**Recommendations**

- **`MutationCoordinator`** with `operationId` + server unique constraints.

---

## 5. Network reconnect handling

**Touchpoints:** `src/lib/connection/ConnectionLifecycleManager.js`, `src/lib/auth/authReconnectEscalation.js`, `SyncEngine.jsx` (`online`/`focus` listeners).

**Findings**

- **Escalation controller** avoids parallel reconnect loops — good.
- **SyncEngine** retries failed queue on `online`.

**Risks**

- **Duplicate reconnect** if a new subsystem adds its own `online` listener without coordination.

**Recommendations**

- **`RuntimeCoordinator`** owns online/offline transitions; other modules subscribe.

---

## 6. Visibility / tab lifecycle

**Touchpoints:** `src/hooks/useInactivitySessionTimeout.js`, `InactivitySessionGuard.jsx`, `paidlyRealtimeManager.js`, wake recovery pipeline.

**Findings**

- **Inactivity logout** + **cross-tab sync** — documented in `SESSION_TIMEOUT_INTEGRATION.md`.
- **Wake recovery** blocks mutations / sync / realtime delivery — strong guardrail.

**Risks**

- **Multi-tab:** duplicate keep-alive / refresh unless scheduler coalesces (generally OK).

---

## 7. Axios retry logic

**Touchpoints:** `src/api/installBackendApiResilience.js`, `src/api/backendClient.js`.

**Findings**

- Retries for GET vs mutations; **429** no longer retried on mutations; GET at most **one** retry on 429 — reduces storms.

**Risks**

- **`fetch`** paths (e.g. keep-alive) bypass Axios — separate policy.

**Recommendations**

- **`RequestCoordinator`** for concurrency + pause-during-reconnect.

---

## 8. Supabase session refresh

**Touchpoints:** `supabaseAuthRefresh.js`, optional `POST /api/auth/refresh`, GoTrue `autoRefreshToken`.

**Findings**

- **Double-refresh** guard (`isFreshEnough`) reduces “refresh_token_not_found” fatals.

**Risks**

- **Concurrent users** hit **shared Auth rate limits** — appears as client “timeouts”.

---

## 9. Local storage persistence

**Touchpoints:** `paidly_sync_queue_v1`, `paidly_query_cache_v1`, `paidly-auth`, Dexie IDB layers in `src/lib/paidlyIdb*`.

**Findings**

- **Allowlists** for persisted query roots; **never persist** auth-like roots (`paidlyPersistedQueryRootKeys.js`).

**Risks**

- **Quota** errors silently ignored in some paths — UX “empty” state.
- **Org switch** must clear persisted domain caches on logout (policy; partial today via query restore rules).

---

## 10. React render performance

**Touchpoints:** Zustand `useAppStore`, many `useQuery` hooks, realtime-driven invalidations.

**Findings**

- Broad store subscriptions cause **rerender amplification** if selectors not narrow.
- Realtime → `invalidateQueries` → list rerenders — expected; must stay debounced.

**Recommendations**

- Selector audit (`useShallow` / split stores where hot).
- React **`useMemo`** for derived props in list rows.

---

## Appendix — New core modules (Phase 2+)

Foundational code lives under **`src/core/`** (see `docs/architecture-improvement-plan.md` for incremental adoption). These do **not** yet replace existing managers; they provide a **single authority** to integrate behind.

**Sync queue:** each queued mutation now carries **`meta.operationId`** (UUID when available) for dedupe, telemetry, and future server idempotency — see `src/lib/syncQueueActions.js`.

**Status table:** `docs/PHASE_COMPLETION_STATUS.md`.

---

*Generated as part of the runtime scalability initiative. Update this file when major runtime paths change.*
