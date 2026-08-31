/**
 * Native POS customer receipt. This is not an invoice and must not write
 * invoices / payments / document_events.
 */

const PAYMENT_METHOD_LABELS = Object.freeze({
  cash: "Cash",
  card: "Card",
  digital: "Digital Payment",
  other: "Other",
});

export function escapeReceiptHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatReceiptMoney(amount, currency = "ZAR") {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: String(currency || "ZAR").trim().toUpperCase() || "ZAR",
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatReceiptDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function paymentMethodLabel(method) {
  const key = String(method || "").trim().toLowerCase();
  return PAYMENT_METHOD_LABELS[key] || (key ? key : "");
}

function snapshotOf(sale) {
  const raw = sale?.raw_payload;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function moneyField(sale, snap, key) {
  const n = Number(sale?.[key] ?? snap[key]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Canonical receipt fields from a pos_sales_events row (or salePublicView).
 */
export function buildPosReceiptView(sale, extras = {}) {
  const snap = snapshotOf(sale);
  const currency = String(sale?.currency || extras.currency || "ZAR").trim().toUpperCase() || "ZAR";
  const isReturn = (sale?.sale_kind || "sale") === "return";
  const items = (Array.isArray(sale?.items) ? sale.items : []).map((item) => {
    const quantity = Number(item?.quantity) || 0;
    const unitPrice = Number(item?.unit_price) || 0;
    const lineTotal = Number(item?.line_total);
    return {
      name: String(item?.name || "Item"),
      quantity,
      unitPrice,
      lineTotal: Number.isFinite(lineTotal) ? lineTotal : Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100,
    };
  });

  const subtotal = moneyField(sale, snap, "subtotal") || items.reduce((sum, row) => sum + row.lineTotal, 0);
  const discountAmount = moneyField(sale, snap, "discount_amount");
  const taxAmount = moneyField(sale, snap, "tax_amount");
  const total = Math.abs(Number(sale?.total_amount) || 0);

  return {
    isReturn,
    kindLabel: isReturn ? "Return" : "Receipt",
    notice: "This is a retail receipt, not an invoice.",
    saleNumber: String(sale?.receipt_number || sale?.external_id || sale?.id || ""),
    occurredAt: sale?.occurred_at || null,
    occurredLabel: formatReceiptDateTime(sale?.occurred_at),
    brandName: String(extras.brandName || sale?.brand_name || snap.brand_name || "Paidly"),
    logoUrl: extras.logoUrl || null,
    cashierName: String(extras.cashierName || sale?.cashier_name || snap.cashier_name || "").trim(),
    customerName: String(extras.customerName || sale?.customer_name || snap.customer_name || "").trim(),
    customerEmail: String(extras.customerEmail || sale?.customer_email || snap.customer_email || "").trim(),
    currency,
    items,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    paymentMethod: sale?.payment_method || "",
    paymentLabel: paymentMethodLabel(sale?.payment_method),
    amountTendered: sale?.amount_tendered != null ? Number(sale.amount_tendered) : null,
    changeDue: sale?.change_due != null ? Number(sale.change_due) : null,
  };
}

export function receiptPdfFilename(view) {
  const slug = String(view?.saleNumber || "receipt").replace(/[^\w.-]+/g, "-");
  return `${slug}.pdf`;
}

function moneyCell(view, amount) {
  return escapeReceiptHtml(formatReceiptMoney(amount, view.currency));
}

/**
 * Inner HTML (tables allowed by transactional email sanitizer). No invoice chrome.
 */
export function renderPosReceiptInnerHtml(view) {
  const rows = (view.items || [])
    .map(
      (item) => `<tr>
        <td>${escapeReceiptHtml(item.name)}</td>
        <td align="center">${item.quantity}</td>
        <td align="right">${moneyCell(view, item.unitPrice)}</td>
        <td align="right">${moneyCell(view, item.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const tender =
    view.amountTendered != null
      ? `<tr><td colspan="3">Tendered</td><td align="right">${moneyCell(view, view.amountTendered)}</td></tr>`
      : "";
  const change =
    view.changeDue != null
      ? `<tr><td colspan="3">Change</td><td align="right">${moneyCell(view, view.changeDue)}</td></tr>`
      : "";

  const logo = view.logoUrl
    ? `<p><img src="${escapeReceiptHtml(view.logoUrl)}" alt="" width="72" height="72"></p>`
    : "";

  return `${logo}
<h1>${escapeReceiptHtml(view.brandName)}</h1>
<p><strong>${escapeReceiptHtml(view.kindLabel)} ${escapeReceiptHtml(view.saleNumber)}</strong></p>
<p>${escapeReceiptHtml(view.occurredLabel)}</p>
${view.cashierName ? `<p>Staff: ${escapeReceiptHtml(view.cashierName)}</p>` : ""}
${view.customerName ? `<p>Customer: ${escapeReceiptHtml(view.customerName)}</p>` : ""}
<table width="100%" cellpadding="4" cellspacing="0">
  <thead>
    <tr>
      <th align="left">Product</th>
      <th align="center">Qty</th>
      <th align="right">Price</th>
      <th align="right">Total</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr><td colspan="3">Subtotal</td><td align="right">${moneyCell(view, view.subtotal)}</td></tr>
    <tr><td colspan="3">Discount</td><td align="right">${moneyCell(view, view.discountAmount)}</td></tr>
    <tr><td colspan="3">Tax</td><td align="right">${moneyCell(view, view.taxAmount)}</td></tr>
    <tr><td colspan="3"><strong>${view.isReturn ? "Refund" : "Total"}</strong></td><td align="right"><strong>${moneyCell(view, view.total)}</strong></td></tr>
    ${view.paymentLabel ? `<tr><td colspan="3">Payment</td><td align="right">${escapeReceiptHtml(view.paymentLabel)}</td></tr>` : ""}
    ${tender}
    ${change}
  </tfoot>
</table>
<p>${escapeReceiptHtml(view.notice)}</p>
<p>Thank you</p>`;
}

export function renderPosReceiptPrintDocument(view) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeReceiptHtml(view.kindLabel)} ${escapeReceiptHtml(view.saleNumber)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #111; max-width: 420px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { margin: 2px 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th, td { padding: 6px 0; border-bottom: 1px solid #e5e5e5; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #666; }
  tfoot td { border-bottom: none; }
  img { max-height: 48px; width: auto; }
</style></head>
<body>
${renderPosReceiptInnerHtml(view)}
<script>window.onload = () => { window.print(); }</script>
</body></html>`;
}

export function openPosReceiptPrint(view) {
  const win = globalThis.window;
  if (!win) return;
  const w = win.open("", "_blank", "noopener,noreferrer,width=480,height=720");
  if (!w) return;
  w.document.write(renderPosReceiptPrintDocument(view));
  w.document.close();
}
