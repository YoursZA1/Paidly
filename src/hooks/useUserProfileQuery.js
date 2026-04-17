import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Example reusable data hook: current user's profile row.
 * Returns a single profile object (or null) from react-query state.
 */
export function useUserProfileQuery() {
  const { user } = useAuth();
  const userId = user?.supabase_id || user?.auth_id || user?.id || null;

  const query = useSupabaseQuery({
    queryKey: ["profile", userId],
    table: "profiles",
    select: "*",
    match: userId ? { id: userId } : undefined,
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    profile: Array.isArray(query.data) ? query.data[0] || null : null,
  };
}
