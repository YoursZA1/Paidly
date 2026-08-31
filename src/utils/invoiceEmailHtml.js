import { formatCurrency } from "@/utils/currencyCalculations";
import { format } from "date-fns";
import { buildBrandedEmailDocumentHtml } from "@/utils/brandedEmailTemplates";
import { parseDocumentBrandHex } from "@/utils/documentBrandColors";
import { escapeHtml, sanitizeHttpUrl } from "@/utils/htmlSecurity";
import { getLogo } from "@/services/AssetService";

function formatDueDate(invoice) {
  const raw = invoice?.delivery_date || invoice?.due_date;
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  try {
    return format(d, "MMM d, yyyy");
  } catch {
    return "—";
  }
}

/**
 * Branded HTML body for invoice emails (used by EmailPreviewModal and sendInvoicePdfEmailToClient).
 * @param {object} invoice
 * @param {object} client
 * @param {object} company - User.me() / profile
 * @param {string} ctaHref
 * @param {string} [pixelUrl]
 */
export function generateInvoiceEmailHtml(invoice, client, company, ctaHref, pixelUrl = "") {
  const companyName = company?.company_name || "Your Company";
  const userCurrency = company?.currency || "USD";
  const formattedAmount = formatCurrency(invoice.total_amount, userCurrency);
  const dueDate = formatDueDate(invoice);
  const primary =
    parseDocumentBrandHex(invoice?.document_brand_primary) ||
    parseDocumentBrandHex(company?.document_brand_primary) ||
    "#f24e00";
  const secondary =
    parseDocumentBrandHex(invoice?.document_brand_secondary) ||
    parseDocumentBrandHex(company?.document_brand_secondary) ||
    "#ff7c00";
  const rawLogoPath = company?.logo_url || company?.company_logo_url || "";
  const resolvedLogo = rawLogoPath ? getLogo(rawLogoPath) : "";
  const logoUrl = resolvedLogo && resolvedLogo.startsWith("https://") ? resolvedLogo : "";

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const safeCta = sanitizeHttpUrl(ctaHref, base) || "#";
  const innerHtml = `
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Dear ${escapeHtml(client.name || "there")},</p>
      <p style="margin:0 0 20px;color:#52525b;line-height:1.6;">
        Thank you for your business. Your invoice for <strong>${escapeHtml(invoice.project_title || "")}</strong> is ready — PDF attached.
      </p>
      <table role="presentation" width="100%" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;margin:0 0 20px;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Summary</p>
          <table role="presentation" width="100%" style="font-size:14px;color:#18181b;">
            <tr><td style="padding:4px 0;color:#71717a;">Invoice #</td><td align="right" style="font-weight:600;">${escapeHtml(invoice.invoice_number || "")}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Amount due</td><td align="right" style="font-weight:700;font-size:18px;color:${primary};">${escapeHtml(formattedAmount)}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Due</td><td align="right" style="font-weight:600;">${escapeHtml(dueDate)}</td></tr>
          </table>
        </td></tr>
      </table>
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(safeCta)}" style="display:inline-block;background:linear-gradient(135deg, ${primary} 0%, ${secondary} 100%);color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(242,78,0,0.25);">
          View invoice online
        </a>
      </div>
      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.55;">
        Questions? Reply to this email or contact ${escapeHtml(companyName)}.
      </p>
    `;

  return buildBrandedEmailDocumentHtml({
    preheader: `Invoice ${invoice.invoice_number} — ${formattedAmount} due ${dueDate}`,
    title: "Invoice",
    subtitle: `Invoice #${invoice.invoice_number}`,
    innerHtml,
    companyName,
    footerNote: "This is an automated message from your supplier.",
    primaryHex: primary,
    secondaryHex: secondary,
    pixelUrl,
    logoUrl,
  });
}
