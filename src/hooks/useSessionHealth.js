import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export const SESSION_STATUS = {
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  EXPIRED: "expired",
};

export function useSessionHealth() {
  const [status, setStatus] = useState(SESSION_STATUS.CONNECTED);
  const reconnectTimeout = useRef(null);
  const channelRef = useRef(null);

  // ---------------------------
  // SESSION CHECK
  // ---------------------------
  const refreshSession = async () => {
    const { data } = await supabase.auth.refreshSession();

    if (data?.session) {
      setStatus(SESSION_STATUS.CONNECTED);
    } else {
      setStatus(SESSION_STATUS.EXPIRED);
      // optional: trigger logout
      window.location.href = "/login";
    }
  };

  const silentSessionCheck = async () => {
    const { data } = await supabase.auth.getSession();

    if (data?.session) {
      setStatus(SESSION_STATUS.CONNECTED);
    } else {
      await refreshSession();
    }
  };

  // ---------------------------
  // REALTIME CONNECTION
  // ---------------------------
  const triggerReconnecting = () => {
    if (document.hidden) return; // CRITICAL FIX

    clearTimeout(reconnectTimeout.current);

    reconnectTimeout.current = setTimeout(() => {
      setStatus(SESSION_STATUS.RECONNECTING);
    }, 2000);
  };

  const pingServer = async () => {
    if (document.hidden) return;

    try {
      await fetch("/api/health");
    } catch {
      triggerReconnecting();
    }
  };

  const connectRealtime = () => {
    if (channelRef.current) return;

    const channel = supabase.channel("system-health");

    channel.on("system", {}, () => {}).subscribe((state) => {
      if (state === "SUBSCRIBED") {
        setStatus(SESSION_STATUS.CONNECTED);
      }

      if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        triggerReconnecting();
      }
    });

    channelRef.current = channel;
  };

  const disconnectRealtime = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  };

  // ---------------------------
  // TAB VISIBILITY HANDLING
  // ---------------------------
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.hidden) {
        disconnectRealtime();
      } else {
        connectRealtime();
        await silentSessionCheck();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // ---------------------------
  // INITIAL LOAD
  // ---------------------------
  useEffect(() => {
    connectRealtime();
    void silentSessionCheck();

    return () => {
      clearTimeout(reconnectTimeout.current);
      disconnectRealtime();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void pingServer();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    status,
    isConnected: status === SESSION_STATUS.CONNECTED,
    isReconnecting: status === SESSION_STATUS.RECONNECTING,
    isExpired: status === SESSION_STATUS.EXPIRED,
  };
}

