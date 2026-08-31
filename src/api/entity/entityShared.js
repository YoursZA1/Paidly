/**
 * Shared constants and helpers for EntityManager (Supabase CRUD).
 */
import { supabase } from "@/lib/supabaseClient";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";

const entityListTimeoutWarnState = new Map();

export function isBrowserOnline() {
  if (typeof navigator === "undefined") return true;
  try {
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

export function assertSessionAuthorityAllowsMutations() {
  if (!isRecoveryCircuitOpen()) return;
  const error = new Error("Session requires reauthentication before mutating data");
  error.code = "AUTH_REAUTH_REQUIRED";
  throw error;
}

export function shouldLogEntityTimeoutWarning(entityName, maxWaitMs) {
  const key = `${String(entityName || "")}:${Number(maxWaitMs || 0)}`;
  const now = Date.now();
  const last = entityListTimeoutWarnState.get(key) || 0;
  // Avoid console storms when many views hit the same bounded list() concurrently.
  const WARN_COOLDOWN_MS = 60_000;
  if (now - last < WARN_COOLDOWN_MS) return false;
  entityListTimeoutWarnState.set(key, now);
  return true;
}


/** Explicit select columns per table for better query performance (avoid .select("*")). */
export const SUPABASE_SELECT_COLUMNS = {
  invoices: "id, org_id, client_id, company_id, invoice_number, status, project_title, project_description, invoice_date, delivery_date, delivery_address, subtotal, tax_rate, tax_amount, total_amount, currency, notes, terms_conditions, created_by, user_id, created_at, updated_at, banking_detail_id, upfront_payment, milestone_payment, final_payment, milestone_date, final_date, pdf_url, recurring_invoice_id, public_share_token, sent_to_email, owner_company_name, owner_company_address, owner_logo_url, owner_email, owner_currency, document_brand_primary, document_brand_secondary, pos_sale_event_id",
  companies: "id, org_id, name, logo_url, created_at, updated_at",
  quotes: "id, org_id, client_id, quote_number, status, project_title, project_description, valid_until, subtotal, tax_rate, tax_amount, total_amount, currency, notes, terms_conditions, created_by, user_id, created_at, updated_at, banking_detail_id, document_brand_primary, document_brand_secondary, public_share_token, owner_company_name, owner_company_address, owner_logo_url, owner_email, owner_currency, sent_date",
  invoice_items: "id, invoice_id, service_name, description, quantity, unit_price, total_price",
  quote_items: "id, quote_id, service_name, description, quantity, unit_price, total_price",
  clients:
    "id, org_id, name, email, phone, address, contact_person, website, tax_id, notes, " +
    "payment_terms, payment_terms_days, follow_up_enabled, segment, total_spent, last_invoice_date, " +
    "created_at, updated_at",
  // Keep in sync with ServiceForm — previously omitted columns meant list/get rows were incomplete for the editor.
  services:
    "id, org_id, name, description, item_type, default_unit, default_rate, tax_category, is_active, " +
    "rate, unit, unit_price, unit_of_measure, service_type, sku, price, billing_unit, " +
    "stock_quantity, cost_price, low_stock_threshold, barcode, image_url, stock_capacity, " +
    "role, hourly_rate, unit_type, cost_rate, cost_type, default_cost, " +
    "category, pricing_type, min_quantity, tags, estimated_duration, requirements, price_locked, " +
    "company_id, created_at, updated_at",
  payments: "id, org_id, invoice_id, document_id, client_id, amount, currency, exchange_rate, status, paid_at, method, reference, notes, created_at, updated_at",
  profiles:
    "id, full_name, email, avatar_url, logo_url, company_name, company_address, phone, company_website, subscription_plan, plan, subscription_status, trial_ends_at, currency, timezone, role, user_role, invoice_template, invoice_header, document_brand_primary, document_brand_secondary, business, list_filter_prefs, reminder_settings, quote_reminder_settings, created_at, updated_at",
  banking_details: "id, org_id, bank_name, account_name, account_number, routing_number, swift_code, payment_method, additional_info, is_default, created_at, updated_at",
  recurring_invoices: "id, org_id, profile_name, client_id, invoice_template, frequency, start_date, end_date, next_generation_date, status, last_generated_invoice_id, created_at, updated_at",
  packages: "id, org_id, name, price, currency, frequency, features, is_recommended, website_link, created_at, updated_at",
  invoice_views: "id, org_id, invoice_id, client_id, viewed_at, ip_address, user_agent, is_read, created_at, updated_at",
  document_sends: "id, org_id, document_type, document_id, client_id, channel, sent_at, created_at",
  message_logs: "id, org_id, document_type, document_id, client_id, channel, recipient, sent_at, opened_at, viewed, paid, payment_date, tracking_token, clicked_at, created_at",
  payslips: "id, org_id, user_id, created_by_id, payslip_number, employee_name, employee_id, employee_email, position, department, pay_period_start, pay_period_end, pay_date, basic_salary, overtime_hours, overtime_rate, allowances, gross_pay, tax_deduction, uif_deduction, pension_deduction, medical_aid_deduction, other_deductions, total_deductions, net_pay, status, public_share_token, sent_to_email, created_at, updated_at",
  expenses: "id, org_id, expense_number, category, description, amount, date, payment_method, vendor, vat, receipt_url, notes, created_at, updated_at",
  tasks: "id, org_id, title, description, client_id, assigned_to, due_date, priority, status, category, created_at, updated_at",
  notes: "id, user_id, title, content, category, is_pinned, created_at, updated_at",
  suppliers: "id, org_id, name, email, phone, address, tax_number, payment_terms, lead_time_days, notes, created_by, created_at, updated_at",
  purchase_orders: "id, org_id, supplier_id, po_number, status, expected_date, notes, created_by, created_at, updated_at, received_at",
  purchase_order_items: "id, purchase_order_id, org_id, product_id, quantity_ordered, quantity_received, unit_cost, created_at, updated_at",
};
export function getSelectColumns(table) {
  return SUPABASE_SELECT_COLUMNS[table] || "id, created_at, updated_at";
}

/** PostgREST 400 / unknown column when explicit `SUPABASE_SELECT_COLUMNS` is ahead of a fork DB. */
export function isPostgrestSelectSchemaDriftError(error) {
  if (!error) return false;
  const status = Number(error.status ?? error.statusCode ?? NaN);
  if (status === 400) return true;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "PGRST204") return true;
  const m = String(error.message ?? error.details ?? error.hint ?? "").toLowerCase();
  return /column|does not exist|schema cache|could not find|unknown column|pgrst/i.test(m);
}


/** Default limit for list queries on large tables to avoid loading thousands of rows at once. */
export const DEFAULT_LIST_LIMIT = 100;

/** Map app sort field names to Supabase column names for .order() */
export const SORT_FIELD_TO_COLUMN = {
  created_date: "created_at",
  updated_date: "updated_at",
  delivery_date: "delivery_date",
  valid_until: "valid_until",
  paid_at: "paid_at",
  payment_date: "paid_at",
  date: "date",
};
export function getOrderColumn(sortBy) {
  const field = (sortBy || "").replace(/^-/, "");
  return SORT_FIELD_TO_COLUMN[field] || field || "created_at";
}
/** sortBy "-created_date" => descending, so ascending = false */
export function getOrderAscending(sortBy) {
  return !(sortBy || "").startsWith("-");
}

/** Multi-brand: attach invoice.company from companies table when invoice.company_id is set. */
export async function attachInvoiceCompany(record) {
  if (!record || !record.company_id || record.company) return;
  try {
    let query = supabase
      .from("companies")
      .select("id, name, logo_url")
      .eq("id", record.company_id);
    if (record.org_id) query = query.eq("org_id", record.org_id);
    const { data } = await query.maybeSingle();
    if (data) record.company = { id: data.id, name: data.name, logo_url: data.logo_url };
  } catch {
    /* ignore */
  }
}


/**
 * Entity class name (e.g. "Invoice") → Supabase table when rows are loaded via pullFromSupabase.
 * Used to skip localStorage mirrors for signed-in users: Supabase (+ in-memory EntityManager cache) is authoritative.
 *
 * Commercial documents never map to `documents`. Hub documents are accessed via DocumentService,
 * not EntityManager.
 *
 *   Invoice → invoices
 *   Quote → quotes
 *   Payslip / Payroll → payslips
 *   RecurringInvoice → recurring_invoices
 */
export function getSupabaseTableForEntityName(entityName) {
  const table = String(entityName || "").toLowerCase() + "s";
  if (table === "services") return "services";
  if (table === "clients") return "clients";
  if (table === "invoices") return "invoices";
  if (table === "quotes") return "quotes";
  if (table === "payments") return "payments";
  if (table === "bankingdetails") return "banking_details";
  if (table === "recurringinvoices") return "recurring_invoices";
  if (table === "packages") return "packages";
  if (table === "invoiceviews") return "invoice_views";
  if (table === "payrolls") return "payslips";
  if (table === "payslips") return "payslips";
  if (table === "expenses") return "expenses";
  if (table === "tasks") return "tasks";
  if (table === "notes") return "notes";
  if (table === "documentsends") return "document_sends";
  if (table === "messagelogs") return "message_logs";
  if (table === "suppliers") return "suppliers";
  if (table === "purchaseorders") return "purchase_orders";
  if (table === "purchaseorderitems") return "purchase_order_items";
  return null;
}
