import { useAuth } from "@/contexts/AuthContext";

/**
 * Canonical profile selector.
 * Profile ownership lives in AuthContext session/bootstrap lifecycle.
 * This hook intentionally avoids issuing its own network query to prevent
 * duplicate profile reads on every page mount.
 */
export function useUserProfileQuery() {
  const { profile, authReady, refreshUser } = useAuth();
  const hasProfile = Boolean(profile?.id);

  return {
    profile: profile ?? null,
    data: profile ? [profile] : [],
    isLoading: !authReady,
    isPending: !authReady,
    isFetching: false,
    isSuccess: hasProfile,
    isError: false,
    error: null,
    async refetch() {
      await refreshUser();
      return { data: profile ? [profile] : [], error: null };
    },
  };
}
