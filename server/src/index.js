import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  assertPayfastClientNotifySameOrigin,
  assertPayfastHttpsUrlsInLive,
  assertPayfastPassphraseForLiveCheckout,
  getPayfastFrequency,
  getPayfastMerchantCredentialsFromEnv,
  getPayfastProcessUrl,
  logPayfastPayloadDebug,
  signPayfastPayload,
} from "./payfast.js";
import { sendInvoiceEmail, sendHtmlEmail } from "./sendInvoice.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { postgrestErrorToApiBody } from "./postgrestErrorToApiBody.js";
import {
  authEmailVerificationFields,
  dedupeAuthUsersByEmail,
  fetchMergedPlatformUsersForAdmin,
  listAllAuthUsersAdmin,
} from "./adminPlatformUsersList.js";
import { fetchSyncUsersForAdmin } from "./adminSyncUsersList.js";
import { runAdminDeleteOrphanProfiles } from "./adminCleanOrphanProfiles.js";
import { purgeUserStorageAssets } from "./purgeUserStorage.js";
import { getSupabaseAnonClient } from "./supabaseAnon.js";
import { getUserFromRequest, requireAuthMiddleware } from "./supabaseAuth.js";
import {
  consumeLoginSlot,
  consumeSignupSlot,
  getClientIp,
  startLoginRateLimitPruner,
} from "./loginIpRateLimit.js";
import {
  auditHttpResponses,
  enforceHttps,
  getSecurityEventsSnapshot,
  logSecurity,
  securityHeaders,
  startSecurityAuditPruner,
} from "./securityMiddleware.js";
import {
  apiAbuseLimiterMiddleware,
  startApiAbusePruner,
} from "./apiAbuseLimiter.js";
import { createGlobalApiLimiter } from "./globalExpressRateLimit.js";
import {
  assertFiniteAmount,
  isSafeHttpUrl,
  isValidEmail,
  isValidTrackingToken,
  isValidUuid,
  normalizeHtmlPdfPageMargins,
  sanitizeCssForPdf,
  sanitizeEmailHtmlBody,
  sanitizeHtmlForPdf,
  sanitizeHtmlPdfTitle,
  sanitizeInviteMetadata,
  sanitizeOneLine,
  sanitizeSignUpUserMetadata,
  validateBase64Pdf,
} from "./inputValidation.js";
import { generateHtmlPdfBuffer, getAnvilClient } from "./anvilPdf.js";
import { parseBody } from "./validateBody.js";
import {
  forgotPasswordBodySchema,
  signInBodySchema,
  signUpBodySchema,
  waitlistBodySchema,
} from "./schemas/apiBodySchemas.js";
import { sendInvoiceBodySchema } from "./schemas/invoiceSchemas.js";
import {
  adminBootstrapBodySchema,
  adminInviteBodySchema,
  adminRolesBodySchema,
  adminUpdateUserBodySchema,
  generatePdfHtmlBodySchema,
  payfastOnceBodySchema,
  payfastSubscriptionBodySchema,
  sendEmailBodySchema,
  trackOpenBodySchema,
} from "./schemas/mutationSchemas.js";
import { sendUnexpectedError } from "./apiResponse.js";
import { assertCallerForAdminRoute } from "./adminRouteAccess.js";
import { createReferralAttributionForUser } from "./affiliateReferralCreate.js";
import { createPayfastSubscriptionItnHandler } from "./payfastSubscriptionItn.js";
import { buildAffiliateDashboardPayload } from "./affiliateDashboardData.js";
import { countAffiliateApplicationsByStatus } from "./affiliateApplicationCounts.js";
import { mergeAffiliateApplicationsWithPartnersAndStats } from "./affiliateAdminApplicationsEnrich.js";
import {
  isPaidSubscriptionPlan,
  markReferralSubscribedForUser,
} from "./affiliateReferralLifecycle.js";
import {
  handlePostAffiliateApplicationApprove,
  handlePostAffiliateApplicationDecline,
} from "./affiliateApplicationAdminActions.js";
import { registerClientPortalRoutes } from "./clientPortalApi.js";
import { registerPublicInvoiceRoutes } from "./publicInvoiceApi.js";
import { registerPublicPayslipRoutes } from "./publicPayslipApi.js";
import { runExpireOverdueTrialsBatch } from "./trialExpiryBatch.js";
import {
  assertUserHasAnyFeature,
  assertUserHasFeature,
} from "./featureGate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from server directory (so it works when run from project root or server/)
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
// Repo root .env (Vite uses this; PayFast vars are often here if not duplicated in server/.env)
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const app = express();
// So req.ip / X-Forwarded-For are correct behind a reverse proxy (e.g. nginx, Vercel, Railway).
if (process.env.TRUST_PROXY === "false") {
  app.set("trust proxy", false);
} else {
  const hops = Number(process.env.TRUST_PROXY_HOPS);
  app.set("trust proxy", Number.isFinite(hops) && hops >= 0 ? hops : 1);
}
const port = Number(process.env.PORT) || 5179;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "paidly";
// Parse ADMIN_BYPASS_AUTH: accept "true", "1", "yes", "on" (case-insensitive)
const adminBypassEnv = (process.env.ADMIN_BYPASS_AUTH || "").toLowerCase().trim();
const adminBypassEnabled = ["true", "1", "yes", "on"].includes(adminBypassEnv);

function makeRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function envFlag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return Boolean(defaultValue);
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envNumber(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseConfiguredClientOrigins(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw || raw === "*") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const OBSERVABILITY_WINDOW_MS = 60 * 1000;
const observabilityCounters = {
  total: [],
  slow: [],
  error4xx: [],
  error5xx: [],
  latencyMs: [],
};

function pruneObservability(now = Date.now()) {
  const cutoff = now - OBSERVABILITY_WINDOW_MS;
  observabilityCounters.total = observabilityCounters.total.filter((ts) => ts >= cutoff);
  observabilityCounters.slow = observabilityCounters.slow.filter((ts) => ts >= cutoff);
  observabilityCounters.error4xx = observabilityCounters.error4xx.filter((ts) => ts >= cutoff);
  observabilityCounters.error5xx = observabilityCounters.error5xx.filter((ts) => ts >= cutoff);
  observabilityCounters.latencyMs = observabilityCounters.latencyMs.filter((entry) => entry.ts >= cutoff);
}

function p95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

function getObservabilityAlertThresholds() {
  return {
    warn: {
      errorRatePct: envNumber("OBS_ALERT_WARN_ERROR_RATE_PCT", 5),
      error5xxLastMinute: envNumber("OBS_ALERT_WARN_5XX_PER_MIN", 3),
      latencyP95Ms: envNumber("OBS_ALERT_WARN_P95_MS", 1200),
      slowRequestsLastMinute: envNumber("OBS_ALERT_WARN_SLOW_PER_MIN", 10),
    },
    critical: {
      errorRatePct: envNumber("OBS_ALERT_CRITICAL_ERROR_RATE_PCT", 12),
      error5xxLastMinute: envNumber("OBS_ALERT_CRITICAL_5XX_PER_MIN", 10),
      latencyP95Ms: envNumber("OBS_ALERT_CRITICAL_P95_MS", 2500),
      slowRequestsLastMinute: envNumber("OBS_ALERT_CRITICAL_SLOW_PER_MIN", 25),
    },
  };
}

/**
 * Health contract for auth security settings.
 * These are deployment assertions (env-driven), because Supabase dashboard auth toggles
 * are not directly queryable from this API process.
 */
function evaluateAuthSecurityHealth() {
  const issues = [];

  if (!process.env.SUPABASE_URL) issues.push("SUPABASE_URL is missing.");
  if (!process.env.SUPABASE_ANON_KEY) issues.push("SUPABASE_ANON_KEY is missing.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) issues.push("SUPABASE_SERVICE_ROLE_KEY is missing.");

  if (!envFlag("AUTH_REQUIRE_EMAIL_VERIFICATION", true)) {
    issues.push("AUTH_REQUIRE_EMAIL_VERIFICATION must be true.");
  }

  const passwordMinLength = envNumber("AUTH_PASSWORD_MIN_LENGTH", 12);
  if (!Number.isFinite(passwordMinLength) || passwordMinLength < 12) {
    issues.push("AUTH_PASSWORD_MIN_LENGTH must be >= 12.");
  }

  const resetTokenTtlMinutes = envNumber("AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES", 60);
  if (!Number.isFinite(resetTokenTtlMinutes) || resetTokenTtlMinutes <= 0 || resetTokenTtlMinutes > 60) {
    issues.push("AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES must be between 1 and 60.");
  }

  const sessionTtlMinutes = envNumber("AUTH_SESSION_TTL_MINUTES", 1440);
  if (!Number.isFinite(sessionTtlMinutes) || sessionTtlMinutes <= 0 || sessionTtlMinutes > 1440) {
    issues.push("AUTH_SESSION_TTL_MINUTES must be between 1 and 1440.");
  }

  return {
    ok: issues.length === 0,
    issues,
    expected: {
      AUTH_REQUIRE_EMAIL_VERIFICATION: true,
      AUTH_PASSWORD_MIN_LENGTH_MIN: 12,
      AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES_MAX: 60,
      AUTH_SESSION_TTL_MINUTES_MAX: 1440,
    },
    observed: {
      AUTH_REQUIRE_EMAIL_VERIFICATION: envFlag("AUTH_REQUIRE_EMAIL_VERIFICATION", true),
      AUTH_PASSWORD_MIN_LENGTH: passwordMinLength,
      AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: resetTokenTtlMinutes,
      AUTH_SESSION_TTL_MINUTES: sessionTtlMinutes,
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  };
}

function evaluateDeploymentSecurityHealth() {
  const issues = [];
  const isProd = process.env.NODE_ENV === "production";
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const clientOrigin = String(process.env.CLIENT_ORIGIN || "").trim();
  const configuredClientOrigins = parseConfiguredClientOrigins(clientOrigin);
  const clientOriginUnsafeInProd = configuredClientOrigins.some((origin) => {
    try {
      const u = new URL(origin);
      const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      return u.protocol !== "https:" && !isLocal;
    } catch {
      return true;
    }
  });
  const trustProxyDisabled = String(process.env.TRUST_PROXY || "").trim().toLowerCase() === "false";
  const corsDebugAllowAll = envFlag("CORS_DEBUG_ALLOW_ALL", false);
  const enforceHttpsEnabled = !envFlag("ENFORCE_HTTPS", true) ? false : true;
  const hstsDisabled = envFlag("DISABLE_HSTS", false);
  const publicDbDirectAccess = envFlag("PUBLIC_DB_DIRECT_ACCESS", false);
  const turnstileEnabled = envFlag("TURNSTILE_ENABLED", false);
  const turnstileRequireSignup = envFlag("TURNSTILE_REQUIRE_SIGNUP", turnstileEnabled);
  const turnstileRequireWaitlist = envFlag("TURNSTILE_REQUIRE_WAITLIST", turnstileEnabled);
  const turnstileRequireForgotPassword = envFlag("TURNSTILE_REQUIRE_FORGOT_PASSWORD", turnstileEnabled);

  if (!process.env.SUPABASE_URL) issues.push("SUPABASE_URL is missing.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) issues.push("SUPABASE_SERVICE_ROLE_KEY is missing.");
  if (!process.env.SUPABASE_ANON_KEY) issues.push("SUPABASE_ANON_KEY is missing.");
  if (!process.env.RESEND_API_KEY) issues.push("RESEND_API_KEY is missing.");
  if (!process.env.ADMIN_BOOTSTRAP_TOKEN) issues.push("ADMIN_BOOTSTRAP_TOKEN is missing.");
  if (turnstileEnabled && !process.env.TURNSTILE_SECRET_KEY) {
    issues.push("TURNSTILE_SECRET_KEY is missing while TURNSTILE_ENABLED is true.");
  }

  if (isProd) {
    if (trustProxyDisabled) {
      issues.push("TRUST_PROXY must not be false in production (required for secure proxy headers).");
    }
    if (!enforceHttpsEnabled) {
      issues.push("ENFORCE_HTTPS must be enabled in production.");
    }
    if (hstsDisabled) {
      issues.push("DISABLE_HSTS must not be true in production.");
    }
    if (corsDebugAllowAll) {
      issues.push("CORS_DEBUG_ALLOW_ALL must be disabled in production.");
    }
    if (adminBypassEnabled) {
      issues.push("ADMIN_BYPASS_AUTH must be disabled in production.");
    }
    if (!clientOrigin || clientOrigin === "*") {
      issues.push("CLIENT_ORIGIN must be set to explicit trusted origins in production.");
    }
    if (clientOriginUnsafeInProd) {
      issues.push("CLIENT_ORIGIN must only include valid https origins in production (localhost allowed for local-only testing).");
    }
    if (/localhost|127\.0\.0\.1/i.test(supabaseUrl)) {
      issues.push("SUPABASE_URL must not point to localhost in production.");
    }
  }

  if (publicDbDirectAccess) {
    issues.push("PUBLIC_DB_DIRECT_ACCESS must remain false. Database access should only be via backend/Supabase RLS.");
  }

  return {
    ok: issues.length === 0,
    issues,
    expected: {
      ENFORCE_HTTPS: true,
      DISABLE_HSTS: false,
      CORS_DEBUG_ALLOW_ALL: false,
      PUBLIC_DB_DIRECT_ACCESS: false,
      ADMIN_BYPASS_AUTH: false,
      CLIENT_ORIGIN_EXPLICIT_IN_PRODUCTION: true,
      TURNSTILE_SECRET_IF_ENABLED: true,
      TURNSTILE_WAITLIST_AND_FORGOT_PASSWORD_OPTIONAL: true,
    },
    observed: {
      NODE_ENV: process.env.NODE_ENV || "development",
      ENFORCE_HTTPS: enforceHttpsEnabled,
      DISABLE_HSTS: hstsDisabled,
      CORS_DEBUG_ALLOW_ALL: corsDebugAllowAll,
      TRUST_PROXY_DISABLED: trustProxyDisabled,
      ADMIN_BYPASS_AUTH: adminBypassEnabled,
      CLIENT_ORIGIN_SET: Boolean(clientOrigin && clientOrigin !== "*"),
      CLIENT_ORIGIN_VALUES_COUNT: configuredClientOrigins.length,
      CLIENT_ORIGIN_UNSAFE_IN_PRODUCTION: clientOriginUnsafeInProd,
      PUBLIC_DB_DIRECT_ACCESS: publicDbDirectAccess,
      SUPABASE_URL_SET: Boolean(process.env.SUPABASE_URL),
      SUPABASE_URL_LOCALHOST: /localhost|127\.0\.0\.1/i.test(supabaseUrl),
      SUPABASE_SERVICE_ROLE_KEY_SET: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_ANON_KEY_SET: Boolean(process.env.SUPABASE_ANON_KEY),
      RESEND_API_KEY_SET: Boolean(process.env.RESEND_API_KEY),
      ADMIN_BOOTSTRAP_TOKEN_SET: Boolean(process.env.ADMIN_BOOTSTRAP_TOKEN),
      TURNSTILE_ENABLED: turnstileEnabled,
      TURNSTILE_REQUIRE_SIGNUP: turnstileRequireSignup,
      TURNSTILE_REQUIRE_WAITLIST: turnstileRequireWaitlist,
      TURNSTILE_REQUIRE_FORGOT_PASSWORD: turnstileRequireForgotPassword,
      TURNSTILE_SECRET_KEY_SET: Boolean(process.env.TURNSTILE_SECRET_KEY),
    },
  };
}

function getTurnstileClientIp(req) {
  const raw = String(req.headers["x-forwarded-for"] || "").trim();
  if (!raw) return undefined;
  return raw.split(",")[0].trim() || undefined;
}

async function verifyTurnstileToken(token, req) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) {
    return { ok: false, reason: "turnstile_secret_missing" };
  }
  const t = String(token || "").trim();
  if (!t) {
    return { ok: false, reason: "turnstile_token_missing" };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", t);
  const ip = getTurnstileClientIp(req);
  if (ip) body.set("remoteip", ip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, reason: "turnstile_http_error", detail: `status_${resp.status}` };
    }
    if (json?.success === true) {
      return { ok: true };
    }
    const code = Array.isArray(json?.["error-codes"]) ? json["error-codes"].join(",") : "turnstile_failed";
    return { ok: false, reason: "turnstile_failed", detail: code };
  } catch (err) {
    return { ok: false, reason: "turnstile_exception", detail: err?.name || err?.message || "unknown" };
  } finally {
    clearTimeout(timer);
  }
}

/** Log admin API calls for monitoring sync and permission issues */
function logAdminApi(method, path, statusCode, detail = null) {
  const msg = detail ? `[admin] ${method} ${path} ${statusCode} - ${detail}` : `[admin] ${method} ${path} ${statusCode}`;
  if (statusCode >= 400) {
    console.error(msg);
    const level = statusCode >= 500 ? "error" : "warn";
    logSecurity(level, "admin_api", {
      method,
      path,
      status: statusCode,
      detail: detail || undefined,
    });
  } else {
    console.log(msg);
  }
}

/**
 * Resolve admin caller from request: must be authenticated, then either
 * app_metadata.role === "admin" OR (when ADMIN_BYPASS_AUTH is true) email in ADMIN_BYPASS_EMAILS.
 * Bypass is only allowed when both ADMIN_BYPASS_AUTH is true AND email is in the list.
 *
 * @param {{
 *   allowInternalTeam?: boolean,
 *   allowTeamManagement?: boolean,
 *   allowAffiliateModeration?: boolean,
 * }} [opts]
 *   allowInternalTeam — profiles with admin|management|support|sales may access read-style admin routes.
 *   allowTeamManagement — profiles with admin|management may POST team invites (same as JWT admin for this action).
 *   allowAffiliateModeration — admin|management|support may approve/decline affiliates (matches /admin-v2/affiliates).
 */
const getAdminFromRequest = async (req, res, opts = {}) => {
  const { user, error } = await getUserFromRequest(req);
  if (error) {
    logAdminApi(req.method, req.path, 401, error);
    res.status(401).json({ error });
    return null;
  }

  const deny = await assertCallerForAdminRoute(supabaseAdmin, user, opts);
  if (deny) {
    logAdminApi(req.method, req.path, deny.status, deny.body?.error);
    res.status(deny.status).json(deny.body);
    return null;
  }

  return user;
};

/**
 * Browser → API: frontend (e.g. https://www.paidly.co.za) calls the API on another host (e.g. api.paidly.co.za).
 * With credentials, CORS must echo a concrete Access-Control-Allow-Origin (never *).
 *
 * Default: strict allowlist only (no *.vercel.app / legacy app.* / :4173). Add staging or previews via CLIENT_ORIGIN
 * (comma-separated full Origin strings, e.g. https://paidly-git-main.vercel.app,http://127.0.0.1:5173).
 */
const SAAS_CORS_ORIGINS = [
  "https://paidly.co.za",
  "https://www.paidly.co.za",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const DEFAULT_CORS_ALLOW_SET = new Set(SAAS_CORS_ORIGINS);

/** Temporary debug: Access-Control-Allow-Origin: * (cannot be combined with credentials; unset after testing). */
const CORS_DEBUG_ALLOW_ALL = /^(1|true|yes)$/i.test(
  String(process.env.CORS_DEBUG_ALLOW_ALL ?? "").trim()
);

function createCorsOriginHandler() {
  const configured = parseConfiguredClientOrigins(process.env.CLIENT_ORIGIN);
  if (configured.length > 0) {
    const allowed = new Set(configured);
    return (origin, callback) => {
      if (!origin) return callback(null, true);
      callback(null, allowed.has(origin));
    };
  }
  return (origin, callback) => {
    if (!origin) return callback(null, true);
    callback(null, DEFAULT_CORS_ALLOW_SET.has(origin));
  };
}

/** Sync mirror of createCorsOriginHandler (for early OPTIONS replies). */
function isCorsOriginAllowed(origin) {
  if (!origin) return true;
  if (typeof origin !== "string") return false;
  const configured = parseConfiguredClientOrigins(process.env.CLIENT_ORIGIN);
  if (configured.length > 0) {
    return configured.includes(origin);
  }
  return DEFAULT_CORS_ALLOW_SET.has(origin);
}

/** Must stay aligned with cors({ methods }) below; credentialed clients need a concrete Allow-Origin. */
const CORS_ALLOW_METHODS =
  "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";

app.use(enforceHttps());
app.use(securityHeaders());
app.use(auditHttpResponses(getClientIp));
// Correlation id for every request (returned in responses and logs).
app.use((req, res, next) => {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  const requestId = incoming || makeRequestId();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

// Browsers send OPTIONS first (preflight). Respond before route handlers; echo Origin when credentials are used.
app.use((req, res, next) => {
  if (req.method !== "OPTIONS") return next();
  res.setHeader("Vary", "Origin");
  if (CORS_DEBUG_ALLOW_ALL) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
    const requested = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      requested || "content-type, authorization, accept"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }
  const origin = req.headers.origin;
  if (origin) {
    if (!isCorsOriginAllowed(origin)) {
      return res.sendStatus(403);
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
    const requested = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      requested || "content-type, authorization, accept"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }
  return next();
});

app.use(
  cors({
    origin: CORS_DEBUG_ALLOW_ALL ? "*" : createCorsOriginHandler(),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    // * and Access-Control-Allow-Credentials: true cannot both be sent (browser will reject).
    credentials: !CORS_DEBUG_ALLOW_ALL,
  })
);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const now = Date.now();
    const durationMs = now - startedAt;
    observabilityCounters.total.push(now);
    observabilityCounters.latencyMs.push({ ts: now, value: durationMs });
    if (durationMs >= 1500) observabilityCounters.slow.push(now);
    if (res.statusCode >= 400 && res.statusCode < 500) observabilityCounters.error4xx.push(now);
    if (res.statusCode >= 500) observabilityCounters.error5xx.push(now);
    pruneObservability(now);
    if (res.statusCode >= 500 || durationMs >= 1500) {
      logSecurity(res.statusCode >= 500 ? "error" : "warn", "http_request_observed", {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs,
        requestId: req.requestId || res.locals.requestId || null,
        ip: getClientIp(req),
      });
    }
  });
  next();
});

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({
  extended: false,
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use("/api", createGlobalApiLimiter(getClientIp));
app.use(apiAbuseLimiterMiddleware(getClientIp, logSecurity));

registerClientPortalRoutes(app);
registerPublicInvoiceRoutes(app);
registerPublicPayslipRoutes(app);

/** Root URL — no SPA here; avoids a bare 404 when someone opens the API port in a browser. */
app.get("/", (req, res) => {
  res.status(200).json({
    service: "Paidly API",
    health: "/api/health",
    hint: "The web app runs on the Vite dev server (usually port 5173), not this port.",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    requestId: req.requestId || res.locals.requestId || null,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

/**
 * Explicit auth-security health endpoint.
 * Returns 503 when required auth-hardening settings are not compliant.
 */
app.get("/api/health/auth-security", (req, res) => {
  const report = evaluateAuthSecurityHealth();
  if (!report.ok) {
    return res.status(503).json({
      status: "fail",
      area: "auth-security",
      message: "Authentication security configuration is not compliant.",
      ...report,
    });
  }
  return res.status(200).json({
    status: "ok",
    area: "auth-security",
    ...report,
  });
});

app.get("/api/health/deployment-security", (req, res) => {
  const report = evaluateDeploymentSecurityHealth();
  if (!report.ok) {
    return res.status(503).json({
      status: "fail",
      area: "deployment-security",
      message: "Deployment security configuration is not compliant.",
      ...report,
    });
  }
  return res.status(200).json({
    status: "ok",
    area: "deployment-security",
    ...report,
  });
});

app.get("/api/health/readiness", (req, res) => {
  const auth = evaluateAuthSecurityHealth();
  const deployment = evaluateDeploymentSecurityHealth();
  const ok = auth.ok && deployment.ok;
  const payload = {
    status: ok ? "ok" : "fail",
    area: "readiness",
    checks: {
      authSecurity: auth.ok ? "pass" : "fail",
      deploymentSecurity: deployment.ok ? "pass" : "fail",
    },
    requestId: req.requestId || res.locals.requestId || null,
    uptimeSeconds: Math.floor(process.uptime()),
  };
  return res.status(ok ? 200 : 503).json(payload);
});

app.get("/api/health/observability", (req, res) => {
  const now = Date.now();
  pruneObservability(now);
  const latencies = observabilityCounters.latencyMs.map((entry) => entry.value);
  const requestsLastMinute = observabilityCounters.total.length;
  const error4xxLastMinute = observabilityCounters.error4xx.length;
  const error5xxLastMinute = observabilityCounters.error5xx.length;
  const slowRequestsLastMinute = observabilityCounters.slow.length;
  const errorRatePct =
    requestsLastMinute > 0
      ? Number((((error4xxLastMinute + error5xxLastMinute) / requestsLastMinute) * 100).toFixed(2))
      : 0;
  const latencyAvg = latencies.length
    ? Number((latencies.reduce((sum, v) => sum + v, 0) / latencies.length).toFixed(2))
    : 0;
  const latencyP95 = p95(latencies);
  const latencyMax = latencies.length ? Math.max(...latencies) : 0;
  const thresholds = getObservabilityAlertThresholds();
  const isCritical =
    errorRatePct >= thresholds.critical.errorRatePct ||
    error5xxLastMinute >= thresholds.critical.error5xxLastMinute ||
    latencyP95 >= thresholds.critical.latencyP95Ms ||
    slowRequestsLastMinute >= thresholds.critical.slowRequestsLastMinute;
  const isWarn =
    errorRatePct >= thresholds.warn.errorRatePct ||
    error5xxLastMinute >= thresholds.warn.error5xxLastMinute ||
    latencyP95 >= thresholds.warn.latencyP95Ms ||
    slowRequestsLastMinute >= thresholds.warn.slowRequestsLastMinute;
  const alertState = isCritical ? "critical" : isWarn ? "warn" : "ok";
  const payload = {
    status: "ok",
    area: "observability",
    windowSeconds: 60,
    alertState,
    counters: {
      requestsLastMinute,
      error4xxLastMinute,
      error5xxLastMinute,
      slowRequestsLastMinute,
      errorRatePct,
    },
    latencyMs: {
      avg: latencyAvg,
      p95: latencyP95,
      max: latencyMax,
    },
    thresholds,
    requestId: req.requestId || res.locals.requestId || null,
    uptimeSeconds: Math.floor(process.uptime()),
  };
  return res.status(200).json(payload);
});

app.get("/api/security/events", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowInternalTeam: true });
    if (!adminUser) return;
    return res.status(200).json({
      status: "ok",
      area: "security-events",
      at: new Date().toISOString(),
      summary: getSecurityEventsSnapshot(),
    });
  } catch (err) {
    return sendUnexpectedError(res, err, "security-events");
  }
});

/**
 * Pre-launch waitlist (email + optional name). Inserts into `waitlist_signups`; duplicate email returns same success message.
 */
app.post("/api/waitlist", async (req, res) => {
  const ip = getClientIp(req);
  try {
    const parsed = parseBody(waitlistBodySchema, req, res, () =>
      logSecurity("warn", "waitlist_bad_request", { ip, reason: "validation" })
    );
    if (!parsed) return;
    const { email: normalizedEmail, name, source, turnstile_token } = parsed;
    const nameSafe = sanitizeOneLine(name != null ? name : "", 120);
    const sourceSafe = sanitizeOneLine(source != null ? source : "", 64);

    const turnstileEnabled = envFlag("TURNSTILE_ENABLED", false);
    const requireTurnstile = envFlag("TURNSTILE_REQUIRE_WAITLIST", turnstileEnabled);
    if (requireTurnstile) {
      const verify = await verifyTurnstileToken(turnstile_token, req);
      if (!verify.ok) {
        logSecurity("warn", "waitlist_turnstile_failed", {
          ip,
          email: normalizedEmail,
          reason: verify.reason,
          detail: verify.detail,
        });
        return res.status(403).json({
          error: "Security verification failed. Please retry and complete the challenge.",
        });
      }
    }

    const { error } = await supabaseAdmin.from("waitlist_signups").insert({
      email: normalizedEmail,
      name: nameSafe || null,
      source: sourceSafe || null,
    });

    if (error) {
      if (error.code === "23505") {
        logSecurity("info", "waitlist_duplicate", { ip, email: normalizedEmail });
        return res.json({
          ok: true,
          duplicate: true,
          message: "You're already on the list — we'll email you before we launch.",
        });
      }
      if (
        typeof error.message === "string" &&
        (error.message.includes("waitlist_signups") || error.message.includes("schema cache"))
      ) {
        logSecurity("error", "waitlist_table_missing", { ip, message: error.message });
        return res.status(503).json({
          error:
            "Waitlist is not available yet. Run the latest database migration (waitlist_signups) and try again.",
        });
      }
      console.error("[waitlist]", error.message);
      logSecurity("error", "waitlist_insert_failed", { ip, message: error.message });
      return res.status(500).json({ error: "Could not save your request. Please try again later." });
    }

    logSecurity("info", "waitlist_signup", { ip, email: normalizedEmail });
    return res.json({
      ok: true,
      message: "You're on the list. We'll email you before we launch.",
    });
  } catch (err) {
    logSecurity("error", "waitlist_exception", { ip, message: err?.message || "unknown" });
    if (!res.headersSent) {
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const ip = getClientIp(req);
  try {
    const parsed = parseBody(forgotPasswordBodySchema, req, res, () =>
      logSecurity("warn", "auth_forgot_password_bad_request", { ip, reason: "validation" })
    );
    if (!parsed) return;
    const { email: normalizedEmail, redirectTo, turnstile_token } = parsed;

    const turnstileEnabled = envFlag("TURNSTILE_ENABLED", false);
    const requireTurnstile = envFlag("TURNSTILE_REQUIRE_FORGOT_PASSWORD", turnstileEnabled);
    if (requireTurnstile) {
      const verify = await verifyTurnstileToken(turnstile_token, req);
      if (!verify.ok) {
        logSecurity("warn", "auth_forgot_password_turnstile_failed", {
          ip,
          email: normalizedEmail,
          reason: verify.reason,
          detail: verify.detail,
        });
        return res.status(403).json({
          error: "Security verification failed. Please retry and complete the challenge.",
        });
      }
    }

    const supabaseAnon = getSupabaseAnonClient();
    if (!supabaseAnon) {
      logSecurity("error", "auth_forgot_password_misconfigured", { ip, reason: "no_supabase_anon" });
      return res.status(503).json({
        error:
          "Password reset service is not configured. Set SUPABASE_ANON_KEY on the API server.",
      });
    }

    const { error } = await supabaseAnon.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: typeof redirectTo === "string" ? redirectTo : undefined,
    });

    if (error) {
      logSecurity("warn", "auth_forgot_password_failed", {
        ip,
        email: normalizedEmail,
        reason: error.message || "forgot_password_error",
      });
      // Keep user-enumeration safe response.
      return res.json({ ok: true });
    }

    logSecurity("info", "auth_forgot_password_requested", {
      ip,
      email: normalizedEmail,
    });
    return res.json({ ok: true });
  } catch (err) {
    logSecurity("error", "auth_forgot_password_exception", {
      ip,
      message: err?.message || "unknown",
    });
    if (!res.headersSent) return res.status(500).json({ error: "Password reset failed" });
  }
});

/**
 * Attach referral attribution after signup/login. Validates JWT server-side; idempotent per referred user.
 */
app.post("/api/referrals/create", async (req, res) => {
  try {
    const { user, error } = await getUserFromRequest(req);
    if (error || !user?.id) {
      return res.status(401).json({ error: error || "Unauthorized" });
    }
    const referralCode = req.body?.referral_code ?? req.body?.referralCode;
    const result = await createReferralAttributionForUser(supabaseAdmin, {
      referralCode: referralCode != null ? String(referralCode) : "",
      userId: user.id,
    });
    if (!result.ok) {
      const err = result.error;
      if (err === "self_referral" || err === "invalid_affiliate" || err === "invalid_code") {
        return res.status(400).json({ error: err });
      }
      return res.status(500).json({ error: err || "failed" });
    }
    return res.json({ ok: true, idempotent: result.idempotent === true });
  } catch (err) {
    console.error("[referrals/create]", err?.message || err);
    return res.status(500).json({ error: "Unexpected error" });
  }
});

/**
 * Affiliate dashboard: stats + commissions (JWT).
 * Canonical on API host: GET /affiliate/dashboard — alias: GET /api/affiliate/dashboard
 */
async function handleAffiliateDashboardGet(req, res) {
  try {
    const { user, error } = await getUserFromRequest(req);
    if (error || !user?.id) {
      return res.status(401).json({ error: error || "Unauthorized" });
    }
    const payload = await buildAffiliateDashboardPayload(supabaseAdmin, user.id);
    if (!payload.ok) {
      return res.status(500).json({ error: payload.error || "failed" });
    }
    return res.json(payload);
  } catch (err) {
    console.error("[affiliate/dashboard]", err?.message || err);
    return res.status(500).json({ error: "Unexpected error" });
  }
}

app.get("/affiliate/dashboard", handleAffiliateDashboardGet);
app.get("/api/affiliate/dashboard", handleAffiliateDashboardGet);

/**
 * Password sign-in proxied through the API so we can rate-limit by IP before hitting Supabase.
 * Client sets the returned tokens via supabase.auth.setSession (see SupabaseAuthService.signInWithEmail).
 */
app.post("/api/auth/sign-in", async (req, res) => {
  const ip = getClientIp(req);
  try {
    const parsed = parseBody(signInBodySchema, req, res, () =>
      logSecurity("warn", "auth_sign_in_bad_request", { ip, reason: "validation" })
    );
    if (!parsed) return;
    const { email: normalizedEmail, password } = parsed;

    const slot = consumeLoginSlot(ip);
    if (!slot.ok) {
      logSecurity("warn", "auth_sign_in_rate_limited", {
        ip,
        retryAfterSeconds: slot.retryAfterSeconds,
      });
      res.setHeader("Retry-After", String(slot.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many sign-in attempts from this network. Please try again later.",
        retryAfterSeconds: slot.retryAfterSeconds,
      });
    }

    const supabaseAnon = getSupabaseAnonClient();
    if (!supabaseAnon) {
      logSecurity("error", "auth_sign_in_misconfigured", { ip, reason: "no_supabase_anon" });
      return res.status(503).json({
        error:
          "Sign-in service is not configured. Set SUPABASE_ANON_KEY on the API server (same value as the browser anon key).",
      });
    }

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      logSecurity("warn", "auth_sign_in_failed", {
        ip,
        email: normalizedEmail,
        reason: "invalid_credentials",
      });
      return res.status(401).json({
        error: error.message || "Invalid login credentials",
      });
    }

    const session = data?.session;
    if (!session?.access_token || !session?.refresh_token) {
      logSecurity("warn", "auth_sign_in_failed", {
        ip,
        email: normalizedEmail,
        reason: "no_session",
      });
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    if (!session?.user?.email_confirmed_at) {
      logSecurity("warn", "auth_sign_in_unverified_email", {
        ip,
        email: normalizedEmail,
        userId: session.user?.id || null,
      });
      return res.status(403).json({
        error: "Email not verified. Please verify your email before signing in.",
      });
    }

    logSecurity("info", "auth_sign_in_success", {
      ip,
      email: normalizedEmail,
      userId: session.user?.id || null,
    });

    return res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      user: session.user,
    });
  } catch (err) {
    logSecurity("error", "auth_sign_in_exception", {
      ip,
      message: err?.message || "unknown",
    });
    if (!res.headersSent) {
      return res.status(500).json({ error: "Sign-in failed" });
    }
  }
});

