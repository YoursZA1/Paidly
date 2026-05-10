import { SESSION_STATUS } from "@/stores/sessionHealthStore";

let failureCount = 0;

export function resetSessionRecoveryEscalation() {
  failureCount = 0;
}

export function getSessionRecoveryFailureCount() {
  return failureCount;
}

/**
 * Monotonic ladder before terminal logout: CONNECTED → unstable → reconnecting → degraded → reauth_required → (expire).
 * @returns {{ status: string, forceTerminalLogout: boolean }}
 */
export function bumpSessionRecoveryEscalation() {
  failureCount += 1;
  if (failureCount === 1) {
    return { status: SESSION_STATUS.UNSTABLE, forceTerminalLogout: false };
  }
  if (failureCount === 2) {
    return { status: SESSION_STATUS.RECONNECTING, forceTerminalLogout: false };
  }
  if (failureCount === 3) {
    return { status: SESSION_STATUS.DEGRADED, forceTerminalLogout: false };
  }
  if (failureCount === 4) {
    return { status: SESSION_STATUS.REAUTH_REQUIRED, forceTerminalLogout: false };
  }
  return { status: SESSION_STATUS.REAUTH_REQUIRED, forceTerminalLogout: true };
}
