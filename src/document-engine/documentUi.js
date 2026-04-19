/**
 * Presentation helpers for unified documents (badges, table columns).
 */

/** @param {string} status */
export function documentStatusBadgeVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "paid" || s === "accepted" || s === "converted") return "default";
  if (s === "sent") return "secondary";
  if (s === "declined" || s === "cancelled" || s === "expired") return "destructive";
  if (s === "overdue") return "destructive";
  return "outline";
}

/** @param {string} type */
export function documentTypeBadgeVariant(type) {
  const t = String(type || "").toLowerCase();
  if (t === "invoice") return "default";
  if (t === "quote") return "secondary";
  if (t === "payslip") return "outline";
  return "secondary";
}
