/**
 * Supabase session refresh helpers for long-lived SaaS tabs.
 * Complements GoTrue autoRefreshToken + AuthContext visibility/focus resync.
 */

import { supabase } from "@/lib/supabaseClient";
import { backendApi, shouldUseNodeAuthApi } from "@/api/backendClient";

/** Seconds before JWT expiry to force a refresh (clock skew + network latency). */
export const PROACTIVE_REFRESH_BUFFER_SEC = 300;

/** Hard timeout on a single refresh attempt. Prevents indefinitely hung requests. */
const REFRESH_ATTEMPT_TIMEOUT_MS = 15_000;

/**
 * @param {unknown} error — Supabase AuthError or similar
 * @returns {boolean} true if the refresh token is no longer usable (user must sign in again)
 */
export function isRefreshTokenFatalError(error) {
  if (!error) return false;
  const code = String(error.code || "").toLowerCase();
  const msg = String(error.message || error.msg || "").toLowerCase();
  if (
    code === "refresh_token_not_found" ||
    code === "invalid_grant" ||
    code === "session_not_found"
  ) {
    return true;
  }
  if (msg.includes("invalid refresh token")) return true;
  if (msg.includes("refresh token not found")) return true;
  if (msg.includes("refresh token") && msg.includes("invalid")) return true;
  if (msg.includes("already been used") || msg.includes("already used")) return true;
  if (msg.includes("revoked")) return true;
  if (msg.includes("session") && msg.includes("expired") && msg.includes("refresh")) return true;
  return false;
}

let refreshInFlightPromise = null;
const REFRESH_LOCK_KEY = "paidly_auth_refresh_lock_v1";
const REFRESH_LOCK_TTL_MS = 12_000;
const REFRESH_WAIT_SLICE_MS = 250;

function getTabRefreshOwnerId() {
  if (typeof window === "undefined") return "server";
  try {
    const k = "paidly_auth_refresh_owner_v1";
    const existing = window.sessionStorage.getItem(k);
    if (existing) return existing;
    const next = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(k, next);
    return next;
  } catch {
    return `tab_${Date.now()}`;
  }
}

function readLock() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(REFRESH_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ownerId || typeof parsed?.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLock(lock) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify(lock));
    return true;
  } catch {
    return false;
  }
}

function clearLock(ownerId) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const current = readLock();
    if (!current || current.ownerId === ownerId) {
      window.localStorage.removeItem(REFRESH_LOCK_KEY);
    }
  } catch {
    // ignore
  }
}

async function waitForRefreshLockRelease(ownerId, maxWaitMs = REFRESH_LOCK_TTL_MS + 1000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const lock = readLock();
    if (!lock) return true;
    if (lock.ownerId === ownerId) return true;
    if (lock.expiresAt <= Date.now()) return true;
    await new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_SLICE_MS));
  }
  return false;
}

function isFreshEnough(session) {
  const exp = Number(session?.expires_at || 0);
  if (!exp) return false;
  return exp * 1000 > Date.now() + 30_000;
}

async function performSingleRefreshAttempt() {
  const { data: before, error: readErr } = await supabase.auth.getSession();
  if (readErr) {
    return { ok: false, error: readErr, fatal: false, reason: "get_session_failed" };
  }
  if (!before?.session?.refresh_token) {
    return { ok: false, reason: "no_refresh_token" };
  }

  // CRITICAL: If GoTrue's autoRefreshToken already rotated the token moments before this call,
  // the session is already fresh and the old refresh token is consumed. Attempting another
  // supabase.auth.refreshSession() would send that already-consumed token → "refresh_token_not_found".
  // Returning early avoids the double-refresh race that causes forced logouts.
  if (isFreshEnough(before.session)) {
    return { ok: true, session: before.session };
  }

  let data;
  let error;
  if (shouldUseNodeAuthApi()) {
    try {
      const response = await backendApi.post(
        "/api/auth/refresh",
        { refresh_token: before.session.refresh_token },
        { __paidlySilent: true, validateStatus: () => true }
      );
      if (
        response.status === 200 &&
        response?.data?.access_token &&
        response?.data?.refresh_token
      ) {
        const setRes = await supabase.auth.setSession({
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token,
        });
        data = setRes.data;
        error = setRes.error || null;
      } else {
        error = {
          message: response?.data?.error || `refresh_failed_${response.status}`,
          code: response.status === 401 ? "refresh_token_not_found" : undefined,
        };
      }
    } catch {
      const refreshed = await supabase.auth.refreshSession();
      data = refreshed.data;
      error = refreshed.error;
    }
  } else {
    const refreshed = await supabase.auth.refreshSession();
    data = refreshed.data;
    error = refreshed.error;
  }
  if (!error && data?.session) {
    return { ok: true, session: data.session };
  }
  if (error && isRefreshTokenFatalError(error)) {
    return { ok: false, error, fatal: true };
  }
  return { ok: false, error, fatal: false };
}

