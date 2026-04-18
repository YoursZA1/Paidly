import { useEffect, useRef, useCallback } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useConnectionStore } from "@/stores/useConnectionStore";
import { runSupabaseHealthCheck } from "@/components/connection/connectionHealth";
import { useAuth } from "@/contexts/AuthContext";

const POLL_MS = 5000;
const CONNECTED_VISIBLE_MS = 3200;

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
  const prevOkRef = useRef(true);

  const runCheck = useCallback(async () => {
    if (!isSupabaseConfigured || typeof window === "undefined") return;

    if (!navigator.onLine) {
      prevOkRef.current = false;
      setConnectionState({
        status: "disconnected",
        lastError: "You appear to be offline.",
        lastCheckAt: Date.now(),
      });
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const wasDisconnected = useConnectionStore.getState().status === "disconnected";
    if (wasDisconnected || !prevOkRef.current) {
      setConnectionState({ status: "reconnecting", lastError: null });
    }

    try {
      const { ok, error } = await runSupabaseHealthCheck();
      prevOkRef.current = ok;
      if (ok) {
        setConnectionState({
          status: "connected",
          lastError: null,
          lastCheckAt: Date.now(),
        });
      } else {
        setConnectionState({
          status: "disconnected",
          lastError: error?.message || "Could not reach Paidly services.",
          lastCheckAt: Date.now(),
        });
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [setConnectionState]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    void runCheck();
    const id = window.setInterval(() => void runCheck(), POLL_MS);

    const onOnline = () => {
      setConnectionState({ status: "reconnecting", lastError: null });
      void runCheck();
    };
    const onOffline = () => {
      prevOkRef.current = false;
      setConnectionState({
        status: "disconnected",
        lastError: "You appear to be offline.",
        lastCheckAt: Date.now(),
      });
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [runCheck, setConnectionState]);

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