/**
 * Sign-up proxied through the API (tiered IP limits in apiAbuseLimiter + this path).
 * Same anon client as sign-in; never log passwords.
 */
app.post("/api/auth/sign-up", async (req, res) => {
  const ip = getClientIp(req);
  try {
    const parsed = parseBody(signUpBodySchema, req, res, () =>
      logSecurity("warn", "auth_sign_up_bad_request", { ip, reason: "validation" })
    );
    if (!parsed) return;
    const { email: normalizedEmail, password, data: profile, turnstile_token, redirectTo } = parsed;

    const slot = consumeSignupSlot(ip);
    if (!slot.ok) {
      logSecurity("warn", "auth_sign_up_rate_limited", {
        ip,
        retryAfterSeconds: slot.retryAfterSeconds,
      });
      res.setHeader("Retry-After", String(slot.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many sign-up attempts from this network. Please try again later.",
        retryAfterSeconds: slot.retryAfterSeconds,
      });
    }

    const supabaseAnon = getSupabaseAnonClient();
    if (!supabaseAnon) {
      logSecurity("error", "auth_sign_up_misconfigured", { ip, reason: "no_supabase_anon" });
      return res.status(503).json({
        error:
          "Sign-up service is not configured. Set SUPABASE_ANON_KEY on the API server (same value as the browser anon key).",
      });
    }

    const turnstileEnabled = envFlag("TURNSTILE_ENABLED", false);
    const requireTurnstile = envFlag("TURNSTILE_REQUIRE_SIGNUP", turnstileEnabled);
    if (requireTurnstile) {
      const verify = await verifyTurnstileToken(turnstile_token, req);
      if (!verify.ok) {
        logSecurity("warn", "auth_sign_up_turnstile_failed", {
          ip,
          email: normalizedEmail,
          reason: verify.reason,
          detail: verify.detail,
        });
        return res.status(403).json({
          error: "Security verification failed. Please retry and complete the challenge.",
        });
      }
    }

    const userMetadata = sanitizeSignUpUserMetadata(
      profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {}
    );

    let safeEmailRedirectTo;
    if (typeof redirectTo === "string" && redirectTo.trim()) {
      try {
        const url = new URL(redirectTo);
        const allowedOrigins = new Set(
          [process.env.CLIENT_ORIGIN, req.headers.origin]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        );
        const hostIsLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (allowedOrigins.has(url.origin) && (url.protocol === "https:" || hostIsLocal)) {
          safeEmailRedirectTo = url.toString();
        }
      } catch {
        safeEmailRedirectTo = undefined;
      }
    }

    const { data, error } = await supabaseAnon.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: userMetadata,
        emailRedirectTo: safeEmailRedirectTo,
      },
    });

    if (error) {
      logSecurity("warn", "auth_sign_up_failed", {
        ip,
        email: normalizedEmail,
        reason: error.message || "signup_error",
      });
      return res.status(400).json({
        error: error.message || "Sign up failed",
      });
    }

    const session = data?.session;
    const user = data?.user ?? null;

    logSecurity("info", "auth_sign_up_success", {
      ip,
      email: normalizedEmail,
      userId: user?.id || null,
      session: Boolean(session?.access_token),
    });

    return res.json({
      user,
      session: session
        ? {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            expires_at: session.expires_at,
          }
        : null,
    });
  } catch (err) {
    logSecurity("error", "auth_sign_up_exception", {
      ip,
      message: err?.message || "unknown",
    });
    if (!res.headersSent) {
      return res.status(500).json({ error: "Sign up failed" });
    }
  }
});

