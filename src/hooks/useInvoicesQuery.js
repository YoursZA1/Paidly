import { useQuery } from '@tanstack/react-query';
import { Invoice, Client } from '@/api/entities';
import { runDedupedAsync } from '@/lib/inflightRequestDedupe';
import { withTimeoutRetry } from '@/utils/fetchWithTimeout';
import { withApiLogging, getCurrentPage } from '@/utils/apiLogger';
import { PAIDLY_STALE_MS } from '@/lib/paidlyClientCachePolicy';
import { queryKeys, listQueryDefaults } from '@/core/query/queryPolicies';
import { useAuth } from '@/contexts/AuthContext';

/** @deprecated Broad key — use queryKeys.invoiceList(scopeKey) */
export const INVOICES_LIST_KEY = ['invoices'];
const TIMEOUT_MS = 30000;
const RETRIES = 1;
const LIST_OPTS = { limit: 100, maxWaitMs: 12000 };

async function fetchInvoicesAndClients() {
  const page = getCurrentPage();
  return runDedupedAsync(
    `Invoice+Client.list:100:12k:30k:1`,
    () =>
      withApiLogging(
        'invoices.list',
        () =>
          withTimeoutRetry(
            () =>
              Promise.all([
                Invoice.list('-created_date', LIST_OPTS),
                Client.list('-created_date', LIST_OPTS),
              ]),
            TIMEOUT_MS,
            RETRIES
          ),
        page
      )
  );
}

/**
 * Single fetch for Invoices page: invoices + clients (for filters).
 * `staleTime` matches `PAIDLY_STALE_MS.invoices` (see `paidlyClientCachePolicy.js`).
 */
export function useInvoicesQuery(options = {}) {
  const { user } = useAuth();
  const scopeKey = user?.id ?? "_guest";
  const defaults = listQueryDefaults();
  return useQuery({
    ...options,
    queryKey: queryKeys.invoiceList(scopeKey, "with-clients"),
    queryFn: async () => {
      const [invoicesData, clientsData] = await fetchInvoicesAndClients();
      return {
        invoices: invoicesData || [],
        clients: clientsData || [],
      };
    },
    staleTime: options.staleTime ?? PAIDLY_STALE_MS.invoices,
    gcTime: options.gcTime ?? defaults.gcTime,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? defaults.refetchOnWindowFocus,
    enabled: options.enabled ?? Boolean(user?.id),
  });
}
