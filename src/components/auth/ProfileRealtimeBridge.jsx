import { useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";

const REFRESH_DEBOUNCE_MS = 600;

/** Profile postgres_changes — only mounted inside {@link AuthenticatedShell}. */
export default function ProfileRealtimeBridge() {
  const { user, refreshUser } = useAuth();
  const timerRef = useRef(null);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void refreshUser();
    }, REFRESH_DEBOUNCE_MS);
  }, [refreshUser]);

  useSupabaseRealtime(
    user?.id ? ["profiles"] : [],
    scheduleRefresh,
    { channelName: "auth-profile-updates" }
  );

  return null;
}
