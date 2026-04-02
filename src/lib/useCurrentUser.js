import { useQuery } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { useAuth } from '@/components/auth/AuthContext';

export function useCurrentUser() {
  const { user: authUser, loading: authLoading } = useAuth();
  const { data: queriedUser, isLoading: queryLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => paidly.auth.me(),
    enabled: !authUser && !authLoading,
    retry: false,
    staleTime: 60_000,
  });

  return {
    user: authUser || queriedUser || null,
    isLoading: authLoading || (!authUser && queryLoading),
  };
}
