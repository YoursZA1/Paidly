/**
 * Shared utilities for normalizing Supabase errors into user-friendly messages.
 * Use for all async operations involving Supabase (auth, storage, database).
 */

/**
 * Get a safe, user-friendly message from a Supabase or generic error.
 * Handles PostgrestError, AuthError, StorageError, and plain Error.
 * @param {unknown} error - Error from Supabase or thrown in catch
 * @param {string} [fallback='Something went wrong'] - Message when error has no message
 * @returns {string} User-facing message (safe to show in UI)
 */
export function getSupabaseErrorMessage(error, fallback = "Something went wrong") {
  if (error == null) return fallback;
  if (typeof error === "string") return error;
  const raw =
    error?.message ??
    error?.error_description ??
    (typeof error?.toString === "function" ? error.toString() : null);
  const msg = typeof raw === "string" ? raw.trim() : "";
  if (msg && msg !== "[object Object]") {
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
