/**
 * Specialised quote → invoice. Writes invoices + quotes only.
 * Never inserts public.documents.
 */
import { Invoice, Quote } from "@/api/entities";
import { supabase } from "@/lib/supabaseClient";
import { QUOTE_STATUSES } from "./documentStateMachine";
import { isQuoteConverted, normalizeQuoteStatus } from "@shared/commercial/quoteInvoiceConversion.js";
import { toPersistableCommercialLineItem } from "@shared/commercial/commercialLineItem.js";
import { isPersistenceDiscountLine } from "@shared/commercial/normalizeCommercialDocument.js";

export const CONVERTIBLE_QUOTE_STATUSES = Object.freeze([
  QUOTE_STATUSES.draft,
  QUOTE_STATUSES.sent,
  QUOTE_STATUSES.viewed,
  QUOTE_STATUSES.accepted,
]);

export function canConvertQuoteStatus(status) {
  return CONVERTIBLE_QUOTE_STATUSES.includes(normalizeQuoteStatus(status));
}

export function assertQuoteConvertible(quote) {
  if (isQuoteConverted(quote)) {
    throw new Error("This quote has already been converted.");
  }
  if (!canConvertQuoteStatus(quote?.status)) {
    throw new Error("This quote cannot be converted.");
  }
}

export function mapQuoteItemsForInvoice(items) {
  return (items || [])
    .filter((item) => item && typeof item === "object" && !isPersistenceDiscountLine(item))
    .map((item, i) => toPersistableCommercialLineItem(item, i));
}

export function quoteConvertComposeUrl(quoteId) {
  if (!quoteId) return null;
  return `/CreateDocument/invoice?quoteId=${encodeURIComponent(quoteId)}`;
}

/**
 * @param {string} quoteId
 * @param {{ filterInvoices?: Function }} [deps]
 */
export async function findInvoiceBySourceQuoteId(quoteId, deps = {}) {
  if (!quoteId) return null;
  const filterInvoices =
    deps.filterInvoices || ((criteria) => Invoice.filter(criteria, "-created_date"));
  const rows = await filterInvoices({ source_quote_id: quoteId });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * Persist via convert_quote_to_invoice RPC. Idempotent.
 * @param {{
 *   quoteId: string,
 *   invoicePayload?: Record<string, unknown>,
 *   getQuote?: Function,
 *   findExisting?: Function,
 * }} opts
 */
export async function convertQuoteToInvoice(opts = {}) {
  const quoteId = opts.quoteId;
  if (!quoteId) throw new Error("quoteId is required");

  const getQuote = opts.getQuote || ((id) => Quote.get(id));
  const findExisting = opts.findExisting || ((id) => findInvoiceBySourceQuoteId(id));

  const quote = await getQuote(quoteId);
  if (!quote) throw new Error("Quote not found");

  const existing = await findExisting(quoteId);
  if (existing?.id) {
    return { invoice: existing, created: false, already_converted: true, quote };
  }

  assertQuoteConvertible(quote);

  if (typeof opts.createInvoice === "function") {
    const createInvoice = opts.createInvoice;
    const updateQuote = opts.updateQuote || ((id, patch) => Quote.update(id, patch));
    const items = mapQuoteItemsForInvoice(opts.invoicePayload?.items || quote.items);
    const taxRate = opts.invoicePayload?.tax_rate ?? quote.tax_rate ?? 0;
    const discountType = opts.invoicePayload?.discount_type ?? quote.discount_type ?? "fixed";
    const discountValue = opts.invoicePayload?.discount_value ?? quote.discount_value ?? quote.discount_amount ?? 0;
    const discountAmount = opts.invoicePayload?.discount_amount ?? quote.discount_amount ?? 0;
    const vatMode = opts.invoicePayload?.vat_mode ?? quote.vat_mode;
    const invoice = await createInvoice({
      ...(opts.invoicePayload || {}),
      client_id: opts.invoicePayload?.client_id || quote.client_id,
      source_quote_id: quote.id,
      tax_rate: taxRate,
      vat_mode: vatMode,
      subtotal: opts.invoicePayload?.subtotal ?? quote.subtotal,
      tax_amount: opts.invoicePayload?.tax_amount ?? quote.tax_amount,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      total_amount: opts.invoicePayload?.total_amount ?? quote.total_amount,
      keep_stored_totals: true,
      items,
    });
    await updateQuote(quote.id, {
      status: QUOTE_STATUSES.converted,
      converted_at: new Date().toISOString(),
    });
    return { invoice, created: true, already_converted: false, quote };
  }

  const { data, error } = await supabase.rpc("convert_quote_to_invoice", {
    p_quote_id: quoteId,
    p_overrides: opts.invoicePayload && typeof opts.invoicePayload === "object" ? opts.invoicePayload : {},
  });

  if (error) {
    const raced = await findExisting(quoteId);
    if (raced?.id) return { invoice: raced, created: false, already_converted: true, quote };
    throw new Error(error.message || "Could not convert quote");
  }

  const invoice = {
    id: data?.invoice_id,
    invoice_number: data?.invoice_number,
    source_quote_id: quoteId,
  };
  return {
    invoice,
    created: !data?.already_converted,
    already_converted: Boolean(data?.already_converted),
    quote,
  };
}
