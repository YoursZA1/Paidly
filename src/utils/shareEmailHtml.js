function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function viewLabel(itemType) {
  const raw = String(itemType || "document").trim();
  if (!raw) return "View document";
  return `View ${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
}

/** Paidly orange. A solid fill survives email clients that strip gradients. */
const PAIDLY_BUTTON = "#f24e00";

/** Email-safe button. bgcolor covers clients that drop the style attribute. */
export function buildViewDocumentButtonHtml(shareUrl, label = "View Quote") {
  const safeUrl = escapeHtml(shareUrl);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto;">
    <tr>
      <td align="center" bgcolor="${PAIDLY_BUTTON}" style="background-color:${PAIDLY_BUTTON};border-radius:8px;">
        <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${safeLabel}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * Transactional share email. The View control is a table button so it stays a button
 * after HTML sanitizing and in clients that ignore CSS on anchors.
 */
export function buildDocumentShareEmailHtml({
  itemType = "document",
  message = "",
  shareUrl = "",
  companyName = "Paidly",
  attachPdf = false,
}) {
  const safeUrl = escapeHtml(shareUrl);
  const body = escapeHtml(message || `Please find your ${itemType} below.`).replace(/\n/g, "<br/>");
  const company = escapeHtml(companyName || "Paidly");
  const pdfNote = attachPdf
    ? `<p style="font-size:14px;color:#52525b;margin:0 0 8px;">A PDF copy is attached to this email.</p>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#f9fafb;">
      <h1 style="font-size:24px;color:#18181b;text-align:center;margin:0 0 20px;">You've received a new ${escapeHtml(itemType)}</h1>
      <div style="background-color:#ffffff;padding:30px;border:1px solid #e4e4e7;border-radius:8px;">
        <p style="font-size:16px;color:#3f3f46;line-height:1.6;margin:0 0 16px;">${body}</p>
        ${pdfNote}
        ${buildViewDocumentButtonHtml(shareUrl, viewLabel(itemType))}
        <p style="font-size:14px;color:#71717a;margin:20px 0 0;">
          Or copy this link:<br/>
          <a href="${safeUrl}" target="_blank" style="color:#f24e00;word-break:break-all;">${safeUrl}</a>
        </p>
      </div>
      <p style="text-align:center;margin:20px 0 0;font-size:12px;color:#a1a1aa;">Sent from ${company}</p>
    </div>
  `.trim();
}
