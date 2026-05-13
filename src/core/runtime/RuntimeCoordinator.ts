import { create } from "zustand";

/**
 * Single authority for **runtime coordination** (auth readiness, network, reconnect debounce,
 * sync/realtime policy hooks). Integrate incrementally — see `docs/architecture-improvement-plan.md`.
 *
 * One store instance per browser tab (module singleton).
 */
export type RuntimePhase =
  | "BOOTING"
  | "AUTH_RECOVERING"
  | "SESSION_READY"
  | "OFFLINE"
  | "RECONNECTING"
  | "SYNCING"
  | "DEGRADED"
  | "ERROR";

const RECONNECT_DEBOUNCE_MS = 400;
const RECONNECT_BACKOFF_CAP_MS = 30_000;
const RECONNECT_BACKOFF_MAX_EXPONENT = 7;

function reconnectDelayMs(attempt: number): number {
  const n = Math.min(RECONNECT_BACKOFF_MAX_EXPONENT, Math.max(0, attempt));
  return Math.min(RECONNECT_BACKOFF_CAP_MS, RECONNECT_DEBOUNCE_MS * 2 ** n);
}

type Listener = (phase: RuntimePhase, prev: RuntimePhase) => void;

let externalListeners: Listener[] = [];

function notify(phase: RuntimePhase, prev: RuntimePhase) {
  for (const fn of externalListeners) {
    try {
      fn(phase, prev);
    } catch {
      /* ignore listener errors */
    }
  }
}

type RuntimeCoordinatorState = {
  phase: RuntimePhase;
  /** Monotonic ms — for metrics / debugging */
  lastTransitionAt: number;
  /** Single-flight guard for auth recovery flows */
  authRecoveryInFlight: boolean;
  /** Single-flight guard for transport reconnect orchestration */
  reconnectInFlight: boolean;
  reconnectAttempt: number;
  reconnectTimerId: ReturnType<typeof setTimeout> | null;
  lastError: string | null;
  /** When true, prefer pausing non-critical HTTP (RequestCoordinator reads this) */
  pauseNonCriticalRequests: boolean;

  setPhase: (next: RuntimePhase, reason?: string) => void;
  /** Returns false if auth recovery already running */
  beginAuthRecovery: () => boolean;
  endAuthRecoverySuccess: () => void;
  endAuthRecoveryFatal: (message?: string) => void;

  setOnline: (online: boolean) => void;
  /** Debounced transition to RECONNECTING; coalesces burst online/offline events */
  scheduleReconnecting: () => void;
  completeReconnecting: (ok: boolean) => void;

  setSyncActive: (active: boolean) => void;
  setDegraded: (degraded: boolean, reason?: string) => void;

  resetForColdStart: () => void;
  /** Call when initial shell is ready and auth is not in a recovery flight */
  markBootstrapReady: () => void;
};

function now() {
  return Date.now();
}

