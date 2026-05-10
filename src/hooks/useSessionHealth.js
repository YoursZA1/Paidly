import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
export { SESSION_STATUS };

export function useSessionHealth() {
  const status = useSessionHealthStore((s) => s.status) || SESSION_STATUS.CONNECTED;

  return {
    status,
    isConnected: status === SESSION_STATUS.CONNECTED,
    isReconnecting: status === SESSION_STATUS.RECONNECTING,
    isUnstable: status === SESSION_STATUS.UNSTABLE,
    isDegraded: status === SESSION_STATUS.DEGRADED,
    isReauthRequired: status === SESSION_STATUS.REAUTH_REQUIRED,
    isExpired: status === SESSION_STATUS.EXPIRED,
  };
}

