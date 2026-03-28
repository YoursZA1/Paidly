import rateLimit from "express-rate-limit";
import process from "node:process";

function requestPath(req) {
  const u = (req.originalUrl || req.url || "").split("?")[0];
  return u || req.path || "";
}

/**
 * Baseline anti-spam / anti-abuse limit for all `/api/*` traffic (per client IP).
 * Path-specific tiers in `apiAbuseLimiter.js` still apply on top of this where configured.
 *
 * Env: `RATE_LIMIT_ENABLED=false` disables (local debugging). `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` override defaults.
 */
export function createGlobalApiLimiter(getClientIp) {
  const enabled = process.env.RATE_LIMIT_ENABLED !== "false";
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
  const max = Number(process.env.RATE_LIMIT_MAX);
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;

  return rateLimit({
    windowMs,
    max: safeMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    skip: (req) => {
      if (!enabled) return true;
      if (req.method === "OPTIONS") return true;
      const p = requestPath(req);
      if (p === "/api/health" || p === "/health") return true;
      if (p.startsWith("/api/email-track") || p.startsWith("/email-track")) return true;
      if (
        (p === "/api/payfast/itn" || p === "/payfast/itn") &&
        req.method === "POST"
      ) {
        return true;
      }
      return false;
    },
    message: {
      error: "Too many requests. Please slow down and try again later.",
    },
  });
}
