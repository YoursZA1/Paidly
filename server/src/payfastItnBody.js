/**
 * Normalize PayFast ITN POST bodies across Express (urlencoded object) and Vercel (object, string, or buffer).
 */

/**
 * Prefer `req.rawBody` (Express urlencoded `verify`) so amounts stay exactly as PayFast signed (e.g. "50.00").
 */
export function getPayfastItnPayload(req) {
  const raw = req?.rawBody;
  if (typeof raw === "string" && raw.length > 0 && raw.includes("=")) {
    try {
      return Object.fromEntries(new URLSearchParams(raw));
    } catch {
      /* fall through */
    }
  }
  return normalizePayfastItnBody(req);
}

export function normalizePayfastItnBody(req) {
  const b = req?.body;
  if (b == null) return {};

  if (Buffer.isBuffer(b)) {
    const s = b.toString("utf8");
    if (!s) return {};
    return Object.fromEntries(new URLSearchParams(s));
  }

  if (typeof b === "string") {
    const t = b.trim();
    if (!t) return {};
    try {
      const j = JSON.parse(t);
      if (j && typeof j === "object" && !Array.isArray(j)) return /** @type {Record<string, string>} */ (j);
    } catch {
      /* PayFast uses x-www-form-urlencoded */
    }
    return Object.fromEntries(new URLSearchParams(t));
  }

  if (typeof b === "object" && !Array.isArray(b)) {
    return { ...b };
  }

  return {};
}
