/**
 * Auth bootstrap: after this, RequireAuth shows retry instead of an infinite spinner (8–10s band).
 */
export const AUTH_BOOTSTRAP_FAILSAFE_MS = 9000;

/**
 * Default ceiling for “stuck loading” UI when an async chain never settles (hung fetch, deadlock).
 */
export const DEFAULT_LOADING_FAILSAFE_MS = 5000;

/**
 * If `asyncWork` does not finish by `maxMs`, forces `setLoading(false)` once.
 * Always call the returned disposer in `finally` (and on effect cleanup) so the timer is cleared when work completes.
 *
 * @param {React.Dispatch<React.SetStateAction<boolean>> | ((loading: boolean) => void)} setLoading
 * @param {number} [maxMs=DEFAULT_LOADING_FAILSAFE_MS]
 * @returns {() => void} Call to clear the fail-safe timeout
 */
export function startLoadingFailSafe(setLoading, maxMs = DEFAULT_LOADING_FAILSAFE_MS) {
  const id = setTimeout(() => {
    setLoading(false);
  }, maxMs);
  return function clearLoadingFailSafe() {
    clearTimeout(id);
  };
}
