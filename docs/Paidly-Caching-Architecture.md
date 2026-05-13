# Paidly — Caching architecture (production grade)

This document describes how Paidly should cache and refresh data to feel **instant**, **stable**, **offline-tolerant**, and **cheap** on Supabase (Postgres + Realtime bandwidth). It aligns with the stack described in `Paidly-Application-Blueprint.md` (TanStack Query, Zustand, `EntityManager`, single Realtime channel).

---

## Goals

| Goal | Primary levers |
|------|----------------|
| Instant UI | **Stale-while-revalidate** (show cache first, refetch when stale), `placeholderData`, persisted hydration, prefetch |
| Stable | One orchestration path per concern; bounded retries; circuit breakers for optional APIs |
| Offline-friendly | TanStack Query + `localStorage` + **IndexedDB** snapshots (whitelisted roots), Zustand persist, EntityManager offline rules |
| Low DB strain | Wider `staleTime` where safe; narrow `select()`; pagination; avoid N+1 |
| Low Realtime churn | Single shared channel (`paidlyRealtimeManager`); debounced invalidation, not per-row refetch storms |
| Smooth tab / route switching | Shared `QueryClient`, **`refetchOnMount: true`** (refetch only when stale — cache still instant), `placeholderData` on key-changing lists |

---

## Layer 1 — Memory cache (fastest)

**Purpose:** dedupe in-flight work, instant back/forward and route changes, hold “good enough” data while revalidating.

### 1.1 TanStack Query (primary server-state cache)

- **Factory:** `src/lib/query-client.js` — `createAppQueryClient()` / `getOrCreateAppQueryClient()`.
- **Defaults today:** `staleTime: 5 * 60 * 1000` (5 minutes), `gcTime: 10 * 60 * 1000`, **`refetchOnMount: true`** (refetch in background when the query is **stale** — cached data still renders immediately), `refetchOnWindowFocus: true`, `retry: false` on queries.
- **Hydration:** successful queries whose root key is in `PAIDLY_PERSISTED_QUERY_ROOT_KEYS` are snapshotted to `localStorage` (`paidly_query_cache_v1`) and **IndexedDB** (`paidly_persistent_cache`) with a debounced writer — sync restore from `localStorage`, then async merge from IDB in `main.jsx` for cold boot.

**Conventions:**

- **Query keys** must be stable, hierarchical, and documented per feature (e.g. `['invoice', id]`, `['invoices', orgId, filtersHash]`).
- **Mutations** should call `queryClient.setQueryData` for optimistic or immediate UI, then `invalidateQueries` with the smallest key prefix that restores correctness.
- Prefer **`enabled`** + auth/org gates so half-ready mounts do not hit Supabase.

### 1.2 Zustand (client session + coarse aggregates)

Used for cross-route **UI and session-adjacent** state, not as a second source of truth for every row.

Examples in-repo:

- `src/stores/useAppStore.js` — global lists (invoices, clients, …), `fetchAll`, integrates with TanStack Query invalidation (`getOrCreateAppQueryClient()`).
- `src/stores/sessionHealthStore.js`, `src/stores/authSessionStore.js`, `src/stores/useSyncQueueStore.js`, `src/stores/useConnectionStore.js`, `src/lib/connection/connectionLifecycleStore.js` — connection, recovery, and sync **orchestration** (prefer one path over many ad-hoc reconnect loops).

**Conventions:**

- Selectors: `useAppStore((s) => s.invoices)` to avoid broad re-renders (already noted in `useAppStore` header).
- Persist only what is safe and bounded (`useAppStore` uses `persist` + JSON storage); avoid persisting large volatile blobs.

### 1.3 Custom entity cache (`EntityManager`)

- **Location:** `src/api/customClient.js` — in-memory + optional local persistence paths per entity.
- **Role:** sync-engine / guest / legacy paths; must respect **offline** rules in the blueprint (no silent “empty means no data” after failed network).

**Conventions:**

