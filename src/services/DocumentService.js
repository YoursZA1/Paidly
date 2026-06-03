import { supabase } from "@/lib/supabaseClient";
import { Invoice } from "@/api/entities";
import { DOCUMENT_TYPES, normalizeDocumentType } from "@/document-engine/documentTypes";
import {
  isCatalogType,
  categoryForType,
  isFinancialType,
  defaultStatusForCatalogType,
  typeLabel,
} from "@/document-engine/documentCatalog";
import { getConversionOptions, usesLegacyQuoteToInvoice } from "@/document-engine/documentConversions";
import { getTemplatePreset } from "@/document-engine/documentTemplatePresets";
import {
  assertTransition,
  INVOICE_STATUSES,
  QUOTE_STATUSES,
  PAYSLIP_STATUSES,
} from "@/document-engine/documentStateMachine";
import { aggregateFromItems } from "@/document-engine/documentTotals";
import { DOCUMENT_EVENT_TYPES, resolveLifecycleEventType } from "@/document-engine/documentEventTypes";
import { getSupabaseErrorMessage, isSupabaseMissingRelationError, isSupabaseMissingColumnError } from "@/utils/supabaseErrorUtils";
import { getExchangeRateForDocument } from "@/lib/exchangeRatesClientPolicy";

const DEFAULT_BASE_CURRENCY = "ZAR";

/** Columns added by the documents hub migration; omitted when DB is still on core schema only. */
const HUB_OPTIONAL_COLUMNS = Object.freeze([
  "category_key",
  "assigned_user_id",
  "archived_at",
  "body",
  "template_id",
]);

function stripHubOptionalColumns(row) {
  const next = { ...row };
  for (const key of HUB_OPTIONAL_COLUMNS) delete next[key];
  return next;
}

/** When `body` column is unavailable, persist prose content inside metadata instead. */
function withBodyFallbackInMetadata(row) {
  if (row.body == null || row.body === "") return row;
  const metadata =
    typeof row.metadata === "object" && row.metadata && !Array.isArray(row.metadata)
      ? { ...row.metadata }
      : {};
  if (metadata.body == null) metadata.body = row.body;
  const next = { ...row, metadata };
  delete next.body;
  return next;
}

function normalizeDocumentRowFromDb(row) {
  if (!row || typeof row !== "object") return row;
  const metadata = typeof row.metadata === "object" && row.metadata ? row.metadata : {};
  if ((row.body == null || row.body === "") && metadata.body) {
    return { ...row, body: metadata.body };
  }
  return row;
}

async function insertDocumentRow(insertRow) {
  let payload = { ...insertRow };
  let { data, error } = await supabase.from("documents").insert(payload).select("*").single();
  if (error && isSupabaseMissingColumnError(error)) {
    payload = stripHubOptionalColumns(withBodyFallbackInMetadata(insertRow));
    ({ data, error } = await supabase.from("documents").insert(payload).select("*").single());
  }
  if (error) throw error;
  return normalizeDocumentRowFromDb(data);
}

async function updateDocumentRow(documentId, orgId, updateRow) {
  let payload = { ...updateRow };
  let { error } = await supabase.from("documents").update(payload).eq("id", documentId).eq("org_id", orgId);
  if (error && isSupabaseMissingColumnError(error)) {
    payload = stripHubOptionalColumns(withBodyFallbackInMetadata(updateRow));
    ({ error } = await supabase.from("documents").update(payload).eq("id", documentId).eq("org_id", orgId));
  }
  if (error) throw error;
}

function throwWithCause(message, cause) {
  const err = new Error(message);
  if (cause != null) err.cause = cause;
  return err;
}

async function getActorContext() {
  const { data: gu, error: guErr } = await supabase.auth.getUser();
  const userId = gu?.user?.id;
  if (guErr || !userId) throw new Error("Not authenticated");
  const orgId = await Invoice.ensureUserHasOrganization(userId);
  return { userId, orgId };
}

function sentStatusForType(type) {
  if (type === DOCUMENT_TYPES.quote) return QUOTE_STATUSES.sent;
  if (type === DOCUMENT_TYPES.payslip) return PAYSLIP_STATUSES.sent;
  return INVOICE_STATUSES.sent;
}

function defaultStatusForType(type) {
  if (type === DOCUMENT_TYPES.quote) return QUOTE_STATUSES.draft;
  if (type === DOCUMENT_TYPES.payslip) return PAYSLIP_STATUSES.draft;
  return INVOICE_STATUSES.draft;
}

/**
 * Resolve a create/payload type to a catalog type key. Catalog types (the full business-hub set)
 * are used verbatim; legacy aliases (`invoices`/`quotes`/`payslips`) fall back to the 3-type
 * normalizer so existing call sites keep working.
 */
function resolveCatalogType(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (isCatalogType(s)) return s;
  return normalizeDocumentType(raw);
}

function normalizeCurrencyCode(raw, fallback = DEFAULT_BASE_CURRENCY) {
  const c = String(raw || fallback)
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : fallback;
}

function asPositiveNumber(raw, fallback = 1) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

async function fetchExchangeRate({ documentCurrency, baseCurrency }) {
  const docCurrency = normalizeCurrencyCode(documentCurrency, DEFAULT_BASE_CURRENCY);
  const base = normalizeCurrencyCode(baseCurrency, DEFAULT_BASE_CURRENCY);
  if (docCurrency === base) return 1;

  const rate = await getExchangeRateForDocument(docCurrency, base);
  if (rate <= 0) {
    throw new Error(`No exchange rate returned for ${docCurrency}->${base}`);
  }
  return rate;
}

function isSettledPayment(payment) {
  const s = String(payment?.status || "")
    .trim()
    .toLowerCase();
  if (s === "paid" || s === "settled") return true;
  // Backward-compatible fallback for legacy rows that only track paid_at.
  if (payment?.paid_at) return true;
  return false;
}

