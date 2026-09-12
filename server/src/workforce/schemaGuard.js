// @ts-check

/**
 * Fail loud when a workforce column is missing from the database.
 * Do not strip the column and retry — that hides incomplete migrations.
 */

/**
 * @param {unknown} error
 * @param {string | string[]} columns
 */
export function isMissingWorkforceColumn(error, columns) {
  const msg = String(
    error && typeof error === "object" && "message" in error
      ? /** @type {{ message?: unknown }} */ (error).message
      : error || ""
  );
  if (!msg) return false;
  const names = (Array.isArray(columns) ? columns : [columns]).filter(Boolean);
  return names.some((col) => {
    const escaped = String(col).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "i").test(msg);
  });
}

/**
 * @param {unknown} error
 * @param {string | string[]} columns
 */
export function throwIfMissingWorkforceColumn(error, columns) {
  if (!error) return;
  if (!isMissingWorkforceColumn(error, columns)) return;
  const list = (Array.isArray(columns) ? columns : [columns]).filter(Boolean).join(", ");
  /** @type {Error & { status?: number, cause?: unknown }} */
  const err = new Error(
    `Workforce schema is missing required column(s): ${list}. Apply the latest workforce migrations.`
  );
  err.status = 500;
  err.cause = error;
  throw err;
}
