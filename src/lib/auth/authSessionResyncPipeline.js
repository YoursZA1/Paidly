import { isRefreshSuccess } from "@/lib/session/refreshResult";
import { useRuntimeCoordinator } from "@/core/runtime/RuntimeCoordinator";

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
  const rc = useRuntimeCoordinator.getState();
  const startedRecovery = rc.beginAuthRecovery();
  try {
    const refreshResult = await refreshSession({ silent, bypassThrottle });
    // Terminal or non-success refresh outcomes must not fan out into resync/bootstrap/entity work.
    if (!isRefreshSuccess(refreshResult)) {
      if (startedRecovery && useRuntimeCoordinator.getState().phase === "AUTH_RECOVERING") {
        rc.endAuthRecoverySuccess();
      }
      return refreshResult;
    }
    await refreshUser();
    await afterProfileHydrated();
    if (startedRecovery) {
      rc.endAuthRecoverySuccess();
    }
    return refreshResult;
  } catch (e) {
    if (startedRecovery) {
      rc.endAuthRecoveryFatal(e?.message || "session_resync_failed");
    }
    throw e;
  }
}
