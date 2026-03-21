const VALID_TEMPLATE_KEYS = ["classic", "modern", "minimal", "bold", "paidlypro"];

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

/** Resolves stored template id to a key Classic / Modern / Minimal / Bold components understand. */
export function normalizeInvoiceTemplateKey(value) {
  const k = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_TEMPLATE_KEYS.includes(k) ? k : null;
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
 * Normalizes draft form data and persisted invoice rows for Classic / Modern / Minimal / Bold templates.
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
      quantity: Number(item.quantity ?? item.qty ?? 1),
      unit_price: Number(item.unit_price ?? item.rate ?? item.price ?? 0),
      total_price: Number(
        item.total_price ??
          item.total ??
          Number(item.quantity ?? item.qty ?? 1) * Number(item.unit_price ?? item.rate ?? item.price ?? 0)
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
    terms_conditions: invoiceData.terms_conditions || "",
    project_title: invoiceData.project_title || "",
    project_description: invoiceData.project_description || "",
  };
}
