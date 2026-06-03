/**
 * Presentation helpers for unified documents (badges, table columns).
 * Covers the full business-hub status vocabulary across all flow groups.
 */

/**
 * Maps a document status to a shadcn Badge variant.
 * @param {string} status
 */
export function documentStatusBadgeVariant(status) {
  const s = String(status || "").toLowerCase();
  // Terminal-positive
  if (s === "paid" || s === "accepted" || s === "converted" || s === "signed" || s === "completed" || s === "approved") {
    return "default";
  }
  // In-flight
  if (s === "sent" || s === "viewed" || s === "pending") return "secondary";
  // Negative / lapsed
  if (s === "declined" || s === "cancelled" || s === "expired" || s === "overdue") return "destructive";
  // draft / archived / unknown
  return "outline";
}

/**
 * Maps a document type (or its category) to a Badge variant. Financial types read as primary,
 * everything else as a neutral secondary so the table stays calm with many types.
 * @param {string} type
 */
export function documentTypeBadgeVariant(type) {
  const t = String(type || "").toLowerCase();
  if (t === "invoice" || t === "receipt" || t === "proforma_invoice") return "default";
  if (t === "quote" || t === "proposal") return "secondary";
  return "outline";
}
