/** Single-record / PDF loads — allow extra time for cold Supabase or slow networks */
export const ENTITY_GET_TIMEOUT_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps an async operation with a timeout and optional retry.
 * Use for data fetches to avoid long hangs (e.g. cold Supabase) and surface errors.
 * @param {() => Promise<T>} fn - Function that returns the promise (e.g. () => Promise.all([...]))
 * @param {number} timeoutMs - Timeout in ms (default 10000; use 15000+ for cold starts)
 * @param {number} retries - Number of retries on timeout or failure (default 2)
 * @returns {Promise<T>}
 */
export async function withTimeoutRetry(fn, timeoutMs = 10000, retries = 2) {
  const run = () => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      Promise.resolve(fn())
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const backoffMs = Math.min(2500, 400 * 2 ** attempt);
        console.warn(
          `Fetch attempt ${attempt + 1} failed (${err?.message || err}), retrying in ${backoffMs}ms…`
        );
        await sleep(backoffMs);
      } else {
        console.error("Fetch failed after retries:", err?.message || err);
      }
    }
  }
  throw lastError;
}
