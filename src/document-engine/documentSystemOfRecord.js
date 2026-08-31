/**
 * Paidly document system of record.
 *
 * One document type has one persistence table. Commercial documents stay on their
 * specialised production tables. The Documents Hub (`public.documents`) owns other
 * business documents (leave, expenses, contracts, and future generic types).
 *
 * Do not dual-write invoices, quotes, payslips, or recurring invoices into `documents`.
 * The Document Engine (`src/document-engine/`) may share UI and helpers; it is not a
 * shared database table.
 */

export const GENERIC_DOCUMENT_TABLE = "documents";

/** @type {Readonly<Record<string, string>>} */
export const COMMERCIAL_DOCUMENT_TABLES = Object.freeze({
  invoice: "invoices",
  quote: "quotes",
  payslip: "payslips",
  recurring_invoice: "recurring_invoices",
});

export const COMMERCIAL_DOCUMENT_TYPES = Object.freeze(Object.keys(COMMERCIAL_DOCUMENT_TABLES));

/**
 * Types that must never be inserted into (or listed from) `public.documents`.
 * Recurring invoices are commercial too, but they are not a `documents.type` value.
 */
export const DOCUMENTS_HUB_EXCLUDED_TYPES = Object.freeze(["invoice", "quote", "payslip"]);

const COMMERCIAL_TYPE_ALIASES = Object.freeze({
  invoices: "invoice",
  quotes: "quote",
  payslips: "payslip",
  payroll: "payslip",
  payrolls: "payslip",
  recurring: "recurring_invoice",
  recurringinvoice: "recurring_invoice",
  recurring_invoices: "recurring_invoice",
});

/**
 * @param {unknown} raw
 * @returns {keyof typeof COMMERCIAL_DOCUMENT_TABLES | null}
 */
export function normalizeCommercialDocumentType(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (Object.prototype.hasOwnProperty.call(COMMERCIAL_DOCUMENT_TABLES, s)) return s;
  if (Object.prototype.hasOwnProperty.call(COMMERCIAL_TYPE_ALIASES, s)) {
    return COMMERCIAL_TYPE_ALIASES[s];
  }
  return null;
}

/** @param {unknown} raw */
export function isCommercialDocumentType(raw) {
  return normalizeCommercialDocumentType(raw) != null;
}

/** Types that may be persisted in `public.documents`. */
export function isDocumentsHubExcludedType(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return DOCUMENTS_HUB_EXCLUDED_TYPES.includes(s) || isCommercialDocumentType(s);
}

/**
 * Canonical Supabase table for a document kind.
 * Unknown / generic types resolve to the Documents Hub.
 * @param {unknown} raw
 */
export function tableForDocumentType(raw) {
  const commercial = normalizeCommercialDocumentType(raw);
  if (commercial) return COMMERCIAL_DOCUMENT_TABLES[commercial];
  return GENERIC_DOCUMENT_TABLE;
}

/** PostgREST `.not("type", "in", …)` value for hub list/KPI queries. */
export function postgrestExcludeCommercialHubTypes() {
  return `(${DOCUMENTS_HUB_EXCLUDED_TYPES.join(",")})`;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function hubWriteForbiddenMessage(raw) {
  const type = normalizeCommercialDocumentType(raw);
  if (type === "invoice") {
    return "Invoices are stored in invoices, not the Documents Hub. Create them from Invoices or New Invoice.";
  }
  if (type === "quote") {
    return "Quotes are stored in quotes, not the Documents Hub. Create them from Quotes or New Quote.";
  }
  if (type === "payslip") {
    return "Payslips are stored in payslips, not the Documents Hub. Create them from Payslips or New Payslip.";
  }
  if (type === "recurring_invoice") {
    return "Recurring invoices are stored in recurring_invoices, not the Documents Hub.";
  }
  return "This document type is owned by a specialised commercial table, not the Documents Hub.";
}

/**
 * Hub create/convert/template paths must call this before inserting into `documents`.
 * @param {unknown} raw
 */
export function assertHubWritableType(raw) {
  if (isDocumentsHubExcludedType(raw)) {
    throw new Error(hubWriteForbiddenMessage(raw));
  }
}

/**
 * Copy for leftover `documents` rows that still have a commercial type.
 * Those rows are hidden from the hub list; they are not migrated or auto-deleted.
 * @param {unknown} raw
 */
export function leftoverHubCommercialMessage(raw) {
  const type = normalizeCommercialDocumentType(raw);
  if (type === "invoice") {
    return "This hub record is a leftover invoice-type row. Live invoices are on the Invoices page. Open Invoices, or remove this leftover hub record.";
  }
  if (type === "quote") {
    return "This hub record is a leftover quote-type row. Live quotes are on the Quotes page. Open Quotes, or remove this leftover hub record.";
  }
  if (type === "payslip") {
    return "This hub record is a leftover payslip-type row. Live payslips are on the Payslips page. Open Payslips, or remove this leftover hub record.";
  }
  if (type === "recurring_invoice") {
    return "This hub record is a leftover recurring-invoice row. Live templates are on Recurring Invoices. Open that page, or remove this leftover hub record.";
  }
  return "This hub record uses a specialised commercial type. Open the specialised page, or remove this leftover hub record.";
}
