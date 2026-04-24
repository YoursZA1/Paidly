import { useEffect, useRef, useCallback } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { useConnectionStore } from "@/stores/useConnectionStore";
import { runSupabaseHealthCheck } from "@/components/connection/connectionHealth";
import { useAuth } from "@/contexts/AuthContext";

const POLL_MS = 5000;
const CONNECTED_VISIBLE_MS = 3200;
const RECONNECTING_GRACE_MS = 3000;
const DISCONNECTED_AFTER_MS = 10000;

/**
 * Mount once near the app root (under {@link AuthProvider}):
 * - Polls Supabase health + browser online/offline → {@link useConnectionStore} `status` / errors.
 * - Drives `suppressConnectedIndicator` so the brief “connected” header flash stays correct when
 *   {@link ConnectionStatusIndicator} is mounted twice (mobile + desktop rows).
 */
export default function ConnectionMonitor() {
  const { isAuthenticated } = useAuth();
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const status = useConnectionStore((s) => s.status);
  const lastError = useConnectionStore((s) => s.lastError);
  const setSuppressConnectedIndicator = useConnectionStore((s) => s.setSuppressConnectedIndicator);
  const inFlightRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const disconnectedTimerRef = useRef(null);
  const degradedSinceRef = useRef(null);
  const hiddenStartedAtRef = useRef(null);
  const pendingDegradeReasonRef = useRef(null);
  const visibilityRef = useRef(typeof document === "undefined" ? "visible" : document.visibilityState);

  const clearDegradedTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (disconnectedTimerRef.current) {
      window.clearTimeout(disconnectedTimerRef.current);
      disconnectedTimerRef.current = null;
    }
  }, []);

  const markConnected = useCallback(() => {
    degradedSinceRef.current = null;
    hiddenStartedAtRef.current = null;
    pendingDegradeReasonRef.current = null;
    clearDegradedTimers();
    setConnectionState({
      status: "connected",
      lastError: null,
      lastCheckAt: Date.now(),
    });
  }, [clearDegradedTimers, setConnectionState]);

  const scheduleDegradedTransition = useCallback(
    (errorMessage = null) => {
      // Hidden tabs often suspend networking/realtime; do not degrade user-facing status while hidden.
      if (visibilityRef.current !== "visible") {
        if (degradedSinceRef.current == null) {
          degradedSinceRef.current = Date.now();
        }
        pendingDegradeReasonRef.current = errorMessage || "Could not reach Paidly services.";
        clearDegradedTimers();
        return;
      }
      pendingDegradeReasonRef.current = null;
      if (degradedSinceRef.current == null) {
        degradedSinceRef.current = Date.now();
      }
      const degradedForMs = Date.now() - degradedSinceRef.current;
      if (degradedForMs >= DISCONNECTED_AFTER_MS) {
        setConnectionState({
          status: "disconnected",
          lastError: errorMessage || "Could not reach Paidly services.",
          lastCheckAt: Date.now(),
        });
        return;
      }
      if (degradedForMs >= RECONNECTING_GRACE_MS) {
        setConnectionState({
          status: "reconnecting",
          lastError: null,
          lastCheckAt: Date.now(),
        });
      }
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          if (degradedSinceRef.current == null) return;
          if (visibilityRef.current !== "visible") return;
          setConnectionState({
            status: "reconnecting",
            lastError: null,
            lastCheckAt: Date.now(),
          });
        }, RECONNECTING_GRACE_MS);
      }
      if (!disconnectedTimerRef.current) {
        disconnectedTimerRef.current = window.setTimeout(() => {
          disconnectedTimerRef.current = null;
          if (degradedSinceRef.current == null) return;
          if (visibilityRef.current !== "visible") return;
          setConnectionState({
            status: "disconnected",
            lastError: errorMessage || "Could not reach Paidly services.",
            lastCheckAt: Date.now(),
          });
        }, DISCONNECTED_AFTER_MS);
      }
    },
    [setConnectionState]
  );

  const runCheck = useCallback(async () => {
    if (!isSupabaseConfigured || typeof window === "undefined") return;
    if (visibilityRef.current !== "visible") return;

    if (!navigator.onLine) {
      degradedSinceRef.current = Date.now();
      clearDegradedTimers();
      setConnectionState({
        status: "disconnected",
        lastError: "You appear to be offline.",
        lastCheckAt: Date.now(),
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
  }, [clearDegradedTimers, markConnected, scheduleDegradedTransition, setConnectionState]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    void runCheck();
    const id = window.setInterval(() => void runCheck(), POLL_MS);

    const onOnline = () => void runCheck();
    const onOffline = () => {
      degradedSinceRef.current = Date.now();
      clearDegradedTimers();
      setConnectionState({
        status: "disconnected",
        lastError: "You appear to be offline.",
        lastCheckAt: Date.now(),
      });
    };
    const onVisibilityChange = () => {
      visibilityRef.current = document.visibilityState;
      if (visibilityRef.current === "hidden") {
        hiddenStartedAtRef.current = Date.now();
        clearDegradedTimers();
        return;
      }
      if (hiddenStartedAtRef.current && degradedSinceRef.current != null) {
        const hiddenDurationMs = Math.max(0, Date.now() - hiddenStartedAtRef.current);
        // Pause degradation clock while hidden so short tab switches never become reconnect/disconnect states.
        degradedSinceRef.current += hiddenDurationMs;
      }
      hiddenStartedAtRef.current = null;
      if (visibilityRef.current === "visible") {
        if (pendingDegradeReasonRef.current) {
          scheduleDegradedTransition(pendingDegradeReasonRef.current);
        }
        void runCheck();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);

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

    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
      clearDegradedTimers();
    };
  }, [clearDegradedTimers, markConnected, runCheck, scheduleDegradedTransition, setConnectionState]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (status !== "connected") {
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