- Treat EntityManager cache as **authoritative only after** a successful sync boundary; pair with React Query for screens that should feel “Linear-like”.
- TTL-style freshness: mirror Query defaults (e.g. 5 minutes) at the **read** boundary where you merge EntityManager data into UI, or invalidate when SyncEngine applies a batch.

### 1.4 Feature-specific in-memory TTL caches

Examples:

- `src/services/AdminDataService.js` — `CACHE_DURATION = 5 * 60 * 1000` in-memory map for admin aggregates.
- `src/lib/exchangeRatesClientPolicy.js` — **12-hour** `localStorage` cache per base (`exchange_rates_ZAR`, …), stale-while-revalidate (return cache, refresh when older than TTL), in-flight dedupe, circuit breaker for missing routes, optional `VITE_DISABLE_EXCHANGE_RATES_SYNC`.

**Pattern:** `memoryCache.set(key, { data, expiresAt })` with explicit `get` that returns `null` when expired; **one writer** per domain.

---

## Layer 2 — Persistent cache (IndexedDB + small localStorage)

**Purposes:** survive refresh and tab close, larger quota than `localStorage`, offline-friendly **read models**, faster cold boot when the network is slow.

### 2.1 Library choice: **Dexie.js** (in use)

- **Package:** `dexie` — small schema versioning API on top of IndexedDB.
- **Alternative:** raw `idb` (Jake Archibald) or `idb-keyval` for key-value only; Dexie fits multiple logical buckets and future indexes.

**Database:** `paidly_persistent_cache` (v1) — see `src/lib/paidlyIdbKvCache.js`.

### 2.2 What is cached today (implementation)

| Domain | Mechanism | Notes |
|--------|-----------|--------|
| Invoices, clients, quotes, dashboard slices, cashflow page, admin settings | TanStack Query snapshots → **IndexedDB** + `localStorage` | Allowlist + prefixes: `shouldPersistReactQueryKey` in `paidlyPersistedQueryRootKeys.js` (exact set + `settings*`, `organization*`, `organizations*`, `currency*`; never `auth`, `session`, `token`, `sb-*`, …). Writer: `query-client.js` + `paidlyIdbQueryPersistence.js`. |
| Cold boot merge | `hydrateQueryClientFromIdb` **awaited** in `main.jsx` before `createRoot` | Merges by **newest `updatedAt`** so returning users see persisted lists immediately. |
| Legacy `paidly_query_cache_v1` | One-time migration into IDB | Flag `paidly_query_idb_migrated_v1` in `localStorage`. |

**Generic JSON blobs (reserved keys, for follow-up wiring):**

- Helpers `paidlyIdbPutJsonKey` / `paidlyIdbGetJsonKey` and prefixes in `PAIDLY_IDB_DOMAIN_PREFIX` (`domain:profile:`, `domain:settings:`, `domain:currency:`) for **user profile (non-auth fields)**, **settings**, **currency profile** snapshots — **do not** store Supabase session / JWT / refresh tokens here.

### 2.3 What must **never** go in this DB

| Do not store | Reason |
|--------------|--------|
| Access / refresh / ID tokens, `sb-*` auth payloads | Treat as secrets; keep Supabase client session handling unchanged. |
| Derived “sensitive financial” totals used for compliance | Recompute from source rows after auth; cache only **UI list/detail** shapes already exposed to the signed-in user via RLS. |
| Cross-user or admin-only bulk exports | Scope by user/org in app logic before any future IDB writes. |

### 2.4 Operational notes

- **Quota:** IndexedDB is still finite; debounced writes (same 1.2s debounce as query cache flush) reduce churn.
- **Privacy mode / blocked IDB:** writes fail silently; `localStorage` path remains for the same snapshots where available.
- **Tests:** `fake-indexeddb` + `tests/unit/paidlyIdbQueryPersistence.test.js`.

### 2.5 Prior table (still accurate)

