/**
 * Shared utilities for normalizing Supabase errors into user-friendly messages.
 * Use for all async operations involving Supabase (auth, storage, database).
 */

/** Shown when GoTrue / Supabase Auth blocks sign-up or confirmation emails (per-email or project limits). */
export const AUTH_SIGNUP_EMAIL_RATE_LIMIT_MESSAGE =
  "Too many sign-up or confirmation emails were sent recently. Wait 30-60 minutes and try again. If you already started, use \"Resend confirmation\" on the login page. For heavy testing, space out attempts or raise limits in Supabase (Authentication → Rate limits).";

/**
 * True for Supabase auth email throttling, API sign-up 429, etc. Used to avoid stacking client-side signup counters.
 * @param {unknown} error - Error, AuthApiError, or `{ message, code, status, cause }`
 */
export function isAuthSignupEmailRateLimitError(error) {
  if (error == null) return false;
  const chain = [];
  let cur = error;
  for (let i = 0; i < 8 && cur; i++) {
    chain.push(cur);
    cur = typeof cur === "object" && cur !== null && "cause" in cur ? cur.cause : null;
  }
  for (const c of chain) {
    const msg = String(
      typeof c === "string" ? c : (c?.message ?? c?.error_description ?? "")
    ).trim();
    if (msg === AUTH_SIGNUP_EMAIL_RATE_LIMIT_MESSAGE) return true;
    const low = msg.toLowerCase();
    if (/email rate limit exceeded|over_email_send_rate|for security purposes, you can only request this/i.test(low)) {
      return true;
    }
    if (/too many sign-up attempts from this network/i.test(low)) return true;
    if (/too many sign-up attempts\. try again/i.test(low)) return true;
    const code = String(
      typeof c === "object" && c !== null && c.code != null ? c.code : ""
    ).toLowerCase();
    if (/over_email_send|email_send_rate/i.test(code)) return true;
    const status = typeof c === "object" && c !== null ? Number(c.status) : NaN;
    if (status === 429 && /sign|auth|email|attempt/i.test(low)) return true;
  }
  return false;
}

/**
 * Get a safe, user-friendly message from a Supabase or generic error.
 * Handles PostgrestError, AuthError, StorageError, and plain Error.
 * @param {unknown} error - Error from Supabase or thrown in catch
 * @param {string} [fallback='Something went wrong'] - Message when error has no message
 * @returns {string} User-facing message (safe to show in UI)
 */
export function getSupabaseErrorMessage(error, fallback = "Something went wrong") {
  if (error == null) return fallback;
  if (typeof error === "string") {
    const s = error.trim();
    if (/email rate limit exceeded|over_email_send_rate/i.test(s.toLowerCase())) {
      return AUTH_SIGNUP_EMAIL_RATE_LIMIT_MESSAGE;
    }
    return s;
  }
  const raw =
    error?.message ??
    error?.error_description ??
    (typeof error?.toString === "function" ? error.toString() : null);
  const msg = typeof raw === "string" ? raw.trim() : "";
  const code = String(error?.code ?? "").toLowerCase();
  if (msg && msg !== "[object Object]") {
    if (
      /over_email_send|email_send_rate/i.test(code) ||
      /email rate limit exceeded|over_email_send_rate|for security purposes, you can only request this/i.test(
        msg.toLowerCase()
      )
    ) {
      return AUTH_SIGNUP_EMAIL_RATE_LIMIT_MESSAGE;
    }
    if (/failed to fetch/i.test(msg) || /networkerror/i.test(msg) || /load failed/i.test(msg)) {
      return (
        "Could not reach Supabase (network). Check your connection, VPN or ad blockers, and that " +
        "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in Vercel for Production, then redeploy. " +
        "If the project was paused, resume it in the Supabase dashboard."
      );
    }
    return msg;
  }
  return fallback;
}

/**
 * Check a Supabase response for error and throw with a normalized message.
 * Use after: const { data, error } = await supabase.from(...).select() etc.
 * @param {{ error?: { message?: string; code?: string; details?: string } | null }} result - Result with optional .error
 * @param {string} context - Short context for the fallback message (e.g. "Failed to load invoices")
 * @throws {Error} If result.error is set
 */
export function throwIfSupabaseError(result, context = "Operation failed") {
  if (result?.error) {
    const msg = getSupabaseErrorMessage(result.error, context);
    const err = new Error(msg);
    err.cause = result.error;
    throw err;
  }
}

/**
 * User-visible feedback for failed Supabase writes (insert/update/delete/upsert).
 * Call when `error` is set or after catching a thrown Error from PostgREST.
 * @param {unknown} error - PostgREST error object or Error
 * @param {string} [context='Save failed'] - Shown if the error has no message
 */
export function alertSupabaseWriteFailure(error, context = "Save failed") {
  if (error == null) return;
  const msg = getSupabaseErrorMessage(error, context);
  console.error(`[Supabase write] ${context}:`, error);
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(msg);
  }
}

/**
 * After `const { data, error } = await supabase.from(...).insert|update|...`
 * @param {{ error?: unknown | null }} result
 * @param {string} context
 * @returns {boolean} true if ok (no error)
 */
export function checkSupabaseWriteResult(result, context = "Operation failed") {
  if (!result?.error) return true;
  alertSupabaseWriteFailure(result.error, context);
  return false;
}

/**
 * Wrap an async function so any thrown error is re-thrown with a normalized message.
 * Useful when you want consistent user-facing messages without changing every catch block.
 * @param {() => Promise<T>} fn - Async function to run
 * @param {string} fallbackContext - Context used if the caught error has no message
 * @returns {Promise<T>}
 * @template T
 */
export async function withSupabaseErrorHandling(fn, fallbackContext = "Operation failed") {
  try {
    return await fn();
  } catch (error) {
    const message = getSupabaseErrorMessage(error, fallbackContext);
    if (error instanceof Error && error.message === message) throw error;
    const wrapped = new Error(message);
    wrapped.cause = error;
    throw wrapped;
  }
}

/**
 * Verify that a Supabase table exists and is accessible.
 * Useful for checking schema before attempting operations.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} tableName - Name of the table to check
 * @returns {Promise<{exists: boolean, error?: string}>}
 */
export async function verifyTableExists(supabase, tableName) {
  try {
    // Try a simple query that should work if table exists
    const { data, error } = await supabase
      .from(tableName)
      .select('id')
      .limit(1);
    
    // If we get a schema cache error, the table might exist but cache is stale
    if (error) {
      const errorMsg = error.message?.toLowerCase() || '';
      if (errorMsg.includes('schema cache') || 
          errorMsg.includes("could not find the table") ||
          errorMsg.includes("relation") && errorMsg.includes("does not exist")) {
        return { 
          exists: false, 
          error: `Table '${tableName}' not found in schema cache. Run scripts/reload-schema-cache.sql in Supabase SQL Editor.` 
        };
      }
      // Other errors (like permission) mean table exists but we can't access it
      // That's okay for verification purposes
      return { exists: true };
    }
    
    return { exists: true };
  } catch (err) {
    const errorMsg = err?.message?.toLowerCase() || '';
    if (errorMsg.includes('schema cache') || 
        errorMsg.includes("could not find the table") ||
        errorMsg.includes("relation") && errorMsg.includes("does not exist")) {
      return { 
        exists: false, 
        error: `Table '${tableName}' does not exist. Run scripts/ensure-invoices-schema.sql in Supabase SQL Editor.` 
      };
    }
    return { exists: false, error: getSupabaseErrorMessage(err, 'Unknown error') };
  }
}
