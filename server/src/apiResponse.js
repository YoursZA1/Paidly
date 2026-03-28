import process from "node:process";

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Consistent JSON errors for the Express API (`{ error: string, ...extras }`).
 */
export function sendApiError(res, status, message, extras = {}) {
  if (res.headersSent) return res;
  return res.status(status).json({ error: message, ...extras });
}

/** 400 shorthand */
export function sendBadRequest(res, message, extras) {
  return sendApiError(res, 400, message, extras);
}

/** 401 shorthand */
export function sendUnauthorized(res, message = "Unauthorized") {
  return sendApiError(res, 401, message);
}

/**
 * 500 in catch blocks — does not expose internal details in production.
 * @param {Record<string, unknown>} [bodyExtras] — e.g. `{ success: false }` for routes that already use that shape
 */
export function sendUnexpectedError(res, err, logLabel = "api", bodyExtras = {}) {
  if (res.headersSent) return res;
  console.error(`[${logLabel}]`, err);
  const message =
    IS_PROD ? "Request failed" : err?.message || "Request failed";
  return res.status(500).json({ error: message, ...bodyExtras });
}
