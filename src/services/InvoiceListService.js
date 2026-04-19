import { Invoice } from "@/api/entities";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";

/** Page size for infinite invoice lists (hooks + UI consume via service). */
export const INVOICE_LIST_PAGE_SIZE = 40;

const LIST_OPTS = { maxWaitMs: 60000 };
const PER_PAGE_TIMEOUT_MS = 120000;
const PER_PAGE_RETRIES = 1;

/**
 * Paginated invoice list reads. Hooks call this — not `Invoice.list` directly —
 * so retries, timeouts, and future logging/metrics stay in one place before EntityManager/Supabase.
 *
 * @param {number} offset
 */
export async function fetchInvoiceListPage(offset) {
  const rows = await withTimeoutRetry(
    () =>
      Invoice.list("-created_date", {
        ...LIST_OPTS,
        limit: INVOICE_LIST_PAGE_SIZE,
        offset,
      }),
    PER_PAGE_TIMEOUT_MS,
    PER_PAGE_RETRIES
  );
  return Array.isArray(rows) ? rows : [];
}
