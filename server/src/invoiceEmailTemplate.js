/**
 * Recommended invoice email template.
 * Subject: Invoice {invoiceNum} from {brandName}
 * Body: Hi {clientName}, ... Amount Due, Due Date, Best regards {brandName}
 */

/**
 * @param {Object} opts
 * @param {string} opts.clientName - Client first name or full name
 * @param {string} opts.invoiceNum - Invoice number
 * @param {string} opts.amountDue - Formatted amount (e.g. "R7,750.00")
 * @param {string} opts.dueDate - Formatted due date (e.g. "April 11, 2026")
 * @param {string} opts.brandName - Company / brand name
 * @returns {{ subject: string, text: string, html: string }}
 */
export function getInvoiceEmailContent({ clientName, invoiceNum, amountDue, dueDate, brandName }) {
  const subject = `Invoice ${invoiceNum} from ${brandName}`;

  const text = `Hi ${clientName},

Please find attached your invoice.

Invoice Number: ${invoiceNum}
Amount Due: ${amountDue}
Due Date: ${dueDate}

Thank you for your business.

Best regards,
${brandName}`;

  const html = `
<p>Hi ${escapeHtml(clientName)},</p>

<p>Please find attached your invoice.</p>

<p>
<strong>Invoice Number:</strong> ${escapeHtml(invoiceNum)}<br/>
<strong>Amount Due:</strong> ${escapeHtml(amountDue)}<br/>
<strong>Due Date:</strong> ${escapeHtml(dueDate)}
</p>

<p>Thank you for your business.</p>

<p>Best regards,<br/>${escapeHtml(brandName)}</p>`.trim();

  return { subject, text, html };
}

function escapeHtml(s) {
  if (s == null || typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