export const useRuntimeCoordinator = create<RuntimeCoordinatorState>((set, get) => ({
  phase: "BOOTING",
  lastTransitionAt: now(),
  authRecoveryInFlight: false,
  reconnectInFlight: false,
  reconnectAttempt: 0,
  reconnectTimerId: null,
  lastError: null,
  pauseNonCriticalRequests: false,

  setPhase: (next, reason) => {
    const prev = get().phase;
    if (prev === next) return;
    set({
      phase: next,
      lastTransitionAt: now(),
      lastError: reason ?? get().lastError,
      pauseNonCriticalRequests:
        next === "RECONNECTING" || next === "AUTH_RECOVERING" || next === "BOOTING",
    });
    notify(next, prev);
  },

  beginAuthRecovery: () => {
    if (get().authRecoveryInFlight) return false;
    const prev = get().phase;
    set({
      authRecoveryInFlight: true,
      phase: "AUTH_RECOVERING",
      lastTransitionAt: now(),
      pauseNonCriticalRequests: true,
      lastError: null,
    });
    notify("AUTH_RECOVERING", prev);
    return true;
  },

  endAuthRecoverySuccess: () => {
    const prev = get().phase;
    set({
      authRecoveryInFlight: false,
      phase: "SESSION_READY",
      lastTransitionAt: now(),
      pauseNonCriticalRequests: false,
      lastError: null,
    });
    notify("SESSION_READY", prev);
  },

  endAuthRecoveryFatal: (message) => {
    const prev = get().phase;
    set({
      authRecoveryInFlight: false,
      phase: "ERROR",
      lastTransitionAt: now(),
      pauseNonCriticalRequests: true,
      lastError: message ?? "auth_fatal",
    });
    notify("ERROR", prev);
  },

  setOnline: (online) => {
    const prev = get().phase;
    if (online) {
      if (prev === "OFFLINE") {
        get().scheduleReconnecting();
      }
    } else {
      const t = get().reconnectTimerId;
      if (t) globalThis.clearTimeout(t);
      set({
        reconnectTimerId: null,
        phase: "OFFLINE",
        lastTransitionAt: now(),
        pauseNonCriticalRequests: true,
        reconnectInFlight: false,
        reconnectAttempt: 0,
      });
      notify("OFFLINE", prev);
    }
  },

  scheduleReconnecting: () => {
    const t = get().reconnectTimerId;
    if (t) globalThis.clearTimeout(t);
    const delay = reconnectDelayMs(get().reconnectAttempt);
    const id = globalThis.setTimeout(() => {
      const prev = get().phase;
      if (get().reconnectInFlight) return;
      set({
        reconnectTimerId: null,
        reconnectInFlight: true,
        phase: "RECONNECTING",
        lastTransitionAt: now(),
        pauseNonCriticalRequests: true,
      });
      notify("RECONNECTING", prev);
    }, delay);
    set({ reconnectTimerId: id });
  },

  completeReconnecting: (ok) => {
    const prev = get().phase;
    const t = get().reconnectTimerId;
    if (t) globalThis.clearTimeout(t);
    set({
      reconnectTimerId: null,
      reconnectInFlight: false,
      reconnectAttempt: ok ? 0 : get().reconnectAttempt + 1,
      phase: ok ? "SESSION_READY" : "DEGRADED",
      lastTransitionAt: now(),
      pauseNonCriticalRequests: !ok,
      lastError: ok ? null : get().lastError,
    });
    notify(ok ? "SESSION_READY" : "DEGRADED", prev);
  },

  setSyncActive: (active) => {
    const prev = get().phase;
    if (active) {
      if (get().phase === "SESSION_READY" || get().phase === "DEGRADED") {
        set({ phase: "SYNCING", lastTransitionAt: now() });
        notify("SYNCING", prev);
      }
    } else if (get().phase === "SYNCING") {
      const next = get().lastError ? "DEGRADED" : "SESSION_READY";
      set({ phase: next, lastTransitionAt: now() });
      notify(next, prev);
    }
  },

  setDegraded: (degraded, reason) => {
    const prev = get().phase;
    if (!degraded) {
      if (get().phase === "DEGRADED") {
        set({ phase: "SESSION_READY", lastError: null, lastTransitionAt: now() });
        notify("SESSION_READY", prev);
      }
      return;
    }
    if (get().phase === "ERROR" || get().phase === "AUTH_RECOVERING") return;
    set({
      phase: "DEGRADED",
      lastError: reason ?? "degraded",
      lastTransitionAt: now(),
    });
    notify("DEGRADED", prev);
  },

  resetForColdStart: () => {
    const t = get().reconnectTimerId;
    if (t) globalThis.clearTimeout(t);
    const prev = get().phase;
    set({
      phase: "BOOTING",
      lastTransitionAt: now(),
      authRecoveryInFlight: false,
      reconnectInFlight: false,
      reconnectAttempt: 0,
      reconnectTimerId: null,
      lastError: null,
      pauseNonCriticalRequests: true,
    });
    notify("BOOTING", prev);
  },

  markBootstrapReady: () => {
    if (get().phase !== "BOOTING") return;
    const prev = get().phase;
    set({
      phase: "SESSION_READY",
      lastTransitionAt: now(),
      pauseNonCriticalRequests: false,
      lastError: null,
    });
    notify("SESSION_READY", prev);
  },
}));

/** Non-React access for modules that must not import the hook. */
export function getRuntimeCoordinatorSnapshot() {
  return useRuntimeCoordinator.getState();
}

export function subscribeRuntimeCoordinator(listener: Listener) {
  externalListeners.push(listener);
  return () => {
    externalListeners = externalListeners.filter((l) => l !== listener);
  };
}
