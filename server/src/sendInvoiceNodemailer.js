/**
 * Send invoice PDF via email using Nodemailer (e.g. Gmail).
 * Requires: process.env.EMAIL, process.env.EMAIL_PASSWORD (or GMAIL_APP_PASSWORD).
 *
 * Example usage:
 *   import { sendInvoice } from "./sendInvoiceNodemailer.js";
 *   await sendInvoice(invoiceData);
 *
 * invoiceData shape: { brand, address, number, client: { name, address, email }, items, subtotal, total, dueDate?, currency? }
 */
import React from "react";
import nodemailer from "nodemailer";
import { renderToBuffer } from "@react-pdf/renderer";
import InvoiceEmailPDF from "./pdf/InvoiceEmailPDFNode.js";
import { getInvoiceEmailContent } from "./invoiceEmailTemplate.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL || process.env.GMAIL_USER,
    pass: process.env.EMAIL_PASSWORD || process.env.GMAIL_APP_PASSWORD
  }
});

/**
 * Generate PDF buffer for the invoice (Node only).
 * @param {Object} invoiceData - Same shape as InvoiceEmailPDF expects
 * @returns {Promise<Buffer>}
 */
export async function generateInvoicePDFBuffer(invoiceData) {
  const currency = invoiceData.currency || "ZAR";
  const element = React.createElement(InvoiceEmailPDF, {
    invoice: invoiceData,
    currency
  });
  return renderToBuffer(element);
}

/**
 * Send the invoice PDF via email using Nodemailer.
 * @param {Object} invoiceData - { brand, address, number, client: { name, address, email }, items, subtotal, total, currency? }
 * @param {{ from?: string }} [options] - Optional. from defaults to process.env.EMAIL_FROM or "billing@yourapp.com"
 */
export async function sendInvoice(invoiceData, options = {}) {
  const pdfBuffer = await generateInvoicePDFBuffer(invoiceData);

  const toEmail =
    invoiceData.client?.email ||
    invoiceData.clientEmail ||
    invoiceData.to;
  if (!toEmail) {
    throw new Error("invoiceData.client.email (or clientEmail/to) is required");
  }

  // Canonical transactional sender (override with options.from or RESEND_FROM)
  const fromAddress = options.from || "Paidly <invoices@paidly.co.za>";

  const clientName = invoiceData.client?.name?.trim() || "there";
  const amountDue =
    invoiceData.formattedTotal ||
    (invoiceData.total != null
      ? new Intl.NumberFormat("en-ZA", { style: "currency", currency: invoiceData.currency || "ZAR" }).format(Number(invoiceData.total))
      : "");
  const dueDate = invoiceData.dueDateFormatted || invoiceData.due_date || "";

  const { subject, text, html } = getInvoiceEmailContent({
    clientName,
    invoiceNum: invoiceData.number,
    amountDue,
    dueDate,
    brandName: invoiceData.brand || "Us"
  });

  await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject,
    text,
    html,
    attachments: [
      {
        filename: `Invoice-${invoiceData.number}.pdf`,
        content: pdfBuffer
      }
    ]
  });
}
