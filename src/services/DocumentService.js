import { supabase } from "@/lib/supabaseClient";
import { Invoice } from "@/api/entities";
import { DOCUMENT_TYPES, normalizeDocumentType } from "@/document-engine/documentTypes";
import {
  assertTransition,
  INVOICE_STATUSES,
  QUOTE_STATUSES,
  PAYSLIP_STATUSES,
} from "@/document-engine/documentStateMachine";
import { aggregateFromItems } from "@/document-engine/documentTotals";
import { DOCUMENT_EVENT_TYPES, resolveLifecycleEventType } from "@/document-engine/documentEventTypes";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

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

function isSettledPayment(payment) {
  const s = String(payment?.status || "")
    .trim()
    .toLowerCase();
  if (s === "paid" || s === "settled") return true;
  // Backward-compatible fallback for legacy rows that only track paid_at.
  if (payment?.paid_at) return true;
  return false;
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
      .select("id, org_id, document_id, amount, status, paid_at, method, reference, notes, created_at")
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
        "id, org_id, type, status, document_number, title, total_amount, currency, client_id, source_quote_id, created_at, updated_at"
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
    return Array.isArray(data) ? data : [];
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
    const events = Array.isArray(data.document_events)
      ? [...data.document_events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      : [];
    const items = Array.isArray(data.document_items)
      ? [...data.document_items].sort((a, b) => (a.line_order ?? 0) - (b.line_order ?? 0))
      : [];
    const { document_events: _e, document_items: _i, ...doc } = data;
    return { ...doc, document_items: items, document_events: events };
  },

  async create(payload) {
    const { userId, orgId } = await getActorContext();
    const type = normalizeDocumentType(payload?.type);
    const defaultStatus = defaultStatusForType(type);
    const requested = payload?.status != null ? String(payload.status) : defaultStatus;
    if (requested !== defaultStatus) {
      throw new Error("New documents must be created in draft status.");
    }
    const status = defaultStatus;
    const source_quote_id = payload?.source_quote_id ?? null;
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
    const { rows, subtotal, tax_amount, total_amount } = aggregateFromItems(
      payload?.items,
      tax_rate,
      discount_amount
    );

    const insertRow = {
      org_id: orgId,
      type,
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
      currency: payload?.currency || "ZAR",
      metadata: payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
      public_share_token: payload?.public_share_token ?? null,
      source_document_id: payload?.source_document_id ?? null,
      source_quote_id,
      created_by: userId,
      user_id: userId,
    };

    const { data: doc, error } = await supabase.from("documents").insert(insertRow).select("*").single();
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

    const { subtotal, tax_amount, total_amount } =
      itemsForAgg != null
        ? aggregateFromItems(itemsForAgg, tax_rate, discount_amount)
        : {
            subtotal: Number(existing.subtotal),
            tax_amount: Number(existing.tax_amount),
            total_amount: Number(existing.total_amount),
          };

    const updateRow = {
      client_id: patch.client_id !== undefined ? patch.client_id : existing.client_id,
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
      currency: patch.currency !== undefined ? patch.currency : existing.currency,
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

    const { error } = await supabase.from("documents").update(updateRow).eq("id", documentId).eq("org_id", orgId);
    if (error) {
      throw throwWithCause(getSupabaseErrorMessage(error, "Failed to update document"), error);
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
};