function sortDocumentEventsNewestFirst(events) {
  return Array.isArray(events)
    ? [...events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    : [];
}

function sortDocumentItemsByOrder(items) {
  return Array.isArray(items) ? [...items].sort((a, b) => (a.line_order ?? 0) - (b.line_order ?? 0)) : [];
}

function buildLifecycleSummary(status, events) {
  const terminalStatuses = new Set(["paid", "accepted", "converted", "cancelled", "rejected", "expired"]);
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const phase = terminalStatuses.has(normalizedStatus) ? "closed" : "active";
  return {
    status: normalizedStatus || "unknown",
    phase,
    hasActivity: Array.isArray(events) && events.length > 0,
    lastActivityAt: Array.isArray(events) && events.length > 0 ? events[0]?.created_at || null : null,
    eventCount: Array.isArray(events) ? events.length : 0,
  };
}

function buildTotalsFromDocument(doc) {
  const subtotal = Number(doc?.subtotal || 0);
  const taxAmount = Number(doc?.tax_amount || 0);
  const discountAmount = Number(doc?.discount_amount || 0);
  const totalAmount = Number(doc?.total_amount || 0);
  const exchangeRate = asPositiveNumber(doc?.exchange_rate, 1);
  return {
    subtotal,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    exchange_rate: exchangeRate,
    currency: doc?.currency || DEFAULT_BASE_CURRENCY,
    base_currency: doc?.base_currency || DEFAULT_BASE_CURRENCY,
    subtotal_base_amount: Math.round(subtotal * exchangeRate * 100) / 100,
    tax_base_amount: Math.round(taxAmount * exchangeRate * 100) / 100,
    discount_base_amount: Math.round(discountAmount * exchangeRate * 100) / 100,
    total_base_amount: Math.round(totalAmount * exchangeRate * 100) / 100,
  };
}

async function hydrateFullDocumentData(doc, service, options = {}) {
  if (!doc) return null;
  const includePaymentSummary = options.includePaymentSummary !== false;
  const items = sortDocumentItemsByOrder(doc.document_items);
  const events = sortDocumentEventsNewestFirst(doc.document_events);
  const totals = buildTotalsFromDocument(doc);
  const lifecycle = buildLifecycleSummary(doc.status, events);
  const paymentSummary =
    includePaymentSummary && doc.type === DOCUMENT_TYPES.invoice
      ? await service.getPaymentSummary(doc.id, doc.total_amount)
      : null;
  return {
    ...doc,
    document_items: items,
    document_events: events,
    totals,
    lifecycle,
    activity_log: events,
    payment_summary: paymentSummary,
  };
}

async function insertDocumentEvent({ orgId, documentId, userId, eventType, payload }) {
  const { error } = await supabase.from("document_events").insert({
    org_id: orgId,
    document_id: documentId,
    actor_user_id: userId,
    event_type: eventType,
    payload: payload && typeof payload === "object" ? payload : {},
  });
  if (error) {
    throw throwWithCause(getSupabaseErrorMessage(error, "Failed to log document event"), error);
  }
}

/** View events must not block the UI if logging fails (RLS, offline, etc.). */
async function insertDocumentEventBestEffort({ orgId, documentId, userId, eventType, payload }) {
  try {
    await insertDocumentEvent({ orgId, documentId, userId, eventType, payload });
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[DocumentService] document_events (best-effort):", e?.message || e);
    }
  }
}

/**
 * @param {string} orgId
 * @param {string} quoteDocumentId
 * @returns {Promise<string | null>} Invoice id if one already exists for this quote.
 */
async function findInvoiceIdBySourceQuoteId(orgId, quoteDocumentId) {
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", DOCUMENT_TYPES.invoice)
    .eq("source_quote_id", quoteDocumentId)
    .maybeSingle();
  if (error) {
    throw throwWithCause(getSupabaseErrorMessage(error, "Failed to look up invoice by source quote"), error);
  }
  return data?.id ?? null;
}

async function replaceDocumentItems(documentId, rows) {
  const { error: delErr } = await supabase.from("document_items").delete().eq("document_id", documentId);
  if (delErr) {
    throw throwWithCause(getSupabaseErrorMessage(delErr, "Failed to clear document line items"), delErr);
  }
  if (!rows.length) return;
  const insertPayload = rows.map((r) => ({
    document_id: documentId,
    line_order: r.line_order,
    description: r.description,
    quantity: r.quantity,
    unit_price: r.unit_price,
    total_price: r.total_price,
    metadata: r.metadata,
  }));
  const { error: insErr } = await supabase.from("document_items").insert(insertPayload);
  if (insErr) {
    throw throwWithCause(getSupabaseErrorMessage(insErr, "Failed to save document line items"), insErr);
  }
}

/** Applies hub list filters (type/category/status/search/assignee/archived) to a documents query. */
function applyHubFilters(q, { type, category, status, search, assignedUserId, includeArchived } = {}) {
  if (type && type !== "all") q = q.eq("type", type);
  if (category && category !== "all") q = q.eq("category_key", category);
  if (status === "archived") {
    q = q.not("archived_at", "is", null);
  } else {
    if (status && status !== "all") q = q.eq("status", status);
    if (!includeArchived) q = q.is("archived_at", null);
  }
  if (assignedUserId && assignedUserId !== "all") q = q.eq("assigned_user_id", assignedUserId);
  const term = String(search || "").trim();
  if (term) {
    const safe = term.replace(/[%,()]/g, " ");
    q = q.or(`document_number.ilike.%${safe}%,title.ilike.%${safe}%`);
  }
  return q;
}

/** Applies the hub sort option to a documents query. */
function applyHubSort(q, sort) {
  switch (sort) {
    case "oldest":
      return q.order("created_at", { ascending: true });
    case "updated":
      return q.order("updated_at", { ascending: false });
    case "value":
      return q.order("total_amount", { ascending: false });
    case "alpha":
      return q.order("title", { ascending: true, nullsFirst: false });
    case "newest":
    default:
      return q.order("created_at", { ascending: false });
  }
}

/**
 * Unified document persistence (Supabase `documents` + `document_items` + `document_events`).
 * Legacy `invoices` / `quotes` / `payslips` rows are unchanged; this is the v2 document store.
 */
