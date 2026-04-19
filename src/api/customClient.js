/**
 * Custom API Client - BreakInvoice Backend
 * Provides a flexible API for managing business entities and integrations
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage, alertSupabaseWriteFailure } from "@/utils/supabaseErrorUtils";
import { runPostgrestWithResilience } from "@/lib/supabaseDataResilience";
import { getBackendBaseUrl } from "@/api/backendClient";
import { DEFAULT_STORAGE_BUCKET } from "@/constants/storageBucket";
import {
  validateActivitiesUpload,
  validateBankDetailsUpload,
  validateBrandingUpload,
  validatePrivateUpload,
  validateReceiptUpload,
} from "@/utils/fileUploadValidation";
import { DEFAULT_INVOICE_TEMPLATE } from "@/utils/invoiceTemplateData";
import { isAbortError, retryOnAbort } from "@/utils/retryOnAbort";
import { resolveUserRoleFromSessionAndProfile } from "@/lib/staffDashboard";
import { clearStoredAuthUser, readStoredAuthUser, writeStoredAuthUser } from "@/utils/authStorage";
import { expireTrialIfDueViaRpc } from "@/lib/trialExpiry";
import { hasFeature } from "@shared/plans.js";
import { apiRequest } from "@/utils/apiRequest";
import { triggerUnauthorizedSession } from "@/lib/unauthorizedSessionHandler";

/**
 * Tenant isolation (authoritative enforcement: Postgres RLS in supabase/schema.postgres.sql):
 * - Org-scoped tables (invoices, quotes, clients, services, payslips, payments, expenses, tasks, …): every
 *   row has `org_id`. This client resolves the active org via `ensureUserHasOrganization(sessionUserId)` and
 *   applies `.eq('org_id', orgId)` on list/get/update/delete. Creates overwrite any client-supplied `org_id`
 *   for those tables (except packages: forced to the same org below).
 * - Per-user / profile: `public.profiles.id` = Supabase auth user id; `notes.user_id` = auth uid.
 * - Line items (`invoice_items`, `quote_items`): scoped indirectly via parent invoice/quote RLS.
 */
// Cache org_id per user to avoid repeated membership/org lookups on every entity sync
const orgIdCache = {};

/**
 * Mobile/webview networks can spuriously abort in-flight auth/session reads.
 * If `getSession()` is empty or slow (e.g. refresh race), `getUser()` validates the JWT with the
 * auth server and often repopulates the local session — then a second `getSession()` succeeds.
 */
async function getSessionWithRetry() {
  const first = await retryOnAbort(() => supabase.auth.getSession(), 2, 300);
  if (first?.data?.session?.user) {
    return first;
  }
  try {
    const { data: userData, error: userErr } = await retryOnAbort(() => supabase.auth.getUser(), 2, 300);
    if (userErr || !userData?.user) {
      return first;
    }
    const second = await retryOnAbort(() => supabase.auth.getSession(), 2, 300);
    if (second?.data?.session?.user) {
      return second;
    }
  } catch {
    /* fall through */
  }
  return first;
}

/**
 * Session read for profile writes. When TOKEN_REFRESHED / parallel tabs abort in-flight
 * `getSession()`, fall back to cached user id so Settings saves don't surface AbortError.
 */
async function getSessionDataForProfileWrite(cachedUser) {
  try {
    return await getSessionWithRetry();
  } catch (e) {
    if (isAbortError(e) && (cachedUser?.supabase_id || cachedUser?.id)) {
      const id = String(cachedUser.supabase_id || cachedUser.id);
      if (isSupabaseAuthUuid(id)) {
        return { data: { session: { user: { id } } }, error: null };
      }
    }
    throw e;
  }
}

/**
 * Prefer supabase.auth.getUser() so the user id is validated with the auth server.
 * Falls back to getSession() when getUser is unavailable or returns no user.
 */
async function getAuthUserIdForWrites() {
  try {
    const { data, error } = await retryOnAbort(() => supabase.auth.getUser(), 2, 300);
    if (!error && data?.user?.id) {
      return data.user.id;
    }
  } catch {
    /* fall through */
  }
  const { data: sessionData } = await getSessionWithRetry();
  return sessionData?.session?.user?.id ?? null;
}

/**
 * Legacy `AuthManager.login` used `user_${hash}` when no Supabase session existed.
 * Never pass those strings to Postgres uuid columns (profiles.id, memberships.user_id, …).
 */
