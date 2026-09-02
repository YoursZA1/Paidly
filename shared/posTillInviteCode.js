/**
 * Human till invite codes (e.g. 7K4M-X92Q).
 * Generation and hashing stay on the server. This module only normalizes/formats
 * so the SPA can clean a typed code before sending it.
 *
 * Alphabet omits 0/O/1/I to reduce verbal/WhatsApp mistakes.
 */

export const POS_TILL_INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const POS_TILL_INVITE_CODE_LENGTH = 8;

/** Strip spaces/hyphens and uppercase. Empty string if nothing usable remains. */
export function normalizePosTillInviteCode(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Display form XXXX-XXXX when the code is 8 chars. Otherwise the normalized value.
 */
export function formatPosTillInviteCode(raw) {
  const normalized = normalizePosTillInviteCode(raw);
  if (normalized.length === POS_TILL_INVITE_CODE_LENGTH) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  }
  return normalized;
}

/** Legacy company_invites.token is 32 random bytes as hex (64 chars). */
export function isLegacyCompanyInviteToken(raw) {
  return /^[0-9a-f]{64}$/i.test(String(raw || "").trim());
}

/**
 * Share text for email / WhatsApp. Does not include dashboard access claims.
 */
export function buildPosTillInviteMessage({
  companyName,
  tillName,
  inviteCode,
  inviteLink,
} = {}) {
  const business = String(companyName || "your company").trim() || "your company";
  const till = String(tillName || "the till").trim() || "the till";
  const code = formatPosTillInviteCode(inviteCode) || "—";
  const link = String(inviteLink || "").trim();
  return [
    "You're invited to Paidly POS.",
    "",
    `Business: ${business}`,
    `Till: ${till}`,
    "Role: POS Staff",
    "",
    link ? `Open Paidly POS:\n${link}` : null,
    "",
    "Backup device code (only if the link cannot open):",
    code,
    "",
    "This invitation provides POS-only access.",
    "It does not provide access to the main Paidly dashboard, invoices, reports, settings or other business information.",
  ]
    .filter((line) => line != null)
    .join("\n");
}
