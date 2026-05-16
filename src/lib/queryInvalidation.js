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
  /** Legacy roots — remove after hook migration completes */
  queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
  queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
}

/**
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {{ scopeKey?: string | null }} [opts]
 */
export function invalidateClientDomain(queryClient, opts = {}) {
  const { scopeKey } = opts;
  if (scopeKey) {
    queryClient.invalidateQueries({ queryKey: ["client-list", scopeKey], exact: false });
  }
  queryClient.invalidateQueries({ queryKey: ["clients"], exact: false });
  invalidateInvoiceDomain(queryClient, { scopeKey });
}
