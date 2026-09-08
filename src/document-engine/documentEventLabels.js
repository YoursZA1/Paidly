/**
 * Human-readable labels for `document_events` (audit / activity UI).
 */

const EVENT_TYPE_LABELS = Object.freeze({
  created: "Document created",
  updated: "Details updated",
  status_changed: "Status changed",
  sent: "Sent to client",
  opened: "Client opened document",
  clicked: "Link clicked",
  viewed: "Viewed",
  accepted: "Quote accepted",
  rejected: "Quote rejected",
  expired: "Quote expired",
  converted_to_invoice: "Quote converted to invoice",
  payment_intent: "Payment started",
  payment_processing: "Payment processing",
  payment_failed: "Payment failed",
  payment_cancelled: "Payment cancelled",
  payment_refunded: "Payment refunded",
  payment_partially_refunded: "Payment partially refunded",
  paid: "Payment received",
  reminded: "Follow-up sent",
  viewed_not_paid: "Viewed, still unpaid",
  due_soon: "Due soon",
  due_today: "Due today",
  overdue: "Overdue",
  converted: "Converted",
  created_from_quote: "Created from quote",
  created_from_conversion: "Created from conversion",
  attachment_added: "Attachment added",
  comment_added: "Comment added",
  archived: "Archived",
  unarchived: "Restored from archive",
  // PDF workflow
  pdf_generated: "PDF generated",
  pdf_downloaded: "PDF downloaded",
  sent_to_client: "Sent to client",
  signature_requested: "Signature requested",
  signature_viewed: "Signature viewed",
  signature_completed: "Signature completed",
  signature_declined: "Signature declined",
  approval_requested: "Submitted for approval",
});

/**
 * @param {string} eventType
 */
const QUOTE_EVENT_LABELS = Object.freeze({
  created: "Quote created",
  sent: "Quote sent",
  opened: "Client viewed quote",
  clicked: "Quote action clicked",
  reminded: "Quote follow-up sent",
  accepted: "Client accepted quote",
  rejected: "Client rejected quote",
  expired: "Quote expired",
  converted_to_invoice: "Quote converted to invoice",
});

const PAYSLIP_EVENT_LABELS = Object.freeze({
  created: "Payslip created",
  sent: "Payslip sent",
  delivered: "Payslip delivered",
  opened: "Employee opened payslip",
  clicked: "Payslip link clicked",
  downloaded: "Payslip downloaded",
  failed: "Payslip delivery failed",
  bounced: "Payslip email bounced",
});

const INVOICE_EVENT_LABELS = Object.freeze({
  created: "Invoice created",
  sent: "Invoice sent",
  opened: "Client viewed invoice",
  clicked: "Payment link clicked",
  reminded: "Payment reminder sent",
  viewed_not_paid: "Viewed, still unpaid",
  due_soon: "Invoice due soon",
  due_today: "Invoice due today",
  overdue: "Invoice overdue",
  paid: "Payment received",
  payment_intent: "Payment started",
  payment_processing: "Payment processing",
  payment_failed: "Payment failed",
  payment_cancelled: "Payment cancelled",
  payment_refunded: "Payment refunded",
  payment_partially_refunded: "Payment partially refunded",
});

export function formatDocumentEventType(eventType, documentType) {
  const t = String(eventType || "").trim();
  if (!t) return "Event";
  const kind = String(documentType || "").trim().toLowerCase();
  if (kind === "quote" && QUOTE_EVENT_LABELS[t]) return QUOTE_EVENT_LABELS[t];
  if (kind === "invoice" && INVOICE_EVENT_LABELS[t]) return INVOICE_EVENT_LABELS[t];
  if (kind === "payslip" && PAYSLIP_EVENT_LABELS[t]) return PAYSLIP_EVENT_LABELS[t];
  if (EVENT_TYPE_LABELS[t]) return EVENT_TYPE_LABELS[t];
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Turn event payload into short label/value rows for the timeline (no raw JSON dump).
 * @param {Record<string, unknown>|null|undefined} payload
 * @returns {{ label: string, value: string }[]}
 */
export function summarizeDocumentEventPayload(payload) {
  if (!payload || typeof payload !== "object") return [];
  const rows = [];
  const p = /** @type {Record<string, unknown>} */ (payload);

  if (p.from_status != null && p.to_status != null) {
    rows.push({
      label: "Status",
      value: `${String(p.from_status)} → ${String(p.to_status)}`,
    });
  }
  if (p.invoice_id || p.new_invoice_document_id) {
    rows.push({ label: "Invoice", value: String(p.invoice_id || p.new_invoice_document_id) });
  }
  if (p.invoice_number) {
    rows.push({ label: "Invoice number", value: String(p.invoice_number) });
  }
  if (p.target_document_id) {
    rows.push({ label: "Target document", value: String(p.target_document_id) });
  }
  if (p.source_document_id) {
    rows.push({ label: "Source document", value: String(p.source_document_id) });
  }
  if (p.source_quote_id) {
    rows.push({ label: "Source quote", value: String(p.source_quote_id) });
  }
  if (p.source_quote_document_id && !p.source_quote_id) {
    rows.push({ label: "Source quote id", value: String(p.source_quote_document_id) });
  }
  if (Array.isArray(p.keys) && p.keys.length) {
    rows.push({ label: "Changed fields", value: p.keys.slice(0, 8).join(", ") + (p.keys.length > 8 ? "…" : "") });
  }
  if (Array.isArray(p.changed_fields) && p.changed_fields.length) {
    rows.push({
      label: "Updated fields",
      value: p.changed_fields.slice(0, 10).join(", ") + (p.changed_fields.length > 10 ? "…" : ""),
    });
  }
  if (p.action && typeof p.action === "string" && !p.from_status && !rows.some((row) => row.label === "Clicked")) {
    rows.push({ label: "Action", value: String(p.action) });
  }
  if (p.type && p.status && !p.from_status) {
    rows.push({ label: "Type", value: String(p.type) });
    rows.push({ label: "Initial status", value: String(p.status) });
  }
  if (p.title != null && String(p.title).trim()) {
    rows.push({ label: "Title", value: String(p.title) });
  }
  if (p.surface) {
    rows.push({ label: "Where", value: String(p.surface) });
  }
  if (p.action && typeof p.action === "string") {
    rows.push({ label: "Clicked", value: String(p.action).replace(/_/g, " ") });
  }
  if (p.reminder_type) {
    rows.push({ label: "Reminder", value: String(p.reminder_type).replace(/-/g, " ") });
  }
  if (p.source) {
    rows.push({ label: "Source", value: String(p.source).replace(/_/g, " ") });
  }
  if (p.recipient_email) {
    const label = p.recipient_name
      ? `${p.recipient_name} <${p.recipient_email}>`
      : String(p.recipient_email);
    rows.push({ label: "Recipient", value: label });
  }
  if (p.approver_email) {
    const label = p.approver_name
      ? `${p.approver_name} <${p.approver_email}>`
      : String(p.approver_email);
    rows.push({ label: "Approver notified", value: label });
  }
  if (p.scheduled_at) {
    rows.push({
      label: "Scheduled",
      value: new Date(String(p.scheduled_at)).toLocaleString(),
    });
  }
  if (Array.isArray(p.signers) && p.signers.length) {
    const names = p.signers
      .map((s) => s?.name || s?.email || "Signer")
      .join(", ");
    rows.push({ label: "Signers", value: names });
  }

  return rows;
}