| Mechanism | Location | Use |
|-----------|----------|-----|
| TanStack Query snapshots | `localStorage` `paidly_query_cache_v1` | Fast sync read on boot; migration source into IDB |
| TanStack Query snapshots | IndexedDB `paidly_persistent_cache` | Larger durable cache for whitelisted query roots |
| Zustand persist | `src/stores/useAppStore.js` | Coarse lists / prefs (separate from IDB layer) |
| Auth / policy flags | `sessionStorage` / `localStorage` | Circuits, skip flags — not the IDB app cache DB |

**Rules:** cap payload size where possible; handle `QuotaExceededError`; never persist secrets (see above).

---

## Layer 3 — HTTP and edge semantics

- Same-origin `/api/*` on Vercel where possible to avoid extra TLS and CORS caches.
- **Stale-while-revalidate** for server reads is specified in **Layer 5** below (TanStack Query + hydration).
- Optional APIs (exchange rates, admin-only routes): **circuit breakers** and **no retry storms** (see `installBackendApiResilience.js` carve-outs for `/api/exchange-rates`).

### 3.1 In-flight request deduplication

- **TanStack Query** already merges concurrent `queryFn` runs for the **same `queryKey`**.
- **Imperative / shared services:** `runDedupedAsync(key, fn)` in `src/lib/inflightRequestDedupe.js` — if `inflight.has(key)`, return the existing promise so three simultaneous `fetchInvoiceListPage(0, …)` calls share one `Invoice.list` round-trip.
- **Wired today:** `fetchInvoiceListPage`, `fetchInvoiceSideData` (`InvoiceListService.js`), combined `Invoice.list` + `Client.list` in `useInvoicesQuery.js`, and raw `fetchInvoices` in `useInvoicesSupabaseQuery.js`.

---

## Layer 4 — Supabase: Postgres + Realtime discipline

- **Reads:** minimal `select()` lists; indexes and RLS as defined in migrations (blueprint).
- **Realtime:** single app channel pattern in `src/lib/realtime/paidlyRealtimeManager.js` — fan-out to SyncEngine / subscribers; **debounce** per-table work (see `SyncEngine.jsx`).
- **Patch-first reconciliation:** on `postgres_changes` for **`invoices`**, use `src/lib/realtimeInvoiceReconciliation.js` + `useAppStore.upsertInvoiceFromRemote` / `removeInvoiceFromRemote`. For **`clients`**, use `src/lib/realtimeClientReconciliation.js` + `upsertClientFromRemote` / `removeClientFromRemote`. When reconciliation returns true, SyncEngine **skips** debounced global `fetchAll()`. Other tables still use targeted invalidation + debounced `fetchAll` when not patched.
- **Writes:** mutations invalidate the **narrowest** query keys; avoid global `fetchAll` except at defined lifecycle boundaries (login, org switch, wake recovery, admin burst fallback).

---

## Layer 5 — Stale While Revalidate (perceived speed)

**Goal:** the app feels instant: **no blocking empty state** while fresh data loads.

**Flow (TanStack Query is the engine):**

1. **Return cache immediately** — `queryClient` memory, optional `localStorage` / IndexedDB restore (`query-client.js`, `paidlyIdbQueryPersistence.js`), and `placeholderData` where the query key changes (e.g. filters) so the previous list stays on screen.
2. **Refetch when stale** — global `refetchOnMount: true` + `refetchOnWindowFocus: true` + `staleTime` define when a background `queryFn` runs **without** clearing `data` first.
3. **Silent UI update** — keep rendering `data`; avoid tying full-page spinners to `isFetching`. Prefer `isPending && !data` (or equivalent) for **first** load only; use a subtle indicator for `isFetching` if needed.

**Imperative pattern (non-Query code):** same idea as `cachedInvoicesImmediately(); void backgroundRefresh()` — read from store or `getQueryData`, then `fetchQuery` / `invalidateQueries` without awaiting before paint.

**UI checklist:** do not use `isLoading` alone when `data` exists; gate skeletons on `!data` (or `isPending && !data`).

---

## Layer 6 — Invalidation and orchestration (the “Stripe-like” part)

**Principle:** one table of **event → cache action** per domain.

