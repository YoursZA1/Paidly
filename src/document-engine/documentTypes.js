/**
 * Paidly Document Engine — canonical types
 *
 * Product model: separate features (Invoices, Quotes, Payslips) are views on one concept:
 *   document({ type: "invoice" | "quote" | "payslip", ... })
 *
 * Persistence: legacy tables (`invoices`, `quotes`, `payslips`) remain in use for production flows;
 * the unified v2 store is `public.documents` (+ `document_items`, `document_events`) via `DocumentService`.
 * This module is the shared vocabulary and resolver for entities, routing params, and engine code.
 */

import { Invoice, Quote, Payslip } from "@/api/entities";

/** @enum {string} */
export const DOCUMENT_TYPES = Object.freeze({
    invoice: "invoice",
    quote: "quote",
    payslip: "payslip",
});

/** @typedef {keyof typeof DOCUMENT_TYPES} DocumentType */

export const DOCUMENT_TYPE_LIST = Object.freeze(/** @type {const} */ (["invoice", "quote", "payslip"]));

/**
 * @param {unknown} value
 * @returns {value is DocumentType}
 */
export function isDocumentType(value) {
    return typeof value === "string" && value in DOCUMENT_TYPES;
}

/**
 * Normalise route/search/UI aliases to a canonical type.
 * Unknown values default to `invoice` (safe for create flows).
 * @param {unknown} raw
 * @returns {DocumentType}
 */
export function normalizeDocumentType(raw) {
    const s = String(raw ?? "")
        .trim()
        .toLowerCase();
    if (s === "quotes" || s === "quote") return DOCUMENT_TYPES.quote;
    if (s === "payslips" || s === "payslip") return DOCUMENT_TYPES.payslip;
    if (s === "invoices" || s === "invoice") return DOCUMENT_TYPES.invoice;
    return DOCUMENT_TYPES.invoice;
}

/**
 * Strict parse for `/ViewDocument/:docType/:id` — only the three engine types; else `null`.
 * @param {unknown} raw
 * @returns {DocumentType | null}
 */
export function parseRouteDocumentTypeStrict(raw) {
    const s = String(raw ?? "")
        .trim()
        .toLowerCase();
    if (s === "quotes" || s === "quote") return DOCUMENT_TYPES.quote;
    if (s === "invoices" || s === "invoice") return DOCUMENT_TYPES.invoice;
    if (s === "payslips" || s === "payslip") return DOCUMENT_TYPES.payslip;
    return null;
}

/**
 * Entity API (Supabase-backed) for this document type.
 * @param {unknown} type
 * @returns {typeof Invoice | typeof Quote | typeof Payslip}
 */
export function getDocumentEntity(type) {
    switch (normalizeDocumentType(type)) {
        case DOCUMENT_TYPES.quote:
            return Quote;
        case DOCUMENT_TYPES.payslip:
            return Payslip;
        default:
            return Invoice;
    }
}

/**
 * @param {DocumentType} type
 * @param {string} id
 */
export function documentRef(type, id) {
    return { type, id: String(id || "").trim() };
}
