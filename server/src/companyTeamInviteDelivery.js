import { sendHtmlEmail } from "./sendInvoice.js";
import { sanitizeOneLine } from "./inputValidation.js";

export function companyInviteRedirectUrl() {
  const origin =
    (process.env.CLIENT_ORIGIN && String(process.env.CLIENT_ORIGIN).split(",")[0]?.trim()) ||
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    "https://www.paidly.co.za";
  return `${String(origin).replace(/\/$/, "")}/ResetPassword`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ to: string, inviteLink: string, companyName?: string, inviterName?: string, roleLabel?: string }} opts
 */
export async function sendCompanyTeamInviteEmail({
  to,
  inviteLink,
  companyName = "your company",
  inviterName = "Your team admin",
  roleLabel = "team member",
}) {
  const safeCompany = sanitizeOneLine(companyName, 120) || "your company";
  const safeInviter = sanitizeOneLine(inviterName, 120) || "Your team admin";
  const safeRole = sanitizeOneLine(roleLabel, 80) || "team member";
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
