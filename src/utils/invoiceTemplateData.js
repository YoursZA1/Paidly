import { effectiveInvoiceTermsForDisplay } from "@/constants/invoiceTerms";

/**
 * Historical template ids that may still exist on profiles / invoices.
 * Do not remove — UI may stop offering some of these, but stored values remain valid.
 */
export const HISTORICAL_INVOICE_TEMPLATE_KEYS = Object.freeze([
  "document", // Paidly (default)
  "paidly", // alias of document if ever stored
  "classic",
  "modern",
  "minimal", // legacy → renders as document
  "bold", // legacy → renders as modern
  "paidlypro",
]);

/** Keys shown in Settings / template picker (4 options). */
export const SELECTABLE_INVOICE_TEMPLATE_KEYS = Object.freeze([
  "document",
  "classic",
  "modern",
  "paidlypro",
]);

/**
 * Legacy / alias → render key used by PDF + preview engines.
 * Stored DB values are left unchanged; only presentation maps.
 */
const TEMPLATE_RENDER_ALIASES = Object.freeze({
  paidly: "document",
  minimal: "document",
  bold: "modern",
});

/** Classic / Modern / Paidly Pro — HTML templates (legacy PDF path). */
const LEGACY_HTML_TEMPLATE_KEYS = ["classic", "modern", "minimal", "bold", "paidlypro"];

/** Paidly document layout (Create / View document, DocumentPreview, @react-pdf). */
export const DOCUMENT_TEMPLATE_KEY = "document";

export const DEFAULT_INVOICE_TEMPLATE = DOCUMENT_TEMPLATE_KEY;

const VALID_TEMPLATE_KEYS = HISTORICAL_INVOICE_TEMPLATE_KEYS;

/** Truncated UI labels (e.g. table ellipsis) → full line item titles for Paidly Pro / display polish */
const LINE_ITEM_DISPLAY_OVERRIDES = [
  [/^basi\.?$/i, "Basic Website Package"],
  [/^basic\s*website\s*$/i, "Basic Website Package"],
  [/^social\s*post\s*de\.?\.?$/i, "Social Post Design"],
];

/**
 * @param {string} [raw]
 * @returns {string}
 */
export function formatLineItemDisplayName(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "Item";
  for (const [re, replacement] of LINE_ITEM_DISPLAY_OVERRIDES) {
    if (re.test(s)) return replacement;
  }
  return s;
}

/**
 * One-line label for invoice/quote tables: "Service or product name - description".
 * Collapses whitespace/newlines in the description so it flows on one visual line.
 *
 * @param {object} [item]
 * @returns {string}
 */
export function formatLineItemNameAndDescription(item) {
  const rawName = String(item?.service_name ?? item?.name ?? "").trim();
  const title = rawName ? formatLineItemDisplayName(rawName) : "";
  const rawDesc = typeof item?.description === "string" ? item.description.trim() : "";
  const descOneLine = rawDesc.replace(/\s+/g, " ").trim();
  if (title && descOneLine) return `${title} - ${descOneLine}`;
  if (title) return title;
  if (descOneLine) return descOneLine;
  return "Item";
}

/**
 * Validates a stored template id (including legacy minimal/bold and paidly alias).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeInvoiceTemplateKey(value) {
  const k = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_TEMPLATE_KEYS.includes(k) ? k : null;
}

/**
 * Maps a historical/stored key to the template used for rendering.
 * @param {unknown} value
 * @returns {string | null} One of document | classic | modern | paidlypro
 */
export function resolveRenderTemplateKey(value) {
  const k = normalizeInvoiceTemplateKey(value);
  if (!k) return null;
  return TEMPLATE_RENDER_ALIASES[k] || k;
}

/**
 * First valid **render** template from sources, else {@link DEFAULT_INVOICE_TEMPLATE}.
 * Applies legacy aliases (minimal → document, bold → modern, paidly → document).
 * @param {...unknown} sources — invoice_template, user.invoice_template, etc.
 */
