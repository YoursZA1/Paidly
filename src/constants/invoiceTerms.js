/**
 * Default body under the “Terms & conditions” heading on invoices.
 * Shown on previews/PDFs and prefilled in create/edit when empty; users can edit dates or wording.
 */
export const DEFAULT_INVOICE_TERMS_BODY = `Payment is due within 15 days of invoice date upon acceptance.

Late payments may incur a 1.5% monthly service charge.
All payments should be made to the banking details provided.`;

/**
 * @param {string} [customTerms] - saved invoice terms or form value
 * @returns {string} default block plus any additional custom lines (no duplicate if custom already starts with default)
 */
export function effectiveInvoiceTermsForDisplay(customTerms) {
  const base = DEFAULT_INVOICE_TERMS_BODY.trim();
  const custom = (customTerms || "").trim();
  if (!custom) return base;
  if (custom === base) return base;
  if (custom.startsWith(base)) return custom;
  return `${base}\n\n${custom}`;
}
