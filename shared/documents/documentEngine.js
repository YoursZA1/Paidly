/**
 * Document Engine contracts — isomorphic (browser + server).
 * PDF/send/observe adapters live in `src/document-engine/`; this module is the
 * shared context, errors, delivery URLs, and payslip safety helpers.
 */

export const DOCUMENT_ENGINE_TYPES = Object.freeze({
  invoice: "invoice",
  quote: "quote",
  payslip: "payslip",
});

export const DOCUMENT_ENGINE_CHANNELS = Object.freeze({
  email: "email",
});

export const DOCUMENT_ENGINE_ERROR = Object.freeze({
  PDF_GENERATION_FAILED: "PDF_GENERATION_FAILED",
  DOCUMENT_NOT_FOUND: "DOCUMENT_NOT_FOUND",
  RECIPIENT_MISSING: "RECIPIENT_MISSING",
  UNAUTHORIZED_DOCUMENT_ACCESS: "UNAUTHORIZED_DOCUMENT_ACCESS",
  TEMPLATE_MISSING: "TEMPLATE_MISSING",
  STORAGE_FAILED: "STORAGE_FAILED",
  EMAIL_PROVIDER_FAILED: "EMAIL_PROVIDER_FAILED",
  INVALID_DOCUMENT_STATE: "INVALID_DOCUMENT_STATE",
});

export const DOCUMENT_OBSERVE_ACTION = Object.freeze({
  PAYMENT_CTA: "payment_cta",
  PAYMENT_LINK: "payment_link",
  ACCEPT_QUOTE: "accept_quote",
  REJECT_QUOTE: "reject_quote",
  PRIMARY_CTA: "primary_cta",
  VIEW_PAYSLIP: "view_payslip",
  DOWNLOAD_PAYSLIP: "download_payslip",
});

/** Never persist these keys on generic document_events.payload (payslip or otherwise). */
export const PAYSLIP_SENSITIVE_METADATA_KEYS = Object.freeze([
  "net_pay",
  "gross_pay",
  "tax_amount",
  "tax_deduction",
  "uif_deduction",
  "pension_deduction",
  "medical_aid_deduction",
  "total_deductions",
  "basic_salary",
  "bank_details",
  "bank_account",
  "account_number",
  "id_number",
  "id_numbers",
  "national_id",
  "employee_id_number",
  "calculation_breakdown",
  "allowances",
  "other_deductions",
]);

const ENGINE_TYPE_SET = new Set(Object.values(DOCUMENT_ENGINE_TYPES));

export class DocumentEngineError extends Error {
  constructor(code, message, details = null) {
    super(message || code);
    this.name = "DocumentEngineError";
    this.code = code;
    this.details = details;
  }
}

export function isDocumentEngineType(value) {
  return ENGINE_TYPE_SET.has(String(value || "").trim().toLowerCase());
}

export function normalizeDocumentEngineType(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "invoices") return DOCUMENT_ENGINE_TYPES.invoice;
  if (key === "quotes") return DOCUMENT_ENGINE_TYPES.quote;
  if (key === "payslips") return DOCUMENT_ENGINE_TYPES.payslip;
  if (ENGINE_TYPE_SET.has(key)) return key;
  return null;
}

export function assertDocumentEngineType(raw) {
  const type = normalizeDocumentEngineType(raw);
  if (type) return type;
  throw new DocumentEngineError(
    DOCUMENT_ENGINE_ERROR.INVALID_DOCUMENT_STATE,
    "Unsupported document type"
  );
}

function documentNumberFromRecord(type, record) {
  if (!record || typeof record !== "object") return null;
  if (type === DOCUMENT_ENGINE_TYPES.invoice) {
    return record.invoice_number || record.reference_number || null;
  }
  if (type === DOCUMENT_ENGINE_TYPES.quote) return record.quote_number || null;
  if (type === DOCUMENT_ENGINE_TYPES.payslip) return record.payslip_number || null;
  return record.document_number || null;
}

/**
 * Shared adapter context. Document types are not required to share business fields.
 *
 * @param {object} input
 */
export function createDocumentContext(input = {}) {
  const record = input.record && typeof input.record === "object" ? input.record : null;
  const documentType = assertDocumentEngineType(input.documentType || input.document_type || record?.type);
  const documentId = String(input.documentId || input.document_id || record?.id || "").trim();
  if (!documentId) {
    throw new DocumentEngineError(DOCUMENT_ENGINE_ERROR.DOCUMENT_NOT_FOUND, "Document not found");
  }
  const metadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? { ...input.metadata }
      : {};
  return {
    documentType,
    documentId,
    businessId: String(input.businessId || input.orgId || input.org_id || record?.org_id || "").trim() || null,
    clientId:
      input.clientId !== undefined
        ? input.clientId
        : input.client_id !== undefined
          ? input.client_id
          : record?.client_id || null,
    ownerId: input.ownerId || input.owner_id || record?.created_by || record?.user_id || null,
    documentNumber: input.documentNumber || input.document_number || documentNumberFromRecord(documentType, record),
    metadata,
    record,
    client: input.client || null,
    user: input.user || null,
    bankingDetail: input.bankingDetail || input.banking_detail || null,
    recipient: input.recipient || null,
  };
}

