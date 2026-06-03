/**
 * One-click document conversion workflows. Each entry maps a source type to allowed target types.
 * Conversions create a new draft document, link it in `document_links`, and record events on both sides.
 */
import { DOCUMENT_TYPES } from "./documentTypes";

/** @typedef {{ targetType: string, label: string, relation?: string }} ConversionOption */

/** @type {Record<string, ConversionOption[]>} */
export const DOCUMENT_CONVERSIONS = Object.freeze({
  proposal: [
    { targetType: "contract", label: "Convert to Contract", relation: "converted_to" },
    { targetType: "quote", label: "Convert to Quote", relation: "converted_to" },
  ],
  contract: [
    { targetType: "contract", label: "Renew Contract", relation: "renewed_as" },
    { targetType: "quote", label: "Convert to Quote", relation: "converted_to" },
  ],
  quote: [{ targetType: "invoice", label: "Convert to Invoice", relation: "converted_to" }],
  job_card: [{ targetType: "invoice", label: "Convert to Invoice", relation: "converted_to" }],
  project_report: [{ targetType: "invoice", label: "Convert to Final Invoice", relation: "converted_to" }],
  service_agreement: [{ targetType: "contract", label: "Convert to Contract", relation: "converted_to" }],
  scope_of_work: [{ targetType: "quote", label: "Convert to Quote", relation: "converted_to" }],
});

/**
 * @param {string} sourceType
 * @returns {ConversionOption[]}
 */
export function getConversionOptions(sourceType) {
  return DOCUMENT_CONVERSIONS[String(sourceType || "")] || [];
}

/**
 * Legacy quote→invoice uses a dedicated path with acceptance + source_quote_id constraints.
 * @param {string} sourceType
 * @param {string} targetType
 */
export function usesLegacyQuoteToInvoice(sourceType, targetType) {
  return sourceType === DOCUMENT_TYPES.quote && targetType === DOCUMENT_TYPES.invoice;
}
