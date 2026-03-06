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
