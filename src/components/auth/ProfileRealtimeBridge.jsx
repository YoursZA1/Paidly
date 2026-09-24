import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { SUBSCRIPTION_CURRENT_QUERY_ROOT } from "@/hooks/useCurrentSubscriptionQuery";

const REFRESH_DEBOUNCE_MS = 600;

/** Profile postgres_changes — only mounted inside {@link AuthenticatedShell}. */
export default function ProfileRealtimeBridge() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const timerRef = useRef(null);

  // Every subscription write (admin package change, activation, payment, expiry) is mirrored into
  // each member's profile by the DB trigger, so a profile event is the signal to re-read the
  // company entitlement: plan changes reach logged-in users without a refresh.
  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void refreshUser();
      void queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_CURRENT_QUERY_ROOT] });
    }, REFRESH_DEBOUNCE_MS);
  }, [refreshUser, queryClient]);

  useSupabaseRealtime(
    user?.id ? ["profiles"] : [],
    scheduleRefresh,
    { channelName: "auth-profile-updates" }
  );

  return null;
}
