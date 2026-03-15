import { useQuery } from '@tanstack/react-query';
import { Client, Invoice, User } from '@/api/entities';
import { withTimeoutRetry } from '@/utils/fetchWithTimeout';
import { withApiLogging, getCurrentPage } from '@/utils/apiLogger';

const CLIENT_LIST_KEY = ['clients'];
const TIMEOUT_MS = 20000;
const RETRIES = 2;

async function fetchClientsAndInvoices() {
  const page = getCurrentPage();
  return withApiLogging(
    'clients.list',
    () =>
      withTimeoutRetry(
        () =>
          Promise.all([
            Client.list('-created_date'),
            Invoice.list('-created_date'),
            User.me(),
          ]),
        TIMEOUT_MS,
        RETRIES
      ),
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
      const [clientsData, invoicesData, userData] = await fetchClientsAndInvoices();
      return {
        clients: clientsData || [],
        invoices: invoicesData || [],
        user: userData,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    ...options,
  });
}
