import { subDays } from "date-fns";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { promiseWithTimeout } from "@/utils/fetchWithTimeout";
import { isPostgrestSelectOrSyntax400 } from "@/schemas/dashboardInvoiceSummary";
import { sanitizePostgrestSelect } from "@/lib/postgrestSelect";

const PAGE = 1000;
const LOOKBACK_DAYS = 180;
const TIMEOUT_MS = 20_000;

const INVOICE_SELECT =
  "id,status,total_amount,created_at,invoice_date,pos_sale_event_id";
const INVOICE_SELECT_MINIMAL = "id,status,total_amount,created_at";
const PAYMENT_SELECT = "id,invoice_id,amount,status,paid_at,created_at,method,reference,notes";
const POS_SELECT =
  "id,total_amount,occurred_at,status,sale_kind,refund_rail,payment_method,invoice_id,parent_event_id";
const POS_SELECT_MINIMAL =
  "id,total_amount,occurred_at,status,sale_kind,payment_method,invoice_id";
const QUOTE_SELECT = "id,status,total_amount,created_at,sent_date";

function sinceIso(now = new Date()) {
  return subDays(now, LOOKBACK_DAYS).toISOString();
}

async function selectSince(table, columns, dateColumn, since) {
  const safeSelect = sanitizePostgrestSelect(columns);
  return promiseWithTimeout(
    () =>
      supabase
        .from(table)
        .select(safeSelect)
        .gte(dateColumn, since)
        .order(dateColumn, { ascending: false })
        .limit(PAGE),
    TIMEOUT_MS
  );
}

async function selectWithFallback(table, primary, fallback, dateColumn, since) {
  let result = await selectSince(table, primary, dateColumn, since);
  if (result.error && isPostgrestSelectOrSyntax400(result.error) && fallback) {
    result = await selectSince(table, fallback, dateColumn, since);
  }
  if (result.error) {
    if (isPostgrestSelectOrSyntax400(result.error)) return [];
    throw result.error;
  }
  return Array.isArray(result.data) ? result.data : [];
}

export function mergeRowsById(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const row of Array.isArray(list) ? list : []) {
      if (!row?.id) continue;
      map.set(row.id, { ...map.get(row.id), ...row });
    }
  }
  return Array.from(map.values());
}

/**
 * One parallel batch for the dashboard Revenue widget (180-day window).
 * Period toggling (30/60/90) is client-side. RLS scopes rows to the company.
 */
export async function fetchDashboardRevenueSources(now = new Date()) {
  if (!isSupabaseConfigured) {
    return { invoices: [], payments: [], posSales: [], quotes: [] };
  }
  const since = sinceIso(now);
  const [invoices, payments, posSales, quotes] = await Promise.all([
    selectWithFallback("invoices", INVOICE_SELECT, INVOICE_SELECT_MINIMAL, "created_at", since),
    selectWithFallback("payments", PAYMENT_SELECT, null, "paid_at", since).catch(async () =>
      selectWithFallback("payments", PAYMENT_SELECT, null, "created_at", since)
    ),
    selectWithFallback("pos_sales_events", POS_SELECT, POS_SELECT_MINIMAL, "occurred_at", since).catch(
      () => []
    ),
    selectWithFallback("quotes", QUOTE_SELECT, "id,status,total_amount,created_at", "created_at", since),
  ]);
  return { invoices, payments, posSales, quotes };
}

export function dashboardRevenueSourcesQueryKey(userId) {
  return ["dashboard", "revenue-sources", userId ?? null];
}
