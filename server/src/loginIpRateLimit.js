/**
 * Fixed-window rate limiter by client IP for sign-in attempts.
 * In-memory only — use Redis or similar if you run multiple server instances.
 */

import process from "node:process";

const store = new Map();
const signupStore = new Map();

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

function windowMs() {
  const n = Number(process.env.LOGIN_RATE_PER_IP_WINDOW_MS);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60 * 1000;
}

function maxPerWindow() {
  const n = Number(process.env.LOGIN_RATE_PER_IP_MAX);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

function signupWindowMs() {
  const n = Number(process.env.SIGNUP_RATE_PER_IP_WINDOW_MS);
  return Number.isFinite(n) && n > 0 ? n : 60 * 60 * 1000;
}

function signupMaxPerWindow() {
  const n = Number(process.env.SIGNUP_RATE_PER_IP_MAX);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

export function isLoginRateLimitEnabled() {
  if (process.env.LOGIN_RATE_LIMIT_ENABLED === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  return process.env.LOGIN_RATE_LIMIT_IN_DEV === "true";
}

/**
 * @param {string} ip
 * @returns {{ ok: true } | { ok: false, retryAfterSeconds: number }}
 */
export function consumeLoginSlot(ip) {
  if (!isLoginRateLimitEnabled()) {
    return { ok: true };
  }

  const key = ip || "unknown";
  const now = Date.now();
  const win = windowMs();
  const max = maxPerWindow();

  let entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + win };
    store.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  return { ok: true };
}

/**
 * @param {string} ip
 * @returns {{ ok: true } | { ok: false, retryAfterSeconds: number }}
 */
export function consumeSignupSlot(ip) {
  if (!isLoginRateLimitEnabled()) {
    return { ok: true };
  }

  const key = ip || "unknown";
  const now = Date.now();
  const win = signupWindowMs();
  const max = signupMaxPerWindow();

  let entry = signupStore.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + win };
    signupStore.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  return { ok: true };
}

/** Best-effort prune to avoid unbounded growth (runs occasionally). */
export function pruneLoginRateLimitStore() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now >= v.resetAt) store.delete(k);
  }
  for (const [k, v] of signupStore) {
    if (now >= v.resetAt) signupStore.delete(k);
  }
}

let pruneTimer = null;
export function startLoginRateLimitPruner() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => pruneLoginRateLimitStore(), 5 * 60 * 1000);
  if (typeof pruneTimer.unref === "function") pruneTimer.unref();
}
