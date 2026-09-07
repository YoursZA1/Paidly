/**
 * One-click document conversion workflows.
 *
 * Hub→hub conversions create a new draft in `documents`, link it in `document_links`,
 * and record events on both sides.
 *
 * Hub→invoice/quote conversions are navigation only: they open specialised compose
 * (`CreateDocument/invoice|quote?fromHubDocument=`) and write to `invoices` / `quotes`.
 * They must never insert `documents.type=invoice|quote`.
 *
 * Quote→invoice on specialised tables uses convert_quote_to_invoice (invoices.source_quote_id).
 * It must never write documents.source_quote_id or insert public.documents.
 */
import { DOCUMENT_TYPES } from "./documentTypes";
import { typeLabel } from "./documentCatalog";
import { getDedicatedCreatePath } from "./documentCreateFlow";
import { isDocumentsHubExcludedType } from "./documentSystemOfRecord";
import { commercialLineItemToComposeRow } from "@shared/commercial/commercialLineItem.js";

/** @typedef {{ targetType: string, label: string, relation?: string, persistence?: "hub"|"commercial" }} ConversionOption */

/** @type {Record<string, ConversionOption[]>} */
export const DOCUMENT_CONVERSIONS = Object.freeze({
  proposal: [
    { targetType: "contract", label: "Convert to Contract", relation: "converted_to" },
    { targetType: "quote", label: "Convert to Quote", persistence: "commercial" },
  ],
  contract: [{ targetType: "contract", label: "Renew Contract", relation: "renewed_as" }],
  service_agreement: [{ targetType: "contract", label: "Convert to Contract", relation: "converted_to" }],
  job_card: [{ targetType: "invoice", label: "Convert to Invoice", persistence: "commercial" }],
  project_report: [{ targetType: "invoice", label: "Convert to Invoice", persistence: "commercial" }],
  status_report: [{ targetType: "invoice", label: "Convert to Invoice", persistence: "commercial" }],
  scope_of_work: [
    { targetType: "quote", label: "Convert to Quote", persistence: "commercial" },
    { targetType: "invoice", label: "Convert to Invoice", persistence: "commercial" },
  ],
});

/**
 * @param {string} sourceType
 * @returns {ConversionOption[]}
 */
export function getConversionOptions(sourceType) {
  return DOCUMENT_CONVERSIONS[String(sourceType || "")] || [];
}

/** @param {ConversionOption | null | undefined} option */
export function isCommercialConversion(option) {
  if (!option) return false;
  return option.persistence === "commercial" || isDocumentsHubExcludedType(option.targetType);
}

/**
 * Specialised compose URL for a hub→invoice/quote conversion.
 * @param {string} targetType
 * @param {string} hubDocumentId
 * @returns {string | null}
 */
export function specialisedComposeUrl(targetType, hubDocumentId) {
  if (!isDocumentsHubExcludedType(targetType) || !hubDocumentId) return null;
  const path = getDedicatedCreatePath(targetType);
  if (!path) return null;
  const params = new URLSearchParams({ fromHubDocument: String(hubDocumentId) });
  return `${path}?${params.toString()}`;
}

/**
 * Prefill specialised invoice/quote compose from a hub document.
 * Writes happen later on `invoices` / `quotes`, not `documents`.
 * @param {Record<string, unknown>} doc
 */
export function hubDocumentToComposePrefill(doc) {
  const items = Array.isArray(doc?.document_items) ? doc.document_items : [];
  let line_items = items.map((item) => commercialLineItemToComposeRow(item));

  const meta = typeof doc?.metadata === "object" && doc.metadata ? doc.metadata : {};
  const noteParts = [];
  const typeName = typeLabel(doc?.type) || String(doc?.type || "document");
  const ref = doc?.document_number || doc?.title || "";
  noteParts.push(ref ? `Converted from ${typeName} — ${ref}.` : `Converted from ${typeName}.`);
  if (doc?.body && String(doc.body).trim()) noteParts.push(String(doc.body).trim());
  for (const key of ["work_description", "materials", "objective", "background", "deliverables"]) {
    const value = meta[key];
    if (value && String(value).trim()) noteParts.push(String(value).trim());
  }

  if (line_items.length === 0) {
    const desc = (doc?.title && String(doc.title).trim()) || typeName || "Item";
    const amount = Number(doc?.total_amount ?? doc?.subtotal ?? 0) || 0;
    line_items = [{ description: desc, quantity: 1, unit_price: amount, total: amount }];
  }

  return {
    client_id: doc?.client_id || "",
    notes: noteParts.join("\n\n"),
    tax_rate: Number(doc?.tax_rate ?? 0),
    currency: doc?.currency || undefined,
    line_items,
    sourceHubDocumentId: doc?.id,
    sourceHubType: doc?.type,
    title: doc?.title || "",
  };
}

/**
 * Quote→invoice on specialised tables is handled by Quotes / Create Invoice, not the hub.
 * Kept so DocumentService can refuse the old hub conversion path.
 * @param {string} sourceType
 * @param {string} targetType
 */
export function usesLegacyQuoteToInvoice(sourceType, targetType) {
  return sourceType === DOCUMENT_TYPES.quote && targetType === DOCUMENT_TYPES.invoice;
}
