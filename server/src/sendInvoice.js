/**
 * Send invoice email with PDF attachment via Resend.
 * Requires RESEND_API_KEY and RESEND_FROM (verified domain) in env.
 * Resend client is created lazily at call time so process.env is populated (after dotenv.config() in index.js).
 */
import { Resend } from "resend";
import { getInvoiceEmailContent } from "./invoiceEmailTemplate.js";

let resendClient = null;

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * @param {string} base64PDF
 * @param {string} clientEmail
 * @param {string} invoiceNum
 * @param {string} [fromName="Paidly"]
 * @param {{ clientName?: string, amountDue?: string, dueDate?: string }} [template] - Optional. When provided, uses recommended subject/body template.
 */
export async function sendInvoiceEmail(base64PDF, clientEmail, invoiceNum, fromName = "Paidly", template = null) {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const resend = getResend();
  if (!resend) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  // Canonical transactional sender (override with RESEND_FROM in env)
  const fromAddress = process.env.RESEND_FROM || "Paidly <invoices@paidly.co.za>";

  // Resend requires raw base64 only; never send data URI prefix.
  let cleanBase64;
  if (typeof base64PDF !== "string") {
    return { success: false, error: "base64PDF must be a string" };
  }
  if (base64PDF.includes("base64,")) {
    const after = base64PDF.split("base64,")[1];
    cleanBase64 = typeof after === "string" ? after.trim() : "";
    if (!cleanBase64) {
      return { success: false, error: "Invalid base64PDF: data URI has no base64 content after 'base64,'" };
    }
  } else if (base64PDF.startsWith("data:")) {
    return { success: false, error: "Invalid base64PDF: unexpected data URI format (expected ...base64,content)" };
  } else {
    cleanBase64 = base64PDF.trim();
    if (!cleanBase64) {
      return { success: false, error: "Missing base64PDF content" };
    }
  }

  if (!clientEmail || !invoiceNum) {
    return { success: false, error: "Missing clientEmail or invoiceNum" };
  }

  const clientName = template?.clientName ?? "there";
  const amountDue = template?.amountDue ?? "";
  const dueDate = template?.dueDate ?? "";
  const useTemplate = clientName !== "there" || amountDue || dueDate;
  const { subject, html } = useTemplate
    ? getInvoiceEmailContent({
        clientName,
        invoiceNum,
        amountDue,
        dueDate,
        brandName: fromName,
      })
    : {
        subject: `Invoice ${invoiceNum} from ${fromName}`,
        html: `<strong>Hello,</strong><p>Please find your invoice ${invoiceNum} attached.</p>`,
      };

  try {
    const data = await resend.emails.send({
      from: fromAddress,
      to: [clientEmail],
      subject,
      html,
      attachments: [
        {
          content: cleanBase64,
          filename: `Invoice_${invoiceNum}.pdf`,
        },
      ],
    });

    return { success: true, data };
  } catch (error) {
    console.error("Resend send-invoice error:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Send HTML email (e.g. invoice/quote with download link) via Resend.
 * Same env as sendInvoiceEmail: RESEND_API_KEY, RESEND_FROM.
 */
export async function sendHtmlEmail(to, subject, html, fromName = "Paidly") {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const resend = getResend();
  if (!resend) {
    return { success: false, error: "RESEND_API_KEY is not configured" };
  }

  const fromAddress = process.env.RESEND_FROM || "Paidly <invoices@paidly.co.za>";

  if (!to || !subject) {
    return { success: false, error: "Missing to or subject" };
  }

  try {
    const data = await resend.emails.send({
      from: fromAddress,
      to: [to.trim()],
      subject: subject.trim(),
      html: html || "<p>No content.</p>",
    });

    return { success: true, data };
  } catch (error) {
    console.error("Resend send-html-email error:", error);
    return { success: false, error: error?.message || String(error) };
  }
}
