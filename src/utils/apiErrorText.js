/**
 * Normalize API `error` / `message` fields (string or PostgREST / Supabase-shaped object)
 * so we never pass objects into `new Error(...)`, which becomes "[object Object]".
 *
 * @param {unknown} value
 * @returns {string}
 */
export function apiErrorFieldToString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message;
    if (typeof value.details === "string" && value.details.trim()) return value.details;
    if (typeof value.hint === "string" && value.hint.trim()) return value.hint;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Safe string for React Query error UI (Error, string, or odd shapes).
 *
 * @param {unknown} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatQueryError(err, fallback = "Unknown error") {
  if (err == null) return fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const m = err.message;
    if (typeof m === "string" && m.trim() && m !== "[object Object]") return m;

    // Look through common shapes (Axios / Supabase / PostgREST).
    const candidates = [
      err.error,
      err.errors,
      err.detail,
      err.details,
      err.hint,
      err.message,
      err.data?.error,
      err.data?.message,
      err.response?.data?.error,
      err.response?.data?.message,
      err.response?.data,
    ];

    for (const c of candidates) {
      const s = apiErrorFieldToString(c);
      if (s && s !== "{}" && s !== "[object Object]") return s;
    }

    // Last resort: try to JSON-serialize the error for debugging UI.
    try {
      const s = JSON.stringify(err);
      if (s && s !== "{}") return s;
    } catch {
      // ignore
    }
  }
  return fallback;
}
