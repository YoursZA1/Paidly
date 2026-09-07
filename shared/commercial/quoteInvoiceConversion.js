/**
 * Quote → invoice conversion (specialised tables only).
 * Hub `documents.source_quote_id` is not used here.
 */

import { QUOTE_STATUS, normalizeQuoteStatus } from "./documentStatuses.js";
import { toPersistableCommercialLineItem } from "./commercialLineItem.js";
import { isPersistenceDiscountLine } from "./normalizeCommercialDocument.js";

export { QUOTE_STATUS, normalizeQuoteStatus };

const CONVERTIBLE_STATUSES = new Set([
  QUOTE_STATUS.draft,
  QUOTE_STATUS.sent,
  QUOTE_STATUS.viewed,
  QUOTE_STATUS.accepted,
]);

export function isQuoteConverted(quote, existingInvoice = null) {
  if (existingInvoice?.id) return true;
  if (!quote) return false;
  if (quote.converted_at) return true;
  return normalizeQuoteStatus(quote.status) === QUOTE_STATUS.converted;
}

export function isQuoteImmutable(quote) {
  const status = normalizeQuoteStatus(quote?.status);
  return status === QUOTE_STATUS.converted || Boolean(quote?.converted_at);
}

export function canConvertQuote(quote, existingInvoice = null) {
  if (!quote?.id) return false;
  if (isQuoteConverted(quote, existingInvoice)) return false;
  return CONVERTIBLE_STATUSES.has(normalizeQuoteStatus(quote.status));
}

export function copyQuoteLineItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .filter((item) => !isPersistenceDiscountLine(item))
    .map((item, index) => toPersistableCommercialLineItem(item, index));
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

/**
 * Build a new invoice payload from a quote. Totals are copied, not recalculated.
 */
export function buildInvoiceFromQuote(quote, options = {}) {
  if (!quote?.id) {
    throw new Error("quote is required");
  }
  const existing = options.existingInvoice || null;
  if (isQuoteConverted(quote, existing)) {
    return {
      already_converted: true,
      invoice: existing || null,
      items: Array.isArray(existing?.items) ? existing.items : [],
    };
  }
  if (!canConvertQuote(quote, existing)) {
    throw new Error("quote cannot be converted");
  }

  const overrides = options.overrides && typeof options.overrides === "object" ? options.overrides : {};
  const items = copyQuoteLineItems(overrides.items || quote.items);
  const invoiceDate = overrides.invoice_date || options.invoiceDate || new Date().toISOString().slice(0, 10);
  const createdBy = options.createdBy || null;
  const invoiceId = options.invoiceId || `inv-${quote.id}`;

  const invoice = {
    id: invoiceId,
    org_id: quote.org_id || null,
    client_id: firstDefined(overrides.client_id, quote.client_id),
    company_id: firstDefined(overrides.company_id, quote.company_id),
    invoice_number: options.invoiceNumber || null,
    status: "draft",
    project_title: firstDefined(
      overrides.project_title,
      quote.project_title ? `Invoice — ${quote.project_title}` : null,
      quote.quote_number ? `Invoice from ${quote.quote_number}` : "Invoice from quote"
    ),
    project_description: firstDefined(overrides.project_description, quote.project_description, ""),
    invoice_date: invoiceDate,
    delivery_date: firstDefined(overrides.delivery_date, quote.valid_until, invoiceDate),
    delivery_address: firstDefined(overrides.delivery_address, ""),
    subtotal: Number(firstDefined(overrides.subtotal, quote.subtotal, 0)) || 0,
    tax_rate: Number(firstDefined(overrides.tax_rate, quote.tax_rate, 0)) || 0,
    vat_mode: firstDefined(overrides.vat_mode, quote.vat_mode, "VAT_EXCLUSIVE"),
    tax_amount: Number(firstDefined(overrides.tax_amount, quote.tax_amount, 0)) || 0,
    total_amount: Number(firstDefined(overrides.total_amount, quote.total_amount, 0)) || 0,
    currency: firstDefined(overrides.currency, quote.currency, "ZAR"),
    notes: firstDefined(overrides.notes, quote.notes, ""),
    terms_conditions: firstDefined(overrides.terms_conditions, quote.terms_conditions, ""),
    banking_detail_id: firstDefined(overrides.banking_detail_id, quote.banking_detail_id),
    owner_company_name: firstDefined(overrides.owner_company_name, quote.owner_company_name),
    owner_company_address: firstDefined(overrides.owner_company_address, quote.owner_company_address),
    owner_logo_url: firstDefined(overrides.owner_logo_url, quote.owner_logo_url),
    owner_email: firstDefined(overrides.owner_email, quote.owner_email),
    owner_phone: firstDefined(overrides.owner_phone, quote.owner_phone),
    owner_vat_number: firstDefined(overrides.owner_vat_number, quote.owner_vat_number),
    owner_currency: firstDefined(overrides.owner_currency, quote.owner_currency, quote.currency),
    document_brand_primary: firstDefined(overrides.document_brand_primary, quote.document_brand_primary),
    document_brand_secondary: firstDefined(overrides.document_brand_secondary, quote.document_brand_secondary),
    created_by: createdBy,
    user_id: createdBy,
    source_quote_id: quote.id,
    discount_type: firstDefined(overrides.discount_type, quote.discount_type, "fixed") || "fixed",
    discount_value: Number(firstDefined(overrides.discount_value, quote.discount_value, quote.discount_amount, 0)) || 0,
    discount_amount: Number(firstDefined(overrides.discount_amount, quote.discount_amount, 0)) || 0,
  };

  return { already_converted: false, invoice, items };
}

/**
 * In-memory conversion used by unit tests to prove duplicate + rollback behaviour.
 */
export function convertQuoteWithStore(store, quoteId, options = {}) {
  if (!store?.quotes || !store?.invoices) {
    throw new Error("store is required");
  }
  const quote = store.quotes.get(quoteId);
  if (!quote) throw new Error("quote not found");
  const existing = [...store.invoices.values()].find((row) => row.source_quote_id === quoteId) || null;
  if (existing) {
    return { already_converted: true, invoice: existing };
  }

  const snapshot = {
    quotes: new Map(store.quotes),
    invoices: new Map(store.invoices),
    invoiceItems: Array.isArray(store.invoiceItems) ? [...store.invoiceItems] : [],
  };

  try {
    const built = buildInvoiceFromQuote(quote, {
      ...options,
      existingInvoice: existing,
    });
    if (built.already_converted) return built;
    if (options.failAfter === "invoice") {
      throw new Error("forced fail after invoice");
    }
    store.invoices.set(built.invoice.id, built.invoice);
    if (options.failAfter === "items") {
      throw new Error("forced fail after items");
    }
    store.invoiceItems = [...(store.invoiceItems || []), ...built.items.map((item) => ({
      ...item,
      invoice_id: built.invoice.id,
    }))];
    store.quotes.set(quoteId, {
      ...quote,
      status: QUOTE_STATUS.converted,
      converted_at: options.now || new Date().toISOString(),
    });
    return { already_converted: false, invoice: built.invoice };
  } catch (error) {
    store.quotes = snapshot.quotes;
    store.invoices = snapshot.invoices;
    store.invoiceItems = snapshot.invoiceItems;
    throw error;
  }
}
