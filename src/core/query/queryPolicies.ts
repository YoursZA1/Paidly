/**
 * Canonical TanStack Query key factories + cache policy hints.
 * Migrate hooks incrementally — avoid broad `['invoices']` roots for new code.
 */

/** Default stale tiers (ms) — align with `paidlyClientCachePolicy` over time */
export const STALE = {
  /** Hot lists — background refresh often */
  listVolatile: 30_000,
  /** Standard entity lists */
  list: 120_000,
  /** Rarely changing settings */
  settings: 15 * 60_000,
  /** Detail views — shorter stale window */
  detail: 60_000,
} as const;

export const GC = {
  /** Keep list data warm while navigating */
  list: 45 * 60_000,
  detail: 30 * 60_000,
} as const;

export const queryKeys = {
  invoiceList: (orgId: string, fingerprint: string | number = "default") =>
    ["invoice-list", orgId, fingerprint] as const,

  invoiceDetail: (invoiceId: string) => ["invoice", invoiceId] as const,

  client: (clientId: string) => ["client", clientId] as const,

  clientSummary: (clientId: string) => ["client-summary", clientId] as const,

  quoteList: (orgId: string) => ["quote-list", orgId] as const,

  cashflowPage: (orgId: string, rangeKey: string) => ["cashflow-page", orgId, rangeKey] as const,

  dashboardBootstrap: (orgId: string, year: number) => ["dashboard-bootstrap", orgId, year] as const,
} as const;

export type QueryDefaultOverrides = {
  staleTime?: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean | "always";
};

/** Suggested defaults for list queries (override per-hook as needed) */
export function listQueryDefaults(): QueryDefaultOverrides {
  return {
    staleTime: STALE.list,
    gcTime: GC.list,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  };
}

export function detailQueryDefaults(): QueryDefaultOverrides {
  return {
    staleTime: STALE.detail,
    gcTime: GC.detail,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  };
}
