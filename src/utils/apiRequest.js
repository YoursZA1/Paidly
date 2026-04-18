import { triggerUnauthorizedSession } from "@/lib/unauthorizedSessionHandler";

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
  const res = await fetch(input, init);
  if (res.status === 401) {
    await triggerUnauthorizedSession("fetch-401");
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
        : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.response = res;
    err.data = data;
    throw err;
  }
  return data;
}
