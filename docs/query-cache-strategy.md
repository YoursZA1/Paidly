# Paidly — TanStack Query Cache Strategy

> Updated: 2026-05-18

---

## Architecture

| Layer | File | Purpose |
|-------|------|---------|
| QueryClient factory | `src/lib/query-client.js` | Single instance, global defaults, LS+IDB restore |
| Stale tiers | `src/lib/paidlyClientCachePolicy.js` | Domain-specific `staleTime` values |
| Key factories | `src/core/query/queryPolicies.ts` | Fine-grained keys, default overrides per query type |
| Invalidation helpers | `src/lib/queryInvalidation.js` | Scoped invalidation by domain |
| Persistence | `src/lib/paidlyIdbQueryPersistence.js` | IDB (primary) + localStorage (fast init) |
| Root allowlist | `src/lib/paidlyPersistedQueryRootKeys.js` | Blocklists auth-adjacent keys |
| Logout purge | `src/core/query/persistedQueryClient.ts` | Clears in-memory + IDB + LS on logout |

---

## Global Defaults (`createAppQueryClient`)

| Setting | Value | Reason |
|---------|-------|--------|
| `staleTime` | `PAIDLY_STALE_MS.invoices` (5m) | Invoices are the primary entity; most others override |
| `gcTime` | `max(clients×3, 30m)` | Keep warm while navigating between main screens |
| `retry` | `false` | No silent retry on auth/RLS errors |
| `refetchOnWindowFocus` | `true` | Global default; **most list hooks override to `false`** via `listQueryDefaults()` |
| `refetchOnMount` | `true` | Refetch when a component mounts with stale data |
| `placeholderData` | `(prev) => prev` | SWR — keep last snapshot visible while refetch runs |

---

## Key Shape (canonical)

```ts
// from src/core/query/queryPolicies.ts
["invoice-list", orgId, fingerprint?]   // paginated / filtered list
["invoice", invoiceId]                   // single invoice detail
["client", clientId]                     // single client
["client-summary", clientId]             // lightweight summary
["quote-list", orgId]
["cashflow-page", orgId, rangeKey]
["dashboard-bootstrap", orgId, year]
```

**Anti-patterns to avoid:**
- `["invoices"]` — broad root, hits every invoice variant on invalidation
- `["clients"]` — same problem
- Hardcoded strings without scoping by org/user — leaks between org switches

---

## Stale Time Tiers

| Domain | `staleTime` | Notes |
|--------|-------------|-------|
| Dashboard aggregates | 60s | Changes on every transaction |
| Invoices (list) | 5m | Realtime handles incremental updates |
| Clients | 10m | Rarely change; realtime patches on update |
| Settings / org | 15m | Almost never change |
| User profile | 24h | Fetched on session restore only |
| App store bootstrap | 10m | Zustand + persist already hydrated |

---

## Persistence Policy

**What is persisted:** Keys whose root segment matches `PAIDLY_PERSISTED_QUERY_ROOT_KEYS` or `PERSISTED_ROOT_PREFIXES`.

**What is never persisted:** `auth`, `session`, `token`, `jwt`, `sb-*`, `supabase.auth*`.

**Write path:** Every cache update → debounced 1.2s → localStorage snapshot + IDB write (via `saveReactQuerySnapshotsToIdb`).

**Read path on startup:**
1. `restorePersistedQueryCache()` — synchronous LS read → seedsQueryClient
2. `hydrateQueryClientFromIdb()` — async IDB read → merges by `updatedAt` (newer wins)

**On logout:** `purgeQueryClientAfterLogout(client)`:
1. `client.clear()` — wipes in-memory cache
2. `clearPersistedQueryCache()` — removes `paidly_query_cache_v1` from LS + IDB prefix `rq:`

---

## Invalidation Strategy

**Prefer scoped invalidation** (`queryInvalidation.js`):

```js
// ✅ Correct: scoped to user/org + specific invoice
invalidateInvoiceDomain(queryClient, { scopeKey: user.id, invoiceId: "inv_123" });

// ✅ Correct: scoped to org
invalidateClientDomain(queryClient, { scopeKey: user.id });

// ❌ Avoid: broad root (legacy — still present for hook migration)
queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
```

**Realtime update path** (from `SyncEngine`):
- Try `reconcileInvoiceRealtimeEvent()` / `reconcileClientRealtimeEvent()` for surgical cache patches first.
- Fall back to `invalidateInvoiceDomain` only if the reconciler returns `false`.

---

## Hook Best Practices

```js
// Use listQueryDefaults() for any list query
const defaults = listQueryDefaults();
return useQuery({
  queryKey: queryKeys.invoiceList(user.id, "with-clients"),
  queryFn: ...,
  staleTime: PAIDLY_STALE_MS.invoices,
  ...defaults,  // refetchOnWindowFocus: false, refetchOnMount: true
  enabled: Boolean(user?.id),
});
```

Do not use `retry: 1` in `useSupabaseQuery` or any other hook — the global `retry: false` is intentional to prevent silent re-fetches on auth and RLS errors (fixed 2026-05-18).

---

## Known TODOs

- [ ] Migrate hooks still using `["invoices"]` bare root to `queryKeys.invoiceList(scopeKey)`
- [ ] Remove legacy broad root from `invalidateInvoiceDomain` after migration
- [ ] Debounce `useAppStore` persist write (currently synchronous LS write per Zustand update)
