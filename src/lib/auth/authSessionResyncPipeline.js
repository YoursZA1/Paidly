import { isRefreshSuccess } from "@/lib/session/refreshResult";

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
  const refreshResult = await refreshSession({ silent, bypassThrottle });
  // Terminal or non-success refresh outcomes must not fan out into resync/bootstrap/entity work.
  if (!isRefreshSuccess(refreshResult)) {
    return refreshResult;
  }
  await refreshUser();
  await afterProfileHydrated();
  return refreshResult;
}
