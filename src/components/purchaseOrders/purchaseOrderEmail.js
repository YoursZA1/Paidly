/**
 * Supplier email for a purchase order: the full order inline (no public link to the PO), built from
 * the same document model as the preview.
 *
 * Sent through /api/send-invoice, which keeps the email style allowlist (Paidly orange header).
 */
import { escapeHtml } from "@/utils/htmlSecurity";
import { formatCurrencyInvoice } from "@/components/CurrencySelector";
import { buildBrandedEmailDocumentHtml } from "@/utils/brandedEmailTemplates";
import { buildPurchaseOrderDocumentModel } from "./purchaseOrderDocumentModel";

function brandedPurchaseOrderEmail({ title, subtitle, preheader, innerHtml, companyName }) {
  return buildBrandedEmailDocumentHtml({
    preheader,
    title,
    subtitle,
    innerHtml,
    companyName: companyName || "Paidly",
    footerNote: "The purchase order PDF is attached to this email.",
    primaryHex: "#f24e00",
  });
}

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

  const inner = `<div>
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
  return brandedPurchaseOrderEmail({
    title: `Purchase order ${m.number}`,
    subtitle: from,
    preheader: `Purchase order ${m.number} from ${from}`,
    innerHtml: inner,
    companyName: from,
  });
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
 * Covering email when the PO PDF is attached. Paidly orange header, the supplier's note,
 * order total and expected delivery, then a request to confirm. No internal figures
 * (received, paid, outstanding). Every value is escaped.
 */
export function buildPurchaseOrderAttachmentEmailHtml({ purchaseOrder, items, supplier, business, productsById, message }) {
  const m = buildPurchaseOrderDocumentModel({ purchaseOrder, items, supplier, business, productsById });
  const e = (v) => escapeHtml(String(v ?? ""));
  const lines = (v) => e(v).replace(/\n/g, "<br/>");
  const from = m.business?.name || "";
  const opening = message || defaultPurchaseOrderEmailMessage({ purchaseOrder, supplier, business });
  const fact = (label, value) =>
    value ? `<tr><td style="padding:4px 16px 4px 0;color:#71717a;">${e(label)}</td><td style="padding:4px 0;font-weight:700;color:#18181b;">${e(value)}</td></tr>` : "";

  const inner = `<p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">${lines(opening)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;margin:0 0 16px;">
<tr><td style="padding:16px 18px;">
<p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#f24e00;">Purchase order</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">
${fact("Order", m.number)}
${fact("Order total", formatCurrencyInvoice(m.totals.total, m.currency))}
${fact("Expected delivery", m.expectedDate)}
</table>
</td></tr>
</table>
<p style="margin:0 0 14px;color:#52525b;">Please confirm receipt of the order. The PDF is attached.</p>
<p style="margin:0;color:#18181b;">Regards,${from ? `<br/><strong>${e(from)}</strong>` : ""}</p>`;

  return brandedPurchaseOrderEmail({
    title: `Purchase order ${m.number}`,
    subtitle: from,
    preheader: `Purchase order ${m.number}${from ? ` from ${from}` : ""}`,
    innerHtml: inner,
    companyName: from,
  });
}
