import { useEffect, useRef, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_MS = 60_000;
const MIN_WRITE_GAP_MS = 25_000;

/**
 * Writes lightweight heartbeat activity to profiles (last_active_at + last_active_path)
 * for admin-side user behavior visibility.
 */
export default function SessionActivityBeacon() {
  const { session, isAuthenticated, authUserId, authReady } = useAuth();
  const lastWriteAtRef = useRef(0);
  const inFlightRef = useRef(false);

  const writeHeartbeat = useCallback(
    async (force = false) => {
      if (!isSupabaseConfigured) return;
      const userId = authUserId || session?.user?.id || null;
      if (!authReady || !isAuthenticated || !userId) return;
      if (typeof window !== "undefined" && document.visibilityState === "hidden" && !force) return;
      if (inFlightRef.current) return;

      const now = Date.now();
      if (!force && now - lastWriteAtRef.current < MIN_WRITE_GAP_MS) return;
      inFlightRef.current = true;
      try {
        const path =
          typeof window !== "undefined"
            ? `${window.location.pathname || "/"}${window.location.search || ""}`
            : "/";
        const { error } = await supabase
          .from("profiles")
          .update({ last_active_at: new Date(now).toISOString(), last_active_path: path })
          .eq("id", userId);
        if (!error) {
          lastWriteAtRef.current = now;
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [isAuthenticated, authReady, authUserId, session?.user?.id]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !authReady || !isAuthenticated || !(authUserId || session?.user?.id)) {
      return undefined;
    }

    void writeHeartbeat(true);
    const intervalId = window.setInterval(() => void writeHeartbeat(false), HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void writeHeartbeat(true);
      }
    };
    const onFocus = () => void writeHeartbeat(true);
    const onPointer = () => void writeHeartbeat(false);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("keydown", onPointer);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onPointer);
    };
  }, [isAuthenticated, authReady, authUserId, session?.user?.id, writeHeartbeat]);

  return null;
}
