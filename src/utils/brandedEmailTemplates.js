/**
 * Shared transactional email HTML (Resend) — premium, document-style layout.
 * Primary brand: Paidly orange; pass primaryHex to match company document branding.
 */

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{
 *   preheader?: string,
 *   title: string,
 *   subtitle?: string,
 *   innerHtml: string,
 *   companyName: string,
 *   footerNote?: string,
 *   primaryHex?: string,
 *   secondaryHex?: string,
 *   pixelUrl?: string,
 * }} opts
 */
export function buildBrandedEmailDocumentHtml(opts) {
  const {
    preheader = '',
    title,
    subtitle = '',
    innerHtml,
    companyName,
    footerNote = 'This message was sent securely.',
    primaryHex = '#f24e00',
    secondaryHex = '#ff7c00',
    pixelUrl = '',
  } = opts;

  const pre = esc(preheader);
  const safeTitle = esc(title);
  const safeSub = esc(subtitle);
  const safeCompany = esc(companyName);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  ${pre ? `<meta name="description" content="${pre}" />` : ''}
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0">${pre}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);border:1px solid #e4e4e7;">
          <tr>
            <td style="background:linear-gradient(135deg, ${esc(primaryHex)} 0%, ${esc(secondaryHex)} 100%);padding:28px 24px;text-align:center;">
              <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">Document</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.25;">${safeTitle}</h1>
              ${safeSub ? `<p style="margin:10px 0 0;font-size:14px;color:rgba(255,255,255,0.92);">${safeSub}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;color:#18181b;font-size:15px;line-height:1.6;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" style="border-top:1px solid #e4e4e7;padding-top:20px;">
                <tr>
                  <td style="font-size:12px;color:#71717a;line-height:1.5;">
                    ${esc(footerNote)}<br />
                    <span style="color:#a1a1aa;">${safeCompany}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa;">Powered by Paidly</p>
      </td>
    </tr>
  </table>
  ${pixelUrl ? `<img src="${esc(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;outline:none;" />` : ''}
</body>
</html>`;
}
