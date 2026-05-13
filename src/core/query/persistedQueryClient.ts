import type { QueryClient } from "@tanstack/react-query";

/**
 * Version bump when persisted query **shape** or allowlist semantics change.
 * The app currently persists via `src/lib/query-client.js` + `paidlyIdbQueryPersistence.js`
 * (not `@tanstack/react-query-persist-client`). Keep keys aligned with `queryPolicies.ts`.
 */
export const PAIDLY_QUERY_PERSISTENCE_VERSION = 1 as const;

/**
 * Remove queries that include `orgId` in the key (convention: second tuple element is org).
 * Safe incremental step before full key migration.
 */
export function bustOrgScopedQueries(client: QueryClient, orgId: string): void {
  client.removeQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.includes(orgId),
  });
}

/**
 * After logout: clear client cache. Call **after** auth storage cleared so no token-bearing
 * data is rehydrated from in-memory structures.
 */
export function bustAllQueriesAfterLogout(client: QueryClient): void {
  client.clear();
}