/**
 * Refresh the session using the stored refresh token.
 * @returns {Promise<{ ok: boolean, session?: import("@supabase/supabase-js").Session, error?: unknown, fatal?: boolean, reason?: string }>}
 */
export async function refreshSupabaseSessionWithRecovery() {
  if (refreshInFlightPromise) return refreshInFlightPromise;
  refreshInFlightPromise = (async () => {
  const ownerId = getTabRefreshOwnerId();
  if (typeof window === "undefined" || !window.localStorage) {
    return performSingleRefreshAttempt();
  }

  const existingLock = readLock();
  if (existingLock && existingLock.ownerId !== ownerId && existingLock.expiresAt > Date.now()) {
    await waitForRefreshLockRelease(ownerId);
    const { data: afterWait } = await supabase.auth.getSession();
    if (isFreshEnough(afterWait?.session)) {
      return { ok: true, session: afterWait.session };
    }
  }

  const lock = readLock();
  if (lock && lock.ownerId !== ownerId && lock.expiresAt > Date.now()) {
    // Another tab acquired lock while we were waiting; avoid parallel refresh.
    const released = await waitForRefreshLockRelease(ownerId);
    if (released) {
      const { data: afterWait } = await supabase.auth.getSession();
      if (isFreshEnough(afterWait?.session)) {
        return { ok: true, session: afterWait.session };
      }
    }
    return { ok: false, reason: "refresh_lock_waited" };
  }

  const acquired = writeLock({ ownerId, expiresAt: Date.now() + REFRESH_LOCK_TTL_MS });
  if (!acquired) {
    return performSingleRefreshAttempt();
  }
  const verify = readLock();
  if (!verify || verify.ownerId !== ownerId) {
    await waitForRefreshLockRelease(ownerId);
    const { data: afterWait } = await supabase.auth.getSession();
    if (isFreshEnough(afterWait?.session)) {
      return { ok: true, session: afterWait.session };
    }
    return { ok: false, reason: "refresh_lock_contention" };
  }

  try {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("refresh_attempt_timeout")),
        REFRESH_ATTEMPT_TIMEOUT_MS
      );
    });
    try {
      return await Promise.race([performSingleRefreshAttempt(), timeoutPromise]);
    } catch (e) {
      if (String(e?.message || "").includes("refresh_attempt_timeout")) {
        return { ok: false, reason: "refresh_timeout", fatal: false };
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    clearLock(ownerId);
  }
  })();
  try {
    return await refreshInFlightPromise;
  } finally {
    refreshInFlightPromise = null;
  }
}

/**
 * Milliseconds until we should proactively refresh, or null if no session / invalid exp.
 * @param {number | null | undefined} expiresAtSec — JWT exp (unix seconds)
 *
 * - If the access token is already past `PROACTIVE_REFRESH_BUFFER_SEC` before expiry, returns 5s so we
 *   still attempt recovery (GoTrue may refresh on getSession; tab resync also helps).
 * - If actual refresh is >12h away, caps the timer at 6h so long-lived JWTs still get periodic checks
 *   after laptop sleep (single `setTimeout` would otherwise never fire).
 */
export function msUntilProactiveRefresh(expiresAtSec) {
  if (typeof expiresAtSec !== "number" || !Number.isFinite(expiresAtSec)) return null;
  const expMs = expiresAtSec * 1000;
  const target = expMs - PROACTIVE_REFRESH_BUFFER_SEC * 1000;
  const ms = target - Date.now();
  if (ms < 5_000) return 5_000;
  if (ms > 1000 * 60 * 60 * 12) return 1000 * 60 * 60 * 6;
  return ms;
}
