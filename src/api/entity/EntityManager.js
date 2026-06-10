/**
 * EntityManager — Supabase-backed CRUD for all Paidly entities.
 */
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage, alertSupabaseWriteFailure } from "@/utils/supabaseErrorUtils";
import { runPostgrestWithResilience } from "@/lib/supabaseDataResilience";
import { isAbortError, retryOnAbort } from "@/utils/retryOnAbort";
import { readStoredAuthUser } from "@/utils/authStorage";
import { hasFeature } from "@/lib/plans.js";
import {
  runOrgBootstrapWithLock,
  getOrgBootstrapCircuitOpenUntil,
  recordOrgBootstrapFailure,
} from "@/lib/orgBootstrapApi";
import { assertRuntimeAllowsMutations } from "@/lib/runtimeMutationGuard";
import { orgIdCache, fetchPrimaryMembershipOrgId } from "@/api/auth/orgCache.js";
import {
  getSessionWithRetry,
  getAuthUserIdForWrites,
  isSupabaseAuthUuid,
} from "@/api/auth/authSessionHelpers.js";
import { loadCompanyAccessContext } from "@/services/CompanyContextService";
import { applyCompanyDataScope } from "@/lib/companyDataScope";
import {
  isBrowserOnline,
  assertSessionAuthorityAllowsMutations,
  shouldLogEntityTimeoutWarning,
  getSelectColumns,
  isPostgrestSelectSchemaDriftError,
  DEFAULT_LIST_LIMIT,
  getOrderColumn,
  getOrderAscending,
  attachInvoiceCompany,
  getSupabaseTableForEntityName,
} from "@/api/entity/entityShared.js";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";

/**
 * Maps app-shape line items to `invoice_items` / `quote_items` rows for a given parent.
 * Centralizes the mapping previously duplicated between create() and update() so the
 * two write paths stay in lock-step.
 */
function buildChildItemRows(parentIdField, parentId, items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    [parentIdField]: parentId,
    service_name: item.service_name || item.name,
    description: item.description || '',
    quantity: Number(item.quantity || item.qty || 1),
    unit_price: Number(item.unit_price || item.rate || item.price || 0),
    total_price: Number(item.total_price || item.total || 0),
  }));
}

export class EntityManager {
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

