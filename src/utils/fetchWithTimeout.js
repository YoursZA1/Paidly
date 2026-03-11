/**
 * Wraps an async operation with a timeout and optional retry.
 * Use for data fetches to avoid long hangs (e.g. cold Supabase) and surface errors.
 * @param {() => Promise<T>} fn - Function that returns the promise (e.g. () => Promise.all([...]))
 * @param {number} timeoutMs - Timeout in ms (default 5000)
 * @param {number} retries - Number of retries on timeout or failure (default 1)
 * @returns {Promise<T>}
 */
export async function withTimeoutRetry(fn, timeoutMs = 5000, retries = 1) {
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
        console.warn(`Fetch attempt ${attempt + 1} failed (${err?.message || err}), retrying...`);
      } else {
        console.error("Fetch failed after retries:", err?.message || err);
      }
    }
  }
  throw lastError;
}
