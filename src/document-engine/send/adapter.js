import { isValidEmail } from "@/utils/inputSanitization";
import {
  DOCUMENT_ENGINE_CHANNELS,
  DOCUMENT_ENGINE_ERROR,
  DOCUMENT_ENGINE_TYPES,
  DocumentEngineError,
  buildSendIdempotencyKey,
  createDocumentContext,
  wrapDocumentEngineError,
} from "@shared/documents/documentEngine.js";
import { generateDocumentPdf } from "../pdf/adapter";
import { dispatchDocumentEmail } from "./email";
import { recordDocumentSend, persistDocumentMessageLog } from "./message";

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

function resolveRecipientEmail(recipient, context) {
  if (typeof recipient === "string") return recipient.trim();
  return String(
    recipient?.email || context?.recipient?.email || context?.client?.email || ""
  ).trim();
}

/**
 * Shared document send pipeline.
 * Payslips must not attach an unencrypted payroll PDF — use a secure link instead.
 *
 * @param {object} input
 * @param {object} [deps]
 */
export async function sendDocument(input = {}, deps = {}) {
  const context = input.context?.documentType
    ? input.context
    : createDocumentContext(input.context || input);
  const channel = String(input.channel || DOCUMENT_ENGINE_CHANNELS.email).toLowerCase();
  if (channel !== DOCUMENT_ENGINE_CHANNELS.email) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.INVALID_DOCUMENT_STATE,
      `Unsupported send channel: ${channel}`
    );
  }

  const email = resolveRecipientEmail(input.recipient, context);
  if (!email) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.RECIPIENT_MISSING,
      "Recipient has no email address."
    );
  }
  if (!isValidEmail(email)) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.RECIPIENT_MISSING,
      "Recipient email address is invalid."
    );
  }

  const options = input.options && typeof input.options === "object" ? input.options : {};
  const attachPdf =
    options.attachPdf !== undefined
      ? Boolean(options.attachPdf)
      : context.documentType !== DOCUMENT_ENGINE_TYPES.payslip;

  if (context.documentType === DOCUMENT_ENGINE_TYPES.payslip && attachPdf) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.UNAUTHORIZED_DOCUMENT_ACCESS,
      "Payslips must be delivered via a secure authorised link, not as an email attachment."
    );
  }

  const sendAttempt = String(
    options.sendAttempt || options.sendAttemptId || options.idempotencyKey || input.sendAttempt || ""
  ).trim();
  const idempotencyKey =
    options.idempotencyKey ||
    buildSendIdempotencyKey({
      documentType: context.documentType,
      documentId: context.documentId,
      sendAttempt,
    });

  const transport = deps.transport || dispatchDocumentEmail;
  const generatePdf = deps.generatePdf || generateDocumentPdf;
  const recordSentEvent = deps.recordSentEvent;
  const persistLog = deps.persistLog || persistDocumentMessageLog;
  const recordSend = deps.recordSend || recordDocumentSend;

  let artifact = input.artifact || null;
  let pdfBase64 = options.pdfBase64 || "";
  if (attachPdf && !pdfBase64) {
    try {
      artifact = artifact || (await generatePdf(context));
      if (artifact?.blob) {
        pdfBase64 = await pdfBlobToBase64(artifact.blob);
      }
    } catch (error) {
      throw wrapDocumentEngineError(
        error,
        DOCUMENT_ENGINE_ERROR.PDF_GENERATION_FAILED,
        "PDF generation failed"
      );
    }
    if (!pdfBase64) {
      throw new DocumentEngineError(
        DOCUMENT_ENGINE_ERROR.PDF_GENERATION_FAILED,
        "PDF generation failed"
      );
    }
  }

  let providerResult;
  try {
    providerResult = await transport({
      pdfBase64: pdfBase64 || undefined,
      email,
      subject: options.subject || `${context.documentType} ${context.documentNumber || ""}`.trim(),
      html: options.html || "<p>Your document is ready.</p>",
      filename: artifact?.filename || options.filename,
      invoiceNum: context.documentNumber || context.documentId,
      fromName: options.fromName || "Paidly",
      clientName: options.clientName || context.client?.name || "there",
      amountDue: options.amountDue ?? "",
      dueDate: options.dueDate || "",
      idempotencyKey,
    });
  } catch (error) {
    throw wrapDocumentEngineError(
      error,
      DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
      "Email provider failed"
    );
  }

  if (!providerResult || providerResult.success === false) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
      providerResult?.error || "Email provider failed"
    );
  }

  const sentAt = new Date().toISOString();
  if (options.persistMessageLog && options.trackingToken) {
    try {
      await persistLog({
        documentType: context.documentType,
        documentId: context.documentId,
        clientId: context.documentType === DOCUMENT_ENGINE_TYPES.payslip ? null : context.clientId,
        channel,
        recipient: email,
        trackingToken: options.trackingToken,
        sentAt,
      });
    } catch (e) {
      console.warn("Failed to record message log after send:", e);
    }
  }

  if (options.recordDocumentSend !== false && context.documentType !== DOCUMENT_ENGINE_TYPES.payslip) {
    await recordSend(context.documentType, context.documentId, context.clientId, channel);
  }

  if (typeof recordSentEvent === "function") {
    await recordSentEvent({
      orgId: context.businessId,
      documentType: context.documentType,
      documentId: context.documentId,
      clientId: context.documentType === DOCUMENT_ENGINE_TYPES.payslip ? null : context.clientId,
      sendAttemptId: sendAttempt || idempotencyKey,
      channel,
    });
  }

  return {
    success: true,
    sentAt,
    channel,
    documentType: context.documentType,
    documentId: context.documentId,
    idempotencyKey,
    provider: providerResult,
    artifact: artifact || null,
  };
}
