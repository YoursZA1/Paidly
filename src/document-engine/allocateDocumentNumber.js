/**
 * Server-side unique numbering for specialised invoices and quotes.
 * Custom / import numbers skip the RPC; uniqueness is enforced by the DB index.
 */
import { supabase } from "@/lib/supabaseClient";

export const DOCUMENT_NUMBER_PREFIX = Object.freeze({
  invoice: "INV",
  quote: "QUO",
});

/**
 * @param {unknown} docType
 * @returns {'invoice' | 'quote'}
 */
export function normalizeNumberDocType(docType) {
  const s = String(docType || "").trim().toLowerCase();
  if (s === "invoice" || s === "invoices") return "invoice";
  if (s === "quote" || s === "quotes") return "quote";
  throw new Error("allocateDocumentNumber: docType must be invoice or quote");
}

/**
 * @param {{ docType?: unknown, customNumber?: unknown }} opts
 */
export function resolveDocumentNumberAllocation({ docType, customNumber } = {}) {
  const custom = String(customNumber ?? "").trim();
  if (custom) return { mode: "custom", number: custom };
  const type = normalizeNumberDocType(docType);
  return { mode: "rpc", docType: type, prefix: DOCUMENT_NUMBER_PREFIX[type] };
}

export function isUniqueViolation(error) {
  if (!error || typeof error !== "object") return false;
  return String(error.code || "") === "23505";
}

export function uniqueConstraintName(error) {
  const blob = [error?.constraint, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ");
  return blob;
}

export function isDocumentNumberUniqueViolation(error) {
  if (!isUniqueViolation(error)) return false;
  const blob = uniqueConstraintName(error).toLowerCase();
  return (
    blob.includes("invoice_number") ||
    blob.includes("quote_number") ||
    blob.includes("org_invoice_number") ||
    blob.includes("org_quote_number")
  );
}

export function isSourceQuoteUniqueViolation(error) {
  if (!isUniqueViolation(error)) return false;
  return uniqueConstraintName(error).toLowerCase().includes("source_quote_id");
}

export function documentNumberConflictMessage(docType) {
  try {
    return normalizeNumberDocType(docType) === "quote"
      ? "Quote number already used."
      : "Invoice number already used.";
  } catch {
    return "Document number already used.";
  }
}

/**
 * @param {{ orgId: string, docType: string, customNumber?: string, rpc?: Function }} opts
 * @returns {Promise<string>}
 */
export async function allocateDocumentNumber({ orgId, docType, customNumber, rpc } = {}) {
  const plan = resolveDocumentNumberAllocation({ docType, customNumber });
  if (plan.mode === "custom") return plan.number;
  if (!orgId) throw new Error("org_id is required to allocate a document number");
  const run = typeof rpc === "function" ? rpc : (fn, args) => supabase.rpc(fn, args);
  const { data, error } = await run("next_document_number", {
    p_org_id: orgId,
    p_doc_type: plan.docType,
    p_prefix: plan.prefix,
  });
  if (error) throw error;
  const number = String(data ?? "").trim();
  if (!number) throw new Error("next_document_number returned an empty value");
  return number;
}
