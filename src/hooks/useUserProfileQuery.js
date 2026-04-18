import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";

/**
 * Example reusable data hook: current user's profile row.
 * Returns a single profile object (or null) from react-query state.
 */
export function useUserProfileQuery() {
  const { user, authReady } = useAuth();
  const userId = getAuthUserId(user);

  const query = useSupabaseQuery({
    queryKey: ["profile", userId],
    table: "profiles",
    select: "*",
    match: userId ? { id: userId } : undefined,
    enabled: authReady && Boolean(userId),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    profile: Array.isArray(query.data) ? query.data[0] || null : null,
  };
}
