/**
 * Supabase session refresh helpers for long-lived SaaS tabs.
 * Complements GoTrue autoRefreshToken + AuthContext visibility/focus resync.
 */

import { supabase } from "@/lib/supabaseClient";
import { backendApi, shouldUseNodeAuthApi } from "@/api/backendClient";

/** Seconds before JWT expiry to force a refresh (clock skew + network latency). */
export const PROACTIVE_REFRESH_BUFFER_SEC = 150;

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

/**
 * Refresh the session using the stored refresh token.
 * @returns {Promise<{ ok: boolean, session?: import("@supabase/supabase-js").Session, error?: unknown, fatal?: boolean, reason?: string }>}
 */
export async function refreshSupabaseSessionWithRecovery() {
  if (refreshInFlightPromise) return refreshInFlightPromise;
  refreshInFlightPromise = (async () => {
  const { data: before, error: readErr } = await supabase.auth.getSession();
  if (readErr) {
    return { ok: false, error: readErr, fatal: false, reason: "get_session_failed" };
  }
  if (!before?.session?.refresh_token) {
    return { ok: false, reason: "no_refresh_token" };
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
