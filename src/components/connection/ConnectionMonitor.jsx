import { useEffect, useRef, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  hasPaidlyRealtimeWork,
  isPaidlyRealtimeMainChannelJoined,
  schedulePaidlyRealtimeRebuild,
  subscribePaidlyMainChannelStatus,
} from "@/lib/realtime/paidlyRealtimeManager";
import { CONNECTION_STATUS, useConnectionStore } from "@/stores/useConnectionStore";
import { runSupabaseHealthCheck } from "@/components/connection/connectionHealth";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionManager } from "@/contexts/SessionManagerContext";
import { useConnectionLifecycle } from "@/contexts/ConnectionLifecycleContext";

const CONNECTED_VISIBLE_MS = 3200;
const REALTIME_BASE_RECONNECT_MS = 1000;
const REALTIME_MAX_RECONNECT_MS = 30000;
const REALTIME_MAX_RECONNECT_ATTEMPTS = 6;

/**
 * Mount once near the app root (under {@link AuthProvider}):
 * - Polls Supabase health + browser online/offline → {@link useConnectionStore} `status` / errors.
 * - Drives `suppressConnectedIndicator` so the brief “connected” header flash stays correct when
 *   {@link ConnectionStatusIndicator} is mounted twice (mobile + desktop rows).
 */
