import { formatCurrency } from "@/components/CurrencySelector";
import { format } from "date-fns";
import { buildBrandedEmailDocumentHtml } from "@/utils/brandedEmailTemplates";
import { parseDocumentBrandHex } from "@/utils/documentBrandColors";
import { escapeHtml, sanitizeHttpUrl } from "@/utils/htmlSecurity";

/**
 * Branded HTML body for quote emails (used by QuoteEmailPreviewModal and sendQuotePdfEmailToClient).
 * @param {object} quote
 * @param {object} client
 * @param {object} company - User.me() profile (company_name, currency, document_brand_*)
 * @param {string} ctaHref - Public quote URL (often track-wrapped)
 * @param {string} [pixelUrl] - Optional open-tracking pixel URL
 */
export function generateQuoteEmailHtml(quote, client, company, ctaHref, pixelUrl = "") {
    const companyName = company?.company_name || "Your Company";
    const userCurrency = company?.currency || "USD";
    const formattedAmount = formatCurrency(quote.total_amount, userCurrency);
    const validUntilDate = quote.valid_until ? new Date(quote.valid_until) : new Date();
    const validUntil = format(validUntilDate, "MMM d, yyyy");
    const primary =
        parseDocumentBrandHex(quote?.document_brand_primary) ||
        parseDocumentBrandHex(company?.document_brand_primary) ||
        "#f24e00";
    const secondary =
        parseDocumentBrandHex(quote?.document_brand_secondary) ||
        parseDocumentBrandHex(company?.document_brand_secondary) ||
        "#ff7c00";

    const base = typeof window !== "undefined" ? window.location.origin : "";
    const safeCta = sanitizeHttpUrl(ctaHref, base) || "#";
    const innerHtml = `
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Dear ${escapeHtml(client.name || "there")},</p>
      <p style="margin:0 0 20px;color:#52525b;line-height:1.6;">
        Thank you for your interest. Your quote for <strong>${escapeHtml(quote.project_title || "")}</strong> is ready — PDF attached.
      </p>
      <table role="presentation" width="100%" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;margin:0 0 20px;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Quote summary</p>
          <table role="presentation" width="100%" style="font-size:14px;color:#18181b;">
            <tr><td style="padding:4px 0;color:#71717a;">Quote #</td><td align="right" style="font-weight:600;">${escapeHtml(quote.quote_number || "")}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Total</td><td align="right" style="font-weight:700;font-size:18px;color:${primary};">${escapeHtml(formattedAmount)}</td></tr>
            <tr><td style="padding:4px 0;color:#71717a;">Valid until</td><td align="right" style="font-weight:600;">${escapeHtml(validUntil)}</td></tr>
          </table>
        </td></tr>
      </table>
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(safeCta)}" style="display:inline-block;background:linear-gradient(135deg, ${primary} 0%, ${secondary} 100%);color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(242,78,0,0.25);">
          View quote online
        </a>
      </div>
      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.55;">
        We look forward to working with you.
      </p>
    `;

    return buildBrandedEmailDocumentHtml({
        preheader: `Quote ${quote.quote_number} — ${formattedAmount} · valid ${validUntil}`,
        title: "Quote",
        subtitle: `Quote #${quote.quote_number}`,
        innerHtml,
        companyName,
        footerNote: "This is an automated message from your supplier.",
        primaryHex: primary,
        secondaryHex: secondary,
        pixelUrl,
    });
}