/**
 * Track when a client opens an invoice link (tracking_token in message_logs).
 * No auth required; called from public invoice view when URL has ?token=...
 */
app.post("/api/track-open", async (req, res) => {
  try {
    const parsed = parseBody(trackOpenBodySchema, req, res, () =>
      logSecurity("warn", "track_open_bad_request", { reason: "validation" })
    );
    if (!parsed) return;
    const { error } = await supabaseAdmin
      .from("message_logs")
      .update({ viewed: true, opened_at: new Date().toISOString() })
      .eq("tracking_token", parsed.token);
    if (error) {
      console.warn("[track-open]", error.message);
      return res.status(500).json({ error: "Failed to record open" });
    }
    return res.json({ ok: true });
  } catch (err) {
    return sendUnexpectedError(res, err, "track-open");
  }
});

/** 1x1 transparent GIF for email open tracking (same 43-byte standard) */
const TRACKING_PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/**
 * Email open tracking pixel: GET /api/email-track/:token
 * When the email client loads the image, we record the open in message_logs.
 * No auth; use same tracking_token as the invoice link.
 */
app.get("/api/email-track/:token", async (req, res) => {
  try {
    const token = (req.params.token || "").trim();
    if (!token || !isValidTrackingToken(token)) {
      res.set("Content-Type", "image/gif");
      return res.send(TRACKING_PIXEL_GIF);
    }
    await supabaseAdmin
      .from("message_logs")
      .update({ viewed: true, opened_at: new Date().toISOString() })
      .eq("tracking_token", token);
    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-store, private");
    res.send(TRACKING_PIXEL_GIF);
  } catch (err) {
    if (!res.headersSent) {
      res.set("Content-Type", "image/gif");
      res.send(TRACKING_PIXEL_GIF);
    }
  }
});

/**
 * HTML + CSS → PDF via Anvil (same payload shape as Anvil’s generate-pdf API).
 * Requires Bearer auth. Set ANVIL_API_TOKEN on the API server.
 */
