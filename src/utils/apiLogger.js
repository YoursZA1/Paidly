/**
 * Central API logging: failed requests, slow responses, and unhandled errors.
 * Logs include page/endpoint context for easier debugging.
 * SLOW_MS: list/auth often hit maxWaitMs or cold Supabase (3–5s); only log when truly slow.
 */
const SLOW_MS = 6000;

export function getCurrentPage() {
  if (typeof window === "undefined" || !window.location) return "unknown";
  const path = window.location.pathname || "";
  return path.replace(/^\//, "") || "root";
}

/**
 * Log a failed Supabase/API request.
 * @param {string} endpoint - e.g. "clients", "invoices.list"
 * @param {Error|{ message?: string }} error
 * @param {string} [page] - optional override (default: current pathname)
 */
export function logApiFailure(endpoint, error, page) {
  const p = page ?? getCurrentPage();
  const msg = error?.message ?? String(error);
  console.error(
    `[Paidly API] FAILED | page=${p} | endpoint=${endpoint} | error=${msg}`
  );
}

/**
 * Log a slow API response (>1 second).
 * @param {string} endpoint
 * @param {number} durationMs
 * @param {string} [page]
 */
export function logSlowResponse(endpoint, durationMs, page) {
  if (durationMs < SLOW_MS) return;
  const p = page ?? getCurrentPage();
  console.warn(
    `[Paidly API] SLOW | page=${p} | endpoint=${endpoint} | duration=${durationMs}ms`
  );
}

/**
 * Log an unhandled UI/React error with page context.
 * @param {Error} error
 * @param {string} [page]
 */
export function logUnhandledError(error, page) {
  const p = page ?? getCurrentPage();
  console.error(
    `[Paidly UI] UNHANDLED | page=${p} | error=${error?.message ?? error}`
  );
}

/**
 * Wraps an async fn to log duration (slow only) and failures.
 * Use around Supabase/API calls.
 * @param {string} endpoint - e.g. "clients.list"
 * @param {() => Promise<T>} fn
 * @param {string} [page]
 * @returns {Promise<T>}
 */
export async function withApiLogging(endpoint, fn, page) {
  const start = Date.now();
  const p = page ?? getCurrentPage();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logSlowResponse(endpoint, duration, p);
    return result;
  } catch (err) {
    logApiFailure(endpoint, err, p);
    throw err;
  }
}
