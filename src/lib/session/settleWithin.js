/**
 * Resolve with the promise's value, or with `fallback` once `ms` passes — whichever is first.
 * Never rejects. For teardown and session checks that must not be able to hang the UI.
 * @template T
 * @param {Promise<T> | (() => Promise<T>)} work
 * @param {number} ms
 * @param {T} [fallback]
 * @returns {Promise<T>}
 */
export function settleWithin(work, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
  });
  let promise;
  try {
    promise = Promise.resolve(typeof work === "function" ? work() : work).catch(() => fallback);
  } catch {
    promise = Promise.resolve(fallback);
  }
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
