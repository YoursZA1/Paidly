import { useQuery } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';

export function useCurrentUser() {
  const { data: user, isLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => paidly.auth.me(),
    retry: false,
  });

  return { user, isLoading };
}
