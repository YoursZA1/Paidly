import { useSyncExternalStore } from "react";
import { CONNECTION_STATUS, useConnectionStore } from "@/stores/useConnectionStore";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import {
  derivePosConnectivity,
  posCheckoutAllowed,
  posOfflineCheckoutMessage,
  posServerWriteAllowed,
  POS_CONNECTIVITY,
} from "@/lib/pos/posConnectivity";
import { getPosAccessToken } from "@/lib/pos/posAccessClient";

function subscribeNavigatorOnline(onStoreChange) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getNavigatorOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export function usePosConnectivity() {
  const navigatorOnline = useSyncExternalStore(
    subscribeNavigatorOnline,
    getNavigatorOnline,
    () => true
  );
  const connectionStatus = useConnectionStore((s) => s.status) || CONNECTION_STATUS.CONNECTED;
  const sessionHealth = useSessionHealthStore((s) => s.status) || SESSION_STATUS.CONNECTED;
  const posPassActive = Boolean(getPosAccessToken());
  const sessionStatus = posPassActive ? SESSION_STATUS.CONNECTED : sessionHealth;

  const state = derivePosConnectivity({
    navigatorOnline,
    connectionStatus,
    sessionStatus,
  });

  return {
    state,
    online: state === POS_CONNECTIVITY.ONLINE,
    checkoutAllowed: posCheckoutAllowed(state),
    serverWriteAllowed: posServerWriteAllowed(state),
    blockedReason: posOfflineCheckoutMessage(state),
  };
}