export default function ConnectionMonitor() {
  const { isAuthenticated } = useAuth();
  const sessionManager = useSessionManager();
  const connectionLifecycle = useConnectionLifecycle();
  const sessionStatus = useSessionHealthStore((s) => s.status);
  const sessionReason = useSessionHealthStore((s) => s.reason);
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const status = useConnectionStore((s) => s.status);
  const lastError = useConnectionStore((s) => s.lastError);
  const setSuppressConnectedIndicator = useConnectionStore((s) => s.setSuppressConnectedIndicator);
  const inFlightRef = useRef(false);
  const realtimeReconnectAttemptsRef = useRef(0);
  const realtimeReconnectTimerRef = useRef(null);
  const isVisible = useCallback(
    () => (typeof document === "undefined" ? true : document.visibilityState === "visible"),
    []
  );

  const markConnected = useCallback(() => {
    sessionManager?.ConnectionMonitor?.markConnected(setConnectionState);
  }, [sessionManager, setConnectionState]);

  const scheduleDegradedTransition = useCallback(
    (errorMessage = null) => {
      sessionManager?.ConnectionMonitor?.scheduleDegradedTransition({
        errorMessage,
        isVisible,
        getDecisionAction: (reason) => connectionLifecycle?.getDecision(reason)?.action,
        setConnectionState,
      });
    },
    [connectionLifecycle, isVisible, sessionManager, setConnectionState]
  );

  const runCheck = useCallback(async () => {
    if (!isSupabaseConfigured || typeof window === "undefined") return;
    if (useSessionHealthStore.getState().status === SESSION_STATUS.EXPIRED) return;
    if (!isVisible()) return;

    if (!navigator.onLine) {
      sessionManager?.ConnectionMonitor?.setOffline({
        decisionAction: connectionLifecycle?.getDecision("offline")?.action,
        setConnectionState,
      });
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const { ok, error } = await runSupabaseHealthCheck();
      if (ok) {
        markConnected();
      } else {
        scheduleDegradedTransition(error?.message || "Could not reach Paidly services.");
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [
    connectionLifecycle,
    isVisible,
    markConnected,
    scheduleDegradedTransition,
    sessionManager,
    setConnectionState,
  ]);

  const clearRealtimeReconnectTimer = useCallback(() => {
    if (realtimeReconnectTimerRef.current && typeof window !== "undefined") {
      window.clearTimeout(realtimeReconnectTimerRef.current);
      realtimeReconnectTimerRef.current = null;
    }
  }, []);

  const resetRealtimeBackoff = useCallback(() => {
    realtimeReconnectAttemptsRef.current = 0;
    clearRealtimeReconnectTimer();
  }, [clearRealtimeReconnectTimer]);

  const scheduleRealtimeReconnect = useCallback((doReconnect) => {
    if (!isSupabaseConfigured || typeof window === "undefined") return;
    if (useSessionHealthStore.getState().status === SESSION_STATUS.EXPIRED) return;
    if (document.visibilityState !== "visible") return;
    if (realtimeReconnectTimerRef.current) return;

    const nextAttempt = realtimeReconnectAttemptsRef.current + 1;
    if (nextAttempt > REALTIME_MAX_RECONNECT_ATTEMPTS) {
      console.warn("[Realtime] Max reconnect attempts reached; pausing retries.");
      return;
    }
    realtimeReconnectAttemptsRef.current = nextAttempt;
    const delayMs = Math.min(
      REALTIME_MAX_RECONNECT_MS,
      REALTIME_BASE_RECONNECT_MS * 2 ** (nextAttempt - 1)
    );
    console.info("[Realtime] Scheduling reconnect", { attempt: nextAttempt, delayMs });
    realtimeReconnectTimerRef.current = window.setTimeout(() => {
      realtimeReconnectTimerRef.current = null;
      doReconnect?.();
    }, delayMs);
  }, []);

  const nudgeMainRealtimeChannel = useCallback(() => {
    schedulePaidlyRealtimeRebuild();
  }, []);

  const startRealtime = useCallback(() => {
    if (useSessionHealthStore.getState().status === SESSION_STATUS.EXPIRED) return;
    if (!hasPaidlyRealtimeWork()) {
      return;
    }
    if (isPaidlyRealtimeMainChannelJoined()) {
      resetRealtimeBackoff();
      return;
    }
    scheduleRealtimeReconnect(nudgeMainRealtimeChannel);
  }, [nudgeMainRealtimeChannel, resetRealtimeBackoff, scheduleRealtimeReconnect]);

  useEffect(() => {
    if (sessionStatus !== SESSION_STATUS.EXPIRED) return;
    resetRealtimeBackoff();
    clearRealtimeReconnectTimer();
    console.info("[RetryController] Halted realtime recovery because auth is EXPIRED.");
  }, [clearRealtimeReconnectTimer, resetRealtimeBackoff, sessionStatus]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    void runCheck();

    const unsubMainStatus = subscribePaidlyMainChannelStatus((evt) => {
      if (evt === "SUBSCRIBED") {
        resetRealtimeBackoff();
        markConnected();
        return;
      }
      if (evt === "CLOSED" || evt === "CHANNEL_ERROR" || evt === "TIMED_OUT") {
        if (!hasPaidlyRealtimeWork()) return;
        scheduleDegradedTransition("Realtime connection interrupted.");
        scheduleRealtimeReconnect(nudgeMainRealtimeChannel);
      }
    });

    const onOnline = () => void runCheck();
    const onOffline = () => {
      connectionLifecycle?.reportNetworkState(false, "offline");
      sessionManager?.ConnectionMonitor?.setOffline({
        decisionAction: connectionLifecycle?.getDecision("offline")?.action,
        setConnectionState,
      });
    };
    const onVisibilityChange = () => {
      const currentVisibility = document.visibilityState;
      if (currentVisibility === "hidden") {
        sessionManager?.ConnectionMonitor?.onHidden();
        // Keep realtime/auth state intact while hidden; browser may throttle/suspend naturally.
        return;
      }
      sessionManager?.ConnectionMonitor?.onVisible();
      if (currentVisibility === "visible") {
        startRealtime();
        void runCheck();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    startRealtime();

    return () => {
      unsubMainStatus();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearRealtimeReconnectTimer();
      sessionManager?.ConnectionMonitor?.dispose();
    };
  }, [
    clearRealtimeReconnectTimer,
    connectionLifecycle,
    markConnected,
    nudgeMainRealtimeChannel,
    resetRealtimeBackoff,
    runCheck,
    scheduleDegradedTransition,
    scheduleRealtimeReconnect,
    sessionManager,
    setConnectionState,
    startRealtime,
  ]);

  // Read-only subscription: map centralized auth session health to connection UX state.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const mapped = sessionManager?.ConnectionMonitor?.mapSessionHealthToConnection({
      sessionStatus,
      sessionReason,
    });
    if (!mapped) return;
    setConnectionState({
      ...mapped,
      lastCheckAt: Date.now(),
    });
  }, [sessionManager, sessionReason, sessionStatus, setConnectionState]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (status !== CONNECTION_STATUS.CONNECTED) {
      setSuppressConnectedIndicator(true);
      return;
    }
    if (!isAuthenticated) {
      setSuppressConnectedIndicator(true);
      return;
    }

    setSuppressConnectedIndicator(false);
    const t = window.setTimeout(() => setSuppressConnectedIndicator(true), CONNECTED_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [status, lastError, isAuthenticated, setSuppressConnectedIndicator]);

  return null;
}