| Event | Suggested actions |
|-------|---------------------|
| Invoice saved | `setQueryData(['invoice', id])` + `invalidateQueries({ queryKey: ['invoices'] })` (or prefix) |
| Org switched | `queryClient.clear()` or org-scoped prefix invalidation + `useAppStore` reset of org-bound lists |
| Realtime `invoices` row | `reconcileInvoiceRealtimeEvent` + store upsert/remove; skip `fetchAll` when successful |
| Realtime `clients` row | `reconcileClientRealtimeEvent` + `useAppStore.upsertClientFromRemote` / `removeClientFromRemote`; skip `fetchAll` when successful |
| Realtime other tables | Targeted `invalidateQueries` + debounced `fetchAll` (non-admin) until per-entity patch helpers exist |
Avoid: parallel **recovery**, **retry**, and **reconnect** systems that do not share state — consolidate in connection/session stores and the Realtime manager (see blueprint auth + Realtime notes).

---

## Route prefetch (main navigation)

**Goal:** warm TanStack Query for **Dashboard**, **Invoices**, and **Clients** before the user navigates so the first paint reuses cached list/summary data (pairs with Layer 5 SWR).

- **Implementation:** `src/lib/paidlyRoutePrefetch.js` — `schedulePrimaryNavPrefetch({ navId, userId, queryClient })` with a short per-nav throttle (~2.5s) to avoid duplicate work on repeated hovers.
- **Triggers:** `onPointerEnter` / `onFocus` on the matching sidebar `Link` items in `src/pages/Layout.jsx` (`nav-dashboard`, `nav-invoices`, `nav-clients`).

---

## Logo URL micro-cache (public storage URLs)

**Goal:** avoid repeating `getPublicUrl` resolution and stabilize the same resolved URL across navigations for the same stored path (not a substitute for CDN cache headers on the image itself).

- **Read/write:** `src/lib/logoUrlDiskCache.js` — `localStorage` keys `paidly_logo_url_v1:*` with JSON `{ url, savedAt }`. TTL is shorter (~45 min) when the URL looks signed (`token=` query), longer (~24h) for stable public URLs.
- **Integration:** `AssetService.getLogo` consults the disk cache before `supabase.storage.getPublicUrl`, and writes after a successful resolve. `Logo.jsx` / `LogoImage.jsx` call `clearLogoUrlDiskCacheForSrc` when the image fails or preflight rejects the URL, alongside `markStorageAssetFailed`, so a bad cached URL is not reused.

---

## Layer 8 — Exchange rate client cache

**Goal:** never hammer `/api/exchange-rates` on repeated mounts; keep conversions stable offline when a snapshot exists.

| Item | Detail |
|------|--------|
| **Storage key** | `exchange_rates_{BASE}` (e.g. `exchange_rates_ZAR`) with JSON `{ v, savedAt, data }` |
| **TTL** | `EXCHANGE_RATES_CACHE_TTL_MS` = **12 hours** since last successful write |
| **Fresh hit** | Return cached payload **without** calling the API |
| **Stale hit** | Return cached payload immediately; **one** deduped background `GET` updates `savedAt` + `data` |
| **Miss** | Await network; on failure fall back to legacy `paidly_exchange_rates_cache_v1` migration path if present |
| **Circuit / env** | Unchanged: terminal 404/405/501 opens session circuit; `VITE_DISABLE_EXCHANGE_RATES_SYNC` uses cache only |

**File:** `src/lib/exchangeRatesClientPolicy.js` — `fetchLatestExchangeRatesPayload`, `getExchangeRates`, `getExchangeRateForDocument`.

---

## Layer 9 — Dashboard query batching (`/api/dashboard/bootstrap`)

**Goal:** replace several independent list reads on cold load with **one** authenticated `GET` that returns a single JSON payload; the Node/Vercel handler runs **parallel** PostgREST queries using the caller’s JWT (anon client + `Authorization: Bearer …`, RLS unchanged).

**Response shape (contract):**

