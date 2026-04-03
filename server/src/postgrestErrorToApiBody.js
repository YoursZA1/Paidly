/**
 * Serialize PostgREST / Supabase query errors for JSON API responses.
 * `error.message` is sometimes empty; omitting it made clients show bare "HTTP 500".
 *
 * @param {import("@supabase/supabase-js").PostgrestError | null | undefined} err
 * @returns {{ error: string, code?: string, details?: string, hint?: string } | null}
 */
export function postgrestErrorToApiBody(err) {
  if (!err) return null;
  const message =
    (typeof err.message === "string" && err.message.trim()) ||
    (typeof err.details === "string" && err.details.trim()) ||
    (typeof err.hint === "string" && err.hint.trim()) ||
    (typeof err.code === "string" && err.code.trim()) ||
    "Database query failed";
  const body = { error: message };
  if (typeof err.code === "string" && err.code.trim()) body.code = err.code;
  if (typeof err.details === "string" && err.details.trim()) body.details = err.details;
  if (typeof err.hint === "string" && err.hint.trim()) body.hint = err.hint;
  return body;
}
