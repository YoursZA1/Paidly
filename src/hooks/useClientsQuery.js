import { useQuery } from '@tanstack/react-query';
import { Client, Invoice } from '@/api/entities';
import { withTimeoutRetry } from '@/utils/fetchWithTimeout';
import { withApiLogging, getCurrentPage } from '@/utils/apiLogger';

const CLIENT_LIST_KEY = ['clients'];
/** Allow pullFromSupabase to finish on cold/slow Supabase (was 12s → empty cache + failed refresh). */
const LIST_OPTS = { limit: 100, maxWaitMs: 60000 };
/** Per-entity cap: session + org + query can exceed 30s on poor networks. */
const PER_LIST_TIMEOUT_MS = 120000;
const PER_LIST_RETRIES = 1;

async function fetchClientsAndInvoices() {
  const page = getCurrentPage();
  return withApiLogging(
    'clients.list',
    async () => {
      // Fetch in parallel but tolerate partial failure: do not fail the whole page if one list times out.
      const [cRes, iRes] = await Promise.allSettled([
        withTimeoutRetry(() => Client.list('-created_date', LIST_OPTS), PER_LIST_TIMEOUT_MS, PER_LIST_RETRIES),
        withTimeoutRetry(() => Invoice.list('-created_date', LIST_OPTS), PER_LIST_TIMEOUT_MS, PER_LIST_RETRIES),
      ]);
      const clients = cRes.status === 'fulfilled' ? cRes.value : [];
      const invoices = iRes.status === 'fulfilled' ? iRes.value : [];
      if (cRes.status === 'rejected' && iRes.status === 'rejected') {
        const err = cRes.reason || iRes.reason;
        throw err instanceof Error ? err : new Error(String(err || 'Unable to load clients'));
      }
      return [clients, invoices];
    },
    page
  );
}

/**
 * Single source of truth for Clients page: clients + invoices + user.
 * Cached 60s, one request per mount/refetch.
 */
export function useClientsQuery(options = {}) {
  return useQuery({
    queryKey: CLIENT_LIST_KEY,
    queryFn: async () => {
      const [clientsData, invoicesData] = await fetchClientsAndInvoices();
      return {
        clients: clientsData || [],
        invoices: invoicesData || [],
        user: null,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 15000),
    ...options,
  });
}
