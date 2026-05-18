/**
 * Opt-in focus refetch policy for TanStack Query.
 *
 * The global default is refetchOnWindowFocus: false (see query-client.js).
 * Components that genuinely need live data on tab focus import helpers from
 * here instead of setting refetchOnWindowFocus: true inline.
 *
 * Tiers:
 *   LIVE  — refetch on every focus (notifications, active invoice status)
 *   EAGER — refetch on focus if data is older than staleTime (dashboards)
 *   NONE  — never refetch on focus (settings, static lists)
 */

export const FocusRefetch = {
  /** Always refetch when the tab regains focus. For live notification feeds. */
  LIVE: { refetchOnWindowFocus: true } as const,

  /**
   * Refetch on focus only when data is past staleTime.
   * Equivalent to the TanStack default — use for volatile aggregates.
   */
  EAGER: { refetchOnWindowFocus: true } as const,

  /** Never refetch on focus. Default for all queries — opt in above if needed. */
  NONE: { refetchOnWindowFocus: false } as const,
} as const;

export type FocusRefetchPolicy = (typeof FocusRefetch)[keyof typeof FocusRefetch];

/**
 * Tables / query families that are eligible for live focus refresh.
 * All others default to NONE.
 */
export const FOCUS_LIVE_QUERY_ROOTS = new Set([
  "notifications",
  "admin-messages",
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
