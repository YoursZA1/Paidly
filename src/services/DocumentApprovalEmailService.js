/**
 * Sends approval-request emails when hub documents enter `pending` status.
 * Uses the authenticated `/api/send-email` route (Resend, HTML only).
 */

import { SendEmail } from "@/api/integrations";
import { buildBrandedEmailDocumentHtml } from "@/utils/brandedEmailTemplates";
import { leaveTypeLabel } from "@/document-engine/leaveRequest";
import { typeLabel } from "@/document-engine";
import { escapeHtml } from "@/utils/htmlSecurity";
import { createPageUrl } from "@/utils";
import { resolveDocumentBrandColors } from "@/utils/documentBrandColors";

const APPROVER_ROLES = ["owner", "admin"];

/**
 * Resolve who should receive an approval notification.
 * @param {{ assigned_user_id?: string | null, created_by?: string | null }} doc
 * @param {Array<{ user_id: string, role?: string, email?: string | null, full_name?: string | null, label?: string }>} members
 * @param {{ excludeUserId?: string | null }} [options]
 */
export function resolveApproverRecipient(doc, members, { excludeUserId = null } = {}) {
  const rows = Array.isArray(members) ? members : [];
  const pick = (predicate) => {
    const member = rows.find(predicate);
    if (!member?.email?.trim()) return null;
    return {
      user_id: member.user_id,
      email: member.email.trim(),
      name: member.full_name?.trim() || member.label?.trim() || "Approver",
    };
  };

  if (doc?.assigned_user_id) {
    const assignee = pick(
      (m) => m.user_id === doc.assigned_user_id && m.user_id !== excludeUserId
    );
    if (assignee) return assignee;
  }

  for (const role of APPROVER_ROLES) {
    const match = pick((m) => m.role === role && m.user_id !== excludeUserId);
    if (match) return match;
  }

  return pick((m) => Boolean(m.email?.trim()) && m.user_id !== excludeUserId);
}

function approvalSummaryLines(doc) {
  const lines = [];
  const docType = doc?.type;

  if (docType === "leave_request" && doc.metadata?.leave) {
    const leave = doc.metadata.leave;
    if (leave.leave_type) lines.push(`Leave type: ${leaveTypeLabel(leave.leave_type)}`);
    if (leave.start_date && leave.end_date) {
      lines.push(`Dates: ${leave.start_date} → ${leave.end_date}`);
    }
    if (leave.days_requested != null) lines.push(`Days requested: ${leave.days_requested}`);
    if (leave.reason) lines.push(`Reason: ${leave.reason}`);
  } else if (doc?.body?.trim()) {
    lines.push(doc.body.trim().slice(0, 400));
  } else if (doc?.title) {
    lines.push(doc.title);
  }

  return lines;
}

function buildApprovalEmailInnerHtml({ doc, approverName, submitterName, documentUrl, summaryLines }) {
  const safeApprover = escapeHtml(approverName || "there");
  const safeSubmitter = escapeHtml(submitterName || "A team member");
  const safeType = escapeHtml(typeLabel(doc?.type) || "Document");
  const safeTitle = escapeHtml(doc?.title || safeType);
  const safeUrl = escapeHtml(documentUrl);

  const summaryHtml = summaryLines.length
    ? `<ul style="margin:0 0 16px;padding-left:20px;color:#18181b;font-size:14px;line-height:1.6;">
        ${summaryLines.map((line) => `<li style="margin:0 0 6px;">${escapeHtml(line)}</li>`).join("")}
      </ul>`
    : "";

  return `
    <p style="margin:0 0 16px;font-size:15px;color:#18181b;line-height:1.6;">
      Hi ${safeApprover},
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#18181b;line-height:1.6;">
      <strong>${safeSubmitter}</strong> submitted a ${safeType.toLowerCase()} for your approval:
      <strong>${safeTitle}</strong>.
    </p>
    ${summaryHtml}
    <p style="margin:0 0 20px;">
      <a href="${safeUrl}" style="display:inline-block;background:#f24e00;color:#ffffff;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;text-decoration:none;">
        Review in Paidly
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:#71717a;">
      You can approve or decline this request from the document page.
    </p>
  `;
}

/**
 * @param {{
 *   doc: object,
 *   approverEmail: string,
 *   approverName?: string | null,
 *   submitterName?: string | null,
 *   companyName?: string | null,
 *   workspace?: object | null,
 * }} params
 */
export async function sendDocumentApprovalRequestEmail({
  doc,
  approverEmail,
  approverName,
  submitterName,
  companyName,
  workspace = null,
}) {
  const email = String(approverEmail || "").trim();
  if (!email) throw new Error("Approver email is required.");

  const docTypeLabel = typeLabel(doc?.type) || "Document";
  const title = doc?.title || docTypeLabel;
  const subject = `Approval needed: ${title}`;
  const documentUrl = `${window.location.origin}${createPageUrl("Documents")}/${encodeURIComponent(doc.id)}`;
  const summaryLines = approvalSummaryLines(doc);
  const orgName = companyName?.trim() || workspace?.company_name || "Your team";

  const { primary: primaryHex, secondary: secondaryHex } = resolveDocumentBrandColors(workspace);
  const logoUrl = workspace?.logo_url || workspace?.company_logo_url || "";

  const innerHtml = buildApprovalEmailInnerHtml({
    doc,
    approverName,
    submitterName,
    documentUrl,
    summaryLines,
  });

  const html = buildBrandedEmailDocumentHtml({
    title: "Approval requested",
    subtitle: title,
    innerHtml,
    companyName: orgName,
    primaryHex,
    secondaryHex,
    logoUrl: logoUrl || "",
    footerNote: `Sent by ${orgName} via Paidly.`,
    preheader: `${submitterName || "A team member"} submitted ${docTypeLabel.toLowerCase()} for approval`,
  });

  await SendEmail({ to: email, subject, body: html });
  return { sentAt: new Date().toISOString(), recipientEmail: email };
}
