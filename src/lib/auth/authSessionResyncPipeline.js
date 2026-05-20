import { isRefreshSuccess } from "@/lib/session/refreshResult";
import { useRuntimeCoordinator } from "@/core/runtime/RuntimeCoordinator";

/**
 * Body registered with {@link registerSessionRefreshExecutor} in AuthProvider.
 * Syncs session from Supabase storage (no manual refreshSession).
 *
 * @param {object} o
 * @param {boolean} o.silent
 * @param {(opts?: object) => Promise<unknown>} o.syncSession
 * @param {() => Promise<void>} o.refreshUser
 * @param {() => void | Promise<void>} o.afterProfileHydrated
 */
export async function runSessionRefreshExecutorPipeline({
  silent,
  bypassThrottle = false,
  syncSession,
  refreshUser,
  afterProfileHydrated,
}) {
  const rc = useRuntimeCoordinator.getState();
  const startedRecovery = rc.beginAuthRecovery();
  try {
    const syncResult = await syncSession({ silent, bypassThrottle });
    if (!isRefreshSuccess(syncResult)) {
      if (startedRecovery && useRuntimeCoordinator.getState().phase === "AUTH_RECOVERING") {
        rc.endAuthRecoverySuccess();
      }
      return syncResult;
    }
    await refreshUser();
    await afterProfileHydrated();
    if (startedRecovery) {
      rc.endAuthRecoverySuccess();
    }
    return syncResult;
  } catch (e) {
    if (startedRecovery) {
      rc.endAuthRecoveryFatal(e?.message || "session_resync_failed");
    }
    throw e;
  }
}
