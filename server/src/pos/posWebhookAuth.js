import crypto from "node:crypto";

/**
 * Verify webhook authenticity using the connection secret.
 * Supports Authorization: Bearer, X-Paidly-Webhook-Secret, and X-Webhook-Secret headers.
 */
export function verifyPosWebhookSecret(req, webhookSecret) {
  const secret = String(webhookSecret || "").trim();
  if (!secret) return true;

  const auth = String(req.headers?.authorization || "");
  if (auth.startsWith("Bearer ") && auth.slice(7).trim() === secret) return true;

  const headerSecret =
    req.headers?.["x-paidly-webhook-secret"] ||
    req.headers?.["x-webhook-secret"] ||
    req.headers?.["x-pos-webhook-secret"];

  if (headerSecret && String(headerSecret).trim() === secret) return true;

  const querySecret = req.query?.secret;
  if (querySecret && String(querySecret).trim() === secret) return true;

  return false;
}

/**
 * Optional HMAC-SHA256 body signature (hex or sha256= prefix).
 */
export function verifyPosHmacSignature(req, rawBody, webhookSecret) {
  const secret = String(webhookSecret || "").trim();
  if (!secret) return true;

  const signature =
    req.headers?.["x-paidly-signature"] ||
    req.headers?.["x-webhook-signature"] ||
    req.headers?.["webhook-signature"];

  if (!signature) return verifyPosWebhookSecret(req, webhookSecret);

  const body = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody ?? {});
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const provided = String(signature).replace(/^sha256=/i, "").trim();

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export function getWebhookPublicUrl(webhookToken) {
  const origin =
    (process.env.CLIENT_ORIGIN && String(process.env.CLIENT_ORIGIN).split(",")[0]?.trim()) ||
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    "https://www.paidly.co.za";
  return `${String(origin).replace(/\/$/, "")}/api/pos/webhook/${encodeURIComponent(webhookToken)}`;
}