app.post("/api/generate-pdf-html", requireAuthMiddleware, async (req, res) => {
  try {
    const user = req.authUser;

    await assertUserHasAnyFeature(supabaseAdmin, user.id, ["invoices", "quotes"]);

    const parsed = parseBody(generatePdfHtmlBodySchema, req, res);
    if (!parsed) return;

    const anvil = getAnvilClient();
    if (!anvil) {
      logSecurity("warn", "anvil_pdf_misconfigured", { reason: "missing_token" });
      return res.status(503).json({
        error: "PDF service is not configured. Set ANVIL_API_TOKEN on the API server.",
      });
    }

    const html = sanitizeHtmlForPdf(parsed.html);
    const css = sanitizeCssForPdf(typeof parsed.css === "string" ? parsed.css : "");
    const title = sanitizeHtmlPdfTitle(parsed.title);
    const page = normalizeHtmlPdfPageMargins(parsed.page);
    const filenameRaw = sanitizeOneLine(parsed.filename != null ? String(parsed.filename) : "document.pdf", 180) || "document.pdf";
    const downloadName = filenameRaw.toLowerCase().endsWith(".pdf") ? filenameRaw : `${filenameRaw}.pdf`;
    const asciiName = downloadName.replace(/[^\x20-\x7e]/g, "_");

    const result = await generateHtmlPdfBuffer(anvil, { html, css, title, page });

    if (!result.ok) {
      logSecurity("warn", "anvil_pdf_failed", {
        statusCode: result.statusCode,
        userId: user.id || undefined,
        detail: result.message?.slice(0, 500),
      });
      return res.status(502).json({
        error: "Could not generate PDF. Check ANVIL_API_TOKEN and payload size.",
        detail: result.message,
      });
    }

    logSecurity("info", "anvil_pdf_ok", { userId: user.id || null });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${asciiName.replace(/"/g, "")}"`);
    return res.send(result.buffer);
  } catch (err) {
    console.error("[generate-pdf-html]", err?.message || err);
    logSecurity("error", "anvil_pdf_exception", { message: err?.message || "unknown" });
    return sendUnexpectedError(res, err, "generate-pdf-html");
  }
});

app.post("/api/send-invoice", requireAuthMiddleware, async (req, res) => {
  try {
    const user = req.authUser;

    await assertUserHasFeature(supabaseAdmin, user.id, "invoices");
    await assertUserHasFeature(supabaseAdmin, user.id, "email");

    const parsed = parseBody(sendInvoiceBodySchema, req, res, () =>
      logSecurity("warn", "send_invoice_bad_request", {
        userId: user.id || null,
        reason: "validation",
      })
    );
    if (!parsed) return;

    const pdfCheck = validateBase64Pdf(parsed.base64PDF);
    if (!pdfCheck.ok) {
      return res.status(400).json({ error: pdfCheck.error || "Invalid document" });
    }

    const toEmail = parsed.clientEmail;
    const invNum = sanitizeOneLine(parsed.invoiceNum, 120);
    if (!invNum) {
      return res.status(400).json({ error: "Invalid invoice number" });
    }

    const senderName = sanitizeOneLine(parsed.fromName ?? "Paidly", 200) || "Paidly";

    const template = [parsed.clientName, parsed.amountDue, parsed.dueDate].some(Boolean)
      ? {
          clientName: sanitizeOneLine(parsed.clientName ?? "there", 200) || "there",
          amountDue: sanitizeOneLine(parsed.amountDue ?? "", 80),
          dueDate: sanitizeOneLine(parsed.dueDate ?? "", 80),
        }
      : null;

    const result = await sendInvoiceEmail(
      parsed.base64PDF,
      toEmail,
      invNum,
      senderName,
      template
    );

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    return res.json({ success: true, data: result.data });
  } catch (err) {
    return sendUnexpectedError(res, err, "send-invoice", { success: false });
  }
});

app.post("/api/send-email", requireAuthMiddleware, async (req, res) => {
  try {
    const user = req.authUser;

    await assertUserHasFeature(supabaseAdmin, user.id, "email");

    const parsed = parseBody(sendEmailBodySchema, req, res);
    if (!parsed) return;

    const toNorm = parsed.to;
    const subjectSafe = sanitizeOneLine(parsed.subject, 998);
    if (!subjectSafe) {
      return res.status(400).json({ error: "Invalid subject" });
    }

    const bodySafe = sanitizeEmailHtmlBody(parsed.body);

    const result = await sendHtmlEmail(
      toNorm,
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
});

const PAYFAST_BILLING_CYCLES = new Set(["monthly", "annual", "quarterly", "biannual"]);
const PAYFAST_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toPayfastBooleanFlag(value, fallback = true) {
  if (value == null) return fallback ? "true" : "false";
  if (typeof value === "boolean") return value ? "true" : "false";
  const v = String(value).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return "true";
  if (v === "false" || v === "0" || v === "no" || v === "off") return "false";
  return fallback ? "true" : "false";
}

const handlePayfastSubscriptionItn = createPayfastSubscriptionItnHandler({
  supabase: supabaseAdmin,
  getClientIp,
});

/**
 * PayFast subscription — same clean flow as `api/payfast-handler.js` (rewrite → `__pf=subscription`):
 * client POST JSON → this route builds + signs → JSON `{ payfastUrl, fields }` → client POSTs `fields` to PayFast.
 */
app.post("/api/payfast/subscription", (req, res) => {
  const smoke = String(process.env.PAYFAST_SUBSCRIPTION_SMOKE_TEST || "").trim().toLowerCase();
  if (smoke === "true" || smoke === "1") {
    return res.status(200).json({ success: true, message: "API working" });
  }
  const parsed = parseBody(payfastSubscriptionBodySchema, req, res);
  if (!parsed) return;

  const {
    subscriptionId: _subscriptionId,
    userId,
    userEmail,
    userName,
    plan,
    billingCycle,
    amount,
    currency,
    returnUrl,
    cancelUrl,
    notifyUrl: notifyUrlBody,
    itemDescription,
    billingDate,
    cycles,
    subscriptionNotifyEmail,
    subscriptionNotifyWebhook,
    subscriptionNotifyBuyer
  } = parsed;

  void _subscriptionId;

  const emailNorm = userEmail;

  const amountCheck = assertFiniteAmount(amount, { min: 0.01, max: 1_000_000_000 });
  if (!amountCheck.ok) {
    return res.status(400).json({ error: amountCheck.error });
  }

  const cycleRaw = String(billingCycle || "monthly").toLowerCase();
  if (!PAYFAST_BILLING_CYCLES.has(cycleRaw)) {
    return res.status(400).json({ error: "Invalid billing cycle" });
  }

  const currencySafe = sanitizeOneLine(String(currency || "ZAR"), 8).toUpperCase();
  if (!/^[A-Z0-9]{3,8}$/.test(currencySafe)) {
    return res.status(400).json({ error: "Invalid currency" });
  }

  for (const u of [returnUrl, cancelUrl, notifyUrlBody]) {
    if (u != null && String(u).trim() !== "" && !isSafeHttpUrl(String(u))) {
      return res.status(400).json({ error: "Invalid return, cancel, or notify URL" });
    }
  }

  const { merchantId, merchantKey, passphrase } = getPayfastMerchantCredentialsFromEnv();
  let defaultSubscriptionNotifyUrl = returnUrl;
  try {
    if (returnUrl) {
      const origin = new URL(String(returnUrl)).origin;
      defaultSubscriptionNotifyUrl = `${origin}/api/payfast/webhook`;
    }
  } catch {
    /* keep returnUrl fallback */
  }
  const notifyUrl =
    (notifyUrlBody != null && String(notifyUrlBody).trim() !== ""
      ? String(notifyUrlBody).trim()
      : null) ||
    process.env.PAYFAST_SUBSCRIPTION_NOTIFY_URL ||
    process.env.PAYFAST_NOTIFY_URL ||
    defaultSubscriptionNotifyUrl;
  const returnUrlResolved = process.env.PAYFAST_RETURN_URL || returnUrl;
  const cancelUrlResolved = process.env.PAYFAST_CANCEL_URL || cancelUrl;

  if (notifyUrl == null || String(notifyUrl).trim() === "") {
    return res.status(400).json({
      code: "PAYFAST_NOTIFY_URL_MISSING",
      error:
        "Could not determine notify_url. Use https returnUrl/cancelUrl from your app or set PAYFAST_SUBSCRIPTION_NOTIFY_URL in env.",
    });
  }

  if (!merchantId || !merchantKey) {
    console.error("[payfast/subscription] Missing PAYFAST_MERCHANT_ID or PAYFAST_MERCHANT_KEY", {
      hasId: Boolean(merchantId),
      hasKey: Boolean(merchantKey),
      vercelEnv: process.env.VERCEL_ENV,
    });
    return res.status(422).json({
      code: "PAYFAST_MERCHANT_NOT_CONFIGURED",
      error:
        "PayFast merchant id/key missing: set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY in Vercel (Production) or repo-root .env / server/.env for local dev, then redeploy.",
    });
  }

  const clientSuppliedNotify =
    notifyUrlBody != null && String(notifyUrlBody).trim() !== "";
  if (clientSuppliedNotify && (!returnUrl || String(returnUrl).trim() === "")) {
    return res.status(400).json({ error: "return_url is required when supplying notify_url" });
  }
  if (clientSuppliedNotify) {
    const notifyOrigin = assertPayfastClientNotifySameOrigin(notifyUrl, returnUrl);
    if (!notifyOrigin.ok) {
      return res.status(400).json({ error: notifyOrigin.error });
    }
  }

  const httpsCheckout = assertPayfastHttpsUrlsInLive([
    ["return_url", returnUrlResolved],
    ["cancel_url", cancelUrlResolved],
    ["notify_url", notifyUrl],
  ]);
  if (!httpsCheckout.ok) {
    return res.status(400).json({ error: httpsCheckout.error });
  }

  const signingReady = assertPayfastPassphraseForLiveCheckout();
  if (!signingReady.ok) {
    return res.status(422).json({
      code: signingReady.code || "PAYFAST_CHECKOUT_CONFIG",
      error: signingReady.error,
    });
  }

  const now = new Date();
  const billingDateResolved =
    typeof billingDate === "string" && PAYFAST_DATE_RE.test(billingDate.trim())
      ? billingDate.trim()
      : now.toISOString().slice(0, 10);
  const frequency = getPayfastFrequency(cycleRaw);
  const cyclesNumber = Number(cycles);
  const cyclesResolved =
    Number.isFinite(cyclesNumber) && cyclesNumber >= 0 ? Math.floor(cyclesNumber) : 0;

  const planLabel = sanitizeOneLine(plan != null ? String(plan) : "Paidly", 120) || "Paidly";
  const userLabel = sanitizeOneLine(userName != null ? String(userName) : "", 200);
  const descFromClient = sanitizeOneLine(itemDescription != null ? String(itemDescription) : "", 255);
  const itemDesc =
    descFromClient ||
    `Subscription for ${userLabel || emailNorm}`;
  const userIdSafe = String(userId).trim();
  const planForWebhook = planLabel;

  const payload = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: returnUrlResolved,
    cancel_url: cancelUrlResolved,
    notify_url: notifyUrl,
    m_payment_id: `sub_${userIdSafe}_${Date.now()}`,
    amount: amountCheck.value.toFixed(2),
    item_name: planLabel,
    item_description: itemDesc,
    custom_str1: userIdSafe,
    custom_str2: planForWebhook,
    custom_str3: cycleRaw,
    custom_str4: currencySafe,
    email_address: emailNorm,
    // PayFast: 1 = recurring subscription; 2 = tokenization / ad hoc billing.
    subscription_type: 1,
    billing_date: billingDateResolved,
    recurring_amount: amountCheck.value.toFixed(2),
    frequency,
    cycles: cyclesResolved,
    subscription_notify_email: toPayfastBooleanFlag(subscriptionNotifyEmail, true),
    subscription_notify_webhook: toPayfastBooleanFlag(subscriptionNotifyWebhook, true),
    subscription_notify_buyer: toPayfastBooleanFlag(subscriptionNotifyBuyer, true)
  };

  logPayfastPayloadDebug(payload);
  payload.signature = signPayfastPayload(payload, passphrase);
  if (!payload.signature) {
    return res.status(500).json({
      code: "PAYFAST_SIGNATURE_FAILED",
      error: "Failed to generate PayFast signature",
    });
  }

  res.json({
    payfastUrl: getPayfastProcessUrl(process.env.PAYFAST_MODE || "sandbox"),
    fields: payload
  });
});

/**
 * One-time PayFast payment for invoices.
 * Generates a signed PayFast payload for a single invoice payment.
 * This endpoint is intentionally unauthenticated so it can be called from the public invoice view.
 */
app.post("/api/payfast/once", async (req, res) => {
  try {
    const parsed = parseBody(payfastOnceBodySchema, req, res);
    if (!parsed) return;

    const {
      invoiceId: invId,
      amount,
      currency,
      clientName,
      clientEmail,
      returnUrl,
      cancelUrl
    } = parsed;

    const payerEmail = clientEmail;

    const amountOnceCheck = assertFiniteAmount(amount, { min: 0.01, max: 1_000_000_000 });
    if (!amountOnceCheck.ok) {
      return res.status(400).json({ error: amountOnceCheck.error });
    }

    for (const u of [returnUrl, cancelUrl]) {
      if (u != null && String(u).trim() !== "" && !isSafeHttpUrl(String(u))) {
        return res.status(400).json({ error: "Invalid return or cancel URL" });
      }
    }

    const { merchantId, merchantKey, passphrase } = getPayfastMerchantCredentialsFromEnv();
    let defaultOnceNotifyUrl = returnUrl;
    try {
      if (returnUrl) {
        const origin = new URL(String(returnUrl)).origin;
        defaultOnceNotifyUrl = `${origin}/api/payfast/webhook`;
      }
    } catch {
      /* keep returnUrl */
    }
    const notifyUrl =
      process.env.PAYFAST_ONCE_NOTIFY_URL ||
      process.env.PAYFAST_NOTIFY_URL ||
      defaultOnceNotifyUrl;
    const returnUrlResolved =
      process.env.PAYFAST_ONCE_RETURN_URL ||
      process.env.PAYFAST_RETURN_URL ||
      returnUrl;
    const cancelUrlResolved =
      process.env.PAYFAST_ONCE_CANCEL_URL ||
      process.env.PAYFAST_CANCEL_URL ||
      cancelUrl;

    if (notifyUrl == null || String(notifyUrl).trim() === "") {
      return res.status(400).json({
        code: "PAYFAST_NOTIFY_URL_MISSING",
        error:
          "Could not determine notify_url for invoice payment. Use an https returnUrl or set PAYFAST_ONCE_NOTIFY_URL / PAYFAST_NOTIFY_URL.",
      });
    }

    if (!merchantId || !merchantKey) {
      console.error("[payfast-once] Missing PAYFAST_MERCHANT_ID or PAYFAST_MERCHANT_KEY", {
        hasId: Boolean(merchantId),
        hasKey: Boolean(merchantKey),
        vercelEnv: process.env.VERCEL_ENV,
      });
      return res.status(422).json({
        code: "PAYFAST_MERCHANT_NOT_CONFIGURED",
        error:
          "PayFast merchant id/key missing: set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY (Vercel or .env).",
      });
    }

    const httpsOnce = assertPayfastHttpsUrlsInLive([
      ["return_url", returnUrlResolved],
      ["cancel_url", cancelUrlResolved],
      ["notify_url", notifyUrl],
    ]);
    if (!httpsOnce.ok) {
      return res.status(400).json({ error: httpsOnce.error });
    }

    const signingOnce = assertPayfastPassphraseForLiveCheckout();
    if (!signingOnce.ok) {
      return res.status(422).json({
        code: signingOnce.code || "PAYFAST_CHECKOUT_CONFIG",
        error: signingOnce.error,
      });
    }

    // Load invoice to validate amount and get org/client ids for ITN handling.
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, org_id, client_id, total_amount, invoice_number, currency")
      .eq("id", invId)
      .maybeSingle();

    if (invoiceError) {
      console.error("[payfast-once] Failed to load invoice", invoiceError.message);
      return res.status(500).json({ error: "Failed to load invoice" });
    }

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const invoiceAmount = Number(invoice.total_amount ?? amount);
    const paymentAmount = amountOnceCheck.value;
    const safeAmount = Number.isFinite(invoiceAmount)
      ? invoiceAmount
      : Number.isFinite(paymentAmount)
        ? paymentAmount
        : 0;

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return res.status(400).json({ error: "Invalid invoice amount" });
    }

    const nameLine = sanitizeOneLine(clientName != null ? String(clientName) : "", 200);
    const nameParts = nameLine.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ");

    const payload = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: returnUrlResolved,
      cancel_url: cancelUrlResolved,
      notify_url: notifyUrl,
      m_payment_id: `invoice-${invoice.id}-${Date.now()}`,
      amount: safeAmount.toFixed(2),
      item_name: `Invoice ${invoice.invoice_number || invoice.id}`,
      item_description: `Payment for invoice ${invoice.invoice_number || invoice.id}`,
      name_first: firstName || "",
      name_last: lastName || "",
      email_address: payerEmail,
      custom_str1: `invoice:${invoice.id}`,
      custom_str2: invoice.client_id || "",
      custom_str3: invoice.org_id || "",
      custom_str4: "once",
      custom_str5: invoice.currency || currency || "ZAR"
    };

    logPayfastPayloadDebug(payload);
    payload.signature = signPayfastPayload(payload, passphrase);
    if (!payload.signature) {
      return res.status(500).json({ error: "Failed to generate PayFast signature" });
    }

    return res.json({
      payfastUrl: getPayfastProcessUrl(process.env.PAYFAST_MODE || "sandbox"),
      fields: payload
    });
  } catch (err) {
    console.error("[payfast-once] Error", err);
    return sendUnexpectedError(res, err, "payfast-once");
  }
});

/**
 * PayFast ITN handler for recurring subscriptions (tokenized billing).
 * Endpoint can be configured as PAYFAST_SUBSCRIPTION_NOTIFY_URL.
 */
app.post("/payfast/subscription/itn", handlePayfastSubscriptionItn);
app.post("/api/payfast/subscription/itn", handlePayfastSubscriptionItn);

/** Unified PayFast ITN: invoice payments (custom_str1 invoice:…) or subscriptions. */
app.post("/api/payfast/itn", handlePayfastSubscriptionItn);
app.post("/api/payfast/webhook", handlePayfastSubscriptionItn);

app.post("/api/admin/roles", async (req, res) => {
  try {
    const user = await getAdminFromRequest(req, res);
    if (!user) return;

    const parsed = parseBody(adminRolesBodySchema, req, res);
    if (!parsed) return;

    const targetId = parsed.userId;
    const normalizedRole = parsed.role;

    const { data, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetId,
      { app_metadata: { role: normalizedRole } }
    );

    if (updateError) {
      logAdminApi(req.method, req.path, 500, `updateUserById: ${updateError.message}`);
      return res.status(500).json({ error: updateError.message });
    }

    logAdminApi(req.method, req.path, 200, `role updated: ${targetId}`);
    return res.json({
      status: "ok",
      user: data?.user || null
    });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return sendUnexpectedError(res, err, "admin/roles");
  }
});

/**
 * Send a Supabase invite email (secure token in email; never client-generated).
 * Caller must be an admin (same as other /api/admin/* routes).
 */
app.post("/api/admin/invite-user", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowTeamManagement: true });
    if (!adminUser) {
      return;
    }

    const parsed = parseBody(adminInviteBodySchema, req, res);
    if (!parsed) return;

    const normalizedEmail = parsed.email;

    if (
      parsed.redirect_to != null &&
      String(parsed.redirect_to).trim() !== "" &&
      !isSafeHttpUrl(String(parsed.redirect_to))
    ) {
      return res.status(400).json({ error: "Invalid redirect URL" });
    }

    const staffInviteRoles = new Set(["management", "sales", "support"]);
    let inviteRole = String(parsed.role || "management").trim().toLowerCase();
    if (!staffInviteRoles.has(inviteRole)) inviteRole = "management";

    const meta = sanitizeInviteMetadata(parsed.full_name, inviteRole, parsed.plan, adminUser.id);

    const origin =
      (typeof parsed.redirect_to === "string" &&
        parsed.redirect_to.trim() &&
        isSafeHttpUrl(String(parsed.redirect_to).trim())
        ? String(parsed.redirect_to).trim()
        : "") ||
      (process.env.CLIENT_ORIGIN && String(process.env.CLIENT_ORIGIN).replace(/\/$/, "")) ||
      "";

    const redirectTo = origin ? `${origin.replace(/\/$/, "")}/Login` : undefined;

    const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: meta,
        redirectTo,
      }
    );

    if (inviteError) {
      logAdminApi(req.method, req.path, 400, inviteError.message);
      return res.status(400).json({ error: inviteError.message });
    }

    logAdminApi(req.method, req.path, 200);
    return res.json({ ok: true, user: data?.user || null });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return sendUnexpectedError(res, err, "admin/invite-user");
  }
});

app.post("/api/admin/bootstrap", async (req, res) => {
  try {
    const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!bootstrapToken) {
      return res.status(503).json({ error: "Admin bootstrap token is not configured" });
    }

    const providedToken = req.headers["x-bootstrap-token"];
    if (!providedToken || providedToken !== bootstrapToken) {
      return res.status(401).json({ error: "Invalid bootstrap token" });
    }

    const parsed = parseBody(adminBootstrapBodySchema, req, res);
    if (!parsed) return;

    const bootEmail = parsed.email;
    const normalizedRole = parsed.role ?? "user";

    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: bootEmail,
      password: parsed.password,
      email_confirm: true,
      app_metadata: { role: normalizedRole }
    });

    if (createError) {
      return res.status(500).json({ error: createError.message });
    }

    return res.json({
      status: "ok",
      user: data?.user || null
    });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    return sendUnexpectedError(res, err, "admin/bootstrap");
  }
});

app.get("/api/admin/users", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowInternalTeam: true });
    if (!adminUser) {
      return;
    }

    const users = [];
    const perPage = 200;
    let page = 1;

    while (true) {
      const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });

      if (listError) {
        logAdminApi(req.method, req.path, 500, `listUsers: ${listError.message}`);
        return res.status(500).json({ error: listError.message });
      }

      const batch = data?.users || [];
      users.push(
        ...batch.map((u) => {
          const ev = authEmailVerificationFields(u);
          return {
            id: u.id,
            email: u.email,
            app_metadata: u.app_metadata || {},
            user_metadata: u.user_metadata || {},
            created_at: u.created_at,
            email_verified: ev.email_verified,
            email_confirmed_at: ev.email_confirmed_at
          };
        })
      );

      if (batch.length < perPage) {
        break;
      }

      page += 1;
    }

    return res.json({ users });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to list users"
    });
  }
});

app.put("/api/admin/users/:userId", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res);
    if (!adminUser) {
      return;
    }

    const { userId } = req.params;
    if (!userId || !isValidUuid(String(userId).trim())) {
      return res.status(400).json({ error: "Invalid or missing userId" });
    }

    const parsed = parseBody(adminUpdateUserBodySchema, req, res);
    if (!parsed) return;

    const updates = {};
    if (parsed.plan) {
      const plan = String(parsed.plan).trim().toLowerCase();
      const allowedPlans = ["free", "starter", "professional", "enterprise"];
      if (!allowedPlans.includes(plan)) {
        return res.status(400).json({ error: "Invalid plan value" });
      }
      updates.subscription_plan = plan;
    }

    if (parsed.full_name) {
      updates.full_name = String(parsed.full_name).trim();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No update fields provided" });
    }

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (profileError) {
      logAdminApi(req.method, req.path, 500, `profiles update: ${profileError.message}`);
      return res.status(500).json({ error: profileError.message });
    }

    if (updates.subscription_plan && isPaidSubscriptionPlan(updates.subscription_plan)) {
      try {
        await markReferralSubscribedForUser(supabaseAdmin, userId);
      } catch (e) {
        console.error("[admin/users] mark referral subscribed:", e?.message || e);
      }
    }

    let userData = null;
    if (parsed.user_metadata && Object.keys(parsed.user_metadata).length > 0) {
      const authUpdatePayload = { user_metadata: { ...parsed.user_metadata } };
      const { data: authData, error: userError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdatePayload);

      if (userError) {
        logAdminApi(req.method, req.path, 500, `auth.updateUserById: ${userError.message}`);
        return res.status(500).json({ error: userError.message });
      }

      userData = authData?.user || null;
    }

    logAdminApi(req.method, req.path, 200, `user updated: ${userId}`);
    return res.json({
      success: true,
      profile: profileData?.[0] || null,
      user: userData || null
    });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return sendUnexpectedError(res, err, "admin/users/update");
  }
});

app.delete("/api/admin/users/:userId", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res);
    if (!adminUser) {
      return;
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const delId = String(userId).trim();
    if (!isValidUuid(delId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    await purgeUserStorageAssets(supabaseAdmin, delId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(delId);
    if (error) {
      logAdminApi(req.method, req.path, 500, `deleteUser: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    logAdminApi(req.method, req.path, 200, `user deleted: ${delId}`);
    return res.json({ success: true });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to delete user"
    });
  }
});

