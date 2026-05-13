import { z } from "zod";

/**
 * Columns that exist on `public.invoices` for PostgREST `select=`.
 * `created_date` is an app-layer alias of `created_at` — it must never appear in the REST select list
 * (PostgREST returns 400 for unknown columns).
 *
 * @see supabase/schema.postgres.sql (invoices)
 * @see supabase/migrations/20250318000000_multibrand_companies.sql (company_id)
 * @see supabase/migrations/20260324210000_document_brand_on_invoices_quotes.sql
 */
export const DASHBOARD_INVOICES_SUMMARY_POSTGREST_COLUMNS = Object.freeze([
  "id",
  "client_id",
  "invoice_number",
  "status",
  "total_amount",
  "currency",
  "created_at",
  "delivery_date",
  "user_id",
  "created_by",
]);

/** Comma-separated list for `.select(...)` — safe for PostgREST. */
export const DASHBOARD_INVOICES_SUMMARY_SELECT = DASHBOARD_INVOICES_SUMMARY_POSTGREST_COLUMNS.join(",");

/**
 * Minimal projection if a fork DB is missing optional columns (e.g. delivery_date).
 * Still excludes fictional columns like `created_date`.
 */
export const DASHBOARD_INVOICES_SUMMARY_SELECT_MINIMAL = [
  "id",
  "client_id",
  "invoice_number",
  "status",
  "total_amount",
  "currency",
  "created_at",
  "user_id",
  "created_by",
].join(",");

const uuidLike = z.union([z.string().uuid(), z.string(), z.null()]).optional();

/** Validated row shape after PostgREST (before `created_date` alias). */
export const dashboardInvoiceSummaryRowSchema = z
  .object({
    id: z.string().uuid(),
    client_id: uuidLike,
    invoice_number: z.union([z.string(), z.number()]).nullable().optional(),
    status: z.string().optional(),
    total_amount: z.union([z.number(), z.string()]).nullable().optional(),
    currency: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    delivery_date: z.union([z.string(), z.null()]).optional(),
    user_id: uuidLike,
    created_by: uuidLike,
  })
  .passthrough();

/**
 * PostgREST / HTTP errors where retrying the same projection is pointless (bad select, unknown column).
 * Not used for RLS (typically 401/403) or JWT.
 * @param {unknown} error
 */
export function isPostgrestSelectOrSyntax400(error) {
  if (!error || typeof error !== "object") return false;
  const status = Number(error.status ?? error.statusCode ?? NaN);
  if (Number.isFinite(status) && status === 400) return true;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "PGRST204") return true;
  const m = String(error.message ?? error.details ?? error.hint ?? "").toLowerCase();
  return /column|does not exist|unknown column|could not find|schema cache|malformed|syntax|pgrst/i.test(m);
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
export function mapDashboardInvoiceSummaryRow(row) {
  const parsed = dashboardInvoiceSummaryRowSchema.safeParse(row);
  const base = parsed.success ? parsed.data : row;
  const createdAt = base.created_at ?? null;
  return {
    ...base,
    created_date: createdAt ?? base.created_date ?? null,
  };
}
