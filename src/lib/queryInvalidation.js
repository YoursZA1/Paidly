/**
 * Scoped TanStack Query invalidation — prefer over broad `['invoices']` roots.
 * @see src/core/query/queryPolicies.ts
 */

/**
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {{ scopeKey?: string | null, invoiceId?: string | null }} opts
 *   scopeKey — typically signed-in user id (org proxy until org is on user profile).
 */
export function invalidateInvoiceDomain(queryClient, opts = {}) {
  const { scopeKey, invoiceId } = opts;
  if (scopeKey) {
    queryClient.invalidateQueries({ queryKey: ["invoice-list", scopeKey], exact: false });
  }
  if (invoiceId) {
    queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId], exact: false });
    queryClient.invalidateQueries({ queryKey: ["invoices", "detail", invoiceId], exact: false });
  }
  /** Paginated list hook (`useInvoices` / InvoiceListService) */
  queryClient.invalidateQueries({ queryKey: ["invoices", "list"], exact: false });
  /** Legacy roots — remove after hook migration completes */
  queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
  invalidateRevenueReadModels(queryClient);
}

/**
 * Cash Flow + Reports share the `cashflow-page` read model.
 * Call after expense/payment mutations so KPIs, ledgers, and reports stay aligned.
 */
export function invalidateRevenueReadModels(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
}

/**
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {{ scopeKey?: string | null, skipInvoiceCascade?: boolean }} [opts]
 *   skipInvoiceCascade — when true, only invalidates client queries.
 *   Use when the caller has already called invalidateInvoiceDomain separately to avoid double-invalidation.
 */
export function invalidateClientDomain(queryClient, opts = {}) {
  const { scopeKey, skipInvoiceCascade = false } = opts;
  if (scopeKey) {
    queryClient.invalidateQueries({ queryKey: ["client-list", scopeKey], exact: false });
  }
  queryClient.invalidateQueries({ queryKey: ["clients"], exact: false });
  if (!skipInvoiceCascade) {
    invalidateInvoiceDomain(queryClient, { scopeKey });
  }
}
