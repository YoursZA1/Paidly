/**
 * Retry utility for spurious AbortError ("signal is aborted without reason").
 * Often caused by React Strict Mode, navigation, or component unmount.
 */

export const isAbortError = (err) =>
  err?.name === 'AbortError' ||
  (err?.message && String(err.message).toLowerCase().includes('aborted'));

/**
 * Retry an async operation on AbortError (once by default).
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {number} retries - Number of retries on AbortError
 * @param {number} delayMs - Delay before retry
 * @returns {Promise<T>}
 */
export async function retryOnAbort(fn, retries = 1, delayMs = 300) {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && isAbortError(err)) {
      await new Promise((r) => setTimeout(r, delayMs));
      return retryOnAbort(fn, retries - 1, delayMs);
    }
    throw err;
  }
}

/** Browser fetch() failures to Supabase/REST (offline, flaky mobile, ad blockers). */
export const isTransientFetchFailure = (err) => {
  const m = String(err?.message ?? err ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|net::err|could not reach supabase/i.test(m);
};

/**
 * Retry when the thrown error looks like a transient network failure (e.g. Supabase "Failed to fetch").
 * @param {() => Promise<T>} fn
 * @param {number} retries - Extra attempts after the first try
 * @param {number} delayMs
 * @returns {Promise<T>}
 */
export async function retryOnTransientFetch(fn, retries = 2, delayMs = 400) {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && isTransientFetchFailure(err)) {
      await new Promise((r) => setTimeout(r, delayMs));
      return retryOnTransientFetch(fn, retries - 1, delayMs * 1.25);
    }
    throw err;
  }
}
