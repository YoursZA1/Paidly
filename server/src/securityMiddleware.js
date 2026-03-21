/**
 * Production-oriented security: HTTPS redirect, security headers, structured security logs,
 * and lightweight anomaly hints (404 bursts, 5xx).
 */

import process from "node:process";

const IS_PROD = process.env.NODE_ENV === "production";

/** @typedef {"info"|"warn"|"error"} SecurityLevel */

/**
 * Structured single-line JSON for log aggregators (Datadog, CloudWatch, etc.).
 * Never pass passwords, tokens, or raw request bodies.
 *
 * @param {SecurityLevel} level
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
export function logSecurity(level, event, data = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: "security",
    level,
    event,
    ...data,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const NOT_FOUND_WINDOW_MS = Number(process.env.SECURITY_404_WINDOW_MS) || 10 * 60 * 1000;
const NOT_FOUND_BURST_THRESHOLD =
  Number(process.env.SECURITY_404_BURST_THRESHOLD) || 80;

const notFoundByIp = new Map();

function pruneNotFoundMap() {
  const now = Date.now();
  for (const [ip, entry] of notFoundByIp) {
    if (now > entry.resetAt) notFoundByIp.delete(ip);
  }
}

let pruneTimer = null;

export function startSecurityAuditPruner() {
  if (pruneTimer) return;
  pruneTimer = setInterval(pruneNotFoundMap, 5 * 60 * 1000);
  if (typeof pruneTimer.unref === "function") pruneTimer.unref();
}

/**
 * Redirect HTTP → HTTPS when the app is behind a proxy that sets X-Forwarded-Proto.
 * Set ENFORCE_HTTPS=false if TLS terminates only at an internal load balancer and breaks health checks.
 */
export function enforceHttps() {
  return (req, res, next) => {
    if (!IS_PROD || process.env.ENFORCE_HTTPS === "false") {
      return next();
    }
    if (process.env.HTTPS_REDIRECT_PATHS_ONLY === "true") {
      if (!req.path.startsWith("/api")) return next();
    }
    const secure =
      req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
    if (secure) return next();
    const host = req.headers.host;
    if (!host) return next();
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  };
}

export function securityHeaders() {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()"
    );
    if (IS_PROD && process.env.DISABLE_HSTS !== "true") {
      const maxAge = Number(process.env.HSTS_MAX_AGE) || 31536000;
      let value = `max-age=${maxAge}`;
      if (process.env.HSTS_INCLUDE_SUBDOMAINS !== "false") {
        value += "; includeSubDomains";
      }
      if (process.env.HSTS_PRELOAD === "true") {
        value += "; preload";
      }
      res.setHeader("Strict-Transport-Security", value);
    }
    next();
  };
}

/**
 * @param {(req: import("express").Request) => string} getClientIp
 */
export function auditHttpResponses(getClientIp) {
  return (req, res, next) => {
    const ip = getClientIp(req);
    res.on("finish", () => {
      const status = res.statusCode;
      if (status === 404) {
        const now = Date.now();
        let entry = notFoundByIp.get(ip);
        if (!entry || now > entry.resetAt) {
          entry = { count: 0, resetAt: now + NOT_FOUND_WINDOW_MS };
          notFoundByIp.set(ip, entry);
        }
        entry.count += 1;
        if (entry.count === NOT_FOUND_BURST_THRESHOLD) {
          logSecurity("warn", "suspicious_404_burst", {
            ip,
            count: entry.count,
            windowMs: NOT_FOUND_WINDOW_MS,
            lastPath: req.path,
          });
        }
      }
      if (status >= 500) {
        logSecurity("error", "http_server_error", {
          ip,
          method: req.method,
          path: req.path,
          status,
        });
      }
      if (status === 403 && req.path.startsWith("/api/admin")) {
        logSecurity("warn", "admin_forbidden", { ip, path: req.path });
      }
    });
    next();
  };
}
