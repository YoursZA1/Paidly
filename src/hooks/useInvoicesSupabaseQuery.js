import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * Fetch invoices directly from Supabase (raw table access).
 * Use this as a reference for the useQuery + Supabase pattern.
 */
export const fetchInvoices = async () => {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_id, org_id, status, project_title, subtotal, total_amount, tax_amount, delivery_date, created_at, currency')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data;
};

/**
 * useQuery example: cached invoice list from Supabase.
 * queryKey: ['invoices'], staleTime: 60s.
 */
export function useInvoicesSupabaseQuery(options = {}) {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: fetchInvoices,
    staleTime: 60000,
    ...options,
  });
}
