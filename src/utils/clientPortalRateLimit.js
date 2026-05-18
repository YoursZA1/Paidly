import { isClientAuthThrottleRelaxed } from "@/utils/clientAuthThrottleEnv";

/**
 * Client-side throttle for the public client portal login (email lookup).
 * Defense in depth — the server also applies IP rate limiting.
 */
const KEY_PREFIX = "paidly_portal_fail_";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function normalizeKey(email) {
  return (email || "").trim().toLowerCase();
}

function storageKey(emailKey) {
  return `${KEY_PREFIX}${emailKey}`;
}

export function getPortalThrottleState(email) {
  const emailKey = normalizeKey(email);
  if (!emailKey) return { blocked: false, failures: 0 };
  if (isClientAuthThrottleRelaxed()) return { blocked: false, failures: 0 };

  try {
    const raw = sessionStorage.getItem(storageKey(emailKey));
    if (!raw) return { blocked: false, failures: 0 };
    const data = JSON.parse(raw);
    if (!data || typeof data.count !== "number" || typeof data.windowEnd !== "number") {
      return { blocked: false, failures: 0 };
    }
    if (Date.now() > data.windowEnd) {
      sessionStorage.removeItem(storageKey(emailKey));
      return { blocked: false, failures: 0 };
    }
    if (data.count >= MAX_FAILURES) {
      return { blocked: true, retryAfterMs: Math.max(0, data.windowEnd - Date.now()) };
    }
    return { blocked: false, failures: data.count };
  } catch {
    return { blocked: false, failures: 0 };
  }
}

export function recordPortalFailure(email) {
  const emailKey = normalizeKey(email);
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
    // ignore quota / private mode
  }
}

export function clearPortalFailures(email) {
  const emailKey = normalizeKey(email);
  if (!emailKey) return;
  try {
    sessionStorage.removeItem(storageKey(emailKey));
  } catch {
    // ignore
  }
}
