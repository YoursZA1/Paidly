import { startOfYear, subYears } from "date-fns";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { promiseWithTimeout } from "@/utils/fetchWithTimeout";
import { isPostgrestSelectOrSyntax400 } from "@/schemas/dashboardInvoiceSummary";
import { sanitizePostgrestSelect } from "@/lib/postgrestSelect";
import { resolveSessionActiveOrgId } from "@/api/auth/sessionActiveOrg.js";

const PAGE = 1000;
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
  return startOfYear(subYears(now, 1)).toISOString();
}

async function selectSince(table, columns, dateColumn, since, orgId) {
  const safeSelect = sanitizePostgrestSelect(columns);
  return promiseWithTimeout(
    () =>
      supabase
        .from(table)
        .select(safeSelect)
        .eq("org_id", orgId)
        .gte(dateColumn, since)
        .order(dateColumn, { ascending: false })
        .limit(PAGE),
    TIMEOUT_MS
  );
}

async function selectWithFallback(table, primary, fallback, dateColumn, since, orgId) {
  let result = await selectSince(table, primary, dateColumn, since, orgId);
  if (result.error && isPostgrestSelectOrSyntax400(result.error) && fallback) {
    result = await selectSince(table, fallback, dateColumn, since, orgId);
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
 * One parallel batch for dashboard realized revenue (hero + 30/60/90 widget).
 * Window starts at 1 Jan of the previous calendar year so This Year can compare
 * against last-year-to-date. Period toggling is client-side. RLS decides what the user may read; the
 * explicit org filter keeps the dashboard to the active business (a user who owns one business and
 * works at another must never see the two merged).
 */
export async function fetchDashboardRevenueSources(now = new Date()) {
  const empty = { invoices: [], payments: [], posSales: [], quotes: [] };
  if (!isSupabaseConfigured) return empty;
  const orgId = await resolveSessionActiveOrgId();
  if (!orgId) return empty;
  const since = sinceIso(now);
  const [invoices, payments, posSales, quotes] = await Promise.all([
    selectWithFallback("invoices", INVOICE_SELECT, INVOICE_SELECT_MINIMAL, "created_at", since, orgId),
    selectWithFallback("payments", PAYMENT_SELECT, null, "paid_at", since, orgId).catch(async () =>
      selectWithFallback("payments", PAYMENT_SELECT, null, "created_at", since, orgId)
    ),
    selectWithFallback("pos_sales_events", POS_SELECT, POS_SELECT_MINIMAL, "occurred_at", since, orgId).catch(
      () => []
    ),
    selectWithFallback("quotes", QUOTE_SELECT, "id,status,total_amount,created_at", "created_at", since, orgId),
  ]);
  return { invoices, payments, posSales, quotes };
}

export function dashboardRevenueSourcesQueryKey(userId) {
  return ["dashboard", "revenue-sources", userId ?? null];
}
