import { roundMoney } from "./posCheckoutMath.js";

function saleSnapshot(row) {
  return row?.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
    ? { ...row.raw_payload }
    : {};
}

function invoiceDateFromSale(sale) {
  const occurred = sale?.occurred_at ? new Date(sale.occurred_at) : new Date();
  if (Number.isNaN(occurred.getTime())) return new Date().toISOString().slice(0, 10);
  return occurred.toISOString().slice(0, 10);
}

/**
 * Build a paid tax-invoice copy of a settled POS sale.
 * Does not create a new receivable or payment request.
 */
export function buildInvoiceFromPosSale(sale, opts = {}) {
  if (!sale?.id) {
    return { ok: false, error: "Sale is required", code: "SALE_REQUIRED" };
  }
  if ((sale.sale_kind || "sale") !== "sale") {
    return { ok: false, error: "Only a completed sale can become a tax invoice", code: "NOT_A_SALE" };
  }
  if (sale.status && sale.status !== "completed") {
    return { ok: false, error: "Only a completed sale can become a tax invoice", code: "SALE_NOT_COMPLETED" };
  }

  const clientId = String(opts.clientId || sale.client_id || "").trim();
  if (!clientId) {
    return {
      ok: false,
      error: "Attach a named customer before converting to an invoice",
      code: "CLIENT_REQUIRED",
    };
  }

  const items = Array.isArray(sale.items) ? sale.items : [];
  if (items.length === 0) {
    return { ok: false, error: "Sale has no line items", code: "NO_ITEMS" };
  }

  const snap = saleSnapshot(sale);
  const lineItems = [];
  let productSubtotal = 0;

  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const unit = roundMoney(item.unit_price);
    const total = roundMoney(item.line_total != null ? item.line_total : qty * unit);
    productSubtotal = roundMoney(productSubtotal + total);
    const sku = item.sku ? String(item.sku) : "";
    lineItems.push({
      service_id: item.product_id || null,
      service_name: String(item.name || item.service_name || "Item"),
      description: sku ? `SKU ${sku}` : "",
      quantity: qty,
      unit_price: unit,
      total_price: total,
    });
  }

  if (lineItems.length === 0) {
    return { ok: false, error: "Sale has no line items", code: "NO_ITEMS" };
  }

  const discount = roundMoney(snap.discount_amount != null ? snap.discount_amount : 0);
  if (discount > 0) {
    lineItems.push({
      service_id: null,
      service_name: "Discount",
      description: "Till discount",
      quantity: 1,
      unit_price: roundMoney(-discount),
      total_price: roundMoney(-discount),
    });
  }

  const taxAmount = roundMoney(snap.tax_amount != null ? snap.tax_amount : sale.tax_amount || 0);
  const taxRate = roundMoney(snap.tax_rate != null ? snap.tax_rate : sale.tax_rate || 0);
  const subtotal = roundMoney(productSubtotal - discount);
  const total = roundMoney(sale.total_amount);
  const receipt = String(sale.receipt_number || sale.external_id || sale.id);
  const invoiceDate = invoiceDateFromSale(sale);
  const createdBy = opts.createdBy || null;

  return {
    ok: true,
    clientId,
    invoice: {
      org_id: sale.org_id || opts.orgId || null,
      client_id: clientId,
      company_id: opts.companyId || sale.company_id || null,
      invoice_number: `INV-POS-${receipt}`,
      status: "paid",
      project_title: `POS ${receipt}`,
      invoice_date: invoiceDate,
      delivery_date: invoiceDate,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: total,
      currency: sale.currency || "ZAR",
      notes: `Tax invoice for settled POS sale ${receipt}. Already paid at the till — not a new payment request.`,
      terms_conditions:
        "This invoice is a tax copy of a completed retail sale. Do not collect payment again.",
      created_by: createdBy,
      user_id: createdBy,
      pos_sale_event_id: sale.id,
    },
    items: lineItems,
  };
}
