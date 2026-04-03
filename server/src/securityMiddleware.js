/**
 * Production-oriented security: HTTPS redirect, security headers, structured security logs,
 * and lightweight anomaly hints (404 bursts, 5xx).
 */

// Runtime-safe: some Vercel runtimes don't support `node:process` (e.g. Edge-like).
// We only need `process.env` for feature flags.
const process = globalThis.process ?? { env: {} };

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
const AUTH_FAIL_WINDOW_MS = Number(process.env.SECURITY_AUTH_FAIL_WINDOW_MS) || 10 * 60 * 1000;
const AUTH_FAIL_BURST_THRESHOLD = Number(process.env.SECURITY_AUTH_FAIL_BURST_THRESHOLD) || 30;
const RATE_LIMIT_WINDOW_MS = Number(process.env.SECURITY_RATE_LIMIT_WINDOW_MS) || 10 * 60 * 1000;
const RATE_LIMIT_BURST_THRESHOLD = Number(process.env.SECURITY_RATE_LIMIT_BURST_THRESHOLD) || 40;
const SERVER_ERROR_WINDOW_MS = Number(process.env.SECURITY_5XX_WINDOW_MS) || 10 * 60 * 1000;
/** Per-IP rolling count of HTTP ≥500 before suspicious_5xx_burst (aligned with auth-fail default 30). */
const SERVER_ERROR_BURST_THRESHOLD = Number(process.env.SECURITY_5XX_BURST_THRESHOLD) || 30;
const EVENTS_WINDOW_MS = Number(process.env.SECURITY_EVENTS_WINDOW_MS) || 10 * 60 * 1000;

const notFoundByIp = new Map();
const authFailByIp = new Map();
const rateLimitedByIp = new Map();
const serverErrorByIp = new Map();
const eventCounters = new Map();

function bumpEventCounter(name) {
  const now = Date.now();
  let entry = eventCounters.get(name);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + EVENTS_WINDOW_MS };
    eventCounters.set(name, entry);
  }
  entry.count += 1;
}

function countActiveBurstIps(map, threshold) {
  let total = 0;
  for (const [, entry] of map) {
    if ((entry?.count || 0) >= threshold) total += 1;
  }
  return total;
}

export function getSecurityEventsSnapshot() {
  const getCount = (k) => eventCounters.get(k)?.count || 0;
  return {
    windowMs: EVENTS_WINDOW_MS,
    counts: {
      status401: getCount("status401"),
      status403: getCount("status403"),
      status404: getCount("status404"),
      status429: getCount("status429"),
      status5xx: getCount("status5xx"),
    },
    bursts: {
      /** Rolling window length (ms) per burst bucket — same keys as thresholds / activeIps. */
      windowsMs: {
        authFail: AUTH_FAIL_WINDOW_MS,
        notFound: NOT_FOUND_WINDOW_MS,
        rateLimited: RATE_LIMIT_WINDOW_MS,
        serverError: SERVER_ERROR_WINDOW_MS,
      },
      thresholds: {
        authFail: AUTH_FAIL_BURST_THRESHOLD,
        notFound: NOT_FOUND_BURST_THRESHOLD,
        rateLimited: RATE_LIMIT_BURST_THRESHOLD,
        serverError: SERVER_ERROR_BURST_THRESHOLD,
      },
      activeIps: {
        authFail: countActiveBurstIps(authFailByIp, AUTH_FAIL_BURST_THRESHOLD),
        notFound: countActiveBurstIps(notFoundByIp, NOT_FOUND_BURST_THRESHOLD),
        rateLimited: countActiveBurstIps(rateLimitedByIp, RATE_LIMIT_BURST_THRESHOLD),
        serverError: countActiveBurstIps(serverErrorByIp, SERVER_ERROR_BURST_THRESHOLD),
      },
    },
  };
}

function pruneNotFoundMap() {
  const now = Date.now();
  for (const [ip, entry] of notFoundByIp) {
    if (now > entry.resetAt) notFoundByIp.delete(ip);
  }
  for (const [ip, entry] of authFailByIp) {
    if (now > entry.resetAt) authFailByIp.delete(ip);
  }
  for (const [ip, entry] of rateLimitedByIp) {
    if (now > entry.resetAt) rateLimitedByIp.delete(ip);
  }
  for (const [ip, entry] of serverErrorByIp) {
    if (now > entry.resetAt) serverErrorByIp.delete(ip);
  }
  for (const [name, entry] of eventCounters) {
    if (now > entry.resetAt) eventCounters.delete(name);
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
        bumpEventCounter("status404");
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
        bumpEventCounter("status5xx");
        const now = Date.now();
        let entry = serverErrorByIp.get(ip);
        if (!entry || now > entry.resetAt) {
          entry = { count: 0, resetAt: now + SERVER_ERROR_WINDOW_MS };
          serverErrorByIp.set(ip, entry);
        }
        entry.count += 1;
        if (entry.count === SERVER_ERROR_BURST_THRESHOLD) {
          logSecurity("warn", "suspicious_5xx_burst", {
            ip,
            count: entry.count,
            windowMs: SERVER_ERROR_WINDOW_MS,
            lastPath: req.path,
          });
        }
        logSecurity("error", "http_server_error", {
          ip,
          method: req.method,
          path: req.path,
          status,
        });
      }
      if (status === 401 && req.path.startsWith("/api/")) {
        bumpEventCounter("status401");
        const now = Date.now();
        let entry = authFailByIp.get(ip);
        if (!entry || now > entry.resetAt) {
          entry = { count: 0, resetAt: now + AUTH_FAIL_WINDOW_MS };
          authFailByIp.set(ip, entry);
        }
        entry.count += 1;
        if (entry.count === AUTH_FAIL_BURST_THRESHOLD) {
          logSecurity("warn", "suspicious_auth_fail_burst", {
            ip,
            count: entry.count,
            windowMs: AUTH_FAIL_WINDOW_MS,
            lastPath: req.path,
          });
        }
      }
      if (status === 429 && req.path.startsWith("/api/")) {
        bumpEventCounter("status429");
        const now = Date.now();
        let entry = rateLimitedByIp.get(ip);
        if (!entry || now > entry.resetAt) {
          entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
          rateLimitedByIp.set(ip, entry);
        }
        entry.count += 1;
        if (entry.count === RATE_LIMIT_BURST_THRESHOLD) {
          logSecurity("warn", "suspicious_rate_limit_burst", {
            ip,
            count: entry.count,
            windowMs: RATE_LIMIT_WINDOW_MS,
            lastPath: req.path,
          });
        }
      }
      if (status === 403 && req.path.startsWith("/api/")) {
        bumpEventCounter("status403");
      }
      if (status === 403 && req.path.startsWith("/api/admin")) {
        logSecurity("warn", "admin_forbidden", { ip, path: req.path });
      }
    });
    next();
  };
}
