import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";

/** Profile postgres_changes — only mounted inside {@link AuthenticatedShell}. */
export default function ProfileRealtimeBridge() {
  const { user, refreshUser } = useAuth();

  useSupabaseRealtime(
    user?.id ? ["profiles"] : [],
    useCallback(() => {
      refreshUser();
    }, [refreshUser]),
    { channelName: "auth-profile-updates" }
  );

  return null;
}
