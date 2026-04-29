const AUTH_SYNC_KEY = "paidly_auth_tab_sync_v1";

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createAuthTabSyncChannel() {
  const tabId = makeId();
  const listeners = new Set();
  const canBroadcast = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined";
  const channel = canBroadcast ? new BroadcastChannel("paidly-auth-sync") : null;

  const emit = (message) => {
    if (!message || message.sourceTabId === tabId) return;
    listeners.forEach((fn) => {
      try {
        fn(message);
      } catch {
        // ignore listener errors
      }
    });
  };

  const onBroadcastMessage = (event) => emit(event?.data);
  const onStorage = (event) => {
    if (event.key !== AUTH_SYNC_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue);
      emit(parsed);
    } catch {
      // ignore malformed payload
    }
  };

  if (channel) {
    channel.addEventListener("message", onBroadcastMessage);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }

  return {
    publish(type, payload = null) {
      const message = {
        id: makeId(),
        type,
        payload,
        sourceTabId: tabId,
        ts: Date.now(),
      };
      if (channel) {
        channel.postMessage(message);
      } else if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(AUTH_SYNC_KEY, JSON.stringify(message));
        } catch {
          // ignore storage write failures
        }
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      if (channel) {
        channel.removeEventListener("message", onBroadcastMessage);
        channel.close();
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
      listeners.clear();
    },
  };
}
