import { QueryClient } from '@tanstack/react-query';

/**
 * Single factory for the app QueryClient — same defaults everywhere (dev entry, tests, future SSR).
 * Keeps stale/gc windows aligned with navigation patterns (cache hits when moving between main screens).
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 2,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
  });
}