export function resolveInvoiceTemplateKey(...sources) {
  for (const s of sources) {
    const k = resolveRenderTemplateKey(s);
    if (k) return k;
  }
  return DEFAULT_INVOICE_TEMPLATE;
}

/**
 * Map any stored value to a selectable Settings card id (for highlighting).
 * @param {unknown} value
 * @returns {string}
 */
export function toSelectableInvoiceTemplateKey(value) {
  return resolveInvoiceTemplateKey(value);
}

/** True when the key should use the Paidly document / @react-pdf layout. */
export function isDocumentStyleTemplateKey(key) {
  return resolveRenderTemplateKey(key) === DOCUMENT_TEMPLATE_KEY;
}

/** Line types that imply physical delivery / a traditional "ship to" address on the invoice. */
const PHYSICAL_SHIPMENT_ITEM_TYPES = new Set(["product", "material", "equipment"]);

/**
 * @param {Array<{ item_type?: string }>} [items]
 * @returns {boolean} True when at least one line is product-like (shipped goods / materials / equipment).
 */
export function invoiceItemsRequireShipping(items) {
  const arr = Array.isArray(items) ? items : [];
  if (arr.length === 0) return false;
  return arr.some((item) =>
    PHYSICAL_SHIPMENT_ITEM_TYPES.has(String(item?.item_type || "service").toLowerCase())
  );
}

/**
 * Normalizes draft form data and persisted invoice rows for Classic / Modern / Paidly Pro templates.
 * Used by InvoicePreview, ViewInvoice, and public InvoiceView so layout matches the create flow.
 */
export function mapInvoiceDataForTemplate(invoiceData) {
  const items = Array.isArray(invoiceData?.items) ? invoiceData.items : [];
  return {
    invoice_number: invoiceData.invoice_number || invoiceData.reference_number || "Draft",
    delivery_date: invoiceData.delivery_date,
    created_date:
      invoiceData.invoice_date ||
      invoiceData.created_date ||
      invoiceData.created_at ||
      invoiceData.delivery_date,
    status: invoiceData.status || "draft",
    type: invoiceData.type,
    items: items.map((item) => ({
      service_name: item.name || item.service_name || "Item",
      name: item.name || item.service_name,
      description: item.description ?? "",
      quantity: (() => {
        const q = Number(item.quantity ?? item.qty ?? 1);
        return Number.isFinite(q) && q > 0 ? q : 1;
      })(),
      unit_price: Number(item.unit_price ?? item.rate ?? item.price ?? 0) || 0,
      total_price: Number(
        item.total_price ??
          item.total ??
          (() => {
            const q = Number(item.quantity ?? item.qty ?? 1);
            const qty = Number.isFinite(q) && q > 0 ? q : 1;
            return qty * Number(item.unit_price ?? item.rate ?? item.price ?? 0);
          })()
      ),
      item_tax_rate: Number(item.item_tax_rate ?? 0),
      item_type: item.item_type || "service",
    })),
    item_taxes: Number(invoiceData.item_taxes ?? 0),
    subtotal: Number(invoiceData.subtotal ?? 0),
    tax_rate: Number(invoiceData.tax_rate ?? 0),
    tax_amount: Number(invoiceData.tax_amount ?? 0),
    total_amount: Number(invoiceData.total_amount ?? 0),
    discount_amount: Number(invoiceData.discount_amount ?? 0),
    discount_type: invoiceData.discount_type,
    discount_value: invoiceData.discount_value,
    notes: invoiceData.notes || "",
    terms_conditions: effectiveInvoiceTermsForDisplay(invoiceData.terms_conditions),
    project_title: invoiceData.project_title || "",
    project_description: invoiceData.project_description || "",
  };
}

// Keep export for callers that listed legacy HTML keys (not for new UI).
export { LEGACY_HTML_TEMPLATE_KEYS };
