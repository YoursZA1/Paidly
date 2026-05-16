import { getRuntimeCoordinatorSnapshot } from "@/core/runtime/RuntimeCoordinator";
import { assertWakeRecoveryAllowsMutations } from "@/lib/wakeRecoveryGuard";

/**
 * Block EntityManager writes during wake recovery and session reconnect/auth recovery.
 * Reads (list/get) remain allowed so the UI can show cached data while recovering.
 */
export function assertRuntimeAllowsMutations() {
  assertWakeRecoveryAllowsMutations();
  const { phase, pauseNonCriticalRequests } = getRuntimeCoordinatorSnapshot();
  if (!pauseNonCriticalRequests) return;
  if (phase === "AUTH_RECOVERING" || phase === "RECONNECTING" || phase === "BOOTING") {
    const error = new Error("Session is reconnecting. Please try again in a moment.");
    error.code = "SESSION_RECOVERING";
    throw error;
  }
}
