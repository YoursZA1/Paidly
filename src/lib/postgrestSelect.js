/**
 * PostgREST rejects unknown columns with HTTP 400. App aliases like `created_date` must
 * never appear in `.select()` lists — map them in JS after fetch instead.
 */
const DEFAULT_STRIP_ALIASES = Object.freeze(["created_date", "updated_date"]);

/**
 * @param {string} selectList — comma-separated PostgREST columns
 * @param {{ strip?: string[] }} [options]
 * @returns {string}
 */
export function sanitizePostgrestSelect(selectList, options = {}) {
  const strip = new Set(
    (options.strip?.length ? options.strip : DEFAULT_STRIP_ALIASES).map((c) =>
      String(c).trim().toLowerCase()
    )
  );
  const parts = String(selectList || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((col) => !strip.has(col.toLowerCase()));
  return parts.join(",");
}
