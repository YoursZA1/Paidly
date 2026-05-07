import { supabase } from "@/lib/supabaseClient";
import { refreshSupabaseSessionWithRecovery } from "@/lib/supabaseAuthRefresh";
import { triggerUnauthorizedSession } from "@/lib/unauthorizedSessionHandler";
import { trackSessionTelemetry } from "@/lib/sessionTelemetry";

function getResponseStatus(resultOrError) {
  if (!resultOrError) return null;
  if (typeof resultOrError.status === "number") return resultOrError.status;
  if (typeof resultOrError?.response?.status === "number") return resultOrError.response.status;
  return null;
}

export function isReplaySafeHttpMethod(method) {
  const normalized = String(method || "GET").toUpperCase();
  return normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS";
}

/**
 * Unified unauthorized policy for RPC calls:
 * 1) single refresh attempt
 * 2) one retry
 * 3) optional replay queue for safe methods
 * 4) centralized re-auth trigger
 */
export async function runRpcUnauthorizedPolicy({
  method,
  retryRequest,
  queueReplayRequest,
  reason = "rpc-401",
  alreadyRetried = false,
}) {
  trackSessionTelemetry("rpc_unauthorized_detected", {
    reason,
    method: String(method || "GET").toUpperCase(),
    already_retried: Boolean(alreadyRetried),
  });
  if (!alreadyRetried && typeof retryRequest === "function") {
    try {
      trackSessionTelemetry("session_refresh_attempted", { source: "rpc_unauthorized_policy" });
      const refreshed = await refreshSupabaseSessionWithRecovery();
      if (refreshed?.ok) {
        trackSessionTelemetry("session_refresh_result", {
          source: "rpc_unauthorized_policy",
          result: "ok",
        });
        const retried = await retryRequest();
        const retryStatus = getResponseStatus(retried);
        if (retryStatus !== 401 && retryStatus !== 403) {
          trackSessionTelemetry("rpc_unauthorized_recovered", { reason, retry_status: retryStatus || 200 });
          return { recovered: true, response: retried };
        }
      } else if (refreshed?.fatal) {
        trackSessionTelemetry("session_refresh_result", {
          source: "rpc_unauthorized_policy",
          result: "fatal",
        });
      } else {
        trackSessionTelemetry("session_refresh_result", {
          source: "rpc_unauthorized_policy",
          result: "failed",
        });
      }
    } catch (e) {
      trackSessionTelemetry("session_refresh_result", {
        source: "rpc_unauthorized_policy",
        result: "error",
      });
      const retryStatus = getResponseStatus(e);
      if (retryStatus !== 401 && retryStatus !== 403) {
        throw e;
      }
    }
  }

  // Unauthorized responses are terminal for the current auth context.
  // Do not queue replays here: it can create retry storms while auth is invalid.

  trackSessionTelemetry("rpc_reauth_required", { reason });
  await triggerUnauthorizedSession(reason, { source: "rpc" });
  return { recovered: false, response: null };
}

/**
 * Shared access-token acquisition policy for authenticated RPC calls:
 * 1) read current session token
 * 2) attempt silent refresh once
 * 3) trigger centralized unauthorized policy if still missing
 */
export async function getSessionAccessTokenOrHandleUnauthorized(reason = "missing_access_token") {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return token;
  } catch {
    // continue to refresh path
  }

  try {
    trackSessionTelemetry("session_refresh_attempted", { source: "token_acquisition" });
    const refreshed = await refreshSupabaseSessionWithRecovery();
    if (refreshed?.ok) {
      trackSessionTelemetry("session_refresh_result", { source: "token_acquisition", result: "ok" });
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) return token;
    } else if (refreshed?.fatal) {
      trackSessionTelemetry("session_refresh_result", { source: "token_acquisition", result: "fatal" });
    } else {
      trackSessionTelemetry("session_refresh_result", { source: "token_acquisition", result: "failed" });
    }
  } catch {
    trackSessionTelemetry("session_refresh_result", { source: "token_acquisition", result: "error" });
    // continue to unauthorized handler
  }

  trackSessionTelemetry("auth_token_missing", { reason });
  await triggerUnauthorizedSession(reason, { source: "rpc", believedSignedIn: true });
  return null;
}

export async function getAuthBearerHeadersOrThrow(reason = "missing_access_token") {
  const token = await getSessionAccessTokenOrHandleUnauthorized(reason);
  if (!token) {
    throw new Error("Not authenticated");
  }
  return { Authorization: `Bearer ${token}` };
}
