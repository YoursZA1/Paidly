/**
 * DocumentEmailService
 * Sends any Paidly business document as a branded email with optional PDF attachment.
 * Uses the existing `send-invoice-email` Supabase Edge Function (Resend).
 */

import { buildBrandedEmailDocumentHtml, measureEmailLogo } from "@/utils/brandedEmailTemplates";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { waitUntilElementReady } from "@/lib/documentPdf/waitForPdfDocumentReady";
import { parseDocumentBrandHex } from "@/utils/documentBrandColors";
import { typeLabel } from "@/document-engine";
import { escapeHtml, sanitizeHttpUrl } from "@/utils/htmlSecurity";
import { getLogo } from "@/services/AssetService";
import { buildViewDocumentButtonHtml } from "@/utils/shareEmailHtml";
import { dispatchDocumentEmail } from "@/document-engine/send/email";
import { supabase } from "@/lib/supabaseClient";

async function ensureHubShareToken(doc) {
  const existing = String(doc?.public_share_token || "").trim();
  if (existing) return existing;
  if (!doc?.id) return "";
  const token = crypto.randomUUID();
  const { error } = await supabase
    .from("documents")
    .update({ public_share_token: token })
    .eq("id", doc.id);
  if (error) return "";
  return token;
}

function hubShareUrl(token) {
  if (!token || typeof window === "undefined") return "";
  return `${window.location.origin}/PublicDocument?token=${encodeURIComponent(token)}`;
}

function pdfBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read PDF blob."));
    reader.readAsDataURL(blob);
  });
}

/** Same shell as invoice and quote emails: summary, Paidly orange button, company logo. */
export function generateHubDocumentEmailHtml({
  doc,
  recipientName,
  company,
  message,
  shareUrl = "",
  includePdf = false,
  logoBox = null,
}) {
  const docTypeLabel = typeLabel(doc?.type) || "Document";
  const companyName = company?.company_name || "Your Company";
  const number = String(doc?.document_number || "").trim();
  const title = String(doc?.title || "").trim();
  const primary =
    parseDocumentBrandHex(doc?.document_brand_primary) ||
    parseDocumentBrandHex(company?.document_brand_primary) ||
    "#f24e00";
  const secondary =
    parseDocumentBrandHex(doc?.document_brand_secondary) ||
    parseDocumentBrandHex(company?.document_brand_secondary) ||
    "#ff7c00";
  const rawLogo = company?.logo_url || company?.company_logo_url || "";
  const resolvedLogo = rawLogo ? getLogo(rawLogo) : "";
  const logoUrl = resolvedLogo && resolvedLogo.startsWith("https://") ? resolvedLogo : "";
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const safeCta = shareUrl ? sanitizeHttpUrl(shareUrl, base) : "";
  const intro = String(message || "").trim()
    || (includePdf
      ? `Your ${docTypeLabel.toLowerCase()} is ready — PDF attached.`
      : `Your ${docTypeLabel.toLowerCase()} is ready. Open it with the button below.`);

  const innerHtml = `
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Dear ${escapeHtml(recipientName || "there")},</p>
      <p style="margin:0 0 20px;color:#52525b;line-height:1.6;">${escapeHtml(intro)}</p>
      <table role="presentation" width="100%" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;margin:0 0 20px;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">${escapeHtml(docTypeLabel)} summary</p>
          <table role="presentation" width="100%" style="font-size:14px;color:#18181b;">
            ${number ? `<tr><td style="padding:4px 0;color:#71717a;">Number</td><td align="right" style="font-weight:600;">${escapeHtml(number)}</td></tr>` : ""}
            ${title ? `<tr><td style="padding:4px 0;color:#71717a;">Title</td><td align="right" style="font-weight:600;">${escapeHtml(title)}</td></tr>` : ""}
          </table>
        </td></tr>
      </table>
      ${safeCta ? buildViewDocumentButtonHtml(safeCta, `View ${docTypeLabel}`) : ""}
      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.55;">We look forward to working with you.</p>
  `;

  return buildBrandedEmailDocumentHtml({
    preheader: [docTypeLabel, number, title].filter(Boolean).join(" · "),
    title: docTypeLabel,
    subtitle: number ? `#${number}` : title,
    innerHtml,
    companyName,
    footerNote: "This is an automated message from your supplier.",
    primaryHex: primary,
    secondaryHex: secondary,
    logoUrl,
    logoWidth: logoBox?.width,
    logoHeight: logoBox?.height,
  });
}

/** Inbox subject, same shape as "{company name} invoice". */
export function hubDocumentEmailSubject(companyName, docTypeLabel) {
  const name = String(companyName || "").trim() || "Paidly";
  const label = String(docTypeLabel || "document").trim().toLowerCase();
  return `${name} ${label}`;
}

/**
 * Send a document as a branded email with optional PDF attachment.
 *
 * @param {{
 *   pdfElement: HTMLElement | null,
 *   doc: object,
 *   recipientEmail: string,
 *   recipientName?: string | null,
 *   subject?: string | null,
 *   message?: string | null,
 *   includePdf?: boolean,
 *   workspace?: object | null,
 * }} params
 */
export async function sendDocumentEmail({
  pdfElement,
  doc,
  recipientEmail,
  recipientName,
  subject,
  message,
  includePdf = false,
  workspace = null,
}) {
  const docTypeLabel = typeLabel(doc?.type) || "Document";
  const documentNumber = doc?.document_number || null;
  const companyName = workspace?.company_name || doc?.company_name || "Your Company";
  const rawLogo = workspace?.logo_url || workspace?.company_logo_url || "";
  const resolvedLogo = rawLogo ? getLogo(rawLogo) : "";
  const logoBox = await measureEmailLogo(resolvedLogo);

  const emailSubject = subject?.trim() || hubDocumentEmailSubject(companyName, docTypeLabel);
  const shareToken = await ensureHubShareToken(doc);
  const html = generateHubDocumentEmailHtml({
    doc,
    recipientName,
    company: workspace,
    message,
    shareUrl: hubShareUrl(shareToken),
    includePdf,
    logoBox,
  });

  let pdfBase64 = null;
  let filename = null;

  if (includePdf && pdfElement) {
    filename = [documentNumber || docTypeLabel, ".pdf"]
      .join("")
      .replace(/\s+/g, "-");
    const ready = await waitUntilElementReady(pdfElement);
    const blob = await generatePdfBlobFromElement(ready || pdfElement, filename);
    pdfBase64 = await pdfBlobToBase64(blob);
  }

  await dispatchDocumentEmail({
    pdfBase64: pdfBase64 || undefined,
    email: recipientEmail.trim(),
    subject: emailSubject,
    html,
    filename: filename || undefined,
    invoiceNum: documentNumber || doc?.id || docTypeLabel,
    fromName: companyName,
    clientName: recipientName || "there",
    amountDue: "",
    dueDate: "",
    idempotencyKey: crypto.randomUUID(),
  });

  return { success: true, sentAt: new Date().toISOString() };
}
