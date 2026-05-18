/**
 * IP rate limits for auth routes. Uses Postgres buckets when RATE_LIMIT_PERSIST=1
 * (shared across Vercel serverless instances); otherwise in-memory per isolate.
 */

import process from "node:process";
import {
  consumeAuthIpSlot,
  pruneMemoryRateLimitStores,
} from "./rateLimit/consumeRateLimit.js";

/**
 * @param {import("express").Request} req
 */
export function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function isLoginRateLimitEnabled() {
  if (process.env.LOGIN_RATE_LIMIT_ENABLED === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  return process.env.LOGIN_RATE_LIMIT_IN_DEV === "true";
}

/**
 * @param {string} ip
 * @returns {Promise<{ ok: true } | { ok: false, retryAfterSeconds: number }>}
 */
export async function consumeLoginSlot(ip) {
  if (!isLoginRateLimitEnabled()) {
    return { ok: true };
  }
  return consumeAuthIpSlot("login", ip);
}

/**
 * @param {string} ip
 * @returns {Promise<{ ok: true } | { ok: false, retryAfterSeconds: number }>}
 */
export async function consumeSignupSlot(ip) {
  if (!isLoginRateLimitEnabled()) {
    return { ok: true };
  }
  return consumeAuthIpSlot("signup", ip);
}

/**
 * @param {string} ip
 * @returns {Promise<{ ok: true } | { ok: false, retryAfterSeconds: number }>}
 */
export async function consumeForgotPasswordSlot(ip) {
  if (!isLoginRateLimitEnabled()) {
    return { ok: true };
  }
  return consumeAuthIpSlot("forgot-password", ip);
}

export function pruneLoginRateLimitStore() {
  pruneMemoryRateLimitStores();
}

let pruneTimer = null;
export function startLoginRateLimitPruner() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => pruneLoginRateLimitStore(), 5 * 60 * 1000);
  if (typeof pruneTimer.unref === "function") pruneTimer.unref();
}
