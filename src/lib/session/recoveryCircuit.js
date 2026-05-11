import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { isConnectionLifecycleAuthInvalid } from "@/lib/connection/connectionLifecycleRegistry";

/**
 * Terminal auth states where silent recovery is no longer valid.
 * - `EXPIRED`: authority already decided logout/reauth terminal path.
 * - `REAUTH_REQUIRED`: refresh token/session is not recoverable silently.
 */
export function isRecoveryCircuitOpen() {
  if (isConnectionLifecycleAuthInvalid()) return true;
  const status = useSessionHealthStore.getState().status;
  return status === SESSION_STATUS.EXPIRED || status === SESSION_STATUS.REAUTH_REQUIRED;
}

