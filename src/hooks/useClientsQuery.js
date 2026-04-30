import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useClientsList } from "@/hooks/useClientsList";
import { useInvoices } from "@/hooks/useInvoices";
import { getInvoiceListQueryKey } from "@/services/InvoiceListService";

/**
 * Clients page: clients + invoices with shared infinite-query caches
 * (`['clients','list',userId]` and `['invoices','list',filters,userId]`).
 */
export function useClientsQuery(options = {}) {
  const { user, clientsBootstrap = [], invoicesBootstrap = [] } = options;
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const cq = useClientsList(user);
  const iq = useInvoices({ userId, filters: {} });

  const clients = useMemo(() => {
    if (cq.clients.length > 0 || !cq.loading) return cq.clients;
    return Array.isArray(clientsBootstrap) ? clientsBootstrap : [];
  }, [cq.clients, cq.loading, clientsBootstrap]);

  const invoices = useMemo(() => {
    if (iq.invoices.length > 0 || !iq.loading) return iq.invoices;
    return Array.isArray(invoicesBootstrap) ? invoicesBootstrap : [];
  }, [iq.invoices, iq.loading, invoicesBootstrap]);

  const isLoading = cq.loading || iq.loading;

  const isError = cq.isError && iq.isError;
  const error = cq.error || iq.error;

  const isRefetching =
    (cq.isFetching && !cq.loading) || (iq.isFetching && !iq.loading);

  const refetch = useCallback(async () => {
    await Promise.all([cq.refetch(), iq.refetch()]);
    const cPages = userId
      ? queryClient.getQueryData(["clients", "list", userId])
      : null;
    const iPages = userId
      ? queryClient.getQueryData(getInvoiceListQueryKey({}, userId))
      : null;
    const cFlat = cPages?.pages?.flat?.() ?? [];
    const iFlat = iPages?.pages?.flat?.() ?? [];
    return {
      data: {
        clients: cFlat,
        invoices: iFlat,
        user: null,
      },
    };
  }, [cq.refetch, iq.refetch, queryClient, userId]);

  const data = useMemo(
    () => ({
      clients,
      invoices,
      user: null,
    }),
    [clients, invoices]
  );

  return {
    data,
    clients,
    invoices,
    isLoading,
    isError,
    error,
    isRefetching,
    refetch,
    fetchNextClientsPage: cq.fetchNextPage,
    hasNextClientsPage: cq.hasNextPage,
    isFetchingNextClientsPage: cq.isFetchingNextPage,
    fetchNextInvoicesPage: iq.fetchNextPage,
    hasNextInvoicesPage: iq.hasNextPage,
    isFetchingNextInvoicesPage: iq.isFetchingNextPage,
  };
}
