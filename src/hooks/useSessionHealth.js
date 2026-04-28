import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
export { SESSION_STATUS };

export function useSessionHealth() {
  const status = useSessionHealthStore((s) => s.status) || SESSION_STATUS.CONNECTED;

  return {
    status,
    isConnected: status === SESSION_STATUS.CONNECTED,
    isReconnecting: status === SESSION_STATUS.RECONNECTING,
    isExpired: status === SESSION_STATUS.EXPIRED,
  };
}

