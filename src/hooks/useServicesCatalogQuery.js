import { useQuery } from '@tanstack/react-query';
import { Service } from '@/api/entities';

/** Shared cache for Products & Services — used by Services page, invoices, quotes, recurring. */
export const SERVICES_CATALOG_QUERY_KEY = ['services', 'catalog'];

export const SERVICES_CATALOG_LIST_OPTS = { limit: 500 };

export async function fetchServicesCatalog() {
  const rows = await Service.list('-created_date', SERVICES_CATALOG_LIST_OPTS);
  return Array.isArray(rows) ? rows : [];
}

/**
 * Cached catalog list (up to 500 items). Mutations on the Services page should call
 * `invalidateServicesCatalog(queryClient)` so invoice/quote pickers update immediately.
 */
export function useServicesCatalogQuery(options = {}) {
  return useQuery({
    queryKey: SERVICES_CATALOG_QUERY_KEY,
    queryFn: fetchServicesCatalog,
    // Reuse list across pages without refetching on every navigation
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Overrides app default (refetchOnWindowFocus: false) so returning from another tab refreshes catalog
    refetchOnWindowFocus: true,
    ...options,
  });
}

export function invalidateServicesCatalog(queryClient) {
  return queryClient.invalidateQueries({ queryKey: SERVICES_CATALOG_QUERY_KEY });
}
