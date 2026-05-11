import { runRpcUnauthorizedPolicy } from "@/lib/rpcSessionPolicy";
import { triggerUnauthorizedSession } from "@/lib/unauthorizedSessionHandler";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";
import { formatHttpStatusMessage } from "@/utils/apiErrorText";

/**
 * Low-level fetch for **authenticated / session-cookie** API calls.
 * On HTTP 401, runs the global session handler (sign out + redirect when registered).
 *
 * Prefer **`apiRequest`** for new code (same behavior; clearer intent).
 * Raw `fetch` is fine for public URLs, static assets, and third-party origins (e.g. payment gateways).
 *
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 * @see docs/AUTHENTICATED_FETCH.md
 */
export async function safeFetch(input, init) {
  if (isRecoveryCircuitOpen()) {
    await triggerUnauthorizedSession("terminal_auth_state", {
      source: "api_request",
      refreshFatal: true,
      believedSignedIn: true,
    });
    return new Response(null, { status: 401, statusText: "Unauthorized" });
  }
  const res = await fetch(input, init);
  if (res.status === 401) {
    const alreadyRetried = Boolean(init?.headers && new Headers(init.headers).get("x-paidly-auth-retry") === "1");
    const handled = await runRpcUnauthorizedPolicy({
      method: init?.method,
      alreadyRetried,
      reason: "fetch-401",
      retryRequest: async () => {
        const retryHeaders = new Headers(init?.headers || {});
        retryHeaders.set("x-paidly-auth-retry", "1");
        return fetch(input, { ...(init || {}), headers: retryHeaders });
      },
      queueReplayRequest: async () => {
        const replayHeaders = new Headers(init?.headers || {});
        replayHeaders.set("x-paidly-auth-replay", "1");
        return fetch(input, { ...(init || {}), headers: replayHeaders });
      },
    });
    if (handled?.recovered && handled.response) {
      return handled.response;
    }
  }
  return res;
}

/**
 * Preferred alias for authenticated app API requests (identical to {@link safeFetch}).
 *
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export const apiRequest = safeFetch;

/**
 * `apiRequest` + JSON body: reads text, parses JSON when possible, throws on `!res.ok`.
 * 401 still triggers the session handler before throw.
 *
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @returns {Promise<unknown>} Parsed JSON or `null` for empty body
 */
export async function apiRequestJson(input, init) {
  const res = await safeFetch(input, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && (data.error || data.message)
        ? String(data.error || data.message)
        : formatHttpStatusMessage(res.status);
    const err = new Error(msg);
    err.response = res;
    err.data = data;
    throw err;
  }
  return data;
}
