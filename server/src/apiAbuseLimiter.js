/**
 * Tiered per-IP rate limits for /api routes (in-memory; use Redis for multi-instance).
 * Complements login-specific limits in loginIpRateLimit.js.
 */

import process from "node:process";

const store = new Map();

export function isApiAbuseLimitEnabled() {
  if (process.env.API_ABUSE_LIMIT_ENABLED === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  return process.env.API_ABUSE_LIMIT_IN_DEV === "true";
}

function num(env, fallback) {
  const n = Number(process.env[env]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function consume(bucketKey, max, windowMs) {
  const now = Date.now();
  let entry = store.get(bucketKey);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(bucketKey, entry);
  }
  entry.count += 1;
  if (entry.count > max) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { ok: true };
}

/** @param {string} ip */
export function tryConsumeApiBudget(ip, reqPath, method) {
  if (!isApiAbuseLimitEnabled()) {
    return { ok: true };
  }

  const path = reqPath || "";
  const m = (method || "GET").toUpperCase();

  const tiers = [];

  // Global baseline: `express-rate-limit` in `globalExpressRateLimit.js` (default 100 / 15 min per IP).

  if (m === "POST" && path === "/api/send-email") {
    tiers.push({
      key: `send-email:${ip}`,
      max: num("API_RATE_SEND_EMAIL_MAX", 25),
      windowMs: num("API_RATE_SEND_EMAIL_WINDOW_MS", 15 * 60 * 1000),
      tier: "send_email",
    });
  }
  if (m === "POST" && path === "/api/send-invoice") {
    tiers.push({
      key: `send-invoice:${ip}`,
      max: num("API_RATE_SEND_INVOICE_MAX", 25),
      windowMs: num("API_RATE_SEND_INVOICE_WINDOW_MS", 15 * 60 * 1000),
      tier: "send_invoice",
    });
  }
  if (m === "POST" && path === "/api/auth/sign-up") {
    tiers.push({
      key: `sign-up:${ip}`,
      max: num("API_RATE_SIGNUP_MAX", 8),
      windowMs: num("API_RATE_SIGNUP_WINDOW_MS", 60 * 60 * 1000),
      tier: "sign_up",
    });
  }
  if (m === "POST" && path === "/api/waitlist") {
    tiers.push({
      key: `waitlist:${ip}`,
      max: num("API_RATE_WAITLIST_MAX", 12),
      windowMs: num("API_RATE_WAITLIST_WINDOW_MS", 60 * 60 * 1000),
      tier: "waitlist",
    });
  }
  if (m === "POST" && path === "/api/track-open") {
    tiers.push({
      key: `track-open:${ip}`,
      max: num("API_RATE_TRACK_OPEN_MAX", 120),
      windowMs: num("API_RATE_TRACK_OPEN_WINDOW_MS", 15 * 60 * 1000),
      tier: "track_open",
    });
  }
  if (m === "POST" && path.startsWith("/api/payfast/") && path !== "/api/payfast/itn") {
    tiers.push({
      key: `payfast:${ip}`,
      max: num("API_RATE_PAYFAST_MAX", 45),
      windowMs: num("API_RATE_PAYFAST_WINDOW_MS", 15 * 60 * 1000),
      tier: "payfast",
    });
  }
  if (m === "POST" && path.startsWith("/api/ai/")) {
    tiers.push({
      key: `ai:${ip}`,
      max: num("API_RATE_AI_MAX", 20),
      windowMs: num("API_RATE_AI_WINDOW_MS", 60 * 60 * 1000),
      tier: "ai_generation",
    });
  }

  for (const t of tiers) {
    const r = consume(t.key, t.max, t.windowMs);
    if (!r.ok) {
      return { ok: false, retryAfterSeconds: r.retryAfterSeconds, tier: t.tier };
    }
  }
  return { ok: true };
}

export function pruneApiAbuseStore() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now >= v.resetAt) store.delete(k);
  }
}

let pruneTimer = null;
export function startApiAbusePruner() {
  if (pruneTimer) return;
  pruneTimer = setInterval(pruneApiAbuseStore, 5 * 60 * 1000);
  if (typeof pruneTimer.unref === "function") pruneTimer.unref();
}

/**
 * Express middleware: apply tiered limits to /api (except webhooks & health).
 * @param {(req: import("express").Request) => string} getClientIp
 * @param {(level: "warn", event: string, data: object) => void} logSecurity
 */
export function apiAbuseLimiterMiddleware(getClientIp, logSecurity) {
  return (req, res, next) => {
    const path = req.path || req.url?.split("?")[0] || "";
    if (!path.startsWith("/api")) {
      return next();
    }
    if (path === "/api/health") {
      return next();
    }
    if (path.startsWith("/api/email-track")) {
      return next();
    }
    if (path === "/api/payfast/itn" && req.method === "POST") {
      return next();
    }

    const ip = getClientIp(req);
    const result = tryConsumeApiBudget(ip, path, req.method);
    if (!result.ok) {
      logSecurity("warn", "api_rate_limited", {
        ip,
        path,
        method: req.method,
        tier: result.tier,
        retryAfterSeconds: result.retryAfterSeconds,
      });
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many requests. Please slow down and try again later.",
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    next();
  };
}
