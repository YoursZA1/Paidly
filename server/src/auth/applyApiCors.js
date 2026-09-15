/**
 * CORS for browser-callable /api routes on Vercel serverless functions (no Express cors middleware).
 * Only reflects Origin when it matches the configured allowlist — never reflects arbitrary origins.
 */

const PRODUCTION_ORIGINS = new Set([
  "https://www.paidly.co.za",
  "https://paidly.co.za",
  "https://app.paidly.co.za",
]);

function extraAllowedOrigins() {
  const raw = `${process.env.PAIDLY_PAY_ORIGINS || ""},${process.env.PAIDLY_PAY_ORIGIN || ""}`;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((origin) => origin && origin !== "*" && /^https?:\/\/[^/]+$/i.test(origin));
}

function isOriginAllowed(origin) {
  if (!origin || typeof origin !== "string") return false;
  if (PRODUCTION_ORIGINS.has(origin)) return true;
  if (extraAllowedOrigins().includes(origin)) return true;
  const clientOrigin = process.env.CLIENT_ORIGIN || "";
  const configured = clientOrigin
    .split(",")
    .map((s) => s.trim())
    .filter((value) => value && value !== "*");
  if (configured.includes(origin)) return true;
  // Allow localhost in non-production environments only
  if (
    process.env.NODE_ENV !== "production" &&
    /^https?:\/\/localhost(:\d+)?$/.test(origin)
  ) {
    return true;
  }
  return false;
}

export function applyApiCors(
  req,
  res,
  { methods = "POST, OPTIONS", headers = "Content-Type, Authorization", credentials = false } = {}
) {
  const origin = req.headers?.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (credentials) res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", headers);
}
