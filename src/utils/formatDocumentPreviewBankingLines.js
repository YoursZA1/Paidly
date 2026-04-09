/**
 * Multiline string for document preview under Terms & conditions (small type).
 * Expects a banking row or profile-shaped object (after effectiveBankingDetail).
 */
function str(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

export function formatDocumentPreviewBankingLines(bd) {
  if (!bd || typeof bd !== "object") return null;
  const lines = [];
  if (str(bd.bank_name)) lines.push(`Bank: ${str(bd.bank_name)}`);
  if (str(bd.account_name)) lines.push(`Account name: ${str(bd.account_name)}`);
  if (str(bd.account_number)) lines.push(`Account number: ${str(bd.account_number)}`);
  const branch = str(bd.routing_number || bd.branch_code);
  if (branch) lines.push(`Branch / routing: ${branch}`);
  if (str(bd.swift_code)) lines.push(`SWIFT / BIC: ${str(bd.swift_code)}`);
  if (str(bd.additional_info)) lines.push(`Payment reference: ${str(bd.additional_info)}`);
  return lines.length ? lines.join("\n") : null;
}
