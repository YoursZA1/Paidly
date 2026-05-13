# Query cache strategy (TanStack Query)

## Current stack (as shipped)

- **Factory:** `src/lib/query-client.js` → `createAppQueryClient()`
- **Defaults:** `staleTime` / `gcTime` from `src/lib/paidlyClientCachePolicy.js` (`PAIDLY_STALE_MS`)
- **Persistence:** `localStorage` snapshot + IndexedDB writes via `paidlyIdbQueryPersistence.js`
- **Allowlist:** `src/lib/paidlyPersistedQueryRootKeys.js` — **never** persist auth-like roots

## Problems addressed by `src/core/query/queryPolicies.ts`

| Bad pattern | Why it hurts | Good pattern |
|-------------|--------------|--------------|
| `['invoices']` + `exact: false` invalidation | Refetches **all** invoice queries | `invoiceList(orgId)` invalidate; detail only by `id` |
| Long `staleTime` everywhere | Stale money views | Domain-specific stale tiers |
| Short `gcTime` on heavy lists | Thrash / re-download | Longer `gcTime`, shorter `staleTime` where SWR is OK |
| `refetchOnWindowFocus: true` globally | Mobile tab flapping | Per-query override: `false` for stable settings |

## Recommended key shape

```txt
['invoice-list', orgId, filtersHash?]
['invoice', invoiceId]
['client', clientId]
['client-summary', clientId]
['cashflow-page', orgId, rangeKey]
```

## Background refresh policy

- **Lists:** `staleTime` 30s–5m depending on volatility; **`placeholderData`** keep last snapshot (already in `query-client`).
- **Detail:** refetch on arg change only; avoid global list invalidation when patching single row if optimistic update applied.

## Logout / org change

- Call **`bustQueryCacheForOrgChange(queryClient)`** (from `queryPolicies.ts`) after sign-out or org switch — clears in-memory cache; persistence layer must **not** restore disallowed roots (already guarded).

## Optional future: `@tanstack/react-query-persist-client`

Not added as a dependency yet. When adopted:

- Use **`createSyncStoragePersister`** or IDB persister with **bserialize** guards
- **Do not persist** queries containing tokens
- Bump **`PAIDLY_QUERY_PERSISTENCE_VERSION`** in `persistedQueryClient.ts` when schema changes
