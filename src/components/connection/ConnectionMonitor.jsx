import { useEffect, useRef, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  hasPaidlyRealtimeWork,
  isPaidlyRealtimeMainChannelJoined,
  kickPaidlyRealtimeIfNeededOnMonitorMount,
  notifyPaidlyRealtimeNavigatorOnline,
  subscribePaidlyMainChannelStatus,
} from "@/lib/realtime/paidlyRealtimeManager";
import { CONNECTION_STATUS, useConnectionStore } from "@/stores/useConnectionStore";
import { runSupabaseHealthCheck } from "@/components/connection/connectionHealth";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { useAuth } from "@/contexts/AuthContext";
import { useConnectionLifecycle } from "@/contexts/ConnectionLifecycleContext";
import { useAuthGatedConnectedSignal } from "@/lib/connection/connectionLifecycleStore";

const CONNECTED_VISIBLE_MS = 3200;

/**
 * Mount once near the app root (under {@link AuthProvider}):
 * - Polls Supabase health + browser online/offline → {@link useConnectionStore} `status` / errors.
 * - Drives `suppressConnectedIndicator` so the brief “connected” header flash stays correct when
 *   {@link ConnectionStatusIndicator} is mounted twice (mobile + desktop rows).
 *
 * Realtime multiplex rebuilds and backoff are owned by {@link paidlyRealtimeManager} — this component
 * only maps transport status to connection UX (no parallel reconnect timers).
 */
export default function ConnectionMonitor() {
  const { isAuthenticated } = useAuth();
  const connectionLifecycle = useConnectionLifecycle();
  const sessionManager = connectionLifecycle?.connectionMonitor
    ? { ConnectionMonitor: connectionLifecycle.connectionMonitor }
    : null;
  const sessionStatus = useSessionHealthStore((s) => s.status);
  const sessionReason = useSessionHealthStore((s) => s.reason);
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const status = useConnectionStore((s) => s.status);
  const lastError = useConnectionStore((s) => s.lastError);
  const setSuppressConnectedIndicator = useConnectionStore((s) => s.setSuppressConnectedIndicator);
  const canShowConnected = useAuthGatedConnectedSignal();
  const inFlightRef = useRef(false);
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

  const kickedRealtimeRef = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    void runCheck();

    const unsubMainStatus = subscribePaidlyMainChannelStatus((evt) => {
      if (evt === "SUBSCRIBED") {
        if (isPaidlyRealtimeMainChannelJoined()) {
          markConnected();
        }
        return;
      }
      if (evt === "CLOSED" || evt === "CHANNEL_ERROR" || evt === "TIMED_OUT") {
        if (!hasPaidlyRealtimeWork()) return;
        // Transport recovery + backoff live in paidlyRealtimeManager (subscribe callback). Calling
        // requestPaidlyRealtimeErrorRecovery here duplicated work on the main thread while failing.
        scheduleDegradedTransition("Realtime connection interrupted.");
      }
    });

    const onOnline = () => {
      notifyPaidlyRealtimeNavigatorOnline();
      void runCheck();
    };
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
        return;
      }
      sessionManager?.ConnectionMonitor?.onVisible();
      if (currentVisibility === "visible") {
        void runCheck();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (!kickedRealtimeRef.current) {
      kickedRealtimeRef.current = true;
      kickPaidlyRealtimeIfNeededOnMonitorMount();
    }

    return () => {
      unsubMainStatus();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sessionManager?.ConnectionMonitor?.dispose();
    };
  }, [
    connectionLifecycle,
    markConnected,
    runCheck,
    scheduleDegradedTransition,
    sessionManager,
    setConnectionState,
  ]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    const mapped = sessionManager?.ConnectionMonitor?.mapSessionHealthToConnection({
      sessionStatus,
      sessionReason,
    });
    if (!mapped) return undefined;
    if (mapped.status === CONNECTION_STATUS.CONNECTED) {
      markConnected();
      return undefined;
    }
    setConnectionState({ ...mapped, lastCheckAt: Date.now() });
    return undefined;
  }, [markConnected, sessionManager, sessionReason, sessionStatus, setConnectionState]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    if (status !== CONNECTION_STATUS.CONNECTED) {
      setSuppressConnectedIndicator(true);
      return undefined;
    }
    if (!isAuthenticated || !canShowConnected) {
      setSuppressConnectedIndicator(true);
      return undefined;
    }

    setSuppressConnectedIndicator(false);
    const t = window.setTimeout(() => setSuppressConnectedIndicator(true), CONNECTED_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [status, lastError, isAuthenticated, canShowConnected, setSuppressConnectedIndicator]);

  return null;
}
