/**
 * DocumentEmailService
 * Sends any Paidly business document as a branded email with optional PDF attachment.
 * Uses the existing `send-invoice-email` Supabase Edge Function (Resend).
 */

import { getStableSession } from "@/core/auth/SessionCoordinator";
import { buildBrandedEmailDocumentHtml } from "@/utils/brandedEmailTemplates";
import { generatePdfBlobFromElement } from "@/utils/generatePdfFromElement";
import { resolveDocumentBrandColors } from "@/utils/documentBrandColors";
import { typeLabel } from "@/document-engine";
import { escapeHtml } from "@/utils/htmlSecurity";

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

/**
 * Build the inner HTML for the document email body.
 */
function buildDocumentEmailInnerHtml({
  docTypeLabel,
  documentNumber,
  title,
  message,
  companyName,
}) {
  const safeType = escapeHtml(docTypeLabel || "Document");
  const safeNum = documentNumber ? escapeHtml(`#${documentNumber}`) : "";
  const safeTitle = title ? escapeHtml(title) : "";
  const safeMsg = message
    ? message
        .split("\n")
        .map((l) => `<p style="margin:0 0 8px;">${escapeHtml(l)}</p>`)
        .join("")
    : "";
  const safeCompany = escapeHtml(companyName || "");

  return `
    <p style="margin:0 0 16px;font-size:15px;color:#18181b;line-height:1.6;">
      Hi${safeTitle ? ` ${safeTitle},` : ","}
    </p>
    ${
      safeMsg ||
      `<p style="margin:0 0 16px;font-size:15px;color:#18181b;line-height:1.6;">
        Please find your ${safeType.toLowerCase()}${safeNum ? ` ${safeNum}` : ""} attached.
      </p>`
    }
    ${
      safeNum
        ? `<table role="presentation" width="100%" style="background:#f4f4f5;border-radius:8px;padding:16px;margin:0 0 20px;">
        <tr>
          <td>
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#71717a;">${safeType}</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#18181b;">${safeNum}</p>
          </td>
        </tr>
      </table>`
        : ""
    }
    <p style="margin:0;font-size:13px;color:#71717a;">
      If you have any questions, please reply to this email or contact ${safeCompany ? `<strong>${safeCompany}</strong>` : "us"} directly.
    </p>
  `;
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
  includePdf = true,
  workspace = null,
}) {
  const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const supabaseUrl = rawSupabaseUrl.replace(/\.supabase\.com$/i, ".supabase.co");
  if (!supabaseUrl) throw new Error("Supabase URL is not configured.");

  const session = await getStableSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("You must be logged in to send emails.");

  const docTypeLabel = typeLabel(doc?.type) || "Document";
  const documentNumber = doc?.document_number || null;
  const title = doc?.title || null;
  const companyName =
    workspace?.company_name || doc?.company_name || "Your Company";

  const { primary: primaryHex, secondary: secondaryHex } =
    resolveDocumentBrandColors(workspace);

  const logoUrl =
    workspace?.logo_url ||
    workspace?.company_logo_url ||
    null;

  const emailSubject =
    subject?.trim() ||
    [docTypeLabel, documentNumber ? `#${documentNumber}` : null, title]
      .filter(Boolean)
      .join(" · ");

  const innerHtml = buildDocumentEmailInnerHtml({
    docTypeLabel,
    documentNumber,
    title: recipientName || null,
    message: message?.trim() || null,
    companyName,
  });

  const html = buildBrandedEmailDocumentHtml({
    title: emailSubject,
    subtitle: title || undefined,
    innerHtml,
    companyName,
    primaryHex,
    secondaryHex,
    logoUrl: logoUrl || "",
    footerNote: `Sent by ${companyName} via Paidly.`,
  });

  let pdfBase64 = null;
  let filename = null;

  if (includePdf && pdfElement) {
    filename = [documentNumber || docTypeLabel, ".pdf"]
      .join("")
      .replace(/\s+/g, "-");
    const blob = await generatePdfBlobFromElement(pdfElement, filename);
    pdfBase64 = await pdfBlobToBase64(blob);
  }

  const body = {
    email: recipientEmail.trim(),
    subject: emailSubject,
    html,
    ...(pdfBase64 ? { pdfBase64, filename } : {}),
  };

  const res = await fetch(
    `${supabaseUrl}/functions/v1/send-invoice-email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    let details = "";
    try {
      details = await res.text();
    } catch {
      details = "";
    }
    throw new Error(details || `Email send failed (${res.status}).`);
  }

  return { success: true, sentAt: new Date().toISOString() };
}