/**
 * Authenticated user deletes their own account. Removes storage assets, then auth user row.
 * DB trigger purge_public_user_data_on_auth_delete clears subscriptions / affiliate applications / waitlist PII.
 * Owned organizations cascade-delete with all org-scoped business data (invoices, clients, etc.).
 */
app.post("/api/account/delete", async (req, res) => {
  try {
    const { user, error: authErr } = await getUserFromRequest(req);
    if (authErr || !user?.id) {
      return res.status(401).json({ error: authErr || "Unauthorized" });
    }

    const phrase = String(req.body?.confirmPhrase ?? "").trim();
    if (phrase !== "DELETE") {
      return res.status(400).json({
        error: 'To delete your account, send JSON body { "confirmPhrase": "DELETE" }.',
      });
    }

    await purgeUserStorageAssets(supabaseAdmin, user.id);

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (delErr) {
      logSecurity("error", "account_self_delete_failed", {
        userId: user.id,
        message: delErr.message,
      });
      return res.status(500).json({ error: delErr.message });
    }

    logSecurity("info", "account_self_deleted", { userId: user.id });
    return res.json({ success: true });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logSecurity("error", "account_self_delete_exception", { message: err?.message });
    return res.status(500).json({ error: err?.message || "Failed to delete account" });
  }
});

