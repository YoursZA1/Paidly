import { useQuery } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { useAuth } from '@/contexts/AuthContext';
import { PAIDLY_STALE_MS } from '@/lib/paidlyClientCachePolicy';

export function useCurrentUser() {
  const { user: authUser, loading: authLoading, authReady } = useAuth();
  const { data: queriedUser, isLoading: queryLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => paidly.auth.me(),
    enabled: authReady && !authUser && !authLoading,
    retry: false,
    staleTime: PAIDLY_STALE_MS.userProfile,
  });

  return {
    user: authUser || queriedUser || null,
    isLoading: authLoading || !authReady || (!authUser && queryLoading),
  };
}
