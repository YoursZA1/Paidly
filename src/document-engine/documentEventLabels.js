/**
 * Human-readable labels for `document_events` (audit / activity UI).
 */

const EVENT_TYPE_LABELS = Object.freeze({
  created: "Document created",
  updated: "Details updated",
  status_changed: "Status changed",
  sent: "Marked sent",
  viewed: "Viewed",
  accepted: "Quote accepted",
  paid: "Marked paid",
  converted: "Converted to invoice",
  created_from_quote: "Created from quote",
});

/**
 * @param {string} eventType
 */
export function formatDocumentEventType(eventType) {
  const t = String(eventType || "").trim();
  if (!t) return "Event";
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
  if (p.new_invoice_document_id) {
    rows.push({ label: "New invoice", value: String(p.new_invoice_document_id) });
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
  if (p.action && typeof p.action === "string" && !p.from_status) {
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

  return rows;
}
