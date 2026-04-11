import { toast } from "sonner";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backoffMs(attempt) {
  return Math.min(2500, 400 * 2 ** attempt);
}

/**
 * Transient PostgREST / browser transport failures worth retrying (not RLS, validation, or "no rows").
 * @param {unknown} error - PostgREST error object or thrown Error
 */
export function isRetryablePostgrestOrTransportError(error) {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "PGRST116") return false;
  if (/^22\d{3}$/.test(code) || /^23\d{3}$/.test(code)) return false;
  if (code === "42501") return false;

  const status = Number(error.status ?? error.statusCode ?? NaN);
  if (Number.isFinite(status)) {
    if (status === 401 || status === 403) return false;
    if (status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504) {
      return true;
    }
  }

  const msg = String(error.message ?? error.details ?? "").toLowerCase();
  if (
    /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|econnreset|etimedout|502|503|504/.test(
      msg
    )
  ) {
    return true;
  }
  if (code === "57014") return true;
  return false;
}

function shouldSkipFailureToast(error) {
  if (!error) return true;
  const status = Number(error.status ?? error.statusCode ?? NaN);
  if (status === 401 || status === 403) return true;
  const code = String(error.code ?? "");
  if (code === "42501") return true;
  const msg = String(error.message ?? "").toLowerCase();
  if (/jwt|permission denied|rls|policy|not authorized/i.test(msg)) return true;
  return false;
}

function maybeToastPostgrestFailure(error, options) {
  if (options.silent) return;
  if (shouldSkipFailureToast(error)) return;
  const msg = getSupabaseErrorMessage(error, "Request failed");
  const key = `paidly-sb-${options.label || "postgrest"}-${String(error.code || "err")}`;
  toast.error("Could not complete request", {
    description: msg.slice(0, 220),
    duration: 6000,
    id: key.slice(0, 100),
  });
}

/**
 * Runs a PostgREST call with backoff retries on transient failures.
 * `execute` must return a fresh `{ data, error }` each invocation (rebuild the query each time).
 *
 * @param {() => Promise<{ data?: unknown, error?: unknown }>} execute
 * @param {{ kind?: 'read'|'write', label?: string, silent?: boolean }} [options]
 * @returns {Promise<{ data?: unknown, error?: unknown }>}
 */
export async function runPostgrestWithResilience(execute, options = {}) {
  const kind = options.kind === "write" ? "write" : "read";
  const maxAttempts = kind === "read" ? 3 : 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await execute();
      if (!result?.error) {
        return result;
      }
      const err = result.error;
      if (!isRetryablePostgrestOrTransportError(err)) {
        maybeToastPostgrestFailure(err, options);
        return result;
      }
      if (attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      maybeToastPostgrestFailure(err, options);
      return result;
    } catch (e) {
      const retryable =
        isRetryablePostgrestOrTransportError(e) ||
        /failed to fetch|network|timeout|aborted/i.test(String(e?.message ?? ""));
      if (!retryable) {
        if (!options.silent) {
          toast.error("Could not complete request", {
            description: getSupabaseErrorMessage(e, "Request failed").slice(0, 220),
            duration: 6000,
            id: `paidly-sb-${options.label || "throw"}-${attempt}`.slice(0, 100),
          });
        }
        throw e;
      }
      if (attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      if (!options.silent) {
        toast.error("Could not complete request", {
          description: getSupabaseErrorMessage(e, "Request failed").slice(0, 220),
          duration: 6000,
          id: `paidly-sb-${options.label || "throw"}-final`.slice(0, 100),
        });
      }
      throw e;
    }
  }

  return { data: null, error: new Error("Exhausted retries") };
}
