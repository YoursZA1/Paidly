/**
 * Canonical client-side staleness targets (TanStack Query + Zustand + Dexie hydration).
 * Exchange rates use a dedicated 12h throttle in `exchangeRatesClientPolicy.js`.
 */

export { EXCHANGE_RATES_CACHE_TTL_MS } from "@/lib/exchangeRatesClientPolicy";

/** Milliseconds — align hooks + Layout bootstrap skip with product TTL table. */
export const PAIDLY_STALE_MS = Object.freeze({
  /** Dashboard aggregates / preview document lists (TanStack keys seeded from bootstrap). */
  dashboard: 60_000,
  /** Full invoice lists (infinite query, legacy combined list hook). */
  invoices: 5 * 60_000,
  /** Client directory lists. */
  clients: 10 * 60_000,
  /**
   * Layout `fetchAll` / dashboard bootstrap skip window when Zustand + persist already have rows.
   * Matches the slowest list slice we bundle in one bootstrap so we do not treat every visit as cold load.
   */
  appStoreBootstrap: 10 * 60_000,
  /** Rare `auth.me` fallback when AuthContext has no user yet — not the primary profile path. */
  userProfile: 24 * 60 * 60_000,
});
