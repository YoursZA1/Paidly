/**
 * HTML layout for admin → user outreach (Resend). Table-based for broad client support.
 *
 * Env (all optional except origins fall back to https://www.paidly.co.za):
 * - ADMIN_OUTREACH_MAILER_HEADER_SUBTITLE — line under “Paidly” in header (default: “Update from Paidly”).
 * - ADMIN_OUTREACH_MAILER_FOOTER — extra footer banner (plain text, multiline); URLs linkified like the body.
 * - PUBLIC_APP_ORIGIN or CLIENT_ORIGIN (first comma-separated origin) — “Open Paidly” + /Login and footer links.
 * - ADMIN_OUTREACH_REPLY_TO — optional; also used as Resend reply_to when set (helps trust + replies).
 *
 * Message body: plain text from admin; `https?://…` URLs become clickable links when they pass isSafeHttpUrl.
 *
 * Deliverability: use a verified sending domain in Resend (SPF/DKIM/DMARC). We send explicit text/html,
 * optional Microsoft OOF suppression + entity-ref header, and optional reply-to — vs HTML-only mail.
 */

import { isSafeHttpUrl, isValidEmail, sanitizeOneLine } from "./inputValidation.js";

const BRAND_ACCENT = "#f24e00";
const BRAND_HEADER_BG = "#0f172a";
const BRAND_HEADER_TEXT = "#ffffff";
const BODY_TEXT = "#334155";
const MUTED = "#64748b";
const CARD_BG = "#ffffff";
const OUTER_BG = "#f1f5f9";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attrEscape(s) {
  return escapeHtml(String(s));
}

/**
 * Escape plain text, turn http(s) URLs into links (safe host allowlist via isSafeHttpUrl), newlines → &lt;br/&gt;.
 * @param {string} plain
 * @returns {string}
 */
export function linkifyPlainTextForEmail(plain) {
  const text = String(plain ?? "");
  const out = [];
  let last = 0;
  const re = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(escapeHtml(text.slice(last, m.index)));
    const raw = m[0];
    const href = raw.replace(/[.,;:!?)]+$/g, "");
    const punct = raw.slice(href.length);
    if (isSafeHttpUrl(href)) {
      out.push(
        `<a href="${attrEscape(href)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;font-weight:600;text-decoration:underline;">${escapeHtml(href)}</a>`
      );
    } else {
      out.push(escapeHtml(raw));
    }
    if (punct) {
      out.push(escapeHtml(punct));
    }
    last = re.lastIndex;
  }
  out.push(escapeHtml(text.slice(last)));
  return out.join("").replace(/\r\n/g, "\n").replace(/\n/g, "<br/>");
}

function getMailerAppOrigin() {
  const pub = String(process.env.PUBLIC_APP_ORIGIN || "").trim().replace(/\/$/, "");
  if (pub && /^https?:\/\//i.test(pub)) return pub;
  const client = String(process.env.CLIENT_ORIGIN || "").split(",")[0].trim().replace(/\/$/, "");
  if (client && /^https?:\/\//i.test(client)) return client;
  return "https://www.paidly.co.za";
}

/** @param {string} plainBody */
const SUBTITLE_MAX = 200;
const FOOTER_ENV_MAX = 4000;

function getOutreachContext(plainBody) {
  const body = String(plainBody || "");
  const subtitleRaw = String(process.env.ADMIN_OUTREACH_MAILER_HEADER_SUBTITLE || "").trim();
  const subtitle =
    sanitizeOneLine(subtitleRaw || "Update from Paidly", SUBTITLE_MAX) || "Update from Paidly";
  const footerPlain = String(process.env.ADMIN_OUTREACH_MAILER_FOOTER || "")
    .trim()
    .slice(0, FOOTER_ENV_MAX);
  const appOrigin = getMailerAppOrigin();
  const loginUrl = `${appOrigin.replace(/\/$/, "")}/Login`;
  return { plainBody: body, subtitle, footerPlain, appOrigin, loginUrl };
}

/**
 * Plain-text sibling to HTML (multipart/alternative friendly).
 * @param {{ plainBody: string, recipientEmail?: string }} opts
 */
export function buildAdminPlatformOutreachPlainText(opts) {
  const c = getOutreachContext(opts.plainBody);
  const toAddr = String(opts.recipientEmail || "").trim();

  let t = "";
  t += "PAIDLY\n";
  t += `${c.subtitle}\n`;
  t += "\n";
  t += `${c.plainBody.trim()}\n`;
  t += "\n";
  t += "────────────────────────\n";
  t += `Open Paidly: ${c.loginUrl}\n`;
  t += `Website: ${c.appOrigin}\n`;

  if (c.footerPlain) {
    t += "\n---\n";
    t += `${c.footerPlain.trim()}\n`;
  }

  t += "\n────────────────────────\n";
  if (toAddr && isValidEmail(toAddr)) {
    t += `This account notice was sent to: ${toAddr}\n`;
  }
  t +=
    "You are receiving this because you have a Paidly account associated with this email address.\n";
  t += `Help & contact: ${c.appOrigin}\n`;

  return t.trim();
}

/**
 * @param {{ plainBody: string }} opts
 * @returns {string} full HTML document fragment for email body
 */
export function buildAdminPlatformOutreachHtml(opts) {
  const c = getOutreachContext(opts.plainBody);
  const { plainBody, subtitle, footerPlain, appOrigin, loginUrl } = c;

  const bodyHtml = linkifyPlainTextForEmail(plainBody);
  const footerHtml = footerPlain ? linkifyPlainTextForEmail(footerPlain) : "";
  const preheader = plainBody.replace(/\s+/g, " ").trim().slice(0, 120);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Paidly</title>
</head>
<body style="margin:0;padding:0;background-color:${OUTER_BG};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${OUTER_BG};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin:0 auto;">
          <!-- Header banner -->
          <tr>
            <td style="background-color:${BRAND_HEADER_BG};border-radius:12px 12px 0 0;border-top:4px solid ${BRAND_ACCENT};padding:28px 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${BRAND_HEADER_TEXT};">
                      Paidly
                    </p>
                    <p style="margin:8px 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:#94a3b8;">
                      ${escapeHtml(subtitle)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Main card -->
          <tr>
            <td style="background-color:${CARD_BG};padding:28px 24px 8px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BODY_TEXT};">
                ${bodyHtml}
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px;">
                <tr>
                  <td style="border-radius:8px;background-color:${BRAND_ACCENT};">
                    <a href="${attrEscape(loginUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Open Paidly
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">
                Prefer the app?
                <a href="${attrEscape(appOrigin)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">Visit ${escapeHtml(appOrigin.replace(/^https?:\/\//, ""))}</a>
              </p>
            </td>
          </tr>
          ${
            footerHtml
              ? `
          <!-- Footer banner (optional) -->
          <tr>
            <td style="background-color:#e2e8f0;padding:20px 24px;border-left:4px solid ${BRAND_ACCENT};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:${BODY_TEXT};">
              ${footerHtml}
            </td>
          </tr>
          `
              : ""
          }
          <!-- Bottom strip -->
          <tr>
            <td style="background-color:${CARD_BG};border-radius:0 0 12px 12px;padding:20px 24px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;">
              You are receiving this because you have a Paidly account tied to this email address.<br/>
              Questions? Reply to this email or visit
              <a href="${attrEscape(appOrigin)}" style="color:#64748b;text-decoration:underline;">our website</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}
