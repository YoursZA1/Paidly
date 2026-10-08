/**
 * Copy for a company whose subscription no longer grants access.
 * Viewing stays available. Creating, editing, deleting, sending, and recording payments do not,
 * until they subscribe or an admin moves trial_ends_at back into the future (or grants an
 * indefinite admin trial).
 * @param {string | null | undefined} status
 */
export function billingViewOnlyMessage(status) {
  const st = String(status || "").toLowerCase();
  if (st === "trialing" || st === "expired" || st === "trial") {
    return "Your trial has ended. You can view your data until you subscribe.";
  }
  return "Your subscription is not active. You can view your data until you subscribe.";
}

/**
 * Button and link labels that start a write. Navigation, download, and dismiss stay allowed.
 * @param {string | null | undefined} label
 */
export function labelIsBillingWrite(label) {
  const text = String(label || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 80) return false;
  if (/^(download|export|print|view|open|close|cancel|back|filter|search|next|previous|clear|show|hide)/i.test(text)) {
    return false;
  }
  return /^(create|new\b|add\b|save|send\b|delete|remove|edit|update|record|import|approve|issue|generate|submit|confirm|receive|duplicate|convert|invite|upload|scan|refund|publish|finalise|finalize|mark\b|void|pay now|pay online|checkout|charge|complete sale)/i.test(text);
}