export const DocumentService = {
  /**
   * Returns the unified invoice id for this quote, if one was already converted (same org).
   * @param {string} quoteDocumentId
   * @returns {Promise<string | null>}
   */
  async findInvoiceBySourceQuoteId(quoteDocumentId) {
    const { orgId } = await getActorContext();
    return findInvoiceIdBySourceQuoteId(orgId, quoteDocumentId);
  },

  /**
   * Records that the current user opened the document (action: `viewed`), for lifecycle analytics.
   * Best-effort: failures are swallowed so the page still works.
   * @param {string} documentId
   * @param {{ surface?: string, meta?: Record<string, unknown> }} [options]
   */
  async recordView(documentId, options = {}) {
    try {
      const { userId, orgId } = await getActorContext();
      const surface = options.surface || "document_detail";
      const meta = options.meta && typeof options.meta === "object" ? options.meta : {};
      await insertDocumentEventBestEffort({
        orgId,
        documentId,
        userId,
        eventType: DOCUMENT_EVENT_TYPES.viewed,
        payload: { surface, ...meta },
      });
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[DocumentService] recordView:", e?.message || e);
      }
    }
  },

  /**
   * Payments must be anchored to a specific document id (not client slicing) for exact totals/state.
   * @param {string} documentId
   */
  async listPaymentsForDocument(documentId) {
    const { orgId } = await getActorContext();
    const { data, error } = await supabase
      .from("payments")
      .select("id, org_id, document_id, amount, currency, exchange_rate, status, paid_at, method, reference, notes, created_at")
      .eq("document_id", documentId)
      .eq("org_id", orgId)
      .order("paid_at", { ascending: false, nullsFirst: false });
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to load payments for document"), error);
    }
    return Array.isArray(data) ? data : [];
  },

  /**
   * Computes invoice payment state from payment actions, not from document.updated_at/status.
   * @param {string} documentId
   * @param {number|string} totalAmount
   */
  async getPaymentSummary(documentId, totalAmount) {
    const payments = await this.listPaymentsForDocument(documentId);
    const settledPayments = payments.filter(isSettledPayment);
    const paid = settledPayments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
    const total = Number(totalAmount) || 0;
    const balance = Math.max(total - paid, 0);
    const status = paid <= 0 ? "unpaid" : paid < total ? "partial" : "paid";
    return {
      payments,
      settledPayments,
      paid,
      total,
      balance,
      status,
      count: settledPayments.length,
    };
  },

  async list({ type, status, limit = 100 } = {}) {
    const { orgId } = await getActorContext();
    let q = supabase
      .from("documents")
      .select(
        "id, org_id, type, status, document_number, title, total_amount, currency, base_currency, exchange_rate, client_id, source_quote_id, created_at, updated_at"
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 500));
    if (type && type !== "all") {
      q = q.eq("type", normalizeDocumentType(type));
    }
    if (status && status !== "all") {
      q = q.eq("status", status);
    }
    const { data, error } = await q;
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to list documents"), error);
    }
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => {
      const exchangeRate = asPositiveNumber(row?.exchange_rate, 1);
      const totalBaseAmount = Number(row?.total_amount || 0) * exchangeRate;
      return {
        ...row,
        exchange_rate: exchangeRate,
        total_base_amount: Math.round(totalBaseAmount * 100) / 100,
      };
    });
  },

  /**
   * Paged, filtered, sorted list for the Documents hub table. Returns light rows (no items/events)
   * plus the total count for pagination. Embeds the client name for the table.
   * @param {{ type?: string, category?: string, status?: string, search?: string,
   *   assignedUserId?: string, sort?: string, limit?: number, offset?: number,
   *   includeArchived?: boolean }} [params]
   */
  async listPage(params = {}) {
    const { orgId } = await getActorContext();
    const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 100);
    const offset = Math.max(Number(params.offset) || 0, 0);
    const hubSelect =
      "id, org_id, type, category_key, status, document_number, title, total_amount, currency, base_currency, exchange_rate, client_id, assigned_user_id, archived_at, created_at, updated_at, client:clients ( id, name )";
    const coreSelect =
      "id, org_id, type, status, document_number, title, total_amount, currency, base_currency, exchange_rate, client_id, created_at, updated_at, client:clients ( id, name )";

    const runQuery = (selectFields, useHubFilters) => {
      let q = supabase.from("documents").select(selectFields, { count: "exact" }).eq("org_id", orgId);
      if (useHubFilters) {
        q = applyHubFilters(q, params);
      } else {
        if (params.type && params.type !== "all") q = q.eq("type", params.type);
        if (params.status && params.status !== "all" && params.status !== "archived") {
          q = q.eq("status", params.status);
        }
        const term = String(params.search || "").trim();
        if (term) {
          const safe = term.replace(/[%,()]/g, " ");
          q = q.or(`document_number.ilike.%${safe}%,title.ilike.%${safe}%`);
        }
      }
      q = applyHubSort(q, params.sort);
      return q.range(offset, offset + limit - 1);
    };

    let result = await runQuery(hubSelect, true);
    if (result.error && isSupabaseMissingColumnError(result.error)) {
      result = await runQuery(coreSelect, false);
    }
    const { data, error, count } = result;
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to list documents"), error);
    }
    const rows = (Array.isArray(data) ? data : []).map((row) => {
      const exchangeRate = asPositiveNumber(row?.exchange_rate, 1);
      return {
        ...normalizeDocumentRowFromDb(row),
        client_name: row?.client?.name || null,
        exchange_rate: exchangeRate,
        total_base_amount: Math.round(Number(row?.total_amount || 0) * exchangeRate * 100) / 100,
      };
    });
    return { rows, total: Number(count || 0), limit, offset };
  },

  /**
   * Dashboard KPI counts for the hub. Each is a `head` count query (no rows transferred).
   * "pending" = pending approval, "signed" = e-signed, "archived" = archived_at set.
   */
  async getKpis() {
    const { orgId } = await getActorContext();
    const base = () =>
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("org_id", orgId);

    const runHubKpis = async () => {
      const [total, drafts, pending, sent, signed, archived] = await Promise.all([
        base().is("archived_at", null),
        base().is("archived_at", null).eq("status", "draft"),
        base().is("archived_at", null).eq("status", "pending"),
        base().is("archived_at", null).eq("status", "sent"),
        base().is("archived_at", null).eq("status", "signed"),
        base().not("archived_at", "is", null),
      ]);
      for (const r of [total, drafts, pending, sent, signed, archived]) {
        if (r?.error) throw r.error;
      }
      const num = (r) => Number(r?.count || 0);
      return {
        total: num(total),
        drafts: num(drafts),
        pending: num(pending),
        sent: num(sent),
        signed: num(signed),
        archived: num(archived),
      };
    };

    const runCoreKpis = async () => {
      const [total, drafts, pending, sent, signed] = await Promise.all([
        base(),
        base().eq("status", "draft"),
        base().eq("status", "pending"),
        base().eq("status", "sent"),
        base().eq("status", "signed"),
      ]);
      for (const r of [total, drafts, pending, sent, signed]) {
        if (r?.error) throw r.error;
      }
      const num = (r) => Number(r?.count || 0);
      return {
        total: num(total),
        drafts: num(drafts),
        pending: num(pending),
        sent: num(sent),
        signed: num(signed),
        archived: 0,
      };
    };

    try {
      return await runHubKpis();
    } catch (e) {
      if (isSupabaseMissingColumnError(e)) {
        return runCoreKpis();
      }
      throw throwWithCause(getSupabaseErrorMessage(e, "Failed to load document stats"), e);
    }
  },

  async get(documentId) {
    const { orgId } = await getActorContext();
    const { data, error } = await supabase
      .from("documents")
      .select(
        `
        *,
        document_items (*),
        document_events (*)
      `
      )
      .eq("id", documentId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to load document"), error);
    }
    if (!data) return null;
    const events = sortDocumentEventsNewestFirst(data.document_events);
    const items = sortDocumentItemsByOrder(data.document_items);
    const { document_events: _e, document_items: _i, ...doc } = data;
    return normalizeDocumentRowFromDb({ ...doc, document_items: items, document_events: events });
  },

  /**
   * Canonical full payload for a single document detail view.
   * Includes line items, totals, lifecycle summary, and activity log for all document types.
   * @param {string} documentId
   * @param {{ includePaymentSummary?: boolean }} [options]
   */
  async getFull(documentId, options = {}) {
    const doc = await this.get(documentId);
    return hydrateFullDocumentData(doc, this, options);
  },

  /**
   * Loads a page of documents and fully hydrates each row (items, totals, lifecycle, activity).
   * Keep this for admin/reporting or migration surfaces; default table screens should still use `list()`.
   * @param {{ type?: string, status?: string, limit?: number, includePaymentSummary?: boolean }} params
   */
  async listFull(params = {}) {
    const { includePaymentSummary = false, ...listParams } = params;
    const rows = await this.list(listParams);
    if (!rows.length) return [];
    const docs = await Promise.all(
      rows.map((row) =>
        this.getFull(row.id, {
          includePaymentSummary,
        })
      )
    );
    return docs.filter(Boolean);
  },

  async create(payload) {
    const { userId, orgId } = await getActorContext();
    const type = resolveCatalogType(payload?.type);
    const defaultStatus = defaultStatusForCatalogType(type);
    const requested = payload?.status != null ? String(payload.status) : defaultStatus;
    if (requested !== defaultStatus) {
      throw new Error("New documents must be created in draft status.");
    }
    const status = defaultStatus;
    const source_quote_id = payload?.source_quote_id ?? null;
    const currency = normalizeCurrencyCode(payload?.currency, DEFAULT_BASE_CURRENCY);
    const baseCurrency = normalizeCurrencyCode(payload?.base_currency, DEFAULT_BASE_CURRENCY);
    if (source_quote_id) {
      if (type !== DOCUMENT_TYPES.invoice) {
        throw new Error("source_quote_id can only be set when creating an invoice.");
      }
      const { data: srcQuote, error: srcErr } = await supabase
        .from("documents")
        .select("id, type")
        .eq("id", source_quote_id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (srcErr) {
        throw throwWithCause(getSupabaseErrorMessage(srcErr, "Could not verify source quote"), srcErr);
      }
      if (!srcQuote || srcQuote.type !== DOCUMENT_TYPES.quote) {
        throw new Error("source_quote_id must reference an existing quote document in your organization.");
      }
      const existingInvoiceId = await findInvoiceIdBySourceQuoteId(orgId, source_quote_id);
      if (existingInvoiceId) {
        throw new Error(
          "An invoice already exists for this quote (duplicate conversion). Open the existing invoice from the documents list."
        );
      }
    }
    const tax_rate = Number(payload?.tax_rate ?? 0);
    const discount_amount = Number(payload?.discount_amount ?? 0);
    let exchangeRate = asPositiveNumber(payload?.exchange_rate, 0);
    if (exchangeRate <= 0) {
      exchangeRate = await fetchExchangeRate({
        documentCurrency: currency,
        baseCurrency: baseCurrency,
      });
    }
    // Only financial types (invoice, quote, PO, …) carry line items + monetary totals. Prose docs
    // (contracts, briefs, reports, …) persist their content in `body` + attachments instead.
    const financial = isFinancialType(type);
    const { rows, subtotal, tax_amount, total_amount } = financial
      ? aggregateFromItems(payload?.items, tax_rate, discount_amount)
      : { rows: [], subtotal: 0, tax_amount: 0, total_amount: 0 };

    const insertRow = {
      org_id: orgId,
      type,
      category_key: categoryForType(type),
      assigned_user_id: payload?.assigned_user_id || null,
      body: payload?.body ?? null,
      status,
      client_id: payload?.client_id || null,
      document_number: payload?.document_number || null,
      title: payload?.title ?? null,
      issue_date: payload?.issue_date ?? null,
      due_date: payload?.due_date ?? null,
      valid_until: payload?.valid_until ?? null,
      subtotal,
      tax_rate,
      tax_amount,
      discount_amount,
      total_amount,
      currency,
      base_currency: baseCurrency,
      exchange_rate: exchangeRate,
      metadata: payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
      public_share_token: payload?.public_share_token ?? null,
      source_document_id: payload?.source_document_id ?? null,
      source_quote_id,
      template_id: payload?.template_id ?? null,
      created_by: userId,
      user_id: userId,
    };

    const { data: doc, error } = await (async () => {
      try {
        const row = await insertDocumentRow(insertRow);
        return { data: row, error: null };
      } catch (e) {
        return { data: null, error: e };
      }
    })();
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to create document"), error);
    }
    await replaceDocumentItems(doc.id, rows);
    await insertDocumentEvent({
      orgId,
      documentId: doc.id,
      userId,
      eventType: DOCUMENT_EVENT_TYPES.created,
      payload: {
        type,
        status,
        title: doc.title,
        currency,
        base_currency: baseCurrency,
        exchange_rate: exchangeRate,
        ...(doc.source_quote_id ? { source_quote_id: doc.source_quote_id } : {}),
      },
    });
    return this.get(doc.id);
  },

  /**
   * Patch header fields and optionally replace all line items.
   * @param {string} documentId
   * @param {Record<string, unknown>} patch
   */
  async update(documentId, patch = {}) {
    const { userId, orgId } = await getActorContext();
    const existing = await this.get(documentId);
    if (!existing) throw new Error("Document not found");

    const nextStatus = patch.status != null ? String(patch.status) : existing.status;
    if (nextStatus !== existing.status) {
      assertTransition(existing.type, existing.status, nextStatus);
    }

    if (existing.type === DOCUMENT_TYPES.invoice && existing.source_quote_id != null) {
      if (patch.source_quote_id !== undefined && patch.source_quote_id !== existing.source_quote_id) {
        throw new Error("source_quote_id cannot be changed: it records which quote this invoice was converted from.");
      }
    }
    if (patch.currency !== undefined && normalizeCurrencyCode(patch.currency, existing.currency) !== normalizeCurrencyCode(existing.currency, existing.currency)) {
      throw new Error("Currency cannot be changed after creation. Create a new document for a different currency.");
    }
    if (patch.base_currency !== undefined && normalizeCurrencyCode(patch.base_currency, existing.base_currency || DEFAULT_BASE_CURRENCY) !== normalizeCurrencyCode(existing.base_currency || DEFAULT_BASE_CURRENCY, DEFAULT_BASE_CURRENCY)) {
      throw new Error("base_currency cannot be changed after creation.");
    }
    if (patch.exchange_rate !== undefined && Number(patch.exchange_rate) !== Number(existing.exchange_rate)) {
      throw new Error("exchange_rate is immutable after creation.");
    }

    const tax_rate = patch.tax_rate != null ? Number(patch.tax_rate) : Number(existing.tax_rate ?? 0);
    const discount_amount =
      patch.discount_amount != null ? Number(patch.discount_amount) : Number(existing.discount_amount ?? 0);

    const itemsForAgg = Array.isArray(patch.items)
      ? patch.items
      : patch.tax_rate != null || patch.discount_amount != null
        ? (existing.document_items || []).map((row) => ({
            description: row.description,
            quantity: row.quantity,
            unit_price: row.unit_price,
            total_price: row.total_price,
            line_order: row.line_order,
            metadata: row.metadata,
          }))
        : null;

    const rowsToPersist = Array.isArray(patch.items)
      ? aggregateFromItems(patch.items, tax_rate, discount_amount).rows
      : null;

    const financial = isFinancialType(existing.type);
    const { subtotal, tax_amount, total_amount } =
      itemsForAgg != null
        ? aggregateFromItems(itemsForAgg, tax_rate, discount_amount)
        : financial
          ? {
              subtotal: Number(existing.subtotal),
              tax_amount: Number(existing.tax_amount),
              total_amount: Number(existing.total_amount),
            }
          : { subtotal: 0, tax_amount: 0, total_amount: 0 };

    const updateRow = {
      client_id: patch.client_id !== undefined ? patch.client_id : existing.client_id,
      assigned_user_id: patch.assigned_user_id !== undefined ? patch.assigned_user_id : existing.assigned_user_id,
      body: patch.body !== undefined ? patch.body : existing.body,
      document_number: patch.document_number !== undefined ? patch.document_number : existing.document_number,
      title: patch.title !== undefined ? patch.title : existing.title,
      issue_date: patch.issue_date !== undefined ? patch.issue_date : existing.issue_date,
      due_date: patch.due_date !== undefined ? patch.due_date : existing.due_date,
      valid_until: patch.valid_until !== undefined ? patch.valid_until : existing.valid_until,
      subtotal,
      tax_rate,
      tax_amount,
      discount_amount,
      total_amount,
      currency: existing.currency,
      base_currency: existing.base_currency || DEFAULT_BASE_CURRENCY,
      exchange_rate: asPositiveNumber(existing.exchange_rate, 1),
      metadata:
        patch.metadata !== undefined
          ? typeof patch.metadata === "object" && patch.metadata
            ? patch.metadata
            : {}
          : existing.metadata,
      source_document_id:
        patch.source_document_id !== undefined ? patch.source_document_id : existing.source_document_id,
      source_quote_id: patch.source_quote_id !== undefined ? patch.source_quote_id : existing.source_quote_id,
      status: nextStatus,
    };

    try {
      await updateDocumentRow(documentId, orgId, updateRow);
    } catch (e) {
      throw throwWithCause(getSupabaseErrorMessage(e, "Failed to update document"), e);
    }
    if (rowsToPersist) {
      await replaceDocumentItems(documentId, rowsToPersist);
    }

    const patchKeys = Object.keys(patch || {});
    const nonStatusKeys = patchKeys.filter((k) => k !== "status");
    const statusChanged = nextStatus !== existing.status;

    let eventType = DOCUMENT_EVENT_TYPES.updated;
    let eventPayload = /** @type {Record<string, unknown>} */ ({ keys: patchKeys });

    if (statusChanged) {
      eventType = resolveLifecycleEventType(existing.type, existing.status, nextStatus);
      eventPayload = {
        action: eventType,
        from_status: existing.status,
        to_status: nextStatus,
        ...(nonStatusKeys.length ? { changed_fields: nonStatusKeys } : {}),
      };
    }

    await insertDocumentEvent({
      orgId,
      documentId,
      userId,
      eventType,
      payload: eventPayload,
    });
    return this.get(documentId);
  },

  /**
   * Marks the document as sent and records the action in `document_events`.
   * Option A (current): no separate `document_sends` table for unified docs.
   * We keep delivery metadata in event payload until multi-recipient / resend / delivery-state is needed.
   *
   * @param {string} documentId
   * @param {{ channel?: string, recipient?: string|null }} [options]
   */
  async send(documentId, options = {}) {
    const { userId, orgId } = await getActorContext();
    const existing = await this.get(documentId);
    if (!existing) throw new Error("Document not found");
    const next = sentStatusForType(existing.type);
    assertTransition(existing.type, existing.status, next);
    const { error } = await supabase
      .from("documents")
      .update({ status: next })
      .eq("id", documentId)
      .eq("org_id", orgId);
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to send document"), error);
    }
    await insertDocumentEvent({
      orgId,
      documentId,
      userId,
      eventType: DOCUMENT_EVENT_TYPES.sent,
      payload: {
        action: DOCUMENT_EVENT_TYPES.sent,
        channel: options.channel || "manual",
        recipient: options.recipient || null,
        from_status: existing.status,
        to_status: next,
      },
    });
    return this.get(documentId);
  },

  /**
   * Creates a draft invoice from an accepted quote document and marks the quote `converted`.
   * @param {string} quoteDocumentId
   */
  async convertToInvoice(quoteDocumentId) {
    const { userId, orgId } = await getActorContext();
    const quote = await this.get(quoteDocumentId);
    if (!quote) throw new Error("Quote document not found");
    if (quote.type !== DOCUMENT_TYPES.quote) {
      throw new Error("convertToInvoice requires a quote document");
    }
    if (quote.status !== QUOTE_STATUSES.accepted) {
      throw new Error(`Quote must be accepted before conversion (current: ${quote.status})`);
    }

    const existingInvoiceId = await findInvoiceIdBySourceQuoteId(orgId, quote.id);
    if (existingInvoiceId) {
      throw new Error(
        "This quote has already been converted to an invoice. Open that invoice from the documents list, or contact support if you need a duplicate."
      );
    }

    const items = (quote.document_items || []).map((row) => ({
      description: row.description,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total_price: row.total_price,
      line_order: row.line_order,
      metadata: row.metadata,
    }));

    let invoice;
    try {
      // Conversion = new draft invoice + canonical quote FK (see unique index on source_quote_id).
      // Equivalent: await DocumentService.create({ type: "invoice", source_quote_id: quote.id, ... })
      invoice = await this.create({
        type: DOCUMENT_TYPES.invoice,
        source_quote_id: quote.id,
        client_id: quote.client_id,
        title: quote.title ? `Invoice — ${quote.title}` : null,
        currency: quote.currency,
        base_currency: quote.base_currency || DEFAULT_BASE_CURRENCY,
        exchange_rate: asPositiveNumber(quote.exchange_rate, 1),
        tax_rate: quote.tax_rate,
        discount_amount: quote.discount_amount,
        issue_date: quote.issue_date,
        due_date: quote.due_date,
        metadata: {
          ...(typeof quote.metadata === "object" && quote.metadata ? quote.metadata : {}),
          converted_from_document_id: quote.id,
        },
        source_document_id: quote.id,
        items,
      });
    } catch (e) {
      const code = e?.cause?.code ?? e?.code;
      const msg = String(e?.message ?? "");
      if (code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
        throw new Error(
          "This quote already has a converted invoice. Open it from the documents list, or contact support if the quote status looks wrong."
        );
      }
      throw e;
    }

    assertTransition(DOCUMENT_TYPES.quote, quote.status, QUOTE_STATUSES.converted);
    const { error: qErr } = await supabase
      .from("documents")
      .update({ status: QUOTE_STATUSES.converted })
      .eq("id", quoteDocumentId)
      .eq("org_id", orgId);
    if (qErr) {
      throw throwWithCause(getSupabaseErrorMessage(qErr, "Failed to mark quote as converted"), qErr);
    }
    await insertDocumentEvent({
      orgId,
      documentId: quote.id,
      userId,
      eventType: DOCUMENT_EVENT_TYPES.converted,
      payload: {
        action: DOCUMENT_EVENT_TYPES.converted,
        new_invoice_document_id: invoice.id,
        source_quote_id: quote.id,
      },
    });
    await insertDocumentEvent({
      orgId,
      documentId: invoice.id,
      userId,
      eventType: DOCUMENT_EVENT_TYPES.created_from_quote,
      payload: {
        action: DOCUMENT_EVENT_TYPES.created_from_quote,
        source_quote_id: quote.id,
      },
    });
    return { invoice, quote: await this.get(quoteDocumentId) };
  },

  /** Soft-archive a document (sets archived_at; keeps the row and its history). */
  async archive(documentId) {
    const { userId, orgId } = await getActorContext();
    const { data, error } = await supabase
      .from("documents")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", documentId)
      .eq("org_id", orgId)
      .select("id")
      .maybeSingle();
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to archive document"), error);
    }
    await insertDocumentEventBestEffort({ orgId, documentId, userId, eventType: "archived", payload: {} });
    return data;
  },

  /** Restore an archived document. */
  async unarchive(documentId) {
    const { userId, orgId } = await getActorContext();
    const { data, error } = await supabase
      .from("documents")
      .update({ archived_at: null })
      .eq("id", documentId)
      .eq("org_id", orgId)
      .select("id")
      .maybeSingle();
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to restore document"), error);
    }
    await insertDocumentEventBestEffort({ orgId, documentId, userId, eventType: "unarchived", payload: {} });
    return data;
  },

  /** Permanently delete a document (cascades to items, events, attachments, comments, links). */
  async remove(documentId) {
    const { orgId } = await getActorContext();
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("org_id", orgId);
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to delete document"), error);
    }
    return true;
  },

  /** Create a draft copy of a document (header + line items), in the same type. */
  async duplicate(documentId) {
    const src = await this.get(documentId);
    if (!src) throw new Error("Document not found");
    return this.create({
      type: src.type,
      title: src.title ? `${src.title} (copy)` : null,
      client_id: src.client_id,
      currency: src.currency,
      base_currency: src.base_currency,
      exchange_rate: asPositiveNumber(src.exchange_rate, 1),
      tax_rate: src.tax_rate,
      discount_amount: src.discount_amount,
      body: src.body,
      assigned_user_id: src.assigned_user_id,
      metadata: typeof src.metadata === "object" && src.metadata ? src.metadata : {},
      items: (src.document_items || []).map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        metadata: it.metadata,
      })),
    });
  },

  /**
   * Full detail payload for the document hub detail page: document + client + attachments +
   * comments + linked documents.
   * @param {string} documentId
   */
  async getDetail(documentId) {
    const full = await this.getFull(documentId);
    if (!full) return null;
    const { orgId } = await getActorContext();
    const [clientRes, attachments, comments, linkedDocuments] = await Promise.all([
      full.client_id
        ? supabase.from("clients").select("id, name, email, company").eq("id", full.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      this.listAttachments(documentId),
      this.listComments(documentId),
      this.listLinkedDocuments(documentId),
    ]);
    return {
      ...full,
      client: clientRes?.data || null,
      document_attachments: attachments,
      document_comments: comments,
      linked_documents: linkedDocuments,
    };
  },

  async listLinkedDocuments(documentId) {
    const { orgId } = await getActorContext();
    const { data: links, error } = await supabase
      .from("document_links")
      .select("id, from_document_id, to_document_id, relation, created_at")
      .eq("org_id", orgId)
      .or(`from_document_id.eq.${documentId},to_document_id.eq.${documentId}`);
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to load linked documents"), error);
    const rows = Array.isArray(links) ? links : [];
    if (!rows.length) return [];
    const relatedIds = new Set();
    for (const l of rows) {
      if (l.from_document_id !== documentId) relatedIds.add(l.from_document_id);
      if (l.to_document_id !== documentId) relatedIds.add(l.to_document_id);
    }
    const { data: docs, error: docErr } = await supabase
      .from("documents")
      .select("id, type, title, document_number, status")
      .in("id", [...relatedIds]);
    if (docErr) throw throwWithCause(getSupabaseErrorMessage(docErr, "Failed to load linked document details"), docErr);
    const byId = new Map((docs || []).map((d) => [d.id, d]));
    return rows.map((l) => {
      const otherId = l.from_document_id === documentId ? l.to_document_id : l.from_document_id;
      return {
        link_id: l.id,
        relation: l.relation,
        created_at: l.created_at,
        direction: l.from_document_id === documentId ? "out" : "in",
        document: byId.get(otherId) || { id: otherId },
      };
    });
  },

  async listAttachments(documentId) {
    const { orgId } = await getActorContext();
    const { data, error } = await supabase
      .from("document_attachments")
      .select("id, file_name, file_url, mime_type, size_bytes, uploaded_by, created_at")
      .eq("document_id", documentId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to load attachments"), error);
    return Array.isArray(data) ? data : [];
  },

  async addAttachment(documentId, { file_name, file_url, mime_type, size_bytes }) {
    const { userId, orgId } = await getActorContext();
    const name = String(file_name || "").trim();
    const url = String(file_url || "").trim();
    if (!name || !url) throw new Error("Attachment name and URL are required.");
    const { data, error } = await supabase
      .from("document_attachments")
      .insert({
        org_id: orgId,
        document_id: documentId,
        file_name: name,
        file_url: url,
        mime_type: mime_type || null,
        size_bytes: size_bytes != null ? Number(size_bytes) : null,
        uploaded_by: userId,
      })
      .select("*")
      .single();
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to add attachment"), error);
    await insertDocumentEventBestEffort({
      orgId,
      documentId,
      userId,
      eventType: "attachment_added",
      payload: { file_name: name },
    });
    return data;
  },

  async removeAttachment(attachmentId) {
    const { orgId } = await getActorContext();
    const { error } = await supabase
      .from("document_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("org_id", orgId);
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to remove attachment"), error);
    return true;
  },

  async listComments(documentId) {
    const { orgId } = await getActorContext();
    const { data, error } = await supabase
      .from("document_comments")
      .select("id, body, author_user_id, created_at, updated_at")
      .eq("document_id", documentId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to load comments"), error);
    return Array.isArray(data) ? data : [];
  },

  async addComment(documentId, body) {
    const { userId, orgId } = await getActorContext();
    const text = String(body || "").trim();
    if (!text) throw new Error("Comment cannot be empty.");
    const { data, error } = await supabase
      .from("document_comments")
      .insert({
        org_id: orgId,
        document_id: documentId,
        author_user_id: userId,
        body: text,
      })
      .select("*")
      .single();
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to add comment"), error);
    await insertDocumentEventBestEffort({
      orgId,
      documentId,
      userId,
      eventType: "comment_added",
      payload: { preview: text.slice(0, 120) },
    });
    return data;
  },

  async removeComment(commentId) {
    const { orgId } = await getActorContext();
    const { error } = await supabase
      .from("document_comments")
      .delete()
      .eq("id", commentId)
      .eq("org_id", orgId);
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to remove comment"), error);
    return true;
  },

  async linkDocuments(fromDocumentId, toDocumentId, relation = "linked") {
    const { userId, orgId } = await getActorContext();
    const { data, error } = await supabase
      .from("document_links")
      .insert({
        org_id: orgId,
        from_document_id: fromDocumentId,
        to_document_id: toDocumentId,
        relation,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to link documents"), error);
    return data;
  },

  /**
   * Generalized one-click conversion. Quote→invoice delegates to `convertToInvoice` when accepted.
   * @param {string} sourceDocumentId
   * @param {string} targetType
   * @param {{ relation?: string }} [options]
   */
  async convertDocument(sourceDocumentId, targetType, options = {}) {
    const source = await this.get(sourceDocumentId);
    if (!source) throw new Error("Source document not found");

    const allowed = getConversionOptions(source.type);
    const match = allowed.find((o) => o.targetType === targetType);
    if (!match) {
      throw new Error(`Cannot convert ${source.type} to ${targetType}.`);
    }

    if (usesLegacyQuoteToInvoice(source.type, targetType)) {
      return this.convertToInvoice(sourceDocumentId);
    }

    const { userId, orgId } = await getActorContext();
    const relation = options.relation || match.relation || "converted_to";
    const financial = isFinancialType(targetType);
    const items = (source.document_items || []).map((row) => ({
      description: row.description,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total_price: row.total_price,
      line_order: row.line_order,
      metadata: row.metadata,
    }));

    const target = await this.create({
      type: targetType,
      client_id: source.client_id,
      title: source.title ? `${typeLabel(targetType)} — ${source.title}` : `New ${typeLabel(targetType)}`,
      currency: source.currency,
      base_currency: source.base_currency,
      exchange_rate: asPositiveNumber(source.exchange_rate, 1),
      tax_rate: source.tax_rate,
      discount_amount: source.discount_amount,
      body: source.body,
      assigned_user_id: source.assigned_user_id,
      source_document_id: source.id,
      metadata: {
        ...(typeof source.metadata === "object" && source.metadata ? source.metadata : {}),
        converted_from_document_id: source.id,
        converted_from_type: source.type,
      },
      ...(financial && items.length ? { items } : financial ? { items: [{ description: "Line item", quantity: 1, unit_price: 0 }] } : {}),
    });

    await this.linkDocuments(source.id, target.id, relation);
    await insertDocumentEvent({
      orgId,
      documentId: source.id,
      userId,
      eventType: DOCUMENT_EVENT_TYPES.converted,
      payload: {
        action: DOCUMENT_EVENT_TYPES.converted,
        target_document_id: target.id,
        target_type: targetType,
        relation,
      },
    });
    await insertDocumentEvent({
      orgId,
      documentId: target.id,
      userId,
      eventType: "created_from_conversion",
      payload: {
        source_document_id: source.id,
        source_type: source.type,
        relation,
      },
    });

    return { source, target };
  },

  async listTemplates({ type } = {}) {
    const { orgId } = await getActorContext();
    let q = supabase
      .from("document_templates")
      .select("id, type, category_key, name, description, is_default, created_at, updated_at")
      .eq("org_id", orgId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (type && type !== "all") q = q.eq("type", type);
    const { data, error } = await q;
    if (error) {
      if (isSupabaseMissingRelationError(error)) {
        return { rows: [], tableReady: false };
      }
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to list templates"), error);
    }
    return { rows: Array.isArray(data) ? data : [], tableReady: true };
  },

  /** Default template for a document type in the current org, if one is marked. */
  async getDefaultTemplateForType(type) {
    const { orgId } = await getActorContext();
    const { data, error } = await supabase
      .from("document_templates")
      .select("id, type, name, is_default")
      .eq("org_id", orgId)
      .eq("type", type)
      .eq("is_default", true)
      .maybeSingle();
    if (error) {
      if (isSupabaseMissingRelationError(error)) return null;
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to load default template"), error);
    }
    return data;
  },

  /** Insert a built-in preset into the org template library. */
  async createTemplateFromPreset(presetKey, { isDefault = false } = {}) {
    const preset = getTemplatePreset(presetKey);
    if (!preset) throw new Error("Unknown template preset.");
    const { userId, orgId } = await getActorContext();
    if (isDefault) {
      const { error: clearErr } = await supabase
        .from("document_templates")
        .update({ is_default: false })
        .eq("org_id", orgId)
        .eq("type", preset.type);
      if (clearErr && !isSupabaseMissingRelationError(clearErr)) {
        throw throwWithCause(getSupabaseErrorMessage(clearErr, "Failed to update defaults"), clearErr);
      }
    }
    const { data, error } = await supabase
      .from("document_templates")
      .insert({
        org_id: orgId,
        type: preset.type,
        category_key: categoryForType(preset.type),
        name: preset.name,
        description: preset.description,
        content: preset.content,
        is_default: Boolean(isDefault),
        created_by: userId,
        user_id: userId,
      })
      .select("*")
      .single();
    if (error) {
      if (isSupabaseMissingRelationError(error)) {
        throw new Error(
          "Templates are not available yet. Apply the documents hub migration (supabase db push), then try again."
        );
      }
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to add template"), error);
    }
    return data;
  },

  async createTemplateFromDocument(documentId, { name, description, isDefault = false } = {}) {
    const { userId, orgId } = await getActorContext();
    const doc = await this.get(documentId);
    if (!doc) throw new Error("Document not found");
    const templateName = String(name || "").trim() || `${doc.title || "Document"} template`;
    if (isDefault) {
      const { error: clearErr } = await supabase
        .from("document_templates")
        .update({ is_default: false })
        .eq("org_id", orgId)
        .eq("type", doc.type);
      if (clearErr && !isSupabaseMissingRelationError(clearErr)) {
        throw throwWithCause(getSupabaseErrorMessage(clearErr, "Failed to update default template"), clearErr);
      }
    }
    const content = {
      title: doc.title,
      body: doc.body,
      tax_rate: doc.tax_rate,
      discount_amount: doc.discount_amount,
      currency: doc.currency,
      items: (doc.document_items || []).map((row) => ({
        description: row.description,
        quantity: row.quantity,
        unit_price: row.unit_price,
        metadata: row.metadata,
      })),
      metadata: typeof doc.metadata === "object" && doc.metadata ? doc.metadata : {},
    };
    const { data, error } = await supabase
      .from("document_templates")
      .insert({
        org_id: orgId,
        type: doc.type,
        category_key: categoryForType(doc.type),
        name: templateName,
        description: description || null,
        content,
        is_default: Boolean(isDefault),
        created_by: userId,
        user_id: userId,
      })
      .select("*")
      .single();
    if (error) {
      if (isSupabaseMissingRelationError(error)) {
        throw new Error(
          "Templates are not available yet. Apply the documents hub migration (supabase db push), then try again."
        );
      }
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to save template"), error);
    }
    return data;
  },

  async removeTemplate(templateId) {
    const { orgId } = await getActorContext();
    const { error } = await supabase
      .from("document_templates")
      .delete()
      .eq("id", templateId)
      .eq("org_id", orgId);
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to delete template"), error);
    return true;
  },

  async duplicateTemplate(templateId, { name } = {}) {
    const { userId, orgId } = await getActorContext();
    const { data: src, error: getErr } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", templateId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (getErr) throw throwWithCause(getSupabaseErrorMessage(getErr, "Failed to load template"), getErr);
    if (!src) throw new Error("Template not found");
    const { data, error } = await supabase
      .from("document_templates")
      .insert({
        org_id: orgId,
        type: src.type,
        category_key: src.category_key,
        name: String(name || "").trim() || `${src.name} (copy)`,
        description: src.description,
        content: src.content,
        is_default: false,
        created_by: userId,
        user_id: userId,
      })
      .select("*")
      .single();
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to duplicate template"), error);
    return data;
  },

  async setDefaultTemplate(templateId) {
    const { orgId } = await getActorContext();
    const { data: tpl, error: getErr } = await supabase
      .from("document_templates")
      .select("id, type")
      .eq("id", templateId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (getErr) throw throwWithCause(getSupabaseErrorMessage(getErr, "Failed to load template"), getErr);
    if (!tpl) throw new Error("Template not found");
    await supabase
      .from("document_templates")
      .update({ is_default: false })
      .eq("org_id", orgId)
      .eq("type", tpl.type);
    const { data, error } = await supabase
      .from("document_templates")
      .update({ is_default: true })
      .eq("id", templateId)
      .eq("org_id", orgId)
      .select("*")
      .single();
    if (error) throw throwWithCause(getSupabaseErrorMessage(error, "Failed to set default template"), error);
    return data;
  },

  async createFromTemplate(templateId) {
    const { orgId } = await getActorContext();
    const { data: tpl, error: getErr } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", templateId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (getErr) throw throwWithCause(getSupabaseErrorMessage(getErr, "Failed to load template"), getErr);
    if (!tpl) throw new Error("Template not found");
    const c = typeof tpl.content === "object" && tpl.content ? tpl.content : {};
    const draftTitle =
      c.title && String(c.title).trim()
        ? String(c.title).trim()
        : `New ${typeLabel(tpl.type)}`;
    return this.create({
      type: tpl.type,
      title: draftTitle,
      body: c.body,
      currency: c.currency || DEFAULT_BASE_CURRENCY,
      base_currency: DEFAULT_BASE_CURRENCY,
      tax_rate: c.tax_rate,
      discount_amount: c.discount_amount,
      metadata: c.metadata,
      items: c.items,
      template_id: tpl.id,
    });
  },
};
