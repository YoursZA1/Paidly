/**
 * Discriminated result for auth/session refresh attempts.
 * Booleans collapse "skipped" (throttled, halted, already expired) into "failure" and cause false escalations.
 *
 * @typedef { { status: "success" } } RefreshSuccess
 * @typedef { { status: "skipped", reason?: string } } RefreshSkipped
 * @typedef { { status: "retrying", reason?: string } } RefreshRetrying
 * @typedef { { status: "failed", reason?: string } } RefreshFailed
 * @typedef { { status: "fatal", reason?: string } } RefreshFatal
 * @typedef { RefreshSuccess | RefreshSkipped | RefreshRetrying | RefreshFailed | RefreshFatal } RefreshResult
 */

/** @returns {RefreshSuccess} */
export function refreshSuccess() {
  return { status: "success" };
}

/** @param {string} [reason] */
/** @returns {RefreshSkipped} */
export function refreshSkipped(reason) {
  return reason ? { status: "skipped", reason } : { status: "skipped" };
}

/** @param {string} [reason] e.g. joined_in_flight */
/** @returns {RefreshRetrying} */
export function refreshRetrying(reason) {
  return reason ? { status: "retrying", reason } : { status: "retrying" };
}

/** @param {string} [reason] */
/** @returns {RefreshFailed} */
export function refreshFailed(reason) {
  return reason ? { status: "failed", reason } : { status: "failed" };
}

/** @param {string} [reason] */
/** @returns {RefreshFatal} */
export function refreshFatal(reason) {
  return reason ? { status: "fatal", reason } : { status: "fatal" };
}

/** @param {unknown} value */
/** @returns {value is RefreshSuccess} */
export function isRefreshSuccess(value) {
  return Boolean(value && typeof value === "object" && value.status === "success");
}

/** @param {unknown} value */
/** @returns {value is RefreshSkipped} */
export function isRefreshSkipped(value) {
  return Boolean(value && typeof value === "object" && value.status === "skipped");
}

/** @param {unknown} value */
/** @returns {value is RefreshRetrying} */
export function isRefreshRetrying(value) {
  return Boolean(value && typeof value === "object" && value.status === "retrying");
}

/** @param {unknown} value */
/** @returns {value is RefreshFailed} */
export function isRefreshFailed(value) {
  return Boolean(value && typeof value === "object" && value.status === "failed");
}

/** @param {unknown} value */
/** @returns {value is RefreshFatal} */
export function isRefreshFatal(value) {
  return Boolean(value && typeof value === "object" && value.status === "fatal");
}
