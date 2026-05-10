/**
 * Body registered with {@link registerSessionRefreshExecutor} in AuthProvider.
 *
 * @param {object} o
 * @param {boolean} o.silent
 * @param {(opts?: object) => Promise<unknown>} o.refreshSession
 * @param {() => Promise<void>} o.refreshUser
 * @param {() => void | Promise<void>} o.afterProfileHydrated — realtime nudge + route invariant
 */
export async function runSessionRefreshExecutorPipeline({
  silent,
  bypassThrottle = false,
  refreshSession,
  refreshUser,
  afterProfileHydrated,
}) {
  await refreshSession({ silent, bypassThrottle });
  await refreshUser();
  await afterProfileHydrated();
}
