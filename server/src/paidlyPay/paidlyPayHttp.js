import crypto from "node:crypto";
import { applyApiCors } from "../auth/applyApiCors.js";
import { getClientIp } from "../loginIpRateLimit.js";
import {
  consumeMemoryRateLimit,
  consumePersistedRateLimit,
  isRateLimitPersistEnabled,
} from "../rateLimit/consumeRateLimit.js";
import { PAIDLY_PAY_ERROR } from "../../../shared/payments/paidlyPayContract.js";

const SENSITIVE_KEY =
  /api[_-]?key|secret|token|authorization|password|passphrase|card|pan|cvv|cvc|pin|rawBody|webhook/i;

export function newPaidlyRequestId(req) {
  const incoming = String(req?.headers?.["x-request-id"] || "").trim();
  if (/^req_[a-zA-Z0-9_-]{8,64}$/.test(incoming)) return incoming;
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function applyPaidlyPayCors(req, res) {
  applyApiCors(req, res, {
    methods: "GET, POST, OPTIONS",
    headers: "Content-Type, Authorization, X-POS-Signature, X-Request-Id, X-Device-Id",
    credentials: false,
  });
}

export function sendPaidlyError(res, status, code, message, requestId, extra = {}) {
  if (res.headersSent) return res;
  const body = {
    error: {
      code,
      message,
      request_id: requestId,
      ...extra,
    },
  };
  res.setHeader("X-Request-Id", requestId);
  return res.status(status).json(body);
}

export function sendPaidlyJson(res, status, payload, requestId) {
  if (res.headersSent) return res;
  res.setHeader("X-Request-Id", requestId);
  return res.status(status).json(payload);
}

export function redactSensitive(value, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 8 && /^(pk_|sk_|whsec_|Bearer )/i.test(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactSensitive(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function logPaidlyRequest({
  requestId,
  endpoint,
  companyId = null,
  service = "paidly-pay",
  status,
  durationMs,
  errorCategory = null,
}) {
  console.info(
    JSON.stringify({
      msg: "paidly_pay_request",
      request_id: requestId,
      endpoint,
      timestamp: new Date().toISOString(),
      company_id: companyId || null,
      authenticated_service: service,
      response_status: status,
      duration_ms: durationMs,
      error_category: errorCategory || null,
    })
  );
}

export function parseJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("JSON body must be an object");
    error.code = PAIDLY_PAY_ERROR.MALFORMED_BODY;
    throw error;
  }
  return parsed;
}

/**
 * Capture the original request bytes for HMAC. Never reconstruct from a parsed object.
 */
export async function captureRawBody(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (typeof req.body === "string") {
    req.rawBody = req.body;
    return req.rawBody;
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body.toString("utf8");
    return req.rawBody;
  }
  if (req.readable && typeof req.on === "function" && !req.readableEnded && req.body == null) {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    req.rawBody = Buffer.concat(chunks).toString("utf8");
    return req.rawBody;
  }
  return null;
}

export async function ensureJsonRequestBody(req) {
  const raw = await captureRawBody(req);
  if (typeof raw === "string") {
    try {
      req.body = raw.trim() ? parseJsonObject(raw) : req.body && typeof req.body === "object" ? req.body : {};
    } catch {
      req.body = {};
    }
    return raw;
  }
  if (req.body && typeof req.body === "object") return null;
  req.body = {};
  return null;
}

const RATE_LIMITS = Object.freeze({
  health: { max: 120, windowMs: 60_000 },
  transactions: { max: 120, windowMs: 60_000 },
  payments_create: { max: 40, windowMs: 60_000 },
  payments_read: { max: 180, windowMs: 60_000 },
  payments_mutate: { max: 30, windowMs: 60_000 },
  devices: { max: 40, windowMs: 60_000 },
  webhooks: { max: 300, windowMs: 60_000 },
});

export async function consumePaidlyPayRateLimit(kind, identity) {
  const spec = RATE_LIMITS[kind] || RATE_LIMITS.transactions;
  const bucket = `paidly-pay:${kind}:${identity || "unknown"}`;
  if (isRateLimitPersistEnabled()) {
    return consumePersistedRateLimit(bucket, spec.max, spec.windowMs);
  }
  return consumeMemoryRateLimit("paidly-pay", bucket, spec.max, spec.windowMs);
}

export async function enforcePaidlyPayRateLimit(res, kind, req, requestId) {
  const identity = req.paidlyAuth?.keyId || getClientIp(req);
  const slot = await consumePaidlyPayRateLimit(kind, identity);
  if (!slot.ok) {
    res.setHeader("Retry-After", String(slot.retryAfterSeconds || 1));
    sendPaidlyError(
      res,
      429,
      PAIDLY_PAY_ERROR.RATE_LIMITED,
      "Too many requests. Try again shortly.",
      requestId
    );
    return false;
  }
  return true;
}

export function paidlyEndpointFromParts(parts) {
  return `/api/paidly/${(parts || []).join("/")}`.replace(/\/$/, "") || "/api/paidly";
}