app.get("/api/admin/platform-users", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowInternalTeam: true });
    if (!adminUser) {
      return;
    }

    let limit = 500;
    if (req.query.limit != null && String(req.query.limit).trim() !== "") {
      const n = Number(String(req.query.limit).trim());
      if (!Number.isInteger(n) || n < 1 || n > 2000) {
        return res.status(400).json({ error: "Invalid limit (use integer 1–2000)" });
      }
      limit = n;
    }

    let users;
    try {
      ({ users } = await fetchMergedPlatformUsersForAdmin(supabaseAdmin, limit));
    } catch (e) {
      logAdminApi(req.method, req.path, 500, `platform-users: ${e?.message}`);
      return res.status(500).json({ error: e?.message || "Failed to list platform users" });
    }

    logAdminApi(req.method, req.path, 200, `${users.length} platform users`);
    return res.json({ users });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to list platform users"
    });
  }
});

function parseAffiliateAdminListLimit(req) {
  let limit = 150;
  if (req.query.limit != null && String(req.query.limit).trim() !== "") {
    const n = Number(String(req.query.limit).trim());
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return { error: "Invalid limit (use integer 1–500)" };
    }
    limit = n;
  }
  return { limit };
}

/**
 * GET /api/affiliates and GET /api/admin/affiliates — admin bundle: `affiliate_applications` + `affiliates` (partner rows). Service role; no user_id filter.
 */
async function handleAdminAffiliateBundleGet(req, res) {
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowInternalTeam: true });
    if (!adminUser) {
      return;
    }

    const parsed = parseAffiliateAdminListLimit(req);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    const { limit } = parsed;

    const [appsRes, partnersRes] = await Promise.all([
      supabaseAdmin
        .from("affiliate_applications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit),
      supabaseAdmin.from("affiliates").select("*").order("created_at", { ascending: false }).limit(limit),
    ]);

    if (appsRes.error) {
      console.error(
        `[GET ${req.path}] affiliate_applications:`,
        appsRes.error.code,
        appsRes.error.message,
        appsRes.error.details
      );
      logAdminApi(
        req.method,
        req.path,
        500,
        `affiliate_applications: ${appsRes.error.message || appsRes.error.code || "query failed"}`
      );
      const body = postgrestErrorToApiBody(appsRes.error);
      return res.status(500).json(body || { error: "affiliate_applications query failed" });
    }

    const rawApplications = appsRes.data || [];
    const partners = partnersRes.error ? [] : partnersRes.data || [];
    const applications = await mergeAffiliateApplicationsWithPartnersAndStats(
      supabaseAdmin,
      rawApplications,
      partners
    );
    const counts = countAffiliateApplicationsByStatus(applications);
    const data = {
      ok: true,
      applications,
      partners,
      counts,
      ...(partnersRes.error ? { partnerError: partnersRes.error.message } : {}),
    };

    console.log(
      `[GET ${req.path}] applications=${applications.length} partners=${partners.length} pending=${counts.pending}` +
        (partnersRes.error ? ` partner_fetch_error=${partnersRes.error.message}` : "")
    );
    logAdminApi(
      req.method,
      req.path,
      200,
      `bundle apps=${applications.length} partners=${partners.length} pending=${counts.pending}`
    );
    return res.json(data);
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to list affiliate data",
    });
  }
}

app.get("/api/affiliates", handleAdminAffiliateBundleGet);
app.get("/api/admin/affiliates", handleAdminAffiliateBundleGet);

const affiliateAdminMutationDeps = { supabaseAdmin, getAdminFromRequest, logAdminApi };
app.post("/api/affiliates/approve", (req, res) =>
  handlePostAffiliateApplicationApprove(req, res, affiliateAdminMutationDeps)
);
app.post("/api/admin/approve", (req, res) =>
  handlePostAffiliateApplicationApprove(req, res, affiliateAdminMutationDeps)
);
app.post("/api/admin/decline", (req, res) =>
  handlePostAffiliateApplicationDecline(req, res, affiliateAdminMutationDeps)
);

/**
 * Full affiliate application queue for admin UI: service role read — no `user_id = current user` filter.
 * (Pending rows often have user_id NULL; RLS on the browser client can hide them.)
 */
app.get("/api/admin/affiliate-applications", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowInternalTeam: true });
    if (!adminUser) {
      return;
    }

    const parsed = parseAffiliateAdminListLimit(req);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    const { limit } = parsed;

    const { data: applications, error } = await supabaseAdmin
      .from("affiliate_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error(
        `[GET ${req.path}] affiliate_applications:`,
        error.code,
        error.message,
        error.details
      );
      logAdminApi(
        req.method,
        req.path,
        500,
        `affiliate_applications: ${error.message || error.code || "query failed"}`
      );
      const body = postgrestErrorToApiBody(error);
      return res.status(500).json(body || { error: "affiliate_applications query failed" });
    }

    const list = applications || [];
    const counts = countAffiliateApplicationsByStatus(list);
    logAdminApi(req.method, req.path, 200, `${list.length} affiliate applications (pending=${counts.pending})`);
    return res.json({ applications: list, counts });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to list affiliate applications",
    });
  }
});

app.post("/api/admin/clean-orphaned-users", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res);
    if (!adminUser) {
      return;
    }

    let result;
    try {
      result = await runAdminDeleteOrphanProfiles(supabaseAdmin);
    } catch (e) {
      logAdminApi(req.method, req.path, 500, e?.message);
      return res.status(500).json({ error: e?.message });
    }

    logAdminApi(req.method, req.path, 200, `orphan profiles removed: ${result.deleted}`);
    return res.json(result);
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to clean orphaned profiles"
    });
  }
});

app.get("/api/admin/sync-users", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowInternalTeam: true });
    if (!adminUser) {
      return;
    }

    let payload;
    try {
      payload = await fetchSyncUsersForAdmin(supabaseAdmin);
    } catch (e) {
      logAdminApi(req.method, req.path, 500, `sync-users: ${e?.message}`);
      return res.status(500).json({ error: e?.message });
    }

    logAdminApi(req.method, req.path, 200, `${payload.users.length} users`);
    return res.json(payload);
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    logAdminApi(req.method, req.path, 500, err?.message);
    return res.status(500).json({
      error: err?.message || "Failed to sync users",
    });
  }
});

