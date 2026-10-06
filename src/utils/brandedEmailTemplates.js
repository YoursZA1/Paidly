import { escapeHtml, sanitizeHttpUrl } from '@/utils/htmlSecurity';

const EMAIL_LOGO_MAX = 96;

function emailLogoPx(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 200) return null;
  return n;
}

/**
 * Fit a logo inside a square box without changing its aspect ratio.
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @param {number} [maxSide]
 * @returns {{ width: number, height: number } | null}
 */
export function fitEmailLogoPixels(naturalWidth, naturalHeight, maxSide = EMAIL_LOGO_MAX) {
  const nw = Number(naturalWidth);
  const nh = Number(naturalHeight);
  const cap = Number(maxSide);
  if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw < 1 || nh < 1) return null;
  if (!Number.isFinite(cap) || cap < 1) return null;
  const scale = Math.min(cap / nw, cap / nh, 1);
  return {
    width: Math.max(1, Math.round(nw * scale)),
    height: Math.max(1, Math.round(nh * scale)),
  };
}

/**
 * Read a logo's pixel size in the browser so the email can set matching width and height.
 * @param {string} url
 * @returns {Promise<{ width: number, height: number } | null>}
 */
export function measureEmailLogo(url) {
  if (typeof Image === 'undefined' || !url || !String(url).startsWith('https://')) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    const done = (box) => resolve(box);
    img.onload = () => done(fitEmailLogoPixels(img.naturalWidth, img.naturalHeight));
    img.onerror = () => done(null);
    img.src = url;
  });
}

/**
 * Shared transactional email HTML (Resend) — premium, document-style layout.
 * Primary brand: Paidly orange; pass primaryHex to match company document branding.
 *
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
 *   logoUrl?: string,
 *   logoWidth?: number,
 *   logoHeight?: number,
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
    secondaryHex: _secondaryHex = '#ff7c00',
    pixelUrl = '',
    logoUrl = '',
    logoWidth,
    logoHeight,
  } = opts;
  void _secondaryHex;

  const pre = escapeHtml(preheader);
  const safeTitle = escapeHtml(title);
  const safeSub = escapeHtml(subtitle);
  const safeCompany = escapeHtml(companyName);
  const safeLogoUrl = logoUrl && logoUrl.startsWith('https://') ? escapeHtml(logoUrl) : '';
  const headerBg = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(primaryHex || '').trim())
    ? String(primaryHex).trim()
    : '#18181b';
  const fittedWidth = emailLogoPx(logoWidth);
  const fittedHeight = emailLogoPx(logoHeight);
  const logoW = fittedWidth && fittedHeight ? fittedWidth : EMAIL_LOGO_MAX;
  const logoH = fittedWidth && fittedHeight ? fittedHeight : null;
  // Both attributes must match the picture. A shorter max-height stretches it flat.
  const logoHtml = safeLogoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td width="${logoW}" style="width:${logoW}px;"><img src="${safeLogoUrl}" alt="${safeCompany}" width="${logoW}"${logoH ? ` height="${logoH}"` : ''} style="display:block;width:${logoW}px;max-width:${logoW}px;height:${logoH ? `${logoH}px` : 'auto'};" /></td></tr></table>`
    : '';

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
            <td bgcolor="${headerBg}" style="background-color:${headerBg};padding:28px 24px;text-align:center;">
              <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#fff7ed;">Document</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.25;">${safeTitle}</h1>
              ${safeSub ? `<p style="margin:10px 0 0;font-size:14px;color:#ffedd5;">${safeSub}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;color:#18181b;font-size:15px;line-height:1.6;">
              ${logoHtml}
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <table role="presentation" width="100%" style="border-top:1px solid #e4e4e7;padding-top:20px;">
                <tr>
                  <td style="font-size:12px;color:#71717a;line-height:1.5;">
                    ${escapeHtml(footerNote)}<br />
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
  ${(() => {
    const safePixel = sanitizeHttpUrl(pixelUrl, typeof window !== 'undefined' ? window.location.origin : '');
    return safePixel
      ? `<img src="${escapeHtml(safePixel)}" width="1" height="1" alt="" style="display:block;border:0;outline:none;" />`
      : '';
  })()}
</body>
</html>`;
}
