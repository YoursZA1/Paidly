/**
 * Bank lines for document preview Payment instructions.
 * Expects a banking row or profile-shaped object (after effectiveBankingDetail).
 */
import { sanitizeDocumentDisplayText } from "@/utils/documentInvoiceDisplay";

function str(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

/**
 * @param {object|null|undefined} bd
 * @returns {Array<{ label: string, value: string }>|null}
 */
export function formatDocumentPreviewBankingRows(bd) {
  if (!bd || typeof bd !== "object") return null;
  const rows = [];
  if (str(bd.bank_name)) rows.push({ label: "Bank", value: str(bd.bank_name) });
  if (str(bd.account_name)) rows.push({ label: "Account name", value: str(bd.account_name) });
  if (str(bd.account_number)) rows.push({ label: "Account number", value: str(bd.account_number) });
  const branch = str(bd.routing_number || bd.branch_code);
  if (branch) rows.push({ label: "Branch / routing", value: branch });
  if (str(bd.swift_code)) rows.push({ label: "SWIFT / BIC", value: str(bd.swift_code) });
  const paymentRef = sanitizeDocumentDisplayText(bd.additional_info);
  if (paymentRef) rows.push({ label: "Payment reference", value: paymentRef });
  return rows.length ? rows : null;
}

/**
 * Multiline string for callers that still expect plain text.
 * @param {object|null|undefined} bd
 * @returns {string|null}
 */
export function formatDocumentPreviewBankingLines(bd) {
  const rows = formatDocumentPreviewBankingRows(bd);
  if (!rows) return null;
  return rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}
