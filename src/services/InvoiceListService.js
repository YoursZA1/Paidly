import { Invoice, InvoiceView, Payment } from "@/api/entities";
import { supabase } from "@/lib/supabaseClient";
import { withTimeoutRetry } from "@/utils/fetchWithTimeout";

/** Page size for infinite invoice lists (hooks + UI consume via service). */
export const INVOICE_LIST_PAGE_SIZE = 40;

const LIST_OPTS = { maxWaitMs: 60000 };
const PER_PAGE_TIMEOUT_MS = 120000;
const PER_PAGE_RETRIES = 1;
const SIDE_DATA_LIMIT = 100;
const SIDE_DATA_REFRESH_TIMEOUT_MS = 12000;
const SIDE_DATA_MOUNT_TIMEOUT_MS = 4000;

export function normalizeInvoiceListFilters(filters) {
  const input = filters && typeof filters === "object" ? filters : {};
  const sortedKeys = Object.keys(input).sort();
  const normalized = {};
  for (const key of sortedKeys) {
    const value = input[key];
    if (value === undefined) continue;
    normalized[key] = value;
  }
  return normalized;
}

export function getInvoiceListQueryKey(filters, userId) {
  return ["invoices", "list", normalizeInvoiceListFilters(filters), userId ?? null];
}

/**
 * Paginated invoice list reads. Hooks call this — not `Invoice.list` directly —
 * so retries, timeouts, and future logging/metrics stay in one place before EntityManager/Supabase.
 *
 * @param {number} offset
 * @param {Record<string, unknown>} filters
 * @param {string | null} userId
 */
export async function fetchInvoiceListPage(offset, filters = {}, userId = null) {
  void filters;
  void userId;
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

export async function fetchInvoiceSideData({ onMount = false } = {}) {
  const maxWaitMs = onMount ? SIDE_DATA_MOUNT_TIMEOUT_MS : SIDE_DATA_REFRESH_TIMEOUT_MS;
  const [paymentsData, viewsData] = await Promise.all([
    Payment.list("-created_date", { limit: SIDE_DATA_LIMIT, maxWaitMs }).catch(() => []),
    InvoiceView.list("-created_date", { limit: SIDE_DATA_LIMIT, maxWaitMs }).catch(() => []),
  ]);
  return {
    payments: Array.isArray(paymentsData) ? paymentsData : [],
    invoiceViews: Array.isArray(viewsData) ? viewsData : [],
  };
}

export async function fetchInvoiceItemsByInvoiceIds(invoiceIds) {
  if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("invoice_items")
    .select("id, invoice_id, service_name, description, quantity, unit_price, total_price")
    .in("invoice_id", invoiceIds);
  if (error) throw error;

  const itemsByInvoiceId = new Map();
  for (const row of data ?? []) {
    if (!itemsByInvoiceId.has(row.invoice_id)) itemsByInvoiceId.set(row.invoice_id, []);
    itemsByInvoiceId.get(row.invoice_id).push({
      service_name: row.service_name,
      description: row.description || "",
      quantity: Number(row.quantity ?? 1),
      unit_price: Number(row.unit_price ?? 0),
      total_price: Number(row.total_price ?? 0),
    });
  }
  return itemsByInvoiceId;
}
