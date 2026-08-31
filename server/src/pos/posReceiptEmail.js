import { supabaseAdmin } from "../supabaseAdmin.js";
import { isValidEmail, isValidUuid, sanitizeEmailHtmlBody, sanitizeOneLine, validateBase64Pdf } from "../inputValidation.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { buildPosReceiptView, receiptPdfFilename, renderPosReceiptInnerHtml } from "./posReceipt.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

/**
 * POST /api/pos/receipt/email
 * Emails a till receipt. Does not create an invoice.
 */
export async function handlePosReceiptEmail(req, res, gate) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const saleId = String(body.sale_id || "").trim();
  const to = String(body.to || "").trim().toLowerCase();
  if (!isValidUuid(saleId)) {
    return jsonError(res, 422, "sale_id is required");
  }
  if (!isValidEmail(to)) {
    return jsonError(res, 422, "A valid email address is required");
  }

  const { data: row, error } = await supabaseAdmin
    .from("pos_sales_events")
    .select("*")
    .eq("id", saleId)
    .eq("org_id", gate.membership.orgId)
    .maybeSingle();

  if (error) return jsonError(res, 500, error.message || "Could not load sale");
  if (!row) return jsonError(res, 404, "Sale not found");
  if (row.status && row.status !== "completed") {
    return jsonError(res, 422, "Only a completed sale can send a receipt");
  }

  const view = buildPosReceiptView(row, {
    brandName: body.brand_name,
    cashierName: body.cashier_name,
    customerName: body.customer_name,
  });
  const subject = sanitizeOneLine(
    `${view.kindLabel} ${view.saleNumber} from ${view.brandName}`,
    998
  );
  const html = sanitizeEmailHtmlBody(renderPosReceiptInnerHtml(view));

  const mailOpts = {
    tags: [{ name: "kind", value: "pos_receipt" }],
  };

  if (body.base64PDF) {
    const pdfCheck = validateBase64Pdf(body.base64PDF);
    if (!pdfCheck.ok) {
      return jsonError(res, 400, pdfCheck.error || "Invalid PDF attachment");
    }
    const content = String(body.base64PDF).includes("base64,")
      ? String(body.base64PDF).split("base64,")[1]
      : String(body.base64PDF).trim();
    mailOpts.attachments = [
      {
        content,
        filename: receiptPdfFilename(view),
      },
    ];
  }

  const result = await sendHtmlEmail(to, subject, html, view.brandName || "Paidly", mailOpts);
  if (!result.success) {
    return jsonError(res, 503, result.error || "Could not send receipt email");
  }

  return res.status(200).json({
    ok: true,
    receipt_number: view.saleNumber,
  });
}
