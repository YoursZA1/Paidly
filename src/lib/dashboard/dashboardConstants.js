/** Recent Invoices preview on the user dashboard; full list is on Invoices. */
export const RECENT_INVOICES_PREVIEW_ROWS = 3;

/** Transactions lists (mobile + desktop): ~3 rows visible, then scroll. */
export const TRANSACTION_PREVIEW_ROWS = 3;
export const TRANSACTIONS_SOURCE_EACH = 30;
export const TRANSACTIONS_MERGED_MAX = 60;

export const DASHBOARD_CACHE_KEY = (userId) => `paidly_dashboard_cache_${userId || "anon"}`;