      let companyCtx = null;
      try {
        companyCtx = await loadCompanyAccessContext(userId);
      } catch {
        companyCtx = null;
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
        const buildListQuery = (selectCols) => {
          let query = supabase.from(supabaseTable).select(selectCols);

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
          if (supabaseTable === "payslips") {
            query = applyCompanyDataScope(query, companyCtx);
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
        };

        let { data, error } = await runPostgrestWithResilience(
          () => buildListQuery(columns),
          { kind: "read", silent: true, label: `pull.${this.entityName}` }
        );

        if (
          error &&
          isPostgrestSelectSchemaDriftError(error) &&
          (supabaseTable === "invoices" || supabaseTable === "quotes")
        ) {
          const retry = await runPostgrestWithResilience(() => buildListQuery("*"), {
            kind: "read",
            silent: true,
            label: `pull.${this.entityName}.wildcard`,
          });
          data = retry.data;
          error = retry.error;
        }

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
              const buildGetQuery = (selectCols) => async () => {
                let query = supabase.from(supabaseTable).select(selectCols).eq("id", idStr);
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
              };
              let { data, error } = await runPostgrestWithResilience(buildGetQuery(columns), {
                kind: "read",
                silent: true,
                label: `get.${this.entityName}`,
              });
              if (
                error &&
                isPostgrestSelectSchemaDriftError(error) &&
                (supabaseTable === "invoices" || supabaseTable === "quotes")
              ) {
                const retry = await runPostgrestWithResilience(buildGetQuery("*"), {
                  kind: "read",
                  silent: true,
                  label: `get.${this.entityName}.wildcard`,
                });
                data = retry.data;
                error = retry.error;
              }
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
   * @param {{ limit?: number, offset?: number, maxWaitMs?: number, errorOnEmptyTimeout?: boolean } | number} options - limit/offset object, optional maxWaitMs to avoid hanging, optionally throw when timeout leaves empty cache, or legacy numeric limit.
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
    const errorOnEmptyTimeout = opts.errorOnEmptyTimeout === true;
    const orderColumn = getOrderColumn(sortBy);
    const orderAsc = getOrderAscending(sortBy);

    this._listOptions = limit != null ? { limit, offset, orderBy: { column: orderColumn, ascending: orderAsc } } : {};
    try {
      if (useSessionHealthStore.getState().status === SESSION_STATUS.EXPIRED) {
        return Object.values(this.data);
      }
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
          if (!isAbortError(err) && import.meta.env?.DEV) {
            console.warn(
              `[Paidly][EntityManager] list(${this.entityName}) Supabase pull finished after timeout:`,
              getSupabaseErrorMessage(err, String(err))
            );
          }
        });
        const timedOutWithEmptyCache =
          this.skipLocalPersistence &&
          useSessionHealthStore.getState().status !== SESSION_STATUS.EXPIRED &&
          Object.keys(this.data).length === 0 &&
          shouldLogEntityTimeoutWarning(this.entityName, maxWaitMs);
        if (timedOutWithEmptyCache) {
          if (import.meta.env?.DEV) {
            console.warn(
              `[Paidly][EntityManager] list(${this.entityName}): empty cache after ${maxWaitMs}ms — network slow, failed, or still loading.`
            );
          }
          if (errorOnEmptyTimeout) {
            const timeoutErr = new Error(
              `Timed out loading ${this.entityName} after ${maxWaitMs}ms.`
            );
            timeoutErr.name = "EntityListTimeoutError";
            throw timeoutErr;
          }
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
    assertSessionAuthorityAllowsMutations();
    const requestedUserId = String(userId || "");
    if (!requestedUserId || !isSupabaseAuthUuid(requestedUserId)) {
      throw new Error("Organization setup requires a valid signed-in user (Supabase auth id).");
    }
    if (orgIdCache[requestedUserId]) return orgIdCache[requestedUserId];

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

    if (!sessionUid || !isSupabaseAuthUuid(String(sessionUid))) {
      throw new Error("Organization setup requires the active session user. Sign in again and retry.");
    }

    const effectiveUserId = String(sessionUid);
    if (sessionUid && sessionUid !== requestedUserId) {
      console.warn(
        `[Paidly][EntityManager] ensureUserHasOrganization: session/request user mismatch; using active session user ${sessionUid}.`
      );
      // Never keep cross-user cache aliases when identities differ.
      delete orgIdCache[requestedUserId];
    }

    try {
      let orgId = await fetchPrimaryMembershipOrgId(effectiveUserId);
      if (orgId) {
        orgIdCache[effectiveUserId] = orgId;
        return orgId;
      }

      if (getOrgBootstrapCircuitOpenUntil(effectiveUserId) > Date.now()) {
        throw new Error(
          "Organization bootstrap is cooling down after repeated errors. Please retry in a moment or contact support."
        );
      }

      const { data: sessionForToken } = await getSessionWithRetry();
      if (!sessionForToken?.session?.access_token) {
        throw new Error("Organization setup requires an authenticated session.");
      }

      try {
        await runOrgBootstrapWithLock(effectiveUserId, {
          getExistingOrgId: () => fetchPrimaryMembershipOrgId(effectiveUserId),
        });
      } catch (err) {
        console.warn("[Paidly] Organization bootstrap request failed:", err);
        throw new Error(
          `Failed to set up organization: ${err?.message || err}. Please try again or contact support.`
        );
      }

      orgId = await fetchPrimaryMembershipOrgId(effectiveUserId);
      if (orgId) {
        orgIdCache[effectiveUserId] = orgId;
        return orgId;
      }

      recordOrgBootstrapFailure(effectiveUserId);
      throw new Error(
        "Organization membership missing after server bootstrap. Please refresh the page or contact support."
      );
    } catch (error) {
      console.error('Error in ensureUserHasOrganization:', error);
      throw error;
    }
  }

  async create(data) {
    try {
      assertRuntimeAllowsMutations();
      assertSessionAuthorityAllowsMutations();
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
        'document_brand_primary', 'document_brand_secondary', 'client_operation_id',
      ];
      if (supabaseTable === 'invoices') {
        Object.keys(supabaseData).forEach(key => {
          if (!INVOICE_INSERT_COLUMNS.includes(key)) delete supabaseData[key];
        });
        if (supabaseData.invoice_number != null) {
          supabaseData.invoice_number = String(supabaseData.invoice_number).trim();
        }
        const opId = String(supabaseData.client_operation_id || "").trim();
        if (opId) {
          supabaseData.client_operation_id = opId;
          const { data: existing, error: lookupErr } = await supabase
            .from("invoices")
            .select(getSelectColumns("invoices"))
            .eq("org_id", orgId)
            .eq("client_operation_id", opId)
            .maybeSingle();
          if (lookupErr) {
            console.warn("[EntityManager] invoice idempotency lookup failed:", lookupErr.message);
          } else if (existing?.id) {
            // A prior attempt already inserted this parent row (idempotency hit). If that attempt
            // failed before writing line items, the invoice would otherwise be returned stranded
            // with zero items — heal it by attaching the items now before returning.
            if (Array.isArray(data.items) && data.items.length > 0) {
              const { data: existingItems, error: itemsCheckErr } = await supabase
                .from("invoice_items")
                .select("id")
                .eq("invoice_id", existing.id)
                .limit(1);
              if (!itemsCheckErr && (!existingItems || existingItems.length === 0)) {
                const healRows = buildChildItemRows("invoice_id", existing.id, data.items);
                if (healRows.length > 0) {
                  const { error: healErr } = await supabase.from("invoice_items").insert(healRows);
                  if (healErr) {
                    const healMsg = getSupabaseErrorMessage(healErr, "Insert items failed");
                    console.error("[EntityManager] failed to heal invoice line items:", healMsg);
                    alertSupabaseWriteFailure(healErr, "Heal invoice_items failed");
                    throw new Error(`Failed to attach line items to invoice: ${healMsg}`);
                  }
                }
              }
            }
            return this.mapFromSupabase(existing);
          }
        } else {
          delete supabaseData.client_operation_id;
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
        'org_id', 'user_id', 'employee_user_id', 'payslip_number', 'employee_name', 'employee_id', 'employee_email', 'employee_phone',
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

      // Log for debugging (dev only — payload contains client PII, amounts, and addresses).
      if (import.meta.env.DEV) {
        console.log(`Creating ${this.entityName}:`, { supabaseTable, supabaseData });
      }

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
        
        const itemsToInsert = buildChildItemRows(parentIdField, record.id, data.items);

        if (itemsToInsert.length > 0) {
          const { error: itemsError } = await supabase
            .from(itemsTable)
            .insert(itemsToInsert);

          if (itemsError) {
            const msg = getSupabaseErrorMessage(itemsError, "Create items failed");
            console.error(`Failed to create ${itemsTable}:`, msg);
            alertSupabaseWriteFailure(itemsError, `Create ${itemsTable} failed`);
            // Invoices are created idempotently via the sync queue (client_operation_id). Throwing
            // here lets the job retry and the idempotency guard above re-attach items to the existing
            // parent — preventing both duplicate invoices and invoices stranded with zero line items.
            // Quotes have no idempotency key, so throwing could duplicate the parent on retry; keep
            // them log-only to preserve existing behavior.
            if (supabaseTable === 'invoices') {
              throw new Error(`Failed to save invoice line items: ${msg}`);
            }
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
      assertRuntimeAllowsMutations();
      assertSessionAuthorityAllowsMutations();
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

        // Handle items update.
        // Insert the new set FIRST, then delete the previous rows. This guarantees the document is
        // never left with zero line items if the insert fails (the old delete→insert ordering could
        // wipe every item when the insert errored). Totals live on the parent row, so a failed delete
        // only risks transient duplicate display rows that self-heal on the next save.
        if (itemsToUpdate) {
          const itemsTable = supabaseTable === 'invoices' ? 'invoice_items' : 'quote_items';
          const parentIdField = supabaseTable === 'invoices' ? 'invoice_id' : 'quote_id';

          const { data: existingItems, error: existingItemsError } = await supabase
            .from(itemsTable)
            .select('id')
            .eq(parentIdField, id);
          if (existingItemsError) {
            console.error(`Failed to read existing ${itemsTable}:`, getSupabaseErrorMessage(existingItemsError, "Read items failed"));
          }
          const oldItemIds = Array.isArray(existingItems) ? existingItems.map((r) => r.id) : [];

          const itemsToInsert = buildChildItemRows(parentIdField, id, itemsToUpdate);
          if (itemsToInsert.length > 0) {
            const { error: itemsError } = await supabase
              .from(itemsTable)
              .insert(itemsToInsert);

            if (itemsError) {
              const msg = getSupabaseErrorMessage(itemsError, "Update items failed");
              console.error(`Failed to update ${itemsTable}:`, msg);
              alertSupabaseWriteFailure(itemsError, `Update ${itemsTable} failed`);
              // Old items are still intact — surface the failure instead of silently dropping them.
              throw new Error(`Failed to save line items: ${msg}`);
            }
          }

          if (oldItemIds.length > 0) {
            const { error: deleteItemsError } = await supabase
              .from(itemsTable)
              .delete()
              .in('id', oldItemIds);
            if (deleteItemsError) {
              console.error(`Failed to delete previous ${itemsTable}:`, getSupabaseErrorMessage(deleteItemsError, "Delete items failed"));
              alertSupabaseWriteFailure(deleteItemsError, `Delete ${itemsTable} failed`);
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
    assertRuntimeAllowsMutations();
    assertSessionAuthorityAllowsMutations();
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
