/**
 * Supplier email for a purchase order: the full order inline (no public link to the PO), built from
 * the same document model as the preview.
 *
 * /api/send-email sanitizes bodies with server/src/sanitizeHtmlStrings.js, which drops every `style`
 * attribute. Layout therefore uses only what that allowlist keeps: table width/border/cellpadding,
 * td/th align, and semantic tags.
 */
import { escapeHtml } from "@/utils/htmlSecurity";
import { formatCurrencyInvoice } from "@/components/CurrencySelector";
import { buildPurchaseOrderDocumentModel } from "./purchaseOrderDocumentModel";

export function buildPurchaseOrderEmailHtml({ purchaseOrder, items, supplier, business, productsById, message }) {
  const m = buildPurchaseOrderDocumentModel({ purchaseOrder, items, supplier, business, productsById });
  const money = (v) => escapeHtml(formatCurrencyInvoice(v, m.currency));
  const e = (v) => escapeHtml(String(v ?? ""));
  const lines = (v) => e(v).replace(/\n/g, "<br/>");
  const from = m.business?.name || "Our business";

  const rows = m.lines
    .map(
      (l) => `<tr>
<td align="left">${e(l.name)}${l.detail ? `<br/><em>${e(l.detail)}</em>` : ""}</td>
<td align="right">${e(l.quantity)}</td>
<td align="right">${money(l.unitPrice)}</td>
${m.hasDiscount ? `<td align="right">${l.discountPercent ? `${e(l.discountPercent)}%` : "—"}</td>` : ""}
<td align="right">${l.vatRate ? `${e(l.vatRate)}%` : "—"}</td>
<td align="right"><strong>${money(l.total)}</strong></td>
</tr>`
    )
    .join("");

  const totalRow = (label, value, strong = false) =>
    `<tr><td align="left">${strong ? `<strong>${e(label)}</strong>` : e(label)}</td><td align="right">${strong ? `<strong>${money(value)}</strong>` : money(value)}</td></tr>`;

  const block = (title, body) => (body ? `<h4>${e(title)}</h4><p>${lines(body)}</p>` : "");

  return `<div>
<p>${message ? lines(message) : `Please find our purchase order ${e(m.number)} below.`}</p>
<hr/>
<h2>PURCHASE ORDER ${e(m.number)}</h2>
<p>From <strong>${e(from)}</strong>${m.orderDate ? `<br/>Order date: ${e(m.orderDate)}` : ""}${m.expectedDate ? `<br/>Expected delivery: ${e(m.expectedDate)}` : ""}</p>
<table width="100%" border="0" cellpadding="6" cellspacing="0" role="presentation">
<thead><tr>
<th align="left">Item</th>
<th align="right">Qty</th>
<th align="right">Unit price</th>
${m.hasDiscount ? `<th align="right">Disc.</th>` : ""}
<th align="right">VAT</th>
<th align="right">Total</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<table width="100%" border="0" cellpadding="4" cellspacing="0" role="presentation">
<tbody>
${totalRow("Subtotal", m.totals.subtotal)}
${m.totals.discountTotal ? totalRow("Discount", -m.totals.discountTotal) : ""}
${totalRow("VAT", m.totals.vatTotal)}
${totalRow("Total order value", m.totals.total, true)}
</tbody>
</table>
${block("Payment terms", m.paymentTerms)}
${block("Deliver to", [m.deliveryAddress, m.deliveryInstructions].filter(Boolean).join("\n"))}
${block("Notes", m.notes)}
${block("Terms", m.terms)}
${block("Contact", [m.business?.name, m.business?.email, m.business?.phone].filter(Boolean).join(" · "))}
</div>`;
}

/** Subject line for the supplier email: "Purchase Order PO-1001 — Business". */
export function purchaseOrderEmailSubject(purchaseOrder, business) {
  return `Purchase Order ${purchaseOrder?.po_number || ""}${business?.name ? ` — ${business.name}` : ""}`.trim();
}

/** Default opening the user can edit before sending. */
export function defaultPurchaseOrderEmailMessage({ purchaseOrder, supplier, business }) {
  return [
    `Hello${supplier?.name ? ` ${supplier.name}` : ""},`,
    "",
    `Please find attached Purchase Order ${purchaseOrder?.po_number || ""}${business?.name ? ` from ${business.name}` : ""}.`,
  ].join("\n");
}

/**
 * Covering email when the PO PDF is attached (sent through the send-invoice-email edge function).
 * Concise and supplier-facing: the user's opening, order total and expected delivery, a request to
 * confirm, and the sign-off. No internal figures (received, paid, outstanding). Every value is escaped.
 */
export function buildPurchaseOrderAttachmentEmailHtml({ purchaseOrder, items, supplier, business, productsById, message }) {
  const m = buildPurchaseOrderDocumentModel({ purchaseOrder, items, supplier, business, productsById });
  const e = (v) => escapeHtml(String(v ?? ""));
  const lines = (v) => e(v).replace(/\n/g, "<br/>");
  const from = m.business?.name || "";
  const opening = message || defaultPurchaseOrderEmailMessage({ purchaseOrder, supplier, business });
  const fact = (label, value) =>
    value ? `<tr><td style="padding:2px 16px 2px 0;color:#4b5563;">${e(label)}:</td><td style="padding:2px 0;font-weight:600;">${e(value)}</td></tr>` : "";

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111827;max-width:560px;">
<p style="margin:0 0 14px;">${lines(opening)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;font-size:14px;">
${fact("Order Total", formatCurrencyInvoice(m.totals.total, m.currency))}
${fact("Expected Delivery", m.expectedDate)}
</table>
<p style="margin:0 0 14px;">Please confirm receipt of the order.</p>
<p style="margin:0;">Regards,${from ? `<br/>${e(from)}` : ""}</p>
</div>`;
}
