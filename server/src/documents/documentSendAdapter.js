import { sendHtmlEmail } from "../sendInvoice.js";
import { appendDocumentEventBestEffort } from "./documentEventService.js";
import {
  DOCUMENT_EVENT_ACTOR,
  DOCUMENT_EVENT_SOURCE,
  DOCUMENT_EVENT_TYPE,
} from "../../../shared/documents/documentEvents.js";
import {
  DOCUMENT_ENGINE_ERROR,
  DocumentEngineError,
  buildSendIdempotencyKey,
  resolveDocumentDeliveryUrl,
  sanitizeDocumentEventMetadata,
} from "../../../shared/documents/documentEngine.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPayslipDeliveryEmail({ employeeName, periodLabel, payslipNumber, url }) {
  return {
    subject: `Your Paidly payslip for ${periodLabel}`,
    html: `
      <p>Hi ${escapeHtml(employeeName || "there")},</p>
      <p>Your Paidly payslip for <strong>${escapeHtml(periodLabel)}</strong> is ready.</p>
      <p>Payslip number: <strong>${escapeHtml(payslipNumber || "")}</strong></p>
      <p><a href="${escapeHtml(url)}">View your payslip</a> (sign-in or email verification may be required).</p>
      <p>This link is for you only. Do not forward it.</p>
    `,
  };
}

/**
 * Send a payslip via the shared email provider. Never attaches payroll PDF.
 * Marks nothing as sent — caller persists status after this returns success.
 */
export async function sendPayslipEmail({
  to,
  employeeName,
  periodLabel,
  payslipNumber,
  shareToken,
  origin,
  orgId,
  payslipId,
  sendAttempt,
  transport = sendHtmlEmail,
} = {}) {
  const email = String(to || "").trim();
  if (!email) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.RECIPIENT_MISSING,
      "Recipient has no email address."
    );
  }
  const token = String(shareToken || "").trim();
  if (!token) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.UNAUTHORIZED_DOCUMENT_ACCESS,
      "Payslip has no secure share token."
    );
  }
  const url = resolveDocumentDeliveryUrl(
    { documentType: "payslip" },
    { origin, shareToken: token }
  );
  const mail = buildPayslipDeliveryEmail({
    employeeName,
    periodLabel,
    payslipNumber,
    url,
  });
  const result = await transport(email, mail.subject, mail.html, "Paidly");
  if (!result || result.success === false) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
      result?.error || "Email provider failed"
    );
  }

  const attempt = String(sendAttempt || "").trim() || payslipId;
  if (orgId && payslipId) {
    await appendDocumentEventBestEffort({
      orgId,
      sourceKind: DOCUMENT_EVENT_SOURCE.PAYSLIP,
      sourceId: payslipId,
      documentType: "payslip",
      eventType: DOCUMENT_EVENT_TYPE.sent,
      actorType: DOCUMENT_EVENT_ACTOR.USER,
      sendAttemptId: attempt,
      metadata: sanitizeDocumentEventMetadata("payslip", {
        channel: "email",
        source: "payroll_send",
        send_attempt_id: attempt,
        idempotency_key: buildSendIdempotencyKey({
          documentType: "payslip",
          documentId: payslipId,
          sendAttempt: attempt,
        }),
      }),
    });
  }

  return { success: true, url, provider: result };
}

export async function recordPayslipCreatedEvent({ orgId, payslipId }) {
  if (!orgId || !payslipId) return { event: null, skipped: true };
  return appendDocumentEventBestEffort({
    orgId,
    sourceKind: DOCUMENT_EVENT_SOURCE.PAYSLIP,
    sourceId: payslipId,
    documentType: "payslip",
    eventType: DOCUMENT_EVENT_TYPE.created,
    actorType: DOCUMENT_EVENT_ACTOR.SYSTEM,
    metadata: sanitizeDocumentEventMetadata("payslip", { source: "payroll_finalize" }),
  });
}