| Key | Contents |
|-----|----------|
| `user` | `profiles` row merged with auth id |
| `organization` | First `organizations` row for the user’s membership, or `null` |
| `dashboard` | `{ clients, quotes, payslips, expenses, payments, businessGoal }` — lists + optional goal row for `?year=` |
| `recentInvoices` | Invoice rows (same caps as store bootstrap: 50), `created_date` aliases applied |
| `stats` | `{ invoiceCount, clientCount, … }` — cheap counts for diagnostics / UI |

**Client wiring:** `useAppStore.fetchAll(user, { accessToken })` calls `fetchDashboardBootstrap` when `session.accessToken` is present; on success it hydrates Zustand + seeds `dashboardInvoices` / `dashboardPayslips` React Query keys. On failure it **falls back** to the legacy `Invoice.list` / `Client.list` / … parallel path.

**Files:** `server/src/dashboardBootstrapPayload.js`, `server/src/dashboardBootstrapHandler.js`, `api/dashboard/bootstrap.js`, `src/services/dashboardBootstrapService.js`, `src/stores/useAppStore.js`, `src/pages/Layout.jsx`.

**Env (Vercel / Node):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (JWT validation only), `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`) for user-scoped reads.

---

## Layer 10 — Realtime stability (Supabase multiplex channel)

**Goal:** prevent **WebSocket reconnect storms** while keeping recovery responsive after real failures.

| Mechanism | Behavior |
|-----------|----------|
| **Backoff steps** | Fixed ladder **1s → 2s → 5s → 10s → 30s** (repeat at 30s). Index advances on transport / subscribe failures; resets on successful `SUBSCRIBED` + `joined`. |
| **Single recovery timer** | `requestPaidlyRealtimeErrorRecovery` coalesces origins; only one pending reconnect delay at a time. |
| **Transport burst cooldown** | Short window after `OPEN` / `CLOSED` / `ERROR` suppresses redundant teardown. |
| **Heartbeat** | Periodic check; when unhealthy, schedules recovery via backoff (not immediate `schedulePaidlyRealtimeRebuild`). **Post-subscribe grace** avoids false positives during brief non-`joined` states right after subscribe. |
| **Visibility** | Debounced `visibilitychange` → `visible`: recovery via backoff; **minimum interval** between visibility-driven reconnects (cooldown). Heartbeat skips work when `document.hidden`. |
| **Observability** | Structured `reconnect_backoff_scheduled`, `reconnect_cooldown` (visibility throttle), and related `[PaidlyRealtime]` events. |

**Files:** `src/lib/realtime/paidlyRealtimeManager.js`, `src/lib/realtime/paidlyRealtimeStructuredLog.js`.

---

## Client cache TTL policy (cache-first navigation)

**Principle:** trust **Zustand persist + TanStack Query + Dexie** before issuing a full dashboard bootstrap; **Layout** skips `fetchAll` while `lastFetchedAt` is within `PAIDLY_STALE_MS.appStoreBootstrap`. Lists reconcile incrementally via realtime + targeted invalidation where possible.

| Slice | `staleTime` / skip window | Source |
|-------|---------------------------|--------|
| Dashboard document previews | 60s | `PAIDLY_STALE_MS.dashboard` — `useDashboardDocumentsQuery`, nav prefetch |
| Invoices (lists) | 5 minutes | `PAIDLY_STALE_MS.invoices` — `useInvoices`, `useInvoicesQuery`, default `useSupabaseQuery`, `query-client` default |
| Clients (lists) | 10 minutes | `PAIDLY_STALE_MS.clients` — `useClientsList`, nav prefetch |
| Currency rates | 12 hours | `EXCHANGE_RATES_CACHE_TTL_MS` in `exchangeRatesClientPolicy.js` |
| User profile (`auth.me` fallback) | 24 hours | `PAIDLY_STALE_MS.userProfile` — `useCurrentUser`; primary profile remains AuthContext |
| Zustand bootstrap skip | 10 minutes | `PAIDLY_STALE_MS.appStoreBootstrap` — `Layout.jsx` (`SHARED_STORE_STALE_MS`) |
| Dashboard bootstrap HTTP | In-flight dedupe | `runDedupedAsync` in `fetchDashboardBootstrap` (`dashboardBootstrapService.js`) — concurrent identical GETs share one request |

