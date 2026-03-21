const VALID_TEMPLATE_KEYS = ["classic", "modern", "minimal", "bold"];

/** Resolves stored template id to a key Classic / Modern / Minimal / Bold components understand. */
export function normalizeInvoiceTemplateKey(value) {
  const k = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_TEMPLATE_KEYS.includes(k) ? k : null;
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
    })),
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
