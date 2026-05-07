import { useEffect, useRef, useCallback } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { CONNECTION_STATUS, useConnectionStore } from "@/stores/useConnectionStore";
import { runSupabaseHealthCheck } from "@/components/connection/connectionHealth";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionManager } from "@/contexts/SessionManagerContext";

const CONNECTED_VISIBLE_MS = 3200;

/**
 * Mount once near the app root (under {@link AuthProvider}):
 * - Polls Supabase health + browser online/offline → {@link useConnectionStore} `status` / errors.
 * - Drives `suppressConnectedIndicator` so the brief “connected” header flash stays correct when
 *   {@link ConnectionStatusIndicator} is mounted twice (mobile + desktop rows).
 */
export default function ConnectionMonitor() {
  const { isAuthenticated } = useAuth();
  const sessionManager = useSessionManager();
  const sessionStatus = useSessionHealthStore((s) => s.status);
  const sessionReason = useSessionHealthStore((s) => s.reason);
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const status = useConnectionStore((s) => s.status);
  const lastError = useConnectionStore((s) => s.lastError);
  const setSuppressConnectedIndicator = useConnectionStore((s) => s.setSuppressConnectedIndicator);
  const inFlightRef = useRef(false);
  const realtimeChannelRef = useRef(null);
  const isVisible = useCallback(
    () => (typeof document === "undefined" ? true : document.visibilityState === "visible"),
    []
  );

  const markConnected = useCallback(() => {
    sessionManager?.ConnectionManager?.markConnected(setConnectionState);
  }, [sessionManager, setConnectionState]);

  const scheduleDegradedTransition = useCallback(
    (errorMessage = null) => {
      sessionManager?.ConnectionManager?.scheduleDegradedTransition({
        errorMessage,
        isVisible,
        getDecisionAction: (reason) => sessionManager?.AuthManager?.getDecision(reason)?.action,
        setConnectionState,
      });
    },
    [isVisible, sessionManager, setConnectionState]
  );

  const runCheck = useCallback(async () => {
    if (!isSupabaseConfigured || typeof window === "undefined") return;
    if (useSessionHealthStore.getState().status === SESSION_STATUS.EXPIRED) return;
    if (!isVisible()) return;

    if (!navigator.onLine) {
      sessionManager?.ConnectionManager?.setOffline({
        decisionAction: sessionManager?.AuthManager?.getDecision("offline")?.action,
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
  }, [isVisible, markConnected, scheduleDegradedTransition, sessionManager, setConnectionState]);

  const stopRealtime = useCallback(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  }, []);

  const reconnectRealtime = useCallback(() => {
    stopRealtime();
    const channel = supabase.channel("paidly-connection-monitor");
    channel.subscribe((evt) => {
      if (evt === "SUBSCRIBED") {
        markConnected();
        return;
      }
      if (evt === "CLOSED" || evt === "CHANNEL_ERROR" || evt === "TIMED_OUT") {
        scheduleDegradedTransition("Realtime connection interrupted.");
      }
    });
    realtimeChannelRef.current = channel;
  }, [markConnected, scheduleDegradedTransition, stopRealtime]);

  const startRealtime = useCallback(() => {
    if (useSessionHealthStore.getState().status === SESSION_STATUS.EXPIRED) return;
    const current = realtimeChannelRef.current;
    if (!current) {
      reconnectRealtime();
      return;
    }
    // Keep realtime reconnect logic clean: only reconnect when not joined.
    const state = String(current.state || "").toLowerCase();
    if (state !== "joined") {
      reconnectRealtime();
    }
  }, [reconnectRealtime]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    void runCheck();

    const onOnline = () => void runCheck();
    const onOffline = () => {
      sessionManager?.VisibilityManager?.onOffline("offline");
      sessionManager?.ConnectionManager?.setOffline({
        decisionAction: sessionManager?.AuthManager?.getDecision("offline")?.action,
        setConnectionState,
      });
    };
    const onVisibilityChange = () => {
      const currentVisibility = document.visibilityState;
      if (currentVisibility === "hidden") {
        sessionManager?.ConnectionManager?.onHidden();
        // Keep realtime/auth state intact while hidden; browser may throttle/suspend naturally.
        return;
      }
      sessionManager?.ConnectionManager?.onVisible();
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
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopRealtime();
      sessionManager?.ConnectionManager?.dispose();
    };
  }, [runCheck, sessionManager, setConnectionState, startRealtime, stopRealtime]);

  // Read-only subscription: map centralized auth session health to connection UX state.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const mapped = sessionManager?.ConnectionManager?.mapSessionHealthToConnection({
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