export function buildSendIdempotencyKey({ documentType, documentId, sendAttempt } = {}) {
  const type = String(documentType || "").trim().toLowerCase();
  const id = String(documentId || "").trim();
  const attempt = String(sendAttempt || "").trim();
  if (!type || !id) return "";
  return attempt ? `${type}:${id}:${attempt}` : `${type}:${id}`;
}

export function defaultObserveClickAction(documentType) {
  const type = normalizeDocumentEngineType(documentType);
  if (type === DOCUMENT_ENGINE_TYPES.quote) return DOCUMENT_OBSERVE_ACTION.PRIMARY_CTA;
  if (type === DOCUMENT_ENGINE_TYPES.payslip) return DOCUMENT_OBSERVE_ACTION.VIEW_PAYSLIP;
  return DOCUMENT_OBSERVE_ACTION.PAYMENT_CTA;
}

export function normalizeEmailAddress(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Payslip links are employee-bound. A missing sent-to email is not a public invoice.
 */
export function isAuthorizedPayslipViewer({ viewer, shareToken, sentToEmail } = {}) {
  const sent = normalizeEmailAddress(sentToEmail);
  const token = String(shareToken || "").trim();
  if (!token) return false;
  if (!sent) return true;
  if (!viewer?.shareToken || !viewer?.email) return false;
  return (
    String(viewer.shareToken).trim().toLowerCase() === token.toLowerCase() &&
    normalizeEmailAddress(viewer.email) === sent
  );
}

export function payslipRequiresEmailVerification(sentToEmail) {
  return Boolean(normalizeEmailAddress(sentToEmail));
}

export function sanitizeDocumentEventMetadata(documentType, metadata) {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
  const type = normalizeDocumentEngineType(documentType);
  const strip = type === DOCUMENT_ENGINE_TYPES.payslip
    ? PAYSLIP_SENSITIVE_METADATA_KEYS
    : ["bank_details", "account_number", "id_number", "national_id"];
  for (const key of strip) {
    delete source[key];
  }
  return source;
}

/**
 * Public / secure delivery path (no origin). Payslips never share the invoice `/view/` route.
 */
export function resolveDocumentDeliveryPath(context, { shareToken, trackingToken } = {}) {
  const type = context?.documentType || normalizeDocumentEngineType(context);
  const token = String(shareToken || "").trim();
  const tracking = String(trackingToken || "").trim();
  if (!token) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.UNAUTHORIZED_DOCUMENT_ACCESS,
      "Document has no share token"
    );
  }
  if (type === DOCUMENT_ENGINE_TYPES.invoice) {
    return tracking ? `/view/${token}?token=${encodeURIComponent(tracking)}` : `/view/${token}`;
  }
  if (type === DOCUMENT_ENGINE_TYPES.quote) {
    const base = `/PublicQuote?token=${encodeURIComponent(token)}`;
    return tracking ? `${base}&tracking=${encodeURIComponent(tracking)}` : base;
  }
  if (type === DOCUMENT_ENGINE_TYPES.payslip) {
    return `/PublicPayslip?token=${encodeURIComponent(token)}`;
  }
  throw new DocumentEngineError(
    DOCUMENT_ENGINE_ERROR.INVALID_DOCUMENT_STATE,
    "Unsupported document type"
  );
}

export function resolveDocumentDeliveryUrl(context, { origin, shareToken, trackingToken } = {}) {
  const base = String(origin || "").replace(/\/$/, "");
  const path = resolveDocumentDeliveryPath(context, { shareToken, trackingToken });
  return base ? `${base}${path}` : path;
}

export function pdfArtifactFilename(context) {
  const type = context?.documentType;
  const number = String(context?.documentNumber || context?.documentId || type || "document").trim();
  if (type === DOCUMENT_ENGINE_TYPES.invoice) return `${number}.pdf`;
  if (type === DOCUMENT_ENGINE_TYPES.quote) return `${number}.pdf`;
  if (type === DOCUMENT_ENGINE_TYPES.payslip) return `${number}.pdf`;
  return `${number}.pdf`;
}

export function toPdfArtifact({ blob = null, buffer = null, filename, context } = {}) {
  if (!blob && !buffer) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.PDF_GENERATION_FAILED,
      "PDF generation failed"
    );
  }
  return {
    blob: blob || null,
    buffer: buffer || null,
    filename: filename || pdfArtifactFilename(context),
    mimeType: "application/pdf",
    documentId: context?.documentId || null,
    documentType: context?.documentType || null,
  };
}

export function wrapDocumentEngineError(error, fallbackCode, fallbackMessage) {
  if (error instanceof DocumentEngineError) return error;
  const wrapped = new DocumentEngineError(
    fallbackCode || DOCUMENT_ENGINE_ERROR.EMAIL_PROVIDER_FAILED,
    fallbackMessage || error?.message || "Document engine failed",
    { causeMessage: error?.message || String(error || "") }
  );
  wrapped.cause = error;
  return wrapped;
}
