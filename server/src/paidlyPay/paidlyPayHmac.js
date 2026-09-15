import crypto from "node:crypto";

export const POS_SIGNATURE_HEADER = "x-pos-signature";

function asBuffer(value) {
  return Buffer.from(String(value || ""), "utf8");
}

/**
 * Constant-time compare for secrets / HMAC hex. Different lengths never match.
 */
export function timingSafeEqualString(left, right) {
  const a = asBuffer(left);
  const b = asBuffer(right);
  if (!a.length || !b.length || a.length !== b.length) {
    const dummy = crypto.createHash("sha256").update(a).digest();
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function hmacSha256Hex(rawBody, secret) {
  return crypto.createHmac("sha256", String(secret || "")).update(rawBody, "utf8").digest("hex");
}

export function readPosSignature(req) {
  const headers = req?.headers || {};
  const raw =
    headers[POS_SIGNATURE_HEADER] ||
    headers["X-POS-Signature"] ||
    headers["x-pos-signature"];
  return String(raw || "").replace(/^sha256=/i, "").trim();
}

/**
 * Verify HMAC-SHA256(raw_request_body, POS_WEBHOOK_SECRET).
 * Must use the original body string — never JSON.stringify of a parsed object.
 */
export function verifyPaidlyPaySignature(rawBody, signature, secret) {
  if (typeof rawBody !== "string") return false;
  const expected = hmacSha256Hex(rawBody, secret);
  const provided = String(signature || "").replace(/^sha256=/i, "").trim();
  return timingSafeEqualString(expected, provided);
}
