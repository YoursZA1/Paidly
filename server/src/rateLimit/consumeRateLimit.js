import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const memoryStores = new Map();

function num(env, fallback) {
  const n = Number(process.env[env]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isRateLimitPersistEnabled() {
  if (process.env.RATE_LIMIT_PERSIST === "false") return false;
  if (process.env.RATE_LIMIT_PERSIST === "true") return true;
  if (process.env.NODE_ENV === "production") return true;
  return process.env.RATE_LIMIT_PERSIST_IN_DEV === "true";
}

function getMemoryStore(storeId) {
  if (!memoryStores.has(storeId)) {
    memoryStores.set(storeId, new Map());
  }
  return memoryStores.get(storeId);
}

/**
 * In-memory fixed-window limiter (per Node instance / serverless isolate).
 * @returns {{ ok: true } | { ok: false, retryAfterSeconds: number }}
 */
export function consumeMemoryRateLimit(storeId, bucketKey, maxHits, windowMs) {
  const store = getMemoryStore(storeId);
  const key = bucketKey || "unknown";
  const now = Date.now();
  const win = windowMs;
  const max = maxHits;

  let entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + win };
    store.set(key, entry);
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

let persistClient = null;

function getPersistClient() {
  if (persistClient) return persistClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  persistClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return persistClient;
}

/**
 * Postgres-backed limiter (shared across Vercel instances when migration applied).
 * Falls back to memory on RPC/schema errors.
 */
export async function consumePersistedRateLimit(bucketKey, maxHits, windowMs) {
  const client = getPersistClient();
  if (!client) {
    return consumeMemoryRateLimit("fallback", bucketKey, maxHits, windowMs);
  }
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const { data, error } = await client.rpc("consume_rate_limit_bucket", {
      p_bucket_key: bucketKey,
      p_max_hits: maxHits,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      return consumeMemoryRateLimit("rpc-fallback", bucketKey, maxHits, windowMs);
    }
    const row = data && typeof data === "object" ? data : {};
    if (row.ok === false) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 1),
      };
    }
    return { ok: true };
  } catch {
    return consumeMemoryRateLimit("rpc-fallback", bucketKey, maxHits, windowMs);
  }
}

/**
 * @param {'login'|'signup'|'forgot-password'} kind
 * @param {string} ip
 */
export async function consumeAuthIpSlot(kind, ip) {
  const key = ip || "unknown";
  if (kind === "login") {
    const max = num("LOGIN_RATE_PER_IP_MAX", 40);
    const windowMs = num("LOGIN_RATE_PER_IP_WINDOW_MS", 15 * 60 * 1000);
    const bucket = `auth:sign-in:${key}`;
    if (isRateLimitPersistEnabled()) {
      return consumePersistedRateLimit(bucket, max, windowMs);
    }
    return consumeMemoryRateLimit("login", bucket, max, windowMs);
  }
  if (kind === "forgot-password") {
    // Conservative: 5 reset requests per IP per hour to prevent reset-email spam.
    const max = num("FORGOT_PASSWORD_RATE_PER_IP_MAX", 5);
    const windowMs = num("FORGOT_PASSWORD_RATE_PER_IP_WINDOW_MS", 60 * 60 * 1000);
    const bucket = `auth:forgot-password:${key}`;
    if (isRateLimitPersistEnabled()) {
      return consumePersistedRateLimit(bucket, max, windowMs);
    }
    return consumeMemoryRateLimit("forgot-password", bucket, max, windowMs);
  }
  const max = num("SIGNUP_RATE_PER_IP_MAX", 8);
  const windowMs = num("SIGNUP_RATE_PER_IP_WINDOW_MS", 60 * 60 * 1000);
  const bucket = `auth:sign-up:${key}`;
  if (isRateLimitPersistEnabled()) {
    return consumePersistedRateLimit(bucket, max, windowMs);
  }
  return consumeMemoryRateLimit("signup", bucket, max, windowMs);
}

export function pruneMemoryRateLimitStores() {
  const now = Date.now();
  for (const store of memoryStores.values()) {
    for (const [k, v] of store) {
      if (now >= v.resetAt) store.delete(k);
    }
  }
}
