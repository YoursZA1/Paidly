/**
 * Opt-in focus refetch policy for TanStack Query.
 *
 * The global default is refetchOnWindowFocus: false (see query-client.js).
 * Components that genuinely need live data on tab focus import helpers from
 * here instead of setting refetchOnWindowFocus: true inline.
 *
 * Tiers:
 *   LIVE — refetch on every focus (notifications, cashflow, active invoice status)
 *   NONE — never refetch on focus (settings, static lists) — the default
 *
 * NOTE: TanStack Query v5 does not distinguish "refetch only when past staleTime"
 * from "always refetch" for window focus events. Both map to refetchOnWindowFocus: true.
 * Use staleTime on the query itself to control background freshness; focus refetch is
 * an all-or-nothing flag.
 */

export const FocusRefetch = {
  /** Always refetch when the tab regains focus. */
  LIVE: { refetchOnWindowFocus: true } as const,

  /** Never refetch on focus. Default for all queries — opt in via LIVE if needed. */
  NONE: { refetchOnWindowFocus: false } as const,
} as const;

export type FocusRefetchPolicy = (typeof FocusRefetch)[keyof typeof FocusRefetch];

/**
 * Query root keys eligible for live focus refresh.
 * Add here instead of setting refetchOnWindowFocus: true inline in components.
 */
export const FOCUS_LIVE_QUERY_ROOTS = new Set([
  "notifications",
  "admin-messages",
  "cashflow-page",
]);

/**
 * Returns the appropriate focus policy for a given query root key.
 * Usage: spread into useQuery options.
 *
 * @example
 * useQuery({ queryKey: ["notifications", userId], ...getFocusPolicy("notifications") })
 */
export function getFocusPolicy(rootKey: string): FocusRefetchPolicy {
  if (FOCUS_LIVE_QUERY_ROOTS.has(rootKey)) return FocusRefetch.LIVE;
  return FocusRefetch.NONE;
}
