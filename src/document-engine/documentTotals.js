/**
 * Pure totals for unified documents — shared by DocumentService and UI previews.
 */

export function normalizeLineTotals(raw, index) {
  const qty = Number(raw.quantity ?? 1);
  const unit = Number(raw.unit_price ?? 0);
  const total =
    raw.total_price != null && raw.total_price !== ""
      ? Number(raw.total_price)
      : Math.round(qty * unit * 100) / 100;
  return {
    line_order: raw.line_order != null ? Number(raw.line_order) : index,
    description: raw.description ?? raw.service_name ?? "",
    quantity: qty,
    unit_price: unit,
    total_price: total,
    metadata: typeof raw.metadata === "object" && raw.metadata != null ? raw.metadata : {},
  };
}

/**
 * @param {unknown[]} items
 * @param {number|string} taxRate
 * @param {number|string} discountAmount
 */
export function aggregateFromItems(items, taxRate, discountAmount) {
  const rows = [];
  let subtotal = 0;
  (items || []).forEach((raw, i) => {
    const row = normalizeLineTotals(raw, i);
    rows.push(row);
    subtotal += row.total_price;
  });
  const tr = Number(taxRate) || 0;
  const disc = Number(discountAmount) || 0;
  const sub = Math.round(subtotal * 100) / 100;
  const tax_amount = Math.round(sub * (tr / 100) * 100) / 100;
  const total_amount = Math.round((sub + tax_amount - disc) * 100) / 100;
  return { rows, subtotal: sub, tax_amount, total_amount };
}
