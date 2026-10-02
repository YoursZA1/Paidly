/**
 * POST /api/send-email — authenticated HTML email via Resend.
 * Shared by Vercel serverless and Express (single implementation).
 */
import { getUserFromRequest } from "./supabaseAuth.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { assertUserHasFeature } from "./featureGate.js";
import { parseBody } from "./validateBody.js";
import { sendEmailBodySchema } from "./schemas/mutationSchemas.js";
import { sanitizeEmailHtmlBody, sanitizeOneLine } from "./inputValidation.js";
import { sendHtmlEmail } from "./sendInvoice.js";
import { sendUnexpectedError } from "./apiResponse.js";
import { applyApiCors } from "./auth/applyApiCors.js";
import { isDemoUserId, sendDemoNotSent } from "./demo/demoMode.js";
import { consumePersistedRateLimit } from "./rateLimit/consumeRateLimit.js";

/** Per-user send budget: the Express limiter (apiAbuseLimiter) does not run on Vercel functions. */
export const SEND_EMAIL_LIMIT = Object.freeze({ hits: 60, windowMs: 60 * 60 * 1000 });

export default async function sendEmailHandler(req, res) {
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

    await assertUserHasFeature(supabaseAdmin, user.id, "email");

    const parsed = parseBody(sendEmailBodySchema, req, res);
    if (!parsed) return;

    const subjectSafe = sanitizeOneLine(parsed.subject, 998);
    if (!subjectSafe) {
      return res.status(400).json({ error: "Invalid subject" });
    }

    const bodySafe = sanitizeEmailHtmlBody(parsed.body);

    // Demo Mode: never reaches a real inbox; the caller gets a preview instead.
    if (await isDemoUserId(user.id)) {
      return sendDemoNotSent(res, { channel: "email", to: parsed.to, subject: subjectSafe, kind: "email" });
    }

    const budget = await consumePersistedRateLimit(
      `send-email:${user.id}`,
      SEND_EMAIL_LIMIT.hits,
      SEND_EMAIL_LIMIT.windowMs
    );
    if (!budget.ok) {
      res.setHeader("Retry-After", String(budget.retryAfterSeconds || 60));
      return res.status(429).json({
        success: false,
        code: "RATE_LIMITED",
        error: "Too many emails sent in a short time. Please try again later.",
      });
    }

    const result = await sendHtmlEmail(
      parsed.to,
      subjectSafe,
      bodySafe,
      sanitizeOneLine(user?.user_metadata?.company_name || "Paidly", 200) || "Paidly"
    );

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err) {
    return sendUnexpectedError(res, err, "send-email", { success: false });
  }
}