**Single module:** `src/lib/paidlyClientCachePolicy.js` (`PAIDLY_STALE_MS` + re-export of exchange-rate TTL).

---

## Data layer instrumentation (cache + dedupe + realtime patches)

**Module:** `src/lib/paidlyDataLayerInstrumentation.js` — `[PaidlyDataLayer]` logs.

| Event | When |
|-------|------|
| `cache_restore_ls` | After `localStorage` query snapshot merge on boot (`query-client.js`) |
| `cache_restore_idb` | After Dexie merge counts on boot (`paidlyIdbQueryPersistence.js`) |
| `inflight_dedupe_hit` | Second+ caller shared an in-flight promise (`inflightRequestDedupe.js`) |
| `realtime_patch_invoices` / `realtime_patch_clients` | Incremental realtime reconciliation applied (`realtime*Reconciliation.js`) |

Production: allowlisted events only, **5% sampled** (full rate in `import.meta.env.DEV`). Realtime transport uses `[PaidlyRealtime]` (`paidlyRealtimeStructuredLog.js`) including **`reconnect_started`**, **`reconnect_backoff_scheduled`**, **`reconnect_cooldown`**, suppressions, and circuit-breaker lines.

---

## Reference defaults (today)

| Setting | Value | File |
|---------|-------|------|
| Default `staleTime` | 5 minutes (invoice-aligned) | `src/lib/query-client.js` |
| Default `refetchOnMount` | `true` (SWR: refetch when stale; show cache first) | same |
| Default `gcTime` | 30 minutes | same |
| Default `placeholderData` | previous snapshot kept during refetch (SWR UX) | same |
| Persisted query roots | Exact set + `settings*`, `organization*`, `organizations*`, `currency*` (see `shouldPersistReactQueryKey`) | `src/lib/paidlyPersistedQueryRootKeys.js` |

Tune per query with `staleTime` / `gcTime` overrides where data is more or less volatile than the global default.

---

## Roadmap (incremental)

1. **IndexedDB (Layer 2) — shipped (phase 1):** Dexie DB + React Query whitelist persistence + `main.jsx` hydration merge. Next: wire `paidlyIdbPutJsonKey` for safe profile/settings/currency **subsets** from Auth / settings flows (no tokens).
2. **Realtime patch-first:** extend the same pattern to **quotes** and **payments** (narrow `setQueryData` + Zustand upserts). **Clients** use `realtimeClientReconciliation.js` (shipped).
3. **Inventory** all `useQuery` call sites without explicit `queryKey` discipline; align keys with `DashboardDataService` / document hooks.
4. **Document** invalidation per mutation (short table in each feature PR).
5. **Optional:** small `invoiceCache` helper (TTL + max entries) only where React Query is bypassed today — prefer migrating those reads to `useQuery` instead of duplicating cache layers.
6. **Metrics:** shipped baseline — `paidlyDataLayerInstrumentation.js` + `[PaidlyRealtime]` logs (sampled in prod). Extend per-route `cache_hit` / `cache_miss` when product needs finer funnels.

---

## Related docs

- `docs/Paidly-Application-Blueprint.md` — stack, data flow, EntityManager cautions, Realtime.
- Dashboard bootstrap (batched GET): `server/src/dashboardBootstrapHandler.js`, `src/services/dashboardBootstrapService.js`.
- IndexedDB: `src/lib/paidlyIdbKvCache.js`, `src/lib/paidlyIdbQueryPersistence.js`.
- Realtime reconciliation: `src/lib/realtimeInvoiceReconciliation.js`, `src/lib/realtimeClientReconciliation.js`, `src/components/sync/SyncEngine.jsx`.
- In-flight dedupe: `src/lib/inflightRequestDedupe.js`.
- Client TTL constants: `src/lib/paidlyClientCachePolicy.js`.
- Data layer instrumentation: `src/lib/paidlyDataLayerInstrumentation.js`.
