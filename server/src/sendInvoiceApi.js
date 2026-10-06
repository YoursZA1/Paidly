/**
 * POST /api/send-invoice — authenticated invoice PDF email via Resend.
 * Shared by Vercel serverless (api/system?op=send-invoice) and Express.
 */
import { getUserFromRequest } from "./supabaseAuth.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { assertUserHasFeature } from "./featureGate.js";
import { parseBody } from "./validateBody.js";
import { sendInvoiceBodySchema } from "./schemas/invoiceSchemas.js";
import { sanitizeEmailHtmlBody, sanitizeOneLine, validateBase64Pdf } from "./inputValidation.js";
import { sendInvoiceEmail } from "./sendInvoice.js";
import { sendUnexpectedError } from "./apiResponse.js";
import { applyApiCors } from "./auth/applyApiCors.js";
import { isDemoUserId, sendDemoNotSent } from "./demo/demoMode.js";
import { consumePersistedRateLimit } from "./rateLimit/consumeRateLimit.js";
import { logSecurity } from "./securityMiddleware.js";

/** Per-user send budget. The Express limiter does not run on the Vercel function. */
export const SEND_INVOICE_LIMIT = Object.freeze({ hits: 40, windowMs: 60 * 60 * 1000 });

export default async function sendInvoiceHandler(req, res) {
  applyApiCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { user, error: authErr } = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: authErr || "Unauthorized" });
    }

    await assertUserHasFeature(supabaseAdmin, user.id, "invoices");
    await assertUserHasFeature(supabaseAdmin, user.id, "email");

    const parsed = parseBody(sendInvoiceBodySchema, req, res, () =>
      logSecurity("warn", "send_invoice_bad_request", {
        userId: user.id || null,
        reason: "validation",
      })
    );
    if (!parsed) return;

    const pdfCheck = validateBase64Pdf(parsed.base64PDF);
    if (!pdfCheck.ok) {
      return res.status(400).json({ error: pdfCheck.error || "Invalid document" });
    }

    const invNum = sanitizeOneLine(parsed.invoiceNum, 120);
    if (!invNum) {
      return res.status(400).json({ error: "Invalid invoice number" });
    }

    if (await isDemoUserId(user.id)) {
      return sendDemoNotSent(res, {
        channel: "email",
        to: parsed.clientEmail,
        subject: `Invoice ${invNum}`,
        kind: "invoice",
      });
    }

    const budget = await consumePersistedRateLimit(
      `send-invoice:${user.id}`,
      SEND_INVOICE_LIMIT.hits,
      SEND_INVOICE_LIMIT.windowMs
    );
    if (!budget.ok) {
      res.setHeader("Retry-After", String(budget.retryAfterSeconds || 60));
      return res.status(429).json({
        success: false,
        code: "RATE_LIMITED",
        error: "Too many invoice emails sent in a short time. Please try again later.",
      });
    }

    const senderName = sanitizeOneLine(parsed.fromName ?? "Paidly", 200) || "Paidly";
    const template = [parsed.clientName, parsed.amountDue, parsed.dueDate].some(Boolean)
      ? {
          clientName: sanitizeOneLine(parsed.clientName ?? "there", 200) || "there",
          amountDue: sanitizeOneLine(parsed.amountDue ?? "", 80),
          dueDate: sanitizeOneLine(parsed.dueDate ?? "", 80),
        }
      : null;

    const customHtml = parsed.html ? sanitizeEmailHtmlBody(parsed.html) : "";
    const result = await sendInvoiceEmail(
      parsed.base64PDF,
      parsed.clientEmail,
      invNum,
      senderName,
      template,
      parsed.idempotencyKey,
      {
        html: customHtml,
        subject: parsed.subject ? sanitizeOneLine(parsed.subject, 998) : "",
        filename: parsed.filename || "",
      }
    );

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err) {
    return sendUnexpectedError(res, err, "send-invoice", { success: false });
  }
}