function isSupabaseAuthUuid(id) {
  if (id == null) return false;
  const s = String(id).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * When `navigator.onLine` is false, skip Supabase entity reads in `EntityManager` so transient
 * network errors do not look like "empty data" and localStorage mirrors do not mask real issues
 * while the browser reports online.
 * SSR / unknown: treat as online (attempt Supabase).
 */
function isBrowserOnline() {
  if (typeof navigator === "undefined") return true;
  try {
    return navigator.onLine !== false;
  } catch {
    return true;
  }
}

function normalizePaidlyPlan(rawPlan) {
  const value = String(rawPlan || "").trim().toLowerCase();
  if (!value) return null;
  if (["individual", "starter", "free", "basic", "trial", "none"].includes(value)) return "individual";
  if (["sme", "professional", "business"].includes(value)) return "sme";
  if (["corporate", "enterprise", "pro"].includes(value)) return "corporate";
  return value;
}

/** Explicit select columns per table for better query performance (avoid .select("*")). */
const SUPABASE_SELECT_COLUMNS = {
  invoices: "id, org_id, client_id, company_id, invoice_number, status, project_title, project_description, invoice_date, delivery_date, delivery_address, subtotal, tax_rate, tax_amount, total_amount, currency, notes, terms_conditions, created_by, user_id, created_at, updated_at, banking_detail_id, upfront_payment, milestone_payment, final_payment, milestone_date, final_date, pdf_url, recurring_invoice_id, public_share_token, sent_to_email, owner_company_name, owner_company_address, owner_logo_url, owner_email, owner_currency, document_brand_primary, document_brand_secondary",
  companies: "id, org_id, name, logo_url, created_at, updated_at",
  quotes: "id, org_id, client_id, quote_number, status, project_title, project_description, valid_until, subtotal, tax_rate, tax_amount, total_amount, currency, notes, terms_conditions, created_by, user_id, created_at, updated_at, banking_detail_id, document_brand_primary, document_brand_secondary, public_share_token, owner_company_name, owner_company_address, owner_logo_url, owner_email, owner_currency, sent_date",
  invoice_items: "id, invoice_id, service_name, description, quantity, unit_price, total_price",
  quote_items: "id, quote_id, service_name, description, quantity, unit_price, total_price",
  clients: "id, org_id, name, email, phone, address, contact_person, website, tax_id, notes, payment_terms, payment_terms_days, created_at, updated_at",
  // Keep in sync with ServiceForm — previously omitted columns meant list/get rows were incomplete for the editor.
  services:
    "id, org_id, name, description, item_type, default_unit, default_rate, tax_category, is_active, " +
    "rate, unit, unit_price, unit_of_measure, service_type, sku, price, billing_unit, " +
    "stock_quantity, cost_price, low_stock_threshold, " +
    "role, hourly_rate, unit_type, cost_rate, cost_type, default_cost, " +
    "category, pricing_type, min_quantity, tags, estimated_duration, requirements, price_locked, " +
    "created_at, updated_at",
  payments: "id, org_id, invoice_id, document_id, client_id, amount, currency, exchange_rate, status, paid_at, method, reference, notes, created_at, updated_at",
  profiles:
    "id, full_name, email, avatar_url, logo_url, company_name, company_address, phone, company_website, subscription_plan, plan, subscription_status, trial_ends_at, currency, timezone, role, user_role, invoice_template, invoice_header, document_brand_primary, document_brand_secondary, business, list_filter_prefs, created_at, updated_at",
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
};
function getSelectColumns(table) {
  return SUPABASE_SELECT_COLUMNS[table] || "id, created_at, updated_at";
}

/** Full list minus optional jsonb (scripts/add-profiles-business-jsonb.sql). */
const PROFILES_SELECT_WITHOUT_BUSINESS =
  "id, full_name, email, avatar_url, logo_url, company_name, company_address, phone, subscription_plan, plan, subscription_status, currency, timezone, role, user_role, invoice_template, invoice_header, created_at, updated_at";

/** Older DBs without invoice_template / invoice_header. */
const PROFILES_SELECT_LEGACY =
  "id, full_name, email, avatar_url, logo_url, company_name, company_address, phone, subscription_plan, plan, subscription_status, currency, timezone, role, user_role, created_at, updated_at";

/** Minimal read still useful for app shell (Settings merges defaults). */
const PROFILES_SELECT_MINIMAL =
  "id, full_name, email, logo_url, company_name, company_address, currency, timezone, role, user_role, created_at, updated_at";

function shouldRetryProfileSelectOnSchemaError(error) {
  const m = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  if (/jwt|permission|denied|rls|policy|unauthorized|forbidden|not found|0 rows/i.test(m)) return false;
  return /column|does not exist|schema cache|pgrst204|could not find|unknown|bad request/i.test(m);
}

/**
 * Load one profile row. Retries with fewer columns when PostgREST returns 400 (unknown column / schema drift).
 * @returns {Promise<{ data: object | null, error: object | null }>}
 */
export async function selectProfileByUserId(supabase, authUserId) {
  const attempts = [
    getSelectColumns("profiles"),
    PROFILES_SELECT_WITHOUT_BUSINESS,
    PROFILES_SELECT_LEGACY,
    PROFILES_SELECT_MINIMAL,
  ];
  let last = null;
  for (const cols of attempts) {
    const result = await retryOnAbort(async () => {
      const r = await supabase.from("profiles").select(cols).eq("id", authUserId).maybeSingle();
      if (r.error && isAbortError(r.error)) {
        throw r.error;
      }
      return r;
    }, 2, 350);
    last = result;
    if (!result.error) {
      const d = result.data ? { ...result.data } : null;
      if (d) {
        if (d.business === undefined) d.business = null;
        if (d.invoice_template === undefined) d.invoice_template = DEFAULT_INVOICE_TEMPLATE;
        if (d.invoice_header === undefined) d.invoice_header = "";
        if (d.document_brand_primary === undefined) d.document_brand_primary = null;
        if (d.document_brand_secondary === undefined) d.document_brand_secondary = null;
        if (d.phone === undefined) d.phone = null;
        if (d.company_website === undefined) d.company_website = null;
        if (d.subscription_plan === undefined) d.subscription_plan = null;
        if (d.plan === undefined) d.plan = null;
        if (d.subscription_status === undefined) d.subscription_status = null;
        if (d.trial_ends_at === undefined) d.trial_ends_at = null;
        if (d.avatar_url === undefined) d.avatar_url = null;
        if (d.role === undefined) d.role = null;
        if (d.user_role === undefined) d.user_role = null;
        if (d.list_filter_prefs === undefined) d.list_filter_prefs = null;
      }
      return { data: d, error: null };
    }
    if (!shouldRetryProfileSelectOnSchemaError(result.error)) {
      return result;
    }
  }
  return last;
}

/** Default limit for list queries on large tables to avoid loading thousands of rows at once. */
const DEFAULT_LIST_LIMIT = 100;

/** Map app sort field names to Supabase column names for .order() */
const SORT_FIELD_TO_COLUMN = {
  created_date: "created_at",
  updated_date: "updated_at",
  delivery_date: "delivery_date",
  valid_until: "valid_until",
  paid_at: "paid_at",
  payment_date: "paid_at",
  date: "date",
};
function getOrderColumn(sortBy) {
  const field = (sortBy || "").replace(/^-/, "");
  return SORT_FIELD_TO_COLUMN[field] || field || "created_at";
}
/** sortBy "-created_date" => descending, so ascending = false */
function getOrderAscending(sortBy) {
  return !(sortBy || "").startsWith("-");
}

/** Multi-brand: attach invoice.company from companies table when invoice.company_id is set. */
async function attachInvoiceCompany(record) {
  if (!record || !record.company_id || record.company) return;
  try {
    const { data } = await supabase
      .from("companies")
      .select("id, name, logo_url")
      .eq("id", record.company_id)
      .single();
    if (data) record.company = { id: data.id, name: data.name, logo_url: data.logo_url };
  } catch {
    /* ignore */
  }
}

function clearOrgIdCache() {
  Object.keys(orgIdCache).forEach((k) => delete orgIdCache[k]);
}

/**
 * Entity class name (e.g. "Invoice") → Supabase table when rows are loaded via pullFromSupabase.
 * Used to skip localStorage mirrors for signed-in users: Supabase (+ in-memory EntityManager cache) is authoritative.
 */
function getSupabaseTableForEntityName(entityName) {
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
  if (table === "expenses") return "expenses";
  if (table === "tasks") return "tasks";
  if (table === "notes") return "notes";
  if (table === "documentsends") return "document_sends";
  if (table === "messagelogs") return "message_logs";
  return null;
}

class EntityManager {
  /** @type {{ auth: { user?: object } } | null} */
  static breakApiClient = null;

  static setBreakApiClient(client) {
    EntityManager.breakApiClient = client;
  }

  static getAuthBillingPlanSlug() {
    const u = EntityManager.breakApiClient?.auth?.user;
    return String(u?.subscription_plan || u?.plan || "").trim();
  }

  /**
   * Blocks Supabase writes for tiered features (mirrors `shared/plans.js`).
   * Uses in-memory `auth.user.plan` from the active Break API client.
   */
  static assertSupabaseTableFeatureGate(supabaseTable) {
    if (!isSupabaseConfigured || !supabaseTable) return;
    const featureByTable = {
      invoices: "invoices",
      quotes: "quotes",
      clients: "clients",
      recurring_invoices: "invoices",
      payments: "invoices",
    };
    const feature = featureByTable[supabaseTable];
    if (!feature) return;
    const plan = EntityManager.getAuthBillingPlanSlug() || "free";
    if (!hasFeature(plan, feature)) {
      throw new Error("Upgrade required");
    }
  }

  constructor(entityName = '', userId = null) {
    this.entityName = entityName;
    this.userId = userId;
    this.updateStorageKey();
    this.data = this.loadFromStorage();
    this.subscriptions = [];
  }

  /** Normalize payment record from Supabase (paid_at, method, reference) to app shape (payment_date, payment_method, reference_number) */
  static normalizePaymentRecord(record) {
    if (!record || typeof record !== 'object') return record;
    return {
      ...record,
      payment_date: record.payment_date ?? record.paid_at,
      payment_method: record.payment_method ?? record.method,
      reference_number: record.reference_number ?? record.reference,
      created_date: record.created_date ?? record.created_at,
    };
  }

  updateStorageKey() {
    // Create user-specific storage key
    if (this.userId) {
      this.storageKey = `breakapi_${this.userId}_${this.entityName}`;
    } else {
      this.storageKey = `breakapi_guest_${this.entityName}`;
    }
    this.skipLocalPersistence =
      isSupabaseConfigured &&
      !!this.userId &&
      getSupabaseTableForEntityName(this.entityName) != null;
  }

  setUserId(userId) {
    this.userId = userId;
    this.updateStorageKey();
    this.data = this.loadFromStorage();
    this.notifySubscribers();
  }

  loadFromStorage() {
    if (this.skipLocalPersistence) return {};
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  saveToStorage() {
    if (this.skipLocalPersistence) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch {
      console.warn(`Failed to save ${this.entityName} to localStorage`);
    }
  }

  notifySubscribers() {
    this.subscriptions.forEach(cb => cb(Object.values(this.data)));
  }

  async find() {
    // If local data is empty, try to pull from Supabase
    if (Object.keys(this.data).length === 0) {
      if (!isBrowserOnline()) {
        console.info(
          `[Paidly][EntityManager] ${this.entityName}: offline — find() skipped Supabase pull (empty cache).`
        );
        return [];
      }
      await this.pullFromSupabase();
    }
    return Object.values(this.data);
  }

  async pullFromSupabase() {
    if (!isBrowserOnline()) {
      console.info(
        `[Paidly][EntityManager] ${this.entityName}: offline — skipped Supabase pull (using in-memory / local cache only).`
      );
      return;
    }
    try {
      const { data: sessionData } = await getSessionWithRetry();
      if (!sessionData?.session?.user) return;

      const userId = sessionData.session.user.id;

      // Ensure user has an organization and membership
      let orgId;
      try {
        orgId = await this.ensureUserHasOrganization(userId);
      } catch (error) {
        console.warn(`Failed to ensure organization for user ${userId}:`, error);
        return;
      }

      const table = this.entityName.toLowerCase() + "s";
      const isNotesEntity = table === "notes";
      if (!orgId && !isNotesEntity) {
        console.warn(`No organization found for user ${userId}`);
        return;
      }

      // Supabase CRUD: only these entities map to Supabase tables (see docs/SUPABASE_DATA_MODEL.md)
      const supabaseTable =
        table === "services"
          ? "services"
          : table === "clients"
            ? "clients"
            : table === "invoices"
              ? "invoices"
              : table === "quotes"
                ? "quotes"
                : table === "payments"
                  ? "payments"
                  : table === "bankingdetails"
                    ? "banking_details"
                    : table === "recurringinvoices"
                      ? "recurring_invoices"
                      : table === "packages"
                        ? "packages"
                        : table === "invoiceviews"
                          ? "invoice_views"
                          : table === "payrolls"
                            ? "payslips"
                            : table === "expenses"
                              ? "expenses"
                              : table === "tasks"
                                ? "tasks"
                                : table === "notes"
                                  ? "notes"
                                  : table === "documentsends"
                                    ? "document_sends"
                                    : table === "messagelogs"
                                      ? "message_logs"
                                      : null;

      if (supabaseTable) {
        const columns = getSelectColumns(supabaseTable);
        const { data, error } = await runPostgrestWithResilience(
          async () => {
            let query = supabase.from(supabaseTable).select(columns);

            if (supabaseTable === "notes") {
              query = query.eq("user_id", userId);
            } else if (
              [
                "clients",
                "services",
                "invoices",
                "quotes",
                "payments",
                "banking_details",
                "recurring_invoices",
                "invoice_views",
                "document_sends",
                "message_logs",
                "payslips",
                "expenses",
                "tasks",
              ].includes(supabaseTable)
            ) {
              query = query.eq("org_id", orgId);
            }
            if (supabaseTable === "packages") {
              if (orgId) {
                query = query.or("org_id.is.null,org_id.eq." + orgId);
              } else {
                query = query.is("org_id", null);
              }
            }

            const opts = this._listOptions || {};
            const orderColumn = opts.orderBy?.column ?? "created_at";
            const orderAsc = opts.orderBy?.ascending ?? false;
            if (opts.limit != null && opts.limit > 0) {
              query = query.order(orderColumn, { ascending: orderAsc });
              const from = opts.offset ?? 0;
              const to = from + opts.limit - 1;
              query = query.range(from, to);
            }

            return query;
          },
          { kind: "read", silent: true, label: `pull.${this.entityName}` }
        );
        
        if (!error && data) {
          // Clear existing data and reload from Supabase
          this.data = {};
          data.forEach(item => {
            const rec = {
              ...item,
              created_date: item.created_at || item.created_date,
              updated_date: item.updated_at || item.updated_date
            };
            if (supabaseTable === 'recurring_invoices' && rec.profile_name != null && rec.template_name == null) {
              rec.template_name = rec.profile_name;
            }
            if (supabaseTable === 'payments') {
              Object.assign(rec, EntityManager.normalizePaymentRecord(rec));
            }
            this.data[item.id] = rec;
          });
          this.saveToStorage();
          this.notifySubscribers();
        } else if (error) {
          if (!isAbortError(error)) {
            console.error(`Failed to pull ${this.entityName} from Supabase:`, getSupabaseErrorMessage(error, "Fetch failed"));
          }
        }
      }
    } catch (e) {
      if (!isAbortError(e)) {
        console.warn(`Failed to pull ${this.entityName} from Supabase:`, getSupabaseErrorMessage(e, "Sync failed"));
      }
    }
  }

  async findOne(id) {
    // Simulated findOne method
    return this.data[id] || null;
  }

  /** Returns true if id looks like a UUID (used by Supabase); false for legacy numeric ids */
  static isLikelyUuid(id) {
    if (id == null || typeof id !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
  }

  async get(id) {
    const idStr = String(id);
    // Supabase uses UUIDs; legacy numeric ids will never match in DB — fail fast with a clear error
    if (this.entityName === 'Client' && !EntityManager.isLikelyUuid(idStr)) {
      throw new Error(`${this.entityName} with id ${id} not found. The client may be from an older version. Please open them from the Clients list.`);
    }

    // Do not call pullFromSupabase() on a cache miss: without list limits it can load the entire org
    // table (clients, payments, …) and hang the UI for tens of seconds. Single-row fetch below.

    const record = this.data[idStr];
    if (!record) {
      if (!isBrowserOnline()) {
        throw new Error(
          `${this.entityName} with id ${id} is not available offline. Connect to the internet and try again, or open it from a list you already loaded while online.`
        );
      }
      // Try direct Supabase fetch as fallback
      try {
        const { data: sessionData } = await getSessionWithRetry();
        if (sessionData?.session?.user) {
          const userId = sessionData.session.user.id;
          let orgId;
          try {
            orgId = await this.ensureUserHasOrganization(userId);
          } catch (error) {
            console.error('Error ensuring organization in get():', error);
            // Do not continue without scoping — it can leak cross-tenant data if RLS is misconfigured.
            orgId = null;
          }

          if (orgId || this.entityName === 'Note' || this.entityName === 'Package') {
            const table = this.entityName.toLowerCase() + 's';
            const supabaseTable = table === 'services' ? 'services' :
                                 table === 'clients' ? 'clients' :
                                 table === 'invoices' ? 'invoices' :
                                 table === 'quotes' ? 'quotes' :
                                 table === 'payments' ? 'payments' :
                                 table === 'bankingdetails' ? 'banking_details' :
                                 table === 'recurringinvoices' ? 'recurring_invoices' :
                                 table === 'packages' ? 'packages' :
                                 table === 'invoiceviews' ? 'invoice_views' :
                                 table === 'payrolls' ? 'payslips' :
                                 table === 'expenses' ? 'expenses' :
                                 table === 'tasks' ? 'tasks' :
                                 table === 'notes' ? 'notes' :
                                 table === 'documentsends' ? 'document_sends' :
                                 table === 'messagelogs' ? 'message_logs' : null;

            if (supabaseTable) {
              const columns = getSelectColumns(supabaseTable);
              const { data, error } = await runPostgrestWithResilience(
                async () => {
                  let query = supabase.from(supabaseTable).select(columns).eq("id", idStr);
                  if (supabaseTable === "notes") {
                    query = query.eq("user_id", userId);
                  } else if (
                    [
                      "clients",
                      "services",
                      "invoices",
                      "quotes",
                      "payments",
                      "banking_details",
                      "recurring_invoices",
                      "invoice_views",
                      "document_sends",
                      "message_logs",
                      "payslips",
                      "expenses",
                      "tasks",
                    ].includes(supabaseTable)
                  ) {
                    if (!orgId) {
                      throw new Error("Unable to determine organization for current user");
                    }
                    query = query.eq("org_id", orgId);
                  }
                  return query.single();
                },
                { kind: "read", silent: true, label: `get.${this.entityName}` }
              );
              if (!error && data) {
                const record = {
                  ...data,
                  created_date: data.created_at || data.created_date,
                  updated_date: data.updated_at || data.updated_date
                };
                if (supabaseTable === 'recurring_invoices' && record.profile_name != null && record.template_name == null) {
                  record.template_name = record.profile_name;
                }
                if (supabaseTable === 'payments') {
                  Object.assign(record, EntityManager.normalizePaymentRecord(record));
                }
                // Attach line items for invoices and quotes (stored in separate tables)
                if (supabaseTable === 'invoices' || supabaseTable === 'quotes') {
                  const itemsTable = supabaseTable === 'invoices' ? 'invoice_items' : 'quote_items';
                  const parentIdField = supabaseTable === 'invoices' ? 'invoice_id' : 'quote_id';
                  const itemColumns = getSelectColumns(itemsTable);
                  const { data: itemsData, error: itemsError } = await runPostgrestWithResilience(
                    async () =>
                      supabase.from(itemsTable).select(itemColumns).eq(parentIdField, idStr),
                    { kind: "read", silent: true, label: `getItems.${this.entityName}` }
                  );
                  if (!itemsError && Array.isArray(itemsData)) {
                    record.items = itemsData.map(row => ({
                      service_name: row.service_name,
                      description: row.description || '',
                      quantity: Number(row.quantity ?? 1),
                      unit_price: Number(row.unit_price ?? 0),
                      total_price: Number(row.total_price ?? 0)
                    }));
                  } else {
                    record.items = [];
                  }
                }
                if (supabaseTable === 'invoices') await attachInvoiceCompany(record);
                this.data[idStr] = record;
                this.saveToStorage();
                return record;
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch ${this.entityName} ${id} from Supabase:`, e);
      }

      throw new Error(`${this.entityName} with id ${id} not found`);
    }
    // Ensure invoice/quote from cache has line items (pullFromSupabase does not load invoice_items/quote_items)
    if (record && (this.entityName === 'Invoice' || this.entityName === 'Quote') && !Array.isArray(record.items)) {
      if (!isBrowserOnline()) {
        record.items = [];
      } else {
        const itemsTable = this.entityName === 'Invoice' ? 'invoice_items' : 'quote_items';
        const parentIdField = this.entityName === 'Invoice' ? 'invoice_id' : 'quote_id';
        try {
          const itemColumns = getSelectColumns(itemsTable);
          const { data: itemsData, error: itemsError } = await runPostgrestWithResilience(
            async () => supabase.from(itemsTable).select(itemColumns).eq(parentIdField, idStr),
            { kind: "read", silent: true, label: `lineItems.${this.entityName}` }
          );
          if (!itemsError && Array.isArray(itemsData)) {
            record.items = itemsData.map(row => ({
              service_name: row.service_name,
              description: row.description || '',
              quantity: Number(row.quantity ?? 1),
              unit_price: Number(row.unit_price ?? 0),
              total_price: Number(row.total_price ?? 0)
            }));
          } else {
            record.items = [];
          }
          this.data[idStr] = record;
          this.saveToStorage();
        } catch (e) {
          console.warn(`Failed to fetch line items for ${this.entityName} ${id}:`, e);
          record.items = [];
        }
      }
    }
    if (this.entityName === 'Invoice') await attachInvoiceCompany(record);
    return record;
  }

  /** Filter records by criteria (e.g. { id: 'x', client_id: 'y' }). Returns array. */
  async filter(criteria = {}, sortBy = '') {
    const records = await this.list(sortBy);
    if (!criteria || typeof criteria !== 'object') return records;
    return records.filter((record) => {
      return Object.entries(criteria).every(([key, value]) => {
        const recordVal = record[key];
        if (key === 'quote_number' || key === 'invoice_number') {
          // Do not coerce undefined/null: String(undefined ?? '') === '' would match every row.
          if (Array.isArray(value)) {
            return value.some((v) => {
              if (v === undefined || v === null) return recordVal === v;
              return String(recordVal ?? '') === String(v);
            });
          }
          if (value === undefined || value === null) return recordVal === value;
          return String(recordVal ?? '') === String(value);
        }
        if (Array.isArray(value)) return value.includes(recordVal);
        return recordVal === value;
      });
    });
  }

  /**
   * List records with optional sort and limit (limits Supabase query for performance).
   * @param {string} sortBy - e.g. "-created_date", "delivery_date"
   * @param {{ limit?: number, offset?: number, maxWaitMs?: number } | number} options - limit/offset object, optional maxWaitMs to avoid hanging, or legacy numeric limit.
   */
  async list(sortBy = '', options = {}) {
    const opts = typeof options === 'number' ? { limit: options } : options;
    const table = this.entityName.toLowerCase() + 's';
    // Default-limit large tables to prevent pulling entire tenant datasets on first load.
    // Note: payments and invoice_views can grow unbounded and were causing 30s timeouts.
    const largeTables = ['invoices', 'quotes', 'clients', 'expenses', 'payments', 'invoice_views', 'message_logs', 'document_sends'];
    const useDefaultLimit = largeTables.includes(table) && opts.limit == null;
    const limit = opts.limit ?? (useDefaultLimit ? DEFAULT_LIST_LIMIT : undefined);
    const offset = opts.offset ?? 0;
    const maxWaitMs = typeof opts.maxWaitMs === 'number' ? opts.maxWaitMs : null;
    const orderColumn = getOrderColumn(sortBy);
    const orderAsc = getOrderAscending(sortBy);

    this._listOptions = limit != null ? { limit, offset, orderBy: { column: orderColumn, ascending: orderAsc } } : {};
    try {
      const pull = this.pullFromSupabase();
      const useRace = maxWaitMs != null && maxWaitMs > 0;
      // Online: bounded wait for responsiveness, but log pull failures instead of swallowing them.
      // Offline: pullFromSupabase no-ops immediately — await is cheap; no race needed.
      if (useRace && isBrowserOnline()) {
        await Promise.race([
          pull,
          new Promise((resolve) => setTimeout(resolve, maxWaitMs)),
        ]);
        void pull.catch((err) => {
          if (!isAbortError(err)) {
            console.warn(
              `[Paidly][EntityManager] list(${this.entityName}) Supabase pull finished after timeout:`,
              getSupabaseErrorMessage(err, String(err))
            );
          }
        });
        if (this.skipLocalPersistence && Object.keys(this.data).length === 0) {
          console.warn(
            `[Paidly][EntityManager] list(${this.entityName}): empty cache after ${maxWaitMs}ms — network slow, failed, or still loading.`
          );
        }
      } else if (useRace && !isBrowserOnline()) {
        await pull;
      } else {
        await pull;
      }
    } finally {
      this._listOptions = {};
    }

    let records = Object.values(this.data);

    if (sortBy) {
      const field = sortBy.replace(/^-/, '');
      const isDescending = sortBy.startsWith('-');
      records.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal < bVal) return isDescending ? 1 : -1;
        if (aVal > bVal) return isDescending ? -1 : 1;
        return 0;
      });
    }

    return records;
  }

  async ensureUserHasOrganization(userId) {
    if (!userId || !isSupabaseAuthUuid(String(userId))) {
      throw new Error("Organization setup requires a valid signed-in user (Supabase auth id).");
    }
    if (orgIdCache[userId]) return orgIdCache[userId];

    let sessionUid = null;
    try {
      const { data: gu } = await supabase.auth.getUser();
      sessionUid = gu?.user?.id ?? null;
    } catch {
      /* fall through */
    }
    if (!sessionUid) {
      const { data: sd } = await getSessionWithRetry();
      sessionUid = sd?.session?.user?.id ?? null;
    }
    if (!sessionUid || sessionUid !== userId) {
      throw new Error("Organization setup requires the active session user. Sign in again and retry.");
    }

    let orgName = "My Organization";
    try {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("company_name, full_name")
        .eq("id", userId)
        .maybeSingle();
      if (userProfile) {
        orgName = userProfile.company_name || userProfile.full_name || orgName;
      }
    } catch {
      /* ignore */
    }

    const { data: rpcOrgId, error: rpcErr } = await supabase.rpc("bootstrap_user_organization", {
      p_name: orgName,
    });
    const rpcMsg = rpcErr ? String(rpcErr.message || "") : "";
    const missingRpc =
      rpcErr &&
      (/does not exist|schema cache|42883|function.*not.*found/i.test(rpcMsg) ||
        String(rpcErr.code || "") === "42883");

    if (!rpcErr && rpcOrgId) {
      orgIdCache[userId] = rpcOrgId;
      return rpcOrgId;
    }
    if (rpcErr && !missingRpc) {
      console.warn("bootstrap_user_organization:", getSupabaseErrorMessage(rpcErr, "Org bootstrap failed"));
    }

    try {
      // Check if user has a membership (same ordering as bootstrap_user_organization: oldest first)
      const { data: existingMembership, error: membershipCheckError } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      // If error is not "not found" (PGRST116), log it but continue
      if (membershipCheckError && !membershipCheckError.message.includes('0 rows')) {
        console.warn('Error checking membership:', membershipCheckError);
      }

      if (existingMembership?.org_id) {
        if (userId) orgIdCache[userId] = existingMembership.org_id;
        return existingMembership.org_id;
      }

      // Check if user has an organization as owner
      const { data: existingOrg, error: orgCheckError } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      // If error is not "not found", log it but continue
      if (orgCheckError && !orgCheckError.message.includes('0 rows')) {
        console.warn('Error checking organization:', orgCheckError);
      }

      let orgId = existingOrg?.id;

      // Create organization if it doesn't exist
      if (!orgId) {
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: orgName,
            owner_id: userId
          })
          .select('id')
          .single();

        if (orgError) {
          const msg = getSupabaseErrorMessage(orgError, "Create organization failed");
          console.error("Failed to create organization:", msg);
          alertSupabaseWriteFailure(orgError, "Create organization failed");
          if (/permission|policy|RLS/i.test(msg)) {
            throw new Error("Permission denied: Unable to create organization. Please ensure RLS policies allow organization creation.");
          }
          throw new Error(`Failed to create organization: ${msg}`);
        }

        if (!newOrg?.id) {
          throw new Error('Organization was created but ID was not returned');
        }

        orgId = newOrg.id;
      }

      // Create membership if it doesn't exist
      if (!existingMembership) {
        const { error: membershipError } = await supabase
          .from('memberships')
          .insert({
            org_id: orgId,
            user_id: userId,
            role: 'owner'
          });

        if (membershipError) {
          // If it's a unique constraint violation, membership already exists, which is fine
          if (membershipError.code === '23505' || 
              membershipError.message.includes('unique') || 
              membershipError.message.includes('duplicate')) {
            // Membership already exists, try to fetch it
            const { data: existingMem } = await supabase
              .from('memberships')
              .select('org_id')
              .eq('user_id', userId)
              .eq('org_id', orgId)
              .maybeSingle();
            
            if (existingMem?.org_id) {
              if (userId) orgIdCache[userId] = existingMem.org_id;
              return existingMem.org_id;
            }
          } else {
            const msg = getSupabaseErrorMessage(membershipError, "Create membership failed");
            alertSupabaseWriteFailure(membershipError, "Create membership failed");
            if (/permission|policy|RLS/i.test(msg)) {
              throw new Error("Permission denied: Unable to create membership. Please ensure RLS policies allow membership creation.");
            }
            console.error("Failed to create membership:", msg);
            throw new Error(`Failed to create membership: ${msg}`);
          }
        }
      }

      if (!orgId) {
        throw new Error('Unable to determine organization ID');
      }

      if (userId) orgIdCache[userId] = orgId;
      return orgId;
    } catch (error) {
      console.error('Error in ensureUserHasOrganization:', error);
      throw error;
    }
  }

  async create(data) {
    try {
      const userId = await getAuthUserIdForWrites();
      if (!userId) {
        throw new Error('Not authenticated');
      }

      // Ensure user has an organization and membership
      let orgId;
      try {
        orgId = await this.ensureUserHasOrganization(userId);
      } catch (error) {
        console.error('Error ensuring organization:', error);
        throw new Error(`Failed to set up organization: ${error.message}. Please contact support.`);
      }

      const isNotesEntity = this.entityName === 'Note';
      if (!orgId && !isNotesEntity) {
        throw new Error('No organization found for user. Please contact support.');
      }

      const table = this.entityName.toLowerCase() + "s";
      const supabaseTable =
        table === "services"
          ? "services"
          : table === "clients"
            ? "clients"
            : table === "invoices"
              ? "invoices"
              : table === "quotes"
                ? "quotes"
                : table === "payments"
                  ? "payments"
                  : table === "bankingdetails"
                    ? "banking_details"
                    : table === "recurringinvoices"
                      ? "recurring_invoices"
                      : table === "packages"
                        ? "packages"
                        : table === "invoiceviews"
                          ? "invoice_views"
                          : table === "payrolls"
                            ? "payslips"
                            : table === "expenses"
                              ? "expenses"
                              : table === "tasks"
                                ? "tasks"
                                : table === "notes"
                                  ? "notes"
                                  : table === "documentsends"
                                    ? "document_sends"
                                    : table === "messagelogs"
                                      ? "message_logs"
                                      : null;

      // Prepare data for Supabase (field names match schema: created_at, updated_at, org_id, etc.)
      const supabaseData = {
        ...data,
        updated_at: new Date().toISOString()
      };
      if (supabaseTable === 'document_sends') {
        delete supabaseData.updated_at;
      }
      const MESSAGE_LOG_INSERT_COLUMNS = ['org_id', 'document_type', 'document_id', 'client_id', 'channel', 'recipient', 'sent_at', 'opened_at', 'viewed', 'paid', 'payment_date', 'tracking_token', 'created_at'];
      if (supabaseTable === 'message_logs') {
        if (supabaseData.sent_at === undefined) supabaseData.sent_at = new Date().toISOString();
        Object.keys(supabaseData).forEach(key => {
          if (!MESSAGE_LOG_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }
      if (supabaseTable === 'notes') {
        supabaseData.user_id = userId;
      } else if (supabaseTable !== 'packages') {
        supabaseData.org_id = orgId;
      }
      if (supabaseTable === 'packages') {
        // Never trust client payload for tenancy: org members may only create org-scoped packages (RLS requires membership).
        supabaseData.org_id = orgId;
      }

      // Invoices / quotes: force auth user (getUser-validated id) on created_by + user_id columns
      if (supabaseTable === 'invoices' || supabaseTable === 'quotes') {
        supabaseData.created_by = userId;
        supabaseData.user_id = userId;
        // These tables have items in separate tables
        delete supabaseData.items;
      }
      if (supabaseTable === 'banking_details') {
        if (!supabaseData.created_by_id) supabaseData.created_by_id = userId;
      }
      if (supabaseTable === 'services') {
        if (!supabaseData.created_by_id) supabaseData.created_by_id = userId;
      }
      if (supabaseTable === 'recurring_invoices') {
        if (!supabaseData.created_by_id) supabaseData.created_by_id = userId;
      }
      if (supabaseTable === 'packages') {
        if (!supabaseData.created_by_id) supabaseData.created_by_id = userId;
      }
      if (supabaseTable === 'invoice_views') {
        if (!supabaseData.created_by_id) supabaseData.created_by_id = userId;
      }
      if (supabaseTable === 'payslips') {
        if (!supabaseData.created_by_id) supabaseData.created_by_id = userId;
        supabaseData.user_id = userId;
      }
      if (supabaseTable === 'expenses') {
        if (!supabaseData.created_by_id) supabaseData.created_by_id = userId;
      }
      if (supabaseTable === 'tasks') {
        if (!supabaseData.created_by_id) supabaseData.created_by_id = userId;
      }
      const DOCUMENT_SEND_INSERT_COLUMNS = ['org_id', 'document_type', 'document_id', 'client_id', 'channel', 'sent_at', 'created_at'];
      if (supabaseTable === 'document_sends') {
        if (supabaseData.sent_at === undefined) supabaseData.sent_at = new Date().toISOString();
        Object.keys(supabaseData).forEach(key => {
          if (!DOCUMENT_SEND_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }
      // Map payment payload to DB columns (payments table has paid_at, method, reference, not payment_date etc.)
      if (supabaseTable === 'payments') {
        if (supabaseData.payment_date !== undefined) {
          supabaseData.paid_at = supabaseData.payment_date;
          delete supabaseData.payment_date;
        }
        if (supabaseData.payment_method !== undefined) {
          supabaseData.method = supabaseData.payment_method;
          delete supabaseData.payment_method;
        }
        if (supabaseData.reference_number !== undefined) {
          supabaseData.reference = supabaseData.reference_number;
          delete supabaseData.reference_number;
        }
        delete supabaseData.created_date;
        if (!supabaseData.status) supabaseData.status = 'completed';
        // Whitelist so we only send valid columns
        const PAYMENT_INSERT_COLUMNS = [
          'org_id', 'invoice_id', 'client_id', 'amount', 'status', 'paid_at', 'method', 'reference', 'notes',
          'created_at', 'updated_at'
        ];
        Object.keys(supabaseData).forEach(key => {
          if (!PAYMENT_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      // Only add created_at if not already set (let database handle defaults)
      if (!supabaseData.created_at) {
        supabaseData.created_at = new Date().toISOString();
      }

      // Clean up data: remove undefined/null/empty strings for optional fields
      // Keep required fields even if empty
      const requiredFields = {
        'clients': ['name', 'org_id'],
        'services': ['name', 'org_id', 'item_type', 'default_unit', 'default_rate'],
        'invoices': ['org_id', 'status'],
        'quotes': ['org_id', 'status'],
        'banking_details': ['bank_name', 'org_id'],
        'recurring_invoices': ['org_id', 'status'],
        'packages': ['name', 'price'],
        'invoice_views': ['org_id', 'invoice_id'],
        'payslips': ['org_id', 'employee_name'],
        'expenses': ['org_id', 'amount', 'date'],
        'tasks': ['org_id', 'title']
      };

      // Ensure required fields for services
      if (supabaseTable === 'services') {
        if (!supabaseData.item_type) {
          supabaseData.item_type = 'service';
        }
        if (!supabaseData.default_unit) {
          supabaseData.default_unit = 'unit';
        }
        if (supabaseData.default_rate === undefined || supabaseData.default_rate === null) {
          supabaseData.default_rate = 0;
        }
        // Ensure default_rate is a number
        supabaseData.default_rate = Number(supabaseData.default_rate) || 0;
      }

      Object.keys(supabaseData).forEach(key => {
        const value = supabaseData[key];
        const isRequired = requiredFields[supabaseTable]?.includes(key);
        
        // Remove undefined, null, or empty string for optional fields
        if (!isRequired && (value === undefined || value === null || value === '')) {
          delete supabaseData[key];
        }
      });

      // Whitelist columns for clients table (match schema + user activity / Client_export.csv)
      const CLIENT_INSERT_COLUMNS = [
        'org_id', 'name', 'email', 'phone', 'address', 'contact_person', 'website',
        'tax_id', 'fax', 'alternate_email', 'notes', 'internal_notes', 'industry',
        'payment_terms', 'payment_terms_days', 'follow_up_enabled',
        'segment', 'total_spent', 'last_invoice_date', 'created_by_id',
        'created_at', 'updated_at'
      ];
      if (supabaseTable === 'clients') {
        if (!supabaseData.created_by_id) {
          supabaseData.created_by_id = userId;
        }
        Object.keys(supabaseData).forEach(key => {
          if (!CLIENT_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const BANKING_DETAIL_INSERT_COLUMNS = [
        'org_id', 'bank_name', 'account_name', 'account_number', 'routing_number', 'swift_code',
        'payment_method', 'additional_info', 'payment_gateway_url', 'is_default', 'created_by_id',
        'created_at', 'updated_at'
      ];
      if (supabaseTable === 'banking_details') {
        Object.keys(supabaseData).forEach(key => {
          if (!BANKING_DETAIL_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const INVOICE_INSERT_COLUMNS = [
        'org_id', 'client_id', 'invoice_number', 'status', 'project_title', 'project_description',
        'invoice_date', 'delivery_date', 'delivery_address', 'subtotal', 'tax_rate', 'tax_amount', 'total_amount',
        'currency', 'notes', 'terms_conditions', 'created_by', 'user_id', 'created_at', 'updated_at',
        'banking_detail_id', 'upfront_payment', 'milestone_payment', 'final_payment', 'milestone_date', 'final_date',
        'pdf_url', 'recurring_invoice_id', 'public_share_token', 'sent_to_email',
        'owner_company_name', 'owner_company_address', 'owner_logo_url', 'owner_email', 'owner_currency',
        'document_brand_primary', 'document_brand_secondary',
      ];
      if (supabaseTable === 'invoices') {
        Object.keys(supabaseData).forEach(key => {
          if (!INVOICE_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
        if (supabaseData.invoice_number != null) {
          supabaseData.invoice_number = String(supabaseData.invoice_number).trim();
        }
      }
      const RECURRING_INVOICE_INSERT_COLUMNS = [
        'org_id', 'profile_name', 'client_id', 'invoice_template', 'frequency',
        'start_date', 'end_date', 'next_generation_date', 'status', 'last_generated_invoice_id',
        'created_by_id', 'created_at', 'updated_at'
      ];
      if (supabaseTable === 'recurring_invoices') {
        Object.keys(supabaseData).forEach(key => {
          if (!RECURRING_INVOICE_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const PACKAGE_INSERT_COLUMNS = [
        'org_id', 'name', 'price', 'currency', 'frequency', 'features', 'is_recommended',
        'website_link', 'created_by_id', 'created_at', 'updated_at', 'is_sample'
      ];
      if (supabaseTable === 'packages') {
        if (typeof supabaseData.features === 'string') {
          try {
            supabaseData.features = JSON.parse(supabaseData.features);
          } catch {
            supabaseData.features = [];
          }
        }
        if (supabaseData.features === undefined || supabaseData.features === null) supabaseData.features = [];
        Object.keys(supabaseData).forEach(key => {
          if (!PACKAGE_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const INVOICE_VIEW_INSERT_COLUMNS = [
        'org_id', 'invoice_id', 'client_id', 'viewed_at', 'ip_address', 'user_agent',
        'is_read', 'created_by_id', 'created_at', 'updated_at', 'is_sample'
      ];
      if (supabaseTable === 'invoice_views') {
        Object.keys(supabaseData).forEach(key => {
          if (!INVOICE_VIEW_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const PAYSLIP_INSERT_COLUMNS = [
        'org_id', 'user_id', 'payslip_number', 'employee_name', 'employee_id', 'employee_email', 'employee_phone',
        'position', 'department', 'pay_period_start', 'pay_period_end', 'pay_date',
        'basic_salary', 'overtime_hours', 'overtime_rate', 'allowances', 'gross_pay',
        'tax_deduction', 'uif_deduction', 'pension_deduction', 'medical_aid_deduction',
        'other_deductions', 'total_deductions', 'net_pay', 'status', 'public_share_token', 'sent_to_email',
        'created_by_id', 'created_at', 'updated_at', 'is_sample'
      ];
      if (supabaseTable === 'payslips') {
        if (typeof supabaseData.allowances === 'string') {
          try { supabaseData.allowances = JSON.parse(supabaseData.allowances); } catch { supabaseData.allowances = []; }
        }
        if (typeof supabaseData.other_deductions === 'string') {
          try { supabaseData.other_deductions = JSON.parse(supabaseData.other_deductions); } catch { supabaseData.other_deductions = []; }
        }
        Object.keys(supabaseData).forEach(key => {
          if (!PAYSLIP_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const EXPENSE_INSERT_COLUMNS = [
        'org_id', 'expense_number', 'category', 'description', 'amount', 'date',
        'payment_method', 'vendor', 'vat', 'receipt_url', 'is_claimable', 'claimed', 'notes',
        'created_by_id', 'created_at', 'updated_at', 'is_sample'
      ];
      if (supabaseTable === 'expenses') {
        if (typeof supabaseData.is_claimable === 'string') supabaseData.is_claimable = supabaseData.is_claimable === 'true';
        if (typeof supabaseData.claimed === 'string') supabaseData.claimed = supabaseData.claimed === 'true';
        Object.keys(supabaseData).forEach(key => {
          if (!EXPENSE_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const NOTE_INSERT_COLUMNS = [
        'user_id', 'title', 'content', 'category', 'is_pinned', 'created_at', 'updated_at'
      ];
      if (supabaseTable === 'notes') {
        Object.keys(supabaseData).forEach(key => {
          if (!NOTE_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const TASK_INSERT_COLUMNS = [
        'org_id', 'title', 'description', 'client_id', 'assigned_to', 'due_date',
        'priority', 'status', 'category', 'parent_task_id', 'depends_on', 'estimated_hours', 'tags',
        'created_by_id', 'created_at', 'updated_at', 'is_sample'
      ];
      if (supabaseTable === 'tasks') {
        if (typeof supabaseData.depends_on === 'string') {
          try { supabaseData.depends_on = JSON.parse(supabaseData.depends_on); } catch { supabaseData.depends_on = []; }
        }
        if (!Array.isArray(supabaseData.depends_on)) supabaseData.depends_on = [];
        if (typeof supabaseData.tags === 'string') {
          try { supabaseData.tags = JSON.parse(supabaseData.tags); } catch { supabaseData.tags = []; }
        }
        if (!Array.isArray(supabaseData.tags)) supabaseData.tags = [];
        Object.keys(supabaseData).forEach(key => {
          if (!TASK_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      const QUOTE_INSERT_COLUMNS = [
        'org_id', 'client_id', 'quote_number', 'status', 'project_title', 'project_description',
        'valid_until', 'subtotal', 'tax_rate', 'tax_amount', 'total_amount', 'currency',
        'notes', 'terms_conditions', 'created_by', 'user_id', 'created_at', 'updated_at',
        'banking_detail_id',
        'document_brand_primary', 'document_brand_secondary',
        'owner_company_name', 'owner_company_address', 'owner_logo_url', 'owner_email', 'owner_currency',
      ];
      if (supabaseTable === 'quotes') {
        Object.keys(supabaseData).forEach(key => {
          if (!QUOTE_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
        if (supabaseData.quote_number != null) {
          supabaseData.quote_number = String(supabaseData.quote_number).trim();
        }
      }

      // Whitelist columns for services table to avoid "column does not exist" when DB schema differs
      const SERVICE_INSERT_COLUMNS = [
        'org_id', 'name', 'description', 'item_type', 'default_unit', 'default_rate', 'tax_category', 'is_active',
        'rate', 'unit', 'unit_price', 'unit_of_measure', 'service_type',
        'sku', 'price', 'billing_unit', 'role', 'hourly_rate', 'unit_type', 'cost_rate', 'cost_type', 'default_cost',
        'category', 'pricing_type', 'min_quantity', 'tags', 'estimated_duration', 'requirements',
        'price_locked', 'price_locked_at', 'price_locked_reason', 'usage_count', 'last_used_date', 'type_specific_data',
        'created_by_id', 'created_at', 'updated_at'
      ];
      if (supabaseTable === 'services') {
        Object.keys(supabaseData).forEach(key => {
          if (!SERVICE_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
      }

      EntityManager.assertSupabaseTableFeatureGate(supabaseTable);

      // Log for debugging
      console.log(`Creating ${this.entityName}:`, { supabaseTable, supabaseData });

      let createdRecord;
      if (supabaseTable) {
        const { data: inserted, error } = await supabase
          .from(supabaseTable)
          .insert(supabaseData)
          .select()
          .single();

        if (error) {
          const msg = getSupabaseErrorMessage(error, `Create ${this.entityName} failed`);
          console.error(`Failed to create ${this.entityName} in Supabase:`, msg);
          alertSupabaseWriteFailure(error, `Create ${this.entityName} failed`);
          throw new Error(`Failed to create ${this.entityName}: ${msg}`);
        }

        createdRecord = inserted;
      } else {
        // Fallback for entities without Supabase table
        const id = data.id || `temp_${Date.now()}`;
        createdRecord = {
          id,
          ...data,
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString()
        };
      }

      // Store locally
      const record = {
        ...createdRecord,
        created_date: createdRecord.created_at || createdRecord.created_date,
        updated_date: createdRecord.updated_at || createdRecord.updated_date
      };
      if (supabaseTable === 'recurring_invoices' && record.profile_name != null && record.template_name == null) {
        record.template_name = record.profile_name;
      }
      if (supabaseTable === 'packages' && record.features && typeof record.features === 'object' && !Array.isArray(record.features)) {
        record.features = Array.isArray(record.features) ? record.features : [];
      }
      if (supabaseTable === 'payments') {
        Object.assign(record, EntityManager.normalizePaymentRecord(record));
      }

      this.data[record.id] = record;
      this.saveToStorage();
      this.notifySubscribers();

      // Handle child records (invoice_items, quote_items)
      if ((supabaseTable === 'invoices' || supabaseTable === 'quotes') && data.items && Array.isArray(data.items)) {
        const itemsTable = supabaseTable === 'invoices' ? 'invoice_items' : 'quote_items';
        const parentIdField = supabaseTable === 'invoices' ? 'invoice_id' : 'quote_id';
        
        const itemsToInsert = data.items.map(item => ({
          [parentIdField]: record.id,
          service_name: item.service_name || item.name,
          description: item.description || '',
          quantity: Number(item.quantity || item.qty || 1),
          unit_price: Number(item.unit_price || item.rate || item.price || 0),
          total_price: Number(item.total_price || item.total || 0)
        }));

        if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase
            .from(itemsTable)
            .insert(itemsToInsert);

          if (itemsError) {
            console.error(`Failed to create ${itemsTable}:`, getSupabaseErrorMessage(itemsError, "Create items failed"));
            alertSupabaseWriteFailure(itemsError, `Create ${itemsTable} failed`);
          }
        }
      }

      return record;
    } catch (e) {
      const isAuthError = e?.message === 'Not authenticated';
      if (isAuthError) {
        console.warn(`[${this.entityName}] Not authenticated — session may have expired.`);
      } else {
        console.error(`Failed to create ${this.entityName}:`, e);
      }
      throw e;
    }
  }

  async update(id, data) {
    const idStr = String(id);
    if (this.entityName === 'Client' && !EntityManager.isLikelyUuid(idStr)) {
      throw new Error(`${this.entityName} with id ${id} not found. The client may be from an older version. Please open them from the Clients list.`);
    }

    try {
      const { data: sessionData } = await getSessionWithRetry();
      if (!sessionData?.session?.user) {
        throw new Error('Not authenticated');
      }

      const userId = sessionData.session.user.id;

      // Ensure user has an organization and membership
      let orgId;
      try {
        orgId = await this.ensureUserHasOrganization(userId);
      } catch (error) {
        console.error('Error ensuring organization:', error);
        throw new Error(`Failed to set up organization: ${error.message}. Please contact support.`);
      }

      const isNotesEntity = this.entityName === 'Note';
      if (!orgId && !isNotesEntity) {
        throw new Error('No organization found for user. Please contact support.');
      }

      // Verify record exists and belongs to user's org (or user for notes)
      const existingRecord = this.data[idStr];
      if (!existingRecord) {
        // Try to fetch from Supabase
        await this.get(idStr);
        if (!this.data[idStr]) {
          throw new Error(`${this.entityName} with id ${id} not found`);
        }
      }

      const table = this.entityName.toLowerCase() + 's';
      const supabaseTable = table === 'services' ? 'services' : 
                           table === 'clients' ? 'clients' : 
                           table === 'invoices' ? 'invoices' : 
                           table === 'quotes' ? 'quotes' : 
                           table === 'payments' ? 'payments' : 
                           table === 'recurringinvoices' ? 'recurring_invoices' : 
                           table === 'packages' ? 'packages' : 
                           table === 'invoiceviews' ? 'invoice_views' : 
                           table === 'payrolls' ? 'payslips' :
                           table === 'expenses' ? 'expenses' :
                           table === 'tasks' ? 'tasks' :
                           table === 'notes' ? 'notes' :
                           table === 'documentsends' ? 'document_sends' :
                           table === 'messagelogs' ? 'message_logs' : null;

      EntityManager.assertSupabaseTableFeatureGate(supabaseTable);

      // Prepare update data
      const updateData = {
        ...data,
        updated_at: new Date().toISOString()
      };

      // Whitelist columns for clients table (match schema + segment/total_spent/last_invoice_date)
      const CLIENT_UPDATE_COLUMNS = [
        'name', 'email', 'phone', 'address', 'contact_person', 'website',
        'tax_id', 'fax', 'alternate_email', 'notes', 'internal_notes', 'industry',
        'payment_terms', 'payment_terms_days', 'follow_up_enabled',
        'segment', 'total_spent', 'last_invoice_date', 'updated_at'
      ];
      if (supabaseTable === 'clients') {
        Object.keys(updateData).forEach(key => {
          if (!CLIENT_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const BANKING_DETAIL_UPDATE_COLUMNS = [
        'bank_name', 'account_name', 'account_number', 'routing_number', 'swift_code',
        'payment_method', 'additional_info', 'payment_gateway_url', 'is_default', 'updated_at'
      ];
      if (supabaseTable === 'banking_details') {
        Object.keys(updateData).forEach(key => {
          if (!BANKING_DETAIL_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const INVOICE_UPDATE_COLUMNS = [
        'client_id', 'invoice_number', 'status', 'project_title', 'project_description',
        'invoice_date', 'delivery_date', 'delivery_address', 'subtotal', 'tax_rate', 'tax_amount', 'total_amount',
        'currency', 'notes', 'terms_conditions', 'updated_at',
        'banking_detail_id', 'upfront_payment', 'milestone_payment', 'final_payment', 'milestone_date', 'final_date',
        'pdf_url', 'recurring_invoice_id', 'public_share_token', 'sent_to_email',
        'owner_company_name', 'owner_company_address', 'owner_logo_url', 'owner_email', 'owner_currency',
        'document_brand_primary', 'document_brand_secondary',
      ];
      if (supabaseTable === 'invoices') {
        Object.keys(updateData).forEach(key => {
          if (!INVOICE_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
        if (updateData.invoice_number != null) {
          updateData.invoice_number = String(updateData.invoice_number).trim();
        }
      }
      const QUOTE_UPDATE_COLUMNS = [
        'client_id', 'quote_number', 'status', 'project_title', 'project_description',
        'valid_until', 'subtotal', 'tax_rate', 'tax_amount', 'total_amount', 'currency',
        'notes', 'terms_conditions', 'updated_at', 'banking_detail_id',
        'document_brand_primary', 'document_brand_secondary',
        'owner_company_name', 'owner_company_address', 'owner_logo_url', 'owner_email', 'owner_currency',
      ];
      if (supabaseTable === 'quotes') {
        Object.keys(updateData).forEach(key => {
          if (!QUOTE_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
        if (updateData.quote_number != null) {
          updateData.quote_number = String(updateData.quote_number).trim();
        }
      }
      const RECURRING_INVOICE_UPDATE_COLUMNS = [
        'profile_name', 'client_id', 'invoice_template', 'frequency',
        'start_date', 'end_date', 'next_generation_date', 'status', 'last_generated_invoice_id', 'updated_at'
      ];
      if (supabaseTable === 'recurring_invoices') {
        Object.keys(updateData).forEach(key => {
          if (!RECURRING_INVOICE_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const PACKAGE_UPDATE_COLUMNS = [
        'name', 'price', 'currency', 'frequency', 'features', 'is_recommended',
        'website_link', 'is_sample', 'updated_at'
      ];
      if (supabaseTable === 'packages') {
        if (typeof updateData.features === 'string') {
          try {
            updateData.features = JSON.parse(updateData.features);
          } catch {
            updateData.features = [];
          }
        }
        Object.keys(updateData).forEach(key => {
          if (!PACKAGE_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const INVOICE_VIEW_UPDATE_COLUMNS = [
        'invoice_id', 'client_id', 'viewed_at', 'ip_address', 'user_agent', 'is_read', 'is_sample', 'updated_at'
      ];
      if (supabaseTable === 'invoice_views') {
        Object.keys(updateData).forEach(key => {
          if (!INVOICE_VIEW_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const PAYSLIP_UPDATE_COLUMNS = [
        'payslip_number', 'employee_name', 'employee_id', 'employee_email', 'employee_phone',
        'position', 'department', 'pay_period_start', 'pay_period_end', 'pay_date',
        'basic_salary', 'overtime_hours', 'overtime_rate', 'allowances', 'gross_pay',
        'tax_deduction', 'uif_deduction', 'pension_deduction', 'medical_aid_deduction',
        'other_deductions', 'total_deductions', 'net_pay', 'status', 'public_share_token', 'sent_to_email', 'is_sample', 'updated_at'
      ];
      if (supabaseTable === 'payslips') {
        if (typeof updateData.allowances === 'string') {
          try { updateData.allowances = JSON.parse(updateData.allowances); } catch { updateData.allowances = []; }
        }
        if (typeof updateData.other_deductions === 'string') {
          try { updateData.other_deductions = JSON.parse(updateData.other_deductions); } catch { updateData.other_deductions = []; }
        }
        Object.keys(updateData).forEach(key => {
          if (!PAYSLIP_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const EXPENSE_UPDATE_COLUMNS = [
        'expense_number', 'category', 'description', 'amount', 'date',
        'payment_method', 'vendor', 'vat', 'receipt_url', 'is_claimable', 'claimed', 'notes', 'is_sample', 'updated_at'
      ];
      if (supabaseTable === 'expenses') {
        if (typeof updateData.is_claimable === 'string') updateData.is_claimable = updateData.is_claimable === 'true';
        if (typeof updateData.claimed === 'string') updateData.claimed = updateData.claimed === 'true';
        Object.keys(updateData).forEach(key => {
          if (!EXPENSE_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const NOTE_UPDATE_COLUMNS = [
        'title', 'content', 'category', 'is_pinned', 'updated_at'
      ];
      if (supabaseTable === 'notes') {
        Object.keys(updateData).forEach(key => {
          if (!NOTE_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const DOCUMENT_SEND_UPDATE_COLUMNS = ['sent_at'];
      if (supabaseTable === 'document_sends') {
        delete updateData.updated_at;
        Object.keys(updateData).forEach(key => {
          if (!DOCUMENT_SEND_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }
      const MESSAGE_LOG_UPDATE_COLUMNS = ['opened_at', 'viewed', 'paid', 'payment_date', 'clicked_at'];
      if (supabaseTable === 'message_logs') {
        delete updateData.updated_at;
        Object.keys(updateData).forEach(key => {
          if (!MESSAGE_LOG_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }

      const TASK_UPDATE_COLUMNS = [
        'title', 'description', 'client_id', 'assigned_to', 'due_date',
        'priority', 'status', 'category', 'parent_task_id', 'depends_on', 'estimated_hours', 'tags', 'is_sample', 'updated_at'
      ];
      if (supabaseTable === 'tasks') {
        if (typeof updateData.depends_on === 'string') {
          try { updateData.depends_on = JSON.parse(updateData.depends_on); } catch { updateData.depends_on = []; }
        }
        if (updateData.depends_on !== undefined && !Array.isArray(updateData.depends_on)) updateData.depends_on = [];
        if (typeof updateData.tags === 'string') {
          try { updateData.tags = JSON.parse(updateData.tags); } catch { updateData.tags = []; }
        }
        if (updateData.tags !== undefined && !Array.isArray(updateData.tags)) updateData.tags = [];
        Object.keys(updateData).forEach(key => {
          if (!TASK_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }

      // Whitelist columns for services table to avoid "column does not exist"
      const SERVICE_UPDATE_COLUMNS = [
        'name', 'description', 'item_type', 'default_unit', 'default_rate', 'tax_category', 'is_active',
        'rate', 'unit', 'unit_price', 'unit_of_measure', 'service_type',
        'sku', 'price', 'billing_unit', 'role', 'hourly_rate', 'unit_type', 'cost_rate', 'cost_type', 'default_cost',
        'category', 'pricing_type', 'min_quantity', 'tags', 'estimated_duration', 'requirements',
        'price_locked', 'price_locked_at', 'price_locked_reason', 'usage_count', 'last_used_date', 'type_specific_data',
        'created_by_id', 'updated_at'
      ];
      if (supabaseTable === 'services') {
        Object.keys(updateData).forEach(key => {
          if (!SERVICE_UPDATE_COLUMNS.includes(key)) delete updateData[key];
        });
      }

      // Remove items from update data (handled separately)
      let itemsToUpdate = null;
      if ((supabaseTable === 'invoices' || supabaseTable === 'quotes') && data.items && Array.isArray(data.items)) {
        itemsToUpdate = data.items;
        delete updateData.items;
      }

      // Update in Supabase
      if (supabaseTable) {
        let query = supabase.from(supabaseTable).update(updateData).eq('id', id);
        
        // Ensure we only update records belonging to user (notes: user_id; others: org_id)
        if (supabaseTable === 'notes') {
          query = query.eq('user_id', sessionData.session.user.id);
        } else if (['clients', 'services', 'invoices', 'quotes', 'payments', 'banking_details', 'recurring_invoices', 'invoice_views', 'document_sends', 'message_logs', 'payslips', 'expenses', 'tasks'].includes(supabaseTable)) {
          query = query.eq('org_id', orgId);
        }

        const { data: updated, error } = await query.select().single();

        if (error) {
          const msg = getSupabaseErrorMessage(error, `Update ${this.entityName} failed`);
          console.error(`Failed to update ${this.entityName} in Supabase:`, msg);
          alertSupabaseWriteFailure(error, `Update ${this.entityName} failed`);
          throw new Error(`Failed to update ${this.entityName}: ${msg}`);
        }

        // Update local cache
        const record = {
          ...updated,
          created_date: updated.created_at || updated.created_date,
          updated_date: updated.updated_at || updated.updated_date
        };
        if (supabaseTable === 'recurring_invoices' && record.profile_name != null && record.template_name == null) {
          record.template_name = record.profile_name;
        }
        if (supabaseTable === 'packages' && record.features && typeof record.features === 'object' && !Array.isArray(record.features)) {
          record.features = Array.isArray(record.features) ? record.features : [];
        }

        this.data[id] = record;
        this.saveToStorage();

        // Handle items update
        if (itemsToUpdate) {
          const itemsTable = supabaseTable === 'invoices' ? 'invoice_items' : 'quote_items';
          const parentIdField = supabaseTable === 'invoices' ? 'invoice_id' : 'quote_id';

          const { error: deleteItemsError } = await supabase
            .from(itemsTable)
            .delete()
            .eq(parentIdField, id);
          if (deleteItemsError) {
            console.error(`Failed to delete existing ${itemsTable}:`, getSupabaseErrorMessage(deleteItemsError, "Delete items failed"));
            alertSupabaseWriteFailure(deleteItemsError, `Delete ${itemsTable} failed`);
          }

          const itemsToInsert = itemsToUpdate.map(item => ({
            [parentIdField]: id,
            service_name: item.service_name || item.name,
            description: item.description || '',
            quantity: Number(item.quantity || item.qty || 1),
            unit_price: Number(item.unit_price || item.rate || item.price || 0),
            total_price: Number(item.total_price || item.total || 0)
          }));

          if (itemsToInsert.length > 0) {
            const { error: itemsError } = await supabase
              .from(itemsTable)
              .insert(itemsToInsert);

            if (itemsError) {
              console.error(`Failed to update ${itemsTable}:`, getSupabaseErrorMessage(itemsError, "Update items failed"));
              alertSupabaseWriteFailure(itemsError, `Update ${itemsTable} failed`);
            }
          }
        }

        this.notifySubscribers();
        return record;
      } else {
        // Fallback for entities without Supabase table
        const record = {
          ...this.data[id],
          ...data,
          updated_date: new Date().toISOString()
        };
        
        this.data[id] = record;
        this.saveToStorage();
        this.notifySubscribers();
        return record;
      }
    } catch (e) {
      console.error(`Failed to update ${this.entityName}:`, e);
      throw e;
    }
  }

  async delete(id) {
    // Simulated delete method with persistence
    if (this.data[id]) {
      delete this.data[id];
      this.saveToStorage();

      // Optionally sync to Supabase if authenticated
      try {
        const { data: sessionData } = await getSessionWithRetry();
        if (sessionData?.session?.user && id.includes('-')) {
          const table = this.entityName.toLowerCase() + 's';
          const supabaseTable = table === 'services' ? 'services' : 
                               table === 'clients' ? 'clients' :
                               table === 'invoices' ? 'invoices' :
                               table === 'quotes' ? 'quotes' :
                               table === 'payments' ? 'payments' :
                               table === 'bankingdetails' ? 'banking_details' :
                               table === 'recurringinvoices' ? 'recurring_invoices' :
                               table === 'packages' ? 'packages' :
                               table === 'invoiceviews' ? 'invoice_views' :
                               table === 'payrolls' ? 'payslips' :
                               table === 'expenses' ? 'expenses' :
                               table === 'tasks' ? 'tasks' :
                               table === 'notes' ? 'notes' :
                               table === 'documentsends' ? 'document_sends' :
                               table === 'messagelogs' ? 'message_logs' : null;

          if (supabaseTable) {
            let deleteQuery = supabase.from(supabaseTable).delete().eq("id", id);
            if (supabaseTable === 'notes') {
              deleteQuery = deleteQuery.eq('user_id', sessionData.session.user.id);
            } else if (['clients', 'services', 'invoices', 'quotes', 'payments', 'banking_details', 'recurring_invoices', 'invoice_views', 'document_sends', 'message_logs', 'payslips', 'expenses', 'tasks'].includes(supabaseTable)) {
              const orgId = await this.ensureUserHasOrganization(sessionData.session.user.id);
              if (orgId) deleteQuery = deleteQuery.eq('org_id', orgId);
            }
            // packages: RLS enforces who can delete
            const { error: deleteError } = await deleteQuery;
            if (deleteError) {
              console.warn(`Failed to delete ${this.entityName} from Supabase:`, getSupabaseErrorMessage(deleteError, "Delete failed"));
              alertSupabaseWriteFailure(deleteError, `Delete ${this.entityName} failed`);
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to delete ${this.entityName} from Supabase:`, getSupabaseErrorMessage(e, "Delete failed"));
      }

      this.notifySubscribers();
    }
    return { success: true };
  }

  subscribe(callback) {
    this.subscriptions.push(callback);
    return () => {
      this.subscriptions = this.subscriptions.filter(cb => cb !== callback);
    };
  }
}

class AuthManager {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.loadUserFromStorage();
  }

  loadUserFromStorage() {
    try {
      const stored = readStoredAuthUser();
      if (stored) {
        this.user = stored;
        this.isAuthenticated = !!this.user;
      }
    } catch {
      // Failed to load user from storage
    }
  }

  saveUserToStorage() {
    try {
      if (this.user) {
        writeStoredAuthUser(this.user);
      }
    } catch {
      console.warn("Failed to save user to sessionStorage");
    }
  }

  generateUserId(email) {
    // Generate a consistent user ID from email
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `user_${Math.abs(hash).toString(36)}`;
  }

  async login(credentials) {
    // Simulated login method
    const email = (credentials.email || '').trim().toLowerCase();
    // Use role from credentials (which is now always synced with Supabase)
    const userId = this.generateUserId(email);
    if (import.meta.env.DEV) {
      console.log(`👤 User login: ${email} → Database ID: ${userId}`);
    }

    let companyProfile = {};
    let supabaseUserId = null;
    let resolvedRole = credentials.role || "user";
    try {
      const { data: sessionData, error: sessionError } = await getSessionWithRetry();
      if (sessionError) {
        console.warn("Failed to get session for login:", getSupabaseErrorMessage(sessionError, "Session failed"));
      } else if (sessionData?.session?.user?.id) {
        const su = sessionData.session.user;
        supabaseUserId = su.id;
        const { data: profile, error: profileError } = await selectProfileByUserId(supabase, su.id);
        if (profileError) {
          if (!isAbortError(profileError)) {
            console.warn("Failed to load profile for login:", getSupabaseErrorMessage(profileError, "Load profile failed"));
          } else if (import.meta.env.DEV) {
            console.debug("[auth] Profile select aborted during login; role/plan may use defaults until me() refetch.");
          }
        }
        resolvedRole = resolveUserRoleFromSessionAndProfile(su, profile || {});
        if (profile) {
          companyProfile = {
            full_name: profile.full_name,
            company_name: profile.company_name,
            company_address: profile.company_address,
            currency: profile.currency,
            logo_url: profile.logo_url,
            timezone: profile.timezone,
            invoice_template: profile.invoice_template,
            invoice_header: profile.invoice_header,
            document_brand_primary: profile.document_brand_primary ?? null,
            document_brand_secondary: profile.document_brand_secondary ?? null,
            phone: profile.phone ?? null,
            company_website: profile.company_website ?? null,
            business: profile.business && typeof profile.business === "object" ? profile.business : null,
          };
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        if (import.meta.env.DEV) {
          console.debug(
            "[auth] Profile load aborted (tab refresh, Strict Mode, or parallel auth); continuing with session/credentials defaults."
          );
        }
      } else {
        console.warn("Failed to load profile from Supabase:", getSupabaseErrorMessage(error, "Load profile failed"));
      }
      // Do NOT fall back to localStorage - database is the source of truth.
      // Stale localStorage can cause profile data to appear "lost" after logout/login.
    }

    if (isSupabaseConfigured && !supabaseUserId) {
      this.isAuthenticated = false;
      this.user = null;
      await triggerUnauthorizedSession("missing-supabase-session");
      return null;
    }

    this.isAuthenticated = true;
    this.user = {
      id: supabaseUserId || userId,
      supabase_id: supabaseUserId ?? null,
      email,
      role: resolvedRole,
      full_name: companyProfile.full_name || credentials.full_name || credentials.email?.split('@')[0] || 'User',
      display_name: companyProfile.full_name || credentials.full_name || credentials.email?.split('@')[0] || 'User',
      company_name: companyProfile.company_name || credentials.company_name || 'Company Name',
      company_address: companyProfile.company_address || credentials.company_address || '',
      currency: companyProfile.currency || credentials.currency || 'ZAR',
      logo_url: companyProfile.logo_url || '',
      timezone: companyProfile.timezone || credentials.timezone || 'UTC',
      invoice_template: companyProfile.invoice_template || DEFAULT_INVOICE_TEMPLATE,
      invoice_header: companyProfile.invoice_header || '',
      document_brand_primary: companyProfile.document_brand_primary ?? null,
      document_brand_secondary: companyProfile.document_brand_secondary ?? null,
      phone: companyProfile.phone ?? "",
      company_website: companyProfile.company_website ?? null,
      business: companyProfile.business || null,
      plan: normalizePaidlyPlan(credentials.plan) // Keep null unless explicitly set
    };
    this.saveUserToStorage();
    return this.user;
  }

  async logout() {
    this.isAuthenticated = false;
    this.user = null;
    clearStoredAuthUser();
    clearOrgIdCache();
  }

  async me() {
    // Return current user if authenticated
    if (!this.user || !this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const rawCached = this.user.supabase_id || this.user.id;
    const cachedAuthId = isSupabaseAuthUuid(rawCached) ? rawCached : null;

    const withLocalTimeout = async (promise, ms, label) => {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        clearTimeout(timer);
      }
    };

    // getSession can block on refresh; fail fast and still merge profile using cached id.
    const GET_SESSION_MS = 12000;
    const GET_SESSION_RETRIES = 2;
    const GET_SESSION_RETRY_BACKOFF_MS = 250;
    const PROFILE_MS = 22000;
    const PROFILE_RETRIES = 2;
    const PROFILE_RETRY_BACKOFF_MS = 350;
    const warnSessionSlowOnce = (detail) => {
      if (!import.meta.env?.DEV) return;
      const now = Date.now();
      const last = this._lastMeSessionWarnAt || 0;
      // Avoid noisy duplicate logs when multiple views call me() close together.
      if (now - last < 30000) return;
      this._lastMeSessionWarnAt = now;
      console.warn(
        "me(): getSession slow or failed; continuing with cached user id for profile refresh:",
        detail
      );
    };
    const warnProfileSlowOnce = (detail) => {
      if (!import.meta.env?.DEV) return;
      const now = Date.now();
      const last = this._lastMeProfileWarnAt || 0;
      // Avoid noisy duplicate logs when multiple views call me() close together.
      if (now - last < 30000) return;
      this._lastMeProfileWarnAt = now;
      console.warn(
        "me(): profile refresh slow or failed; using cached profile data:",
        detail
      );
    };

    let authUserId = null;
    for (let attempt = 0; attempt <= GET_SESSION_RETRIES; attempt++) {
      try {
        const { data: sessionData, error: sessionError } = await withLocalTimeout(
          supabase.auth.getSession(),
          GET_SESSION_MS,
          "auth.getSession"
        );
        if (sessionError) {
          warnSessionSlowOnce(getSupabaseErrorMessage(sessionError, "Session failed"));
          break;
        }
        if (sessionData?.session?.user?.id) {
          authUserId = sessionData.session.user.id;
        }
        break;
      } catch (e) {
        const isLastAttempt = attempt >= GET_SESSION_RETRIES;
        if (!isLastAttempt) {
          await new Promise((resolve) => setTimeout(resolve, GET_SESSION_RETRY_BACKOFF_MS * (attempt + 1)));
          continue;
        }
        warnSessionSlowOnce(e?.message || e);
      }
    }

    const effectiveId = authUserId || cachedAuthId;
    if (!effectiveId) {
      return this.user;
    }

    if (isSupabaseConfigured) {
      await expireTrialIfDueViaRpc(supabase);
    }

    try {
      let profile = null;
      let error = null;
      for (let attempt = 0; attempt <= PROFILE_RETRIES; attempt++) {
        try {
          const res = await retryOnAbort(
            () =>
              withLocalTimeout(
                selectProfileByUserId(supabase, effectiveId),
                PROFILE_MS,
                "profiles.select"
              ),
            1,
            250
          );
          profile = res?.data ?? null;
          error = res?.error ?? null;
          // Success, or "not found" shape with no transport error.
          if (!error) break;
        } catch (e) {
          const isLastAttempt = attempt >= PROFILE_RETRIES;
          if (!isLastAttempt) {
            await new Promise((resolve) =>
              setTimeout(resolve, PROFILE_RETRY_BACKOFF_MS * (attempt + 1))
            );
            continue;
          }
          throw e;
        }
        // Query returned error (not throw): retry a couple times for transient DB/network delays.
        if (attempt < PROFILE_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, PROFILE_RETRY_BACKOFF_MS * (attempt + 1))
          );
        }
      }
      if (error && !isAbortError(error)) {
        warnProfileSlowOnce(getSupabaseErrorMessage(error, "Load profile failed"));
      }
      if (!error && profile) {
        const normalizedProfilePlan = normalizePaidlyPlan(profile.plan);
        const normalizedProfileSubscriptionPlan = normalizePaidlyPlan(profile.subscription_plan);
        if (
          normalizedProfilePlan &&
          normalizedProfileSubscriptionPlan &&
          normalizedProfilePlan !== normalizedProfileSubscriptionPlan
        ) {
          console.error("[profile-plan-mismatch] profiles.plan and profiles.subscription_plan differ", {
            userId: effectiveId,
            plan: profile.plan,
            subscription_plan: profile.subscription_plan,
          });
        }
        // Merge Supabase profile (one row per user, id = auth.users.id) into local user
        const fullName = profile.full_name || this.user.full_name;
        const planMerged = normalizePaidlyPlan(
          profile.plan || profile.subscription_plan || this.user.plan || null
        );
        this.user = {
          ...this.user,
          id: effectiveId,
          supabase_id: effectiveId,
          full_name: fullName,
          display_name: fullName,
          email: profile.email || this.user.email,
          avatar_url: profile.avatar_url || this.user.avatar_url,
          logo_url: profile.logo_url || this.user.logo_url || '',
          company_name: profile.company_name || this.user.company_name || '',
          company_address: profile.company_address || this.user.company_address || '',
          currency: profile.currency || this.user.currency || 'USD',
          timezone: profile.timezone || this.user.timezone || 'UTC',
          invoice_template: profile.invoice_template || this.user.invoice_template || DEFAULT_INVOICE_TEMPLATE,
          invoice_header: profile.invoice_header || this.user.invoice_header || '',
          document_brand_primary: profile.document_brand_primary ?? this.user.document_brand_primary ?? null,
          document_brand_secondary: profile.document_brand_secondary ?? this.user.document_brand_secondary ?? null,
          phone: profile.phone ?? this.user.phone ?? "",
          company_website: profile.company_website ?? this.user.company_website ?? null,
          plan: planMerged,
          subscription_plan: normalizePaidlyPlan(profile.subscription_plan || profile.plan || planMerged),
          subscription_status: profile.subscription_status ?? this.user.subscription_status ?? null,
          trial_ends_at: profile.trial_ends_at ?? this.user.trial_ends_at ?? null,
          business:
            profile.business !== undefined && profile.business !== null && typeof profile.business === "object"
              ? profile.business
              : profile.business === null
                ? null
                : this.user.business ?? null,
        };
        this.saveUserToStorage();
      } else if (!error && !profile) {
        // No profile row yet: ensure local user has correct id
        this.user = { ...this.user, id: effectiveId, supabase_id: effectiveId };
        this.saveUserToStorage();
      }
    } catch (e) {
      if (!isAbortError(e)) {
        warnProfileSlowOnce(getSupabaseErrorMessage(e, "Load profile failed"));
      }
    }
    return this.user;
  }

  async getCurrentUser() {
    return this.user;
  }

  /**
   * Restore user state from Supabase session when localStorage was cleared.
   * Loads profile from Supabase profiles table (one row per user, id = auth.users.id).
   * If optionalSession is provided, skips getSession() for faster init (single round-trip: profile only).
   * @param {object} [optionalSession] - If provided, { user } is used; avoids extra getSession() call
   * @returns {Promise<object|null>} Restored user or null
   */
  async restoreFromSupabaseSession(optionalSession = null) {
    try {
      let su = optionalSession?.user ?? null;
      if (!su) {
        const { data, error } = await getSessionWithRetry();
        if (error || !data?.session?.user) return null;
        su = data.session.user;
      }

      if (isSupabaseConfigured) {
        await expireTrialIfDueViaRpc(supabase);
      }

      let profileData = {};
      try {
        const { data: profile, error: profileErr } = await retryOnAbort(
          () => selectProfileByUserId(supabase, su.id),
          2,
          250
        );
        if (profileErr && !isAbortError(profileErr)) {
          console.warn(
            "Could not load profile in restoreFromSupabaseSession:",
            getSupabaseErrorMessage(profileErr, "Profile load failed")
          );
        }
        profileData = profile || {};
      } catch (profileErr) {
        if (!isAbortError(profileErr)) {
          console.warn(
            "Could not load profile in restoreFromSupabaseSession:",
            getSupabaseErrorMessage(profileErr, "Profile load failed")
          );
        }
      }

      const fullName = profileData.full_name || su.user_metadata?.full_name || (su.email || "").split("@")[0] || "User";
      const normalizedProfilePlan = normalizePaidlyPlan(profileData.plan);
      const normalizedProfileSubscriptionPlan = normalizePaidlyPlan(profileData.subscription_plan);
      if (
        normalizedProfilePlan &&
        normalizedProfileSubscriptionPlan &&
        normalizedProfilePlan !== normalizedProfileSubscriptionPlan
      ) {
        console.error("[profile-plan-mismatch] profiles.plan and profiles.subscription_plan differ", {
          userId: su.id,
          plan: profileData.plan,
          subscription_plan: profileData.subscription_plan,
        });
      }
      const plan = normalizePaidlyPlan(
        profileData.plan || profileData.subscription_plan || su.app_metadata?.plan || null
      );
      this.user = {
        id: su.id,
        supabase_id: su.id,
        auth_id: su.id,
        email: (su.email || "").toLowerCase(),
        role: resolveUserRoleFromSessionAndProfile(su, profileData),
        full_name: fullName,
        display_name: fullName,
        company_name: profileData.company_name || "",
        company_address: profileData.company_address || "",
        currency: profileData.currency || "ZAR",
        logo_url: profileData.logo_url || "",
        timezone: profileData.timezone || "UTC",
        invoice_template: profileData.invoice_template || DEFAULT_INVOICE_TEMPLATE,
        invoice_header: profileData.invoice_header || "",
        document_brand_primary: profileData.document_brand_primary ?? null,
        document_brand_secondary: profileData.document_brand_secondary ?? null,
        phone: profileData.phone ?? "",
        company_website: profileData.company_website ?? null,
        business:
          profileData.business !== undefined && profileData.business !== null && typeof profileData.business === "object"
            ? profileData.business
            : null,
        plan,
        subscription_plan: normalizePaidlyPlan(profileData.subscription_plan || profileData.plan || plan),
        subscription_status: profileData.subscription_status ?? null,
        trial_ends_at: profileData.trial_ends_at ?? null,
      };
      this.isAuthenticated = true;
      this.saveUserToStorage();
      return this.user;
    } catch (err) {
      if (!isAbortError(err)) {
        console.warn("restoreFromSupabaseSession failed:", getSupabaseErrorMessage(err, "Restore failed"));
      }
      return null;
    }
  }

  /**
   * Get the current auth user id from Supabase session (used to key profile and storage per user).
   * @returns {Promise<string|null>} auth.users id or null if not authenticated
   */
  async getAuthUserId() {
    const { data } = await getSessionWithRetry();
    return data?.session?.user?.id ?? null;
  }

  /**
   * Update current user and persist to Supabase profiles table.
   * Profile is stored per user: one row per auth user, keyed by auth.users(id). Only writes when session exists.
   *
   * Billing / subscription columns must NOT be updated from the browser — only PayFast ITN (service role) or admin.
   */
  async updateMyUserData(data) {
    if (!this.user) {
      this.user = {};
    }

    const billingFieldsLockedForClient = [
      "subscription_plan",
      "plan",
      "subscription_status",
      "trial_ends_at",
      "payfast_token",
      "payfast_subscription_id",
      "is_pro",
    ];
    const safeData = data && typeof data === "object" ? { ...data } : {};
    for (const k of billingFieldsLockedForClient) {
      if (Object.prototype.hasOwnProperty.call(safeData, k)) {
        if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
          console.warn(
            `[profile] Ignoring "${k}" in updateMyUserData — set only via verified PayFast webhook / server, not the client.`
          );
        }
        delete safeData[k];
      }
    }

    const { data: sessionData } = await getSessionDataForProfileWrite(this.user);
    // Same fallback as me(): avoid skipping DB writes when getSession is slow/empty but we already have the auth id.
    const rawAuth =
      sessionData?.session?.user?.id ?? this.user?.supabase_id ?? this.user?.id ?? null;
    const authUserId = isSupabaseAuthUuid(rawAuth) ? rawAuth : null;

    // Keep id as auth user id when available so all consumers get the real user id
    const updatedUser = {
      ...this.user,
      ...safeData,
      id: authUserId ?? this.user.id,
      supabase_id: authUserId ?? this.user.supabase_id,
    };
    if (safeData.business !== undefined) {
      if (safeData.business === null) {
        updatedUser.business = null;
      } else if (safeData.business && typeof safeData.business === "object") {
        const currentBusiness =
          this.user?.business && typeof this.user.business === "object" ? this.user.business : {};
        updatedUser.business = { ...currentBusiness, ...safeData.business };
      } else {
        updatedUser.business = safeData.business;
      }
    }
    this.user = updatedUser;
    this.saveUserToStorage();

    // Persist to Supabase profiles table (per-user row keyed by auth user id)
    if (!authUserId) {
      throw new Error("Not signed in — cannot save profile. Sign in again and retry.");
    }

    const profileColumnMissing = (msg, columnName) => {
      const m = String(msg || "");
      if (!m) return false;
      const esc = columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `(column|field)[^a-z0-9_]*${esc}|${esc}[^a-z0-9_]*(of relation|does not exist|unknown)|schema cache[^\\n']*${esc}|'${esc}'`,
        "i"
      ).test(m);
    };

    const profileData = {
      full_name: safeData.full_name ?? safeData.display_name ?? updatedUser.full_name,
      email: safeData.email ?? updatedUser.email,
      avatar_url: safeData.avatar_url ?? updatedUser.avatar_url,
      logo_url: safeData.logo_url !== undefined ? safeData.logo_url : updatedUser.logo_url,
      company_name: safeData.company_name !== undefined ? safeData.company_name : updatedUser.company_name,
      company_address: safeData.company_address !== undefined ? safeData.company_address : updatedUser.company_address,
      phone: safeData.phone !== undefined ? safeData.phone : updatedUser.phone,
      company_website: safeData.company_website !== undefined ? safeData.company_website : updatedUser.company_website,
      currency: safeData.currency ?? updatedUser.currency ?? "USD",
      timezone: safeData.timezone ?? updatedUser.timezone ?? "UTC",
      invoice_template: safeData.invoice_template ?? updatedUser.invoice_template ?? DEFAULT_INVOICE_TEMPLATE,
      invoice_header: safeData.invoice_header !== undefined ? safeData.invoice_header : updatedUser.invoice_header,
      ...(safeData.business !== undefined ? { business: updatedUser.business } : {}),
      ...(safeData.document_brand_primary !== undefined
        ? { document_brand_primary: safeData.document_brand_primary }
        : {}),
      ...(safeData.document_brand_secondary !== undefined
        ? { document_brand_secondary: safeData.document_brand_secondary }
        : {}),
      updated_at: new Date().toISOString(),
    };

    Object.keys(profileData).forEach((key) => {
      if (profileData[key] === undefined) delete profileData[key];
    });

    const upsertProfileRow = async () => {
      let { error } = await retryOnAbort(
        () =>
          supabase.from("profiles").upsert({ id: authUserId, ...profileData }, { onConflict: "id" }),
        8,
        450
      );

      const errMsg = error?.message || "";
      const stripBusiness =
        !!error && Object.prototype.hasOwnProperty.call(profileData, "business") && profileColumnMissing(errMsg, "business");
      const stripCompanyAddress =
        !!error &&
        Object.prototype.hasOwnProperty.call(profileData, "company_address") &&
        profileColumnMissing(errMsg, "company_address");
      const stripDocumentBrand =
        !!error &&
        (Object.prototype.hasOwnProperty.call(profileData, "document_brand_primary") ||
          Object.prototype.hasOwnProperty.call(profileData, "document_brand_secondary")) &&
        (profileColumnMissing(errMsg, "document_brand_primary") ||
          profileColumnMissing(errMsg, "document_brand_secondary"));
      const stripCompanyWebsite =
        !!error &&
        Object.prototype.hasOwnProperty.call(profileData, "company_website") &&
        profileColumnMissing(errMsg, "company_website");

      if (error && (stripBusiness || stripCompanyAddress || stripDocumentBrand || stripCompanyWebsite)) {
        const fallback = { ...profileData };
        if (stripBusiness) delete fallback.business;
        if (stripCompanyAddress) delete fallback.company_address;
        if (stripDocumentBrand) {
          delete fallback.document_brand_primary;
          delete fallback.document_brand_secondary;
        }
        if (stripCompanyWebsite) delete fallback.company_website;
        Object.keys(fallback).forEach((key) => {
          if (fallback[key] === undefined) delete fallback[key];
        });
        const retry = await retryOnAbort(
          () => supabase.from("profiles").upsert({ id: authUserId, ...fallback }, { onConflict: "id" }),
          8,
          450
        );
        error = retry.error;
        if (!error) {
          if (stripBusiness) {
            console.warn(
              "Profile saved without business column. Run scripts/add-profiles-business-jsonb.sql on your database."
            );
          }
          if (stripCompanyAddress) {
            console.warn("Profile saved without company_address (column missing on profiles table).");
          }
          if (stripDocumentBrand) {
            console.warn(
              "Profile saved without document brand color columns. Run scripts/add-profiles-document-brand-colors.sql on your database."
            );
          }
          if (stripCompanyWebsite) {
            console.warn(
              "Profile saved without company_website column. Run scripts/add-profiles-company-website.sql on your database."
            );
          }
        }
      }

      if (error) {
        alertSupabaseWriteFailure(error, "Save profile failed");
        throw new Error(getSupabaseErrorMessage(error, "Save profile failed"));
      }
    };

    try {
      await upsertProfileRow();
    } catch (e) {
      if (isAbortError(e)) {
        await new Promise((r) => setTimeout(r, 900));
        try {
          await upsertProfileRow();
        } catch (e2) {
          if (isAbortError(e2)) {
            console.warn(
              "Profile sync aborted after retry (auth/network race). Local profile in this browser was updated.",
              e2
            );
            return this.user;
          }
          throw e2;
        }
      } else {
        throw e instanceof Error ? e : new Error(getSupabaseErrorMessage(e, "Save profile failed"));
      }
    }

    return this.user;
  }

  isAuth() {
    return this.isAuthenticated;
  }
}

class IntegrationManager {
  constructor() {
    const storageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET;

    const getLocalUserId = () => {
      try {
        const stored = readStoredAuthUser();
        return stored?.id || null;
      } catch {
        return null;
      }
    };

    const getSessionUser = async () => {
      const { data, error } = await getSessionWithRetry();
      if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to get session"));
      return data?.session?.user ?? null;
    };

    const getOrgIdForUser = async (userId) => {
      if (!userId || !isSupabaseAuthUuid(String(userId))) {
        throw new Error("Invalid user id for organization resolution.");
      }

      let orgName = "My Organization";
      try {
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("company_name, full_name")
          .eq("id", userId)
          .maybeSingle();
        if (userProfile) {
          orgName = userProfile.company_name || userProfile.full_name || orgName;
        }
      } catch {
        /* ignore */
      }

      const { data: rpcOrgId, error: rpcErr } = await supabase.rpc("bootstrap_user_organization", {
        p_name: orgName,
      });
      const rpcMsg = rpcErr ? String(rpcErr.message || "") : "";
      const missingRpc =
        rpcErr &&
        (/does not exist|schema cache|42883|function.*not.*found/i.test(rpcMsg) ||
          String(rpcErr.code || "") === "42883");
      if (!rpcErr && rpcOrgId) {
        return rpcOrgId;
      }
      if (rpcErr && !missingRpc) {
        console.warn(
          "IntegrationManager bootstrap_user_organization:",
          getSupabaseErrorMessage(rpcErr, "Org bootstrap failed")
        );
      }

      const { data: existingMembership, error: membershipCheckError } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (membershipCheckError && !/0 rows|PGRST116/i.test(membershipCheckError.message || '')) {
        console.warn('IntegrationManager: check membership failed', getSupabaseErrorMessage(membershipCheckError, 'Check failed'));
      }
      if (existingMembership?.org_id) {
        return existingMembership.org_id;
      }

      // Check if user has an organization as owner
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      let orgId = existingOrg?.id;

      // Create organization if it doesn't exist
      if (!orgId) {
        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: orgName,
            owner_id: userId
          })
          .select('id')
          .single();

        if (orgError) {
          const msg = getSupabaseErrorMessage(orgError, "Create organization failed");
          console.error("Failed to create organization:", msg);
          alertSupabaseWriteFailure(orgError, "Create organization failed");
          throw new Error(`Failed to create organization: ${msg}`);
        }

        orgId = newOrg?.id;
      }

      // Create membership if it doesn't exist
      if (!existingMembership && orgId) {
        const { error: membershipError } = await supabase
          .from('memberships')
          .insert({
            org_id: orgId,
            user_id: userId,
            role: 'owner'
          });

        if (membershipError) {
          const msg = getSupabaseErrorMessage(membershipError, "Create membership failed");
          const isUnique = membershipError.code === "23505" || /unique|duplicate/i.test(msg);
          if (!isUnique) {
            console.error("Failed to create membership:", msg);
            alertSupabaseWriteFailure(membershipError, "Create membership failed");
            throw new Error(`Failed to create membership: ${msg}`);
          }
        }
      }

      if (!orgId) {
        throw new Error("No organization found for user");
      }

      return orgId;
    };

    const buildUploadPath = (orgId, file, folder = "uploads") => {
      const safeName = file?.name ? file.name.replace(/[^a-zA-Z0-9._-]/g, "_") : "upload";
      return `${orgId}/${folder}/${Date.now()}-${safeName}`;
    };

    const buildFileUrl = async ({ filePath, preferSigned }) => {
      if (preferSigned) {
        const { data: signed, error: signedError } = await supabase
          .storage
          .from(storageBucket)
          .createSignedUrl(filePath, 60 * 60 * 24 * 365);

        if (!signedError && signed?.signedUrl) {
          return signed.signedUrl;
        }
      }

      const { data: publicData } = supabase
        .storage
        .from(storageBucket)
        .getPublicUrl(filePath);

      if (publicData?.publicUrl) {
        return publicData.publicUrl;
      }

      if (!preferSigned) {
        const { data: signed, error: signedError } = await supabase
          .storage
          .from(storageBucket)
          .createSignedUrl(filePath, 60 * 60 * 24 * 365);

        if (!signedError && signed?.signedUrl) {
          return signed.signedUrl;
        }
      }

      return null;
    };

    const guardUploadByFolder = (file, folder) => {
      const f = folder || "uploads";
      if (f === "branding") {
        validateBrandingUpload(file);
      } else if (f === "activities") {
        validateActivitiesUpload(file);
      } else if (f === "bank-details") {
        validateBankDetailsUpload(file);
      } else if (f === "private") {
        validatePrivateUpload(file);
      } else {
        validateActivitiesUpload(file);
      }
    };

    const uploadToStorage = async ({ file, folder, bucket: bucketOverride }) => {
      if (!file) {
        throw new Error("No file provided");
      }
      guardUploadByFolder(file, folder);
      const bucket = bucketOverride || storageBucket;

      const sessionUser = await getSessionUser();
      const orgId = sessionUser?.id
        ? await getOrgIdForUser(sessionUser.id)
        : `local-${getLocalUserId() || "guest"}`;
      const filePath = buildUploadPath(orgId, file, folder);

      const { error: uploadError } = await supabase
        .storage
        .from(bucket)
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || undefined
        });

      if (uploadError) {
        throw new Error(getSupabaseErrorMessage(uploadError, "File upload failed"));
      }

      const fileUrl = bucketOverride
        ? await buildFileUrlWithBucket({ filePath, preferSigned: !!sessionUser?.id }, bucket)
        : await buildFileUrl({ filePath, preferSigned: !!sessionUser?.id });

      if (!fileUrl) {
        throw new Error(`Upload succeeded but no file URL was generated. Configure the ${bucket} bucket as public or allow signed URLs.`);
      }

      return { file_url: fileUrl, file_path: filePath };
    };

    const buildFileUrlWithBucket = async (opts, bucketName) => {
      const { filePath, preferSigned } = opts;
      const b = bucketName || storageBucket;
      if (preferSigned) {
        const { data: signed, error: signedError } = await supabase.storage.from(b).createSignedUrl(filePath, 60 * 60 * 24 * 365);
        if (!signedError && signed?.signedUrl) return signed.signedUrl;
      }
      const { data: publicData } = supabase.storage.from(b).getPublicUrl(filePath);
      if (publicData?.publicUrl) return publicData.publicUrl;
      const { data: signed, error: signedError } = await supabase.storage.from(b).createSignedUrl(filePath, 60 * 60 * 24 * 365);
      return !signedError && signed?.signedUrl ? signed.signedUrl : null;
    };

    this.Core = {
      InvokeLLM: async (prompt) => {
        void prompt; // Acknowledge parameter
        console.warn('InvokeLLM not implemented in custom client');
        return null;
      },
      SendEmail: async (emailConfig) => {
        const { to, subject, body } = emailConfig || {};
        if (!to || !subject) {
          throw new Error("Missing to or subject");
        }
        try {
          const { data: sessionData } = await getSessionWithRetry();
          const token = sessionData?.session?.access_token;
          if (!token) {
            throw new Error("Not signed in");
          }
          const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
          const res = await apiRequest(`${apiBase}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to, subject, body: body || "" }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(json?.error || res.statusText || "Send failed");
          }
          if (json.success === false) {
            throw new Error(json?.error || "Send failed");
          }
          return { success: true, data: json.data };
        } catch (err) {
          console.error("SendEmail error:", err);
          throw err instanceof Error ? err : new Error(err?.message || String(err));
        }
      },
      UploadFile: async ({ file }) => {
        return uploadToStorage({ file, folder: "branding" });
      },
      /** Upload to activities bucket (receipts, attachments); path = org_id/activities/... */
      UploadToActivities: async ({ file }) => {
        return uploadToStorage({ file, folder: "activities", bucket: "activities" });
      },
      /** Store receipt image in receipts bucket: receipt-{Date.now()}.{ext} under org_id */
      UploadToReceipts: async ({ file }) => {
        if (!file) throw new Error("No file provided");
        validateReceiptUpload(file);
        const sessionUser = await getSessionUser();
        const orgId = sessionUser?.id
          ? await getOrgIdForUser(sessionUser.id)
          : `local-${getLocalUserId() || "guest"}`;
        const ext = (file.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "jpg");
        const filePath = `${orgId}/receipt-${Date.now()}.${ext}`;
        const bucket = "receipts";
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) {
          throw new Error(getSupabaseErrorMessage(uploadError, "Receipt upload failed"));
        }
        const fileUrl = await buildFileUrlWithBucket({ filePath, preferSigned: !!sessionUser?.id }, bucket);
        if (!fileUrl) {
          throw new Error("Receipt upload succeeded but could not generate URL.");
        }
        return { file_url: fileUrl, file_path: filePath };
      },
      /** Upload to bank-details bucket (statements, imports); path = org_id/bank-details/... */
      UploadToBankDetails: async ({ file }) => {
        return uploadToStorage({ file, folder: "bank-details", bucket: "bank-details" });
      },
      GenerateImage: async (prompt) => {
        void prompt; // Acknowledge parameter
        console.warn('GenerateImage not implemented in custom client');
        return null;
      },
      ExtractDataFromUploadedFile: async (file) => {
        void file; // Acknowledge parameter
        // This integration requires a backend/LLM service. In the custom client build, it isn't configured.
        // Callers should fall back to browser OCR (images) or manual entry.
        throw new Error("Receipt extraction service is not configured. Enable 'Extract with browser OCR' (images only) or fill in manually.");
      },
      CreateFileSignedUrl: async (fileId) => {
        void fileId; // Acknowledge parameter
        console.warn('CreateFileSignedUrl not implemented in custom client');
        return null;
      },
      UploadPrivateFile: async ({ file }) => {
        console.log('UploadPrivateFile called with file:', file?.name);
        return uploadToStorage({ file, folder: "private" });
      }
    };
  }
}

class CustomAPIClient {
  constructor(config = {}) {
    this.config = config;
    this.auth = new AuthManager();
    this.integrations = new IntegrationManager();
    this.entities = this.createEntities();
    EntityManager.setBreakApiClient(this);
    this.setupAuthListener();
  }

  setupAuthListener() {
    // Listen for user changes and update entity managers
    const originalLogin = this.auth.login.bind(this.auth);
    const originalLogout = this.auth.logout.bind(this.auth);

    this.auth.login = async (credentials) => {
      const user = await originalLogin(credentials);
      this.updateEntitiesForUser(user.id);
      return user;
    };

    this.auth.logout = async () => {
      await originalLogout();
      this.updateEntitiesForUser(null);
    };

    // Update entities if user already logged in
    if (this.auth.user) {
      this.updateEntitiesForUser(this.auth.user.id);
    }
  }

  updateEntitiesForUser(userId) {
    // Update all entity managers with new user ID
    if (import.meta.env.DEV && typeof console !== "undefined" && console.debug) {
      console.debug(`🔄 Switching to ${userId ? `user: ${userId.slice(0, 8)}…` : "guest"}`);
    }
    Object.values(this.entities).forEach(entity => {
      if (entity && typeof entity.setUserId === 'function') {
        entity.setUserId(userId);
      }
    });
  }

  createEntities() {
    const entityNames = [
      'Client',
      'BankingDetail',
      'Invoice',
      'Note',
      'Service',
      'Quote',
      'PaymentReminder',
      'RecurringInvoice',
      'Package',
      'InvoiceView',
      'Payslip',
      'Notification',
      'Expense',
      'Payroll',
      'Task',
      'Message',
      'DocumentSend',
      'MessageLog',
      'TaskAssignmentRule',
      'QuoteTemplate',
      'QuoteReminder',
      'Vendor',
      'Budget',
      'Payment'
    ];

    const userId = this.auth.user ? this.auth.user.id : null;
    const entities = {};
    entityNames.forEach(name => {
      entities[name] = new EntityManager(name, userId);
    });
    return entities;
  }

  setAuth(token) {
    // Method to set authentication token
    this.token = token;
  }

  isReady() {
    return true;
  }
}

export const createClient = (config) => {
  return new CustomAPIClient(config);
};

export const customClient = createClient({
  appId: "6887a9d49af4acc63ae9062f",
  requiresAuth: true
});
