/**
 * Company email templates (plan feature `email_templates`, Business+).
 * Stored in organizations.email_templates; prefill the send-email dialog for invoices and quotes.
 * Starter (and any company without templates) gets the built-in wording below.
 */

export const EMAIL_TEMPLATE_DOC_TYPES = Object.freeze(["invoice", "quote"]);

export const EMAIL_TEMPLATE_PLACEHOLDERS = Object.freeze([
  { key: "client_name", label: "Client name" },
  { key: "document_number", label: "Invoice / quote number" },
  { key: "company_name", label: "Your company name" },
  { key: "amount", label: "Total amount" },
  { key: "due_date", label: "Due / valid-until date" },
]);

export const EMAIL_TEMPLATE_LIMITS = Object.freeze({ subject: 200, message: 2000 });

export const DEFAULT_EMAIL_TEMPLATES = Object.freeze({
  invoice: Object.freeze({
    subject: "Invoice {document_number} from {company_name}",
    message: "Hi {client_name},\n\nPlease find invoice {document_number} for {amount}, due {due_date}.\n\nThank you,\n{company_name}",
  }),
  quote: Object.freeze({
    subject: "Quote {document_number} from {company_name}",
    message: "Hi {client_name},\n\nPlease find quote {document_number} for {amount}, valid until {due_date}.\n\nKind regards,\n{company_name}",
  }),
});

/**
 * Validate and normalise a templates payload. Unknown keys are dropped; blank fields fall back to
 * the defaults when rendered. Throws an Error with a user-facing message when a field is too long.
 * @param {unknown} input
 * @returns {{ invoice?: { subject: string, message: string }, quote?: { subject: string, message: string } }}
 */
export function normalizeEmailTemplates(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  for (const type of EMAIL_TEMPLATE_DOC_TYPES) {
    const t = src[type];
    if (!t || typeof t !== "object") continue;
    const subject = String(t.subject ?? "").trim();
    const message = String(t.message ?? "").replace(/\r\n/g, "\n").trim();
    if (subject.length > EMAIL_TEMPLATE_LIMITS.subject) {
      throw new Error(`The ${type} subject can be at most ${EMAIL_TEMPLATE_LIMITS.subject} characters.`);
    }
    if (message.length > EMAIL_TEMPLATE_LIMITS.message) {
      throw new Error(`The ${type} message can be at most ${EMAIL_TEMPLATE_LIMITS.message} characters.`);
    }
    if (subject || message) out[type] = { subject, message };
  }
  return out;
}

/**
 * The template in effect for a document type: the company's saved one (when its plan includes
 * email templates), else the built-in default.
 * @param {object | null | undefined} saved organizations.email_templates
 * @param {"invoice" | "quote"} docType
 * @param {boolean} allowed plan includes email_templates
 */
export function effectiveEmailTemplate(saved, docType, allowed) {
  const base = DEFAULT_EMAIL_TEMPLATES[docType] || DEFAULT_EMAIL_TEMPLATES.invoice;
  const own = allowed && saved && typeof saved === "object" ? saved[docType] : null;
  return {
    subject: own?.subject || base.subject,
    message: own?.message || base.message,
  };
}

/**
 * Replace {placeholders}. Unknown placeholders are left as typed; missing values become "".
 * Output is plain text (the caller escapes it for HTML).
 * @param {string} text
 * @param {Record<string, string | number | null | undefined>} values
 */
export function renderEmailTemplate(text, values = {}) {
  return String(text || "").replace(/\{([a-z_]+)\}/g, (match, key) => {
    if (!EMAIL_TEMPLATE_PLACEHOLDERS.some((p) => p.key === key)) return match;
    const v = values[key];
    return v == null ? "" : String(v);
  });
}