app.get("/api/admin/sync-data", async (req, res) => {
  try {
    const adminUser = await getAdminFromRequest(req, res, { allowInternalTeam: true });
    if (!adminUser) {
      return;
    }

    let limit = 1000;
    if (req.query.limit != null && String(req.query.limit).trim() !== "") {
      const n = Number(String(req.query.limit).trim());
      if (!Number.isInteger(n) || n < 1 || n > 5000) {
        return res.status(400).json({ error: "Invalid limit (use integer 1–5000)" });
      }
      limit = n;
    }

    let users;
    try {
      users = await listAllAuthUsersAdmin(supabaseAdmin);
    } catch (e) {
      logAdminApi(req.method, req.path, 500, `listUsers: ${e?.message}`);
      return res.status(500).json({ error: e?.message });
    }
    users = dedupeAuthUsersByEmail(users);
    users.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    users = users.slice(0, limit);

    const userIds = users.map((u) => u.id);

    const { data: profiles, error: profilesError } = userIds.length
      ? await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, avatar_url, logo_url, subscription_plan")
        .in("id", userIds)
      : { data: [], error: null };

    if (profilesError) {
      logAdminApi(req.method, req.path, 500, `profiles: ${profilesError.message}`);
      return res.status(500).json({ error: profilesError.message });
    }

    const { data: memberships, error: membershipsError } = userIds.length
      ? await supabaseAdmin
        .from("memberships")
        .select("user_id, role, org_id")
        .in("user_id", userIds)
      : { data: [], error: null };

    if (membershipsError) {
      logAdminApi(req.method, req.path, 500, `memberships: ${membershipsError.message}`);
      return res.status(500).json({ error: membershipsError.message });
    }

    const { data: organizations, error: orgsError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, owner_id")
      .limit(limit);

    if (orgsError) {
      logAdminApi(req.method, req.path, 500, `organizations: ${orgsError.message}`);
      return res.status(500).json({ error: orgsError.message });
    }

    const orgOwnerMap = new Map((organizations || []).map((org) => [org.id, org.owner_id]));

    const { data: clients, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("*")
      .limit(limit);

    if (clientsError) {
      logAdminApi(req.method, req.path, 500, `clients: ${clientsError.message}`);
      return res.status(500).json({ error: clientsError.message });
    }

    const { data: services, error: servicesError } = await supabaseAdmin
      .from("services")
      .select("*")
      .limit(limit);

    if (servicesError) {
      logAdminApi(req.method, req.path, 500, `services: ${servicesError.message}`);
      return res.status(500).json({ error: servicesError.message });
    }

    const { data: invoices, error: invoicesError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .limit(limit);

    if (invoicesError) {
      logAdminApi(req.method, req.path, 500, `invoices: ${invoicesError.message}`);
      return res.status(500).json({ error: invoicesError.message });
    }

    const { data: quotes, error: quotesError } = await supabaseAdmin
      .from("quotes")
      .select("*")
      .limit(limit);

    if (quotesError) {
      logAdminApi(req.method, req.path, 500, `quotes: ${quotesError.message}`);
      return res.status(500).json({ error: quotesError.message });
    }

    const { data: affiliates, error: affiliatesError } = await supabaseAdmin
      .from("affiliates")
      .select("*")
      .limit(limit);

    if (affiliatesError) {
      logAdminApi(req.method, req.path, 500, `affiliates: ${affiliatesError.message}`);
      return res.status(500).json({ error: affiliatesError.message });
    }

    const { data: affiliateApplications, error: affiliateApplicationsError } = await supabaseAdmin
      .from("affiliate_applications")
      .select("*")
      .limit(limit);

    if (affiliateApplicationsError) {
      logAdminApi(req.method, req.path, 500, `affiliate_applications: ${affiliateApplicationsError.message}`);
      return res.status(500).json({ error: affiliateApplicationsError.message });
    }

    const { data: referrals, error: referralsError } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .limit(limit);

    if (referralsError) {
      logAdminApi(req.method, req.path, 500, `referrals: ${referralsError.message}`);
      return res.status(500).json({ error: referralsError.message });
    }

    const { data: commissions, error: commissionsError } = await supabaseAdmin
      .from("commissions")
      .select("*")
      .limit(limit);

    if (commissionsError) {
      logAdminApi(req.method, req.path, 500, `commissions: ${commissionsError.message}`);
      return res.status(500).json({ error: commissionsError.message });
    }

    const { data: affiliateClicks, error: affiliateClicksError } = await supabaseAdmin
      .from("affiliate_clicks")
      .select("*")
      .limit(limit);

    if (affiliateClicksError) {
      logAdminApi(req.method, req.path, 500, `affiliate_clicks: ${affiliateClicksError.message}`);
      return res.status(500).json({ error: affiliateClicksError.message });
    }

    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .limit(limit);

    if (paymentsError) {
      logAdminApi(req.method, req.path, 500, `payments: ${paymentsError.message}`);
      return res.status(500).json({ error: paymentsError.message });
    }

    const mappedClients = (clients || []).map((client) => ({
      ...client,
      org_owner_id: orgOwnerMap.get(client.org_id) || null,
      user_id: orgOwnerMap.get(client.org_id) || null
    }));

    const mappedServices = (services || []).map((service) => ({
      ...service,
      org_owner_id: orgOwnerMap.get(service.org_id) || null,
      user_id: orgOwnerMap.get(service.org_id) || null
    }));

    const mappedInvoices = (invoices || []).map((invoice) => ({
      ...invoice,
      org_owner_id: orgOwnerMap.get(invoice.org_id) || null,
      user_id: invoice.created_by || orgOwnerMap.get(invoice.org_id) || null
    }));

    const mappedQuotes = (quotes || []).map((quote) => ({
      ...quote,
      org_owner_id: orgOwnerMap.get(quote.org_id) || null,
      user_id: quote.created_by || orgOwnerMap.get(quote.org_id) || null
    }));

    const mappedPayments = (payments || []).map((payment) => ({
      ...payment,
      org_owner_id: orgOwnerMap.get(payment.org_id) || null,
      user_id: orgOwnerMap.get(payment.org_id) || null
    }));

    const orgIds = Array.from(new Set((organizations || []).map((org) => org.id)));
    const assets = [];
    for (const orgId of orgIds.slice(0, 50)) {
      const { data: orgAssets, error: assetsError } = await supabaseAdmin
        .storage
        .from(storageBucket)
        .list(`${orgId}`, { limit: 200 });

      if (assetsError) {
        continue;
      }

      (orgAssets || []).forEach((asset) => {
        assets.push({
          ...asset,
          org_id: orgId
        });
      });
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const orgMap = new Map((organizations || []).map((org) => [org.id, org]));
    const membershipsByUser = (memberships || []).reduce((acc, membership) => {
      const list = acc[membership.user_id] || [];
      list.push({
        ...membership,
        organization: orgMap.get(membership.org_id) || null
      });
      acc[membership.user_id] = list;
      return acc;
    }, {});

    const enrichedUsers = (users || []).map((authUser) => {
      const ev = authEmailVerificationFields(authUser);
      return {
        id: authUser.id,
        email: authUser.email,
        app_metadata: authUser.app_metadata || {},
        user_metadata: authUser.user_metadata || {},
        created_at: authUser.created_at,
        email_verified: ev.email_verified,
        email_confirmed_at: ev.email_confirmed_at,
        profile: profileMap.get(authUser.id) || null,
        memberships: membershipsByUser[authUser.id] || []
      };
    });

    const counts = {
      users: enrichedUsers.length,
      organizations: (organizations || []).length,
      clients: mappedClients.length,
      services: mappedServices.length,
      invoices: mappedInvoices.length,
      quotes: mappedQuotes.length,
      payments: mappedPayments.length,
      affiliates: (affiliates || []).length,
      affiliate_applications: (affiliateApplications || []).length,
      referrals: (referrals || []).length,
      commissions: (commissions || []).length,
      affiliate_clicks: (affiliateClicks || []).length
    };
    logAdminApi(req.method, req.path, 200, `sync ok: ${counts.users} users, ${counts.invoices} invoices`);
    return res.json({
      users: enrichedUsers,
      organizations: organizations || [],
      memberships: memberships || [],
      clients: mappedClients,
      services: mappedServices,
      invoices: mappedInvoices,
      quotes: mappedQuotes,
      payments: mappedPayments,
      affiliates: affiliates || [],
      affiliate_applications: affiliateApplications || [],
      referrals: referrals || [],
      commissions: commissions || [],
      affiliate_clicks: affiliateClicks || [],
      assets,
      bucket: storageBucket
    });
  } catch (err) {
    if (res.headersSent) {
      return;
    }
    const message = err?.message || "Failed to sync admin data";
    logAdminApi(req.method, req.path, 500, message);
    return res.status(500).json({
      error: message
    });
  }
});

startLoginRateLimitPruner();
startSecurityAuditPruner();
startApiAbusePruner();

const startupAuthHealth = evaluateAuthSecurityHealth();
if (!startupAuthHealth.ok) {
  logSecurity("error", "auth_security_health_failed", {
    issues: startupAuthHealth.issues,
  });
  console.error(
    "[AUTH-SECURITY] FAILED startup checks:\n" +
      startupAuthHealth.issues.map((issue) => ` - ${issue}`).join("\n")
  );
  if (envFlag("AUTH_HEALTH_STRICT_MODE", process.env.NODE_ENV === "production")) {
    throw new Error(
      "Auth security health checks failed and AUTH_HEALTH_STRICT_MODE is enabled. Refusing to start."
    );
  }
}

const startupDeploymentHealth = evaluateDeploymentSecurityHealth();
if (!startupDeploymentHealth.ok) {
  logSecurity("error", "deployment_security_health_failed", {
    issues: startupDeploymentHealth.issues,
  });
  console.error(
    "[DEPLOYMENT-SECURITY] FAILED startup checks:\n" +
      startupDeploymentHealth.issues.map((issue) => ` - ${issue}`).join("\n")
  );
  if (envFlag("DEPLOYMENT_HEALTH_STRICT_MODE", process.env.NODE_ENV === "production")) {
    throw new Error(
      "Deployment security health checks failed and DEPLOYMENT_HEALTH_STRICT_MODE is enabled. Refusing to start."
    );
  }
}

// Unknown API routes (helps 404-burst anomaly detection)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  const ip = getClientIp(req);
  const requestId = res?.locals?.requestId || req?.requestId || "n/a";
  if (err instanceof SyntaxError && "body" in err) {
    logSecurity("warn", "invalid_json_body", { ip, path: req.path, requestId });
    if (!res.headersSent) {
      return res.status(400).json({ error: "Invalid JSON body", requestId });
    }
    return;
  }
  logSecurity("error", "unhandled_exception", {
    ip,
    path: req.path,
    requestId,
    message: err?.message || "error",
  });
  if (!res.headersSent) {
    return res.status(500).json({ error: "Internal server error", requestId });
  }
});

app.listen(port, "0.0.0.0", () => {
  void runExpireOverdueTrialsBatch(supabaseAdmin);
  const batchMs = Number(process.env.TRIAL_EXPIRY_BATCH_INTERVAL_MS || "");
  if (Number.isFinite(batchMs) && batchMs >= 60_000) {
    setInterval(() => void runExpireOverdueTrialsBatch(supabaseAdmin), batchMs);
  }

  const url = `http://localhost:${port}`;
  console.log(`Backend running at ${url}`);
  console.log(`  Health check: ${url}/api/health`);
  console.log(`  Auth security health: ${url}/api/health/auth-security`);
  console.log(`  Deployment security health: ${url}/api/health/deployment-security`);
  console.log(`  Readiness health: ${url}/api/health/readiness`);
  console.log(`  Observability health: ${url}/api/health/observability`);
  if (CORS_DEBUG_ALLOW_ALL) {
    console.warn(
      "[cors] CORS_DEBUG_ALLOW_ALL is on: Access-Control-Allow-Origin: * and credentials disabled. Remove for production."
    );
  }
  if (process.env.NODE_ENV === "production") {
    const co = (process.env.CLIENT_ORIGIN || "").trim();
    if (!co || co === "*") {
      console.log(
        "[cors] Strict default allowlist (unset CLIENT_ORIGIN): %s. For Vercel preview / :4173 / app host, set CLIENT_ORIGIN=comma-separated full Origin URLs.",
        JSON.stringify(SAAS_CORS_ORIGINS)
      );
    }
  }
});