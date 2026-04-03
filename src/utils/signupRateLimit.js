import { isClientAuthThrottleRelaxed } from "@/utils/clientAuthThrottleEnv";

/**
 * Client-side throttle for sign-up step 1 (defense in depth; server limits POST /api/auth/sign-up).
 */
const KEY_PREFIX = "paidly_signup_attempt_";
const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function storageKey(emailKey) {
  return `${KEY_PREFIX}${emailKey}`;
}

function normalizeEmailKey(email) {
  return (email || "").trim().toLowerCase();
}

export function getSignupThrottleState(email) {
  const emailKey = normalizeEmailKey(email);
  if (!emailKey) return { blocked: false, attempts: 0 };
  if (isClientAuthThrottleRelaxed()) return { blocked: false, attempts: 0 };

  try {
    const raw = sessionStorage.getItem(storageKey(emailKey));
    if (!raw) return { blocked: false, attempts: 0 };
    const data = JSON.parse(raw);
    if (!data || typeof data.count !== "number" || typeof data.windowEnd !== "number") {
      return { blocked: false, attempts: 0 };
    }
    if (Date.now() > data.windowEnd) {
      sessionStorage.removeItem(storageKey(emailKey));
      return { blocked: false, attempts: 0 };
    }
    if (data.count >= MAX_ATTEMPTS) {
      return { blocked: true, retryAfterMs: Math.max(0, data.windowEnd - Date.now()) };
    }
    return { blocked: false, attempts: data.count };
  } catch {
    return { blocked: false, attempts: 0 };
  }
}

export function recordSignupAttempt(email) {
  const emailKey = normalizeEmailKey(email);
  if (!emailKey) return;
  if (isClientAuthThrottleRelaxed()) return;

  try {
    const key = storageKey(emailKey);
    const now = Date.now();
    const raw = sessionStorage.getItem(key);
    let count = 1;
    let windowEnd = now + WINDOW_MS;
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data.count === "number" && typeof data.windowEnd === "number" && now <= data.windowEnd) {
        count = data.count + 1;
        windowEnd = data.windowEnd;
      }
    }
    sessionStorage.setItem(key, JSON.stringify({ count, windowEnd }));
  } catch {
    // ignore
  }
}

export function clearSignupAttempts(email) {
  const emailKey = normalizeEmailKey(email);
  if (!emailKey) return;
  try {
    sessionStorage.removeItem(storageKey(emailKey));
  } catch {
    // ignore
  }
}
