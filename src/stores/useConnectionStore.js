import { create } from "zustand";

/**
 * Real-time app connectivity + Supabase session/API reachability.
 * @typedef {'connected' | 'reconnecting' | 'disconnected'} ConnectionStatus
 */
export const CONNECTION_STATUS = {
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  DISCONNECTED: "disconnected",
};

export const useConnectionStore = create((set) => ({
  /** Last known connectivity to Supabase (auth + optional DB ping). Browser offline forces disconnected. */
  status: CONNECTION_STATUS.CONNECTED,
  /** Short message for disconnected UI / tooling */
  lastError: null,
  lastCheckAt: null,
  /**
   * When true, hide the brief “connected” affordance for signed-in users (single source of truth; avoids duplicate timers from two header mounts).
   * @see ConnectionMonitor (header flash timing)
   */
  suppressConnectedIndicator: true,

  setConnectionState: (partial) => set(partial),

  setSuppressConnectedIndicator: (suppressConnectedIndicator) => set({ suppressConnectedIndicator }),

  reset: () =>
    set({
      status: CONNECTION_STATUS.CONNECTED,
      lastError: null,
      lastCheckAt: null,
      suppressConnectedIndicator: true,
    }),
}));
