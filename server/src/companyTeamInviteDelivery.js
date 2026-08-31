import { sendHtmlEmail } from "./sendInvoice.js";
import { sanitizeOneLine } from "./inputValidation.js";
import { resolvePublicAppOrigin } from "./companyInviteAppUrl.js";

export function companyInviteRedirectUrl() {
  return `${resolvePublicAppOrigin()}/ResetPassword`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ to: string, inviteLink: string, companyName?: string, inviterName?: string, roleLabel?: string, tillName?: string | null, inviteCode?: string | null, posOnly?: boolean }} opts
 */
export async function sendCompanyTeamInviteEmail({
  to,
  inviteLink,
  companyName = "your company",
  inviterName = "Your team admin",
  roleLabel = "team member",
  tillName = null,
  inviteCode = null,
  posOnly = false,
}) {
  const safeCompany = sanitizeOneLine(companyName, 120) || "your company";
  const safeInviter = sanitizeOneLine(inviterName, 120) || "Your team admin";
  const safeRole = sanitizeOneLine(roleLabel, 80) || "team member";
  const safeTill = sanitizeOneLine(tillName, 80);
  const safeCode = sanitizeOneLine(inviteCode, 24);

  if (posOnly) {
    const subject = `You're invited to Paidly POS at ${safeCompany}`;
    const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
  <p>You're invited to Paidly POS.</p>
  <p><strong>Business:</strong> ${escapeHtml(safeCompany)}<br/>
  <strong>Till:</strong> ${escapeHtml(safeTill || "Assigned till")}<br/>
  <strong>Role:</strong> POS Staff</p>
  ${
    safeCode
      ? `<p>Your Till Invite Code:</p><p style="font-size: 28px; letter-spacing: 0.12em; font-weight: 700;">${escapeHtml(safeCode)}</p>`
      : ""
  }
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(inviteLink)}" style="display: inline-block; background: #ea580c; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
      Open your invitation
    </a>
  </p>
  <p style="font-size: 13px; word-break: break-all; color: #334155;">${escapeHtml(inviteLink)}</p>
  <p style="font-size: 13px; color: #64748b; margin-top: 24px;">This invitation provides POS-only access. It does not provide access to the main Paidly dashboard, invoices, reports, settings or other business information.</p>
</body>
</html>`;
    const text = [
      "You're invited to Paidly POS.",
      "",
      `Business: ${safeCompany}`,
      `Till: ${safeTill || "Assigned till"}`,
      "Role: POS Staff",
      "",
      safeCode ? `Your Till Invite Code:\n${safeCode}` : null,
      "",
      "Open your invitation:",
      inviteLink,
      "",
      "This invitation provides POS-only access.",
      "It does not provide access to the main Paidly dashboard, invoices, reports, settings or other business information.",
    ]
      .filter((line) => line != null)
      .join("\n");

    return sendHtmlEmail(to, subject, html, {
      text,
      tags: [{ name: "category", value: "pos_till_invite" }],
    });
  }

  const subject = `You're invited to join ${safeCompany} on Paidly`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #0f172a;">
  <p>Hi,</p>
  <p><strong>${escapeHtml(safeInviter)}</strong> invited you to join <strong>${escapeHtml(safeCompany)}</strong> on Paidly as a <strong>${escapeHtml(safeRole)}</strong>.</p>
  <p style="margin: 24px 0;">
    <a href="${escapeHtml(inviteLink)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
      Accept invitation
    </a>
  </p>
  <p style="font-size: 14px; color: #475569;">Or copy this link into your browser:</p>
  <p style="font-size: 13px; word-break: break-all; color: #334155;">${escapeHtml(inviteLink)}</p>
  <p style="font-size: 13px; color: #64748b; margin-top: 24px;">This secure link expires automatically. If you did not expect this invite, you can ignore this email.</p>
</body>
</html>`;

  const text = [
    `${safeInviter} invited you to join ${safeCompany} on Paidly as a ${safeRole}.`,
    "",
    "Accept your invitation:",
    inviteLink,
    "",
    "This secure link expires automatically.",
  ].join("\n");

  return sendHtmlEmail(to, subject, html, {
    text,
    tags: [{ name: "category", value: "company_team_invite" }],
  });
}
