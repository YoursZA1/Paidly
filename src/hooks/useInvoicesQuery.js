import { useQuery } from '@tanstack/react-query';
import { Invoice, Client } from '@/api/entities';
import { withTimeoutRetry } from '@/utils/fetchWithTimeout';
import { withApiLogging, getCurrentPage } from '@/utils/apiLogger';

const INVOICES_LIST_KEY = ['invoices'];
const TIMEOUT_MS = 15000;
const RETRIES = 2;

async function fetchInvoicesAndClients() {
  const page = getCurrentPage();
  return withApiLogging(
    'invoices.list',
    () =>
      withTimeoutRetry(
        () =>
          Promise.all([
            Invoice.list('-created_date'),
            Client.list('-created_date'),
          ]),
        TIMEOUT_MS,
        RETRIES
      ),
    page
  );
}

/**
 * Single fetch for Invoices page: invoices + clients (for filters).
 * Cached 60s.
 */
export function useInvoicesQuery(options = {}) {
  return useQuery({
    queryKey: INVOICES_LIST_KEY,
    queryFn: async () => {
      const [invoicesData, clientsData] = await fetchInvoicesAndClients();
      return {
        invoices: invoicesData || [],
        clients: clientsData || [],
      };
    },
    staleTime: 60 * 1000,
    ...options,
  });
}
