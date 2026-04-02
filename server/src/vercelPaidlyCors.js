/**
 * CORS for Vercel serverless: allow Paidly apex + www (and local dev) so cross-subdomain
 * preflight succeeds if a request ever hits www while the page is on apex.
 */
function parseExtraOrigins(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h === "paidly.co.za" || h === "www.paidly.co.za") return true;
    if (h.endsWith(".vercel.app")) return true;
    for (const x of parseExtraOrigins(process.env.CLIENT_ORIGIN)) {
      try {
        if (new URL(x).origin === u.origin) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse} res
 * @param {{ methods?: string, allowCredentials?: boolean }} [opts]
 */
export function applyPaidlyServerlessCors(req, res, opts = {}) {
  const origin = req.headers.origin;
  const methods = opts.methods ?? "GET, POST, OPTIONS";
  const allowCredentials = opts.allowCredentials !== false;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (allowCredentials) res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
}
