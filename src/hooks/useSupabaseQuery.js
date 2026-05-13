import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { PAIDLY_STALE_MS } from "@/lib/paidlyClientCachePolicy";

/**
 * Reusable Supabase query hook.
 * Keeps data access logic in hooks and components lean.
 */
export function useSupabaseQuery({
  queryKey,
  table,
  select = "*",
  match,
  order,
  enabled = true,
  staleTime = PAIDLY_STALE_MS.invoices,
  retry = 1,
}) {
  return useQuery({
    queryKey,
    enabled,
    staleTime,
    retry,
    queryFn: async () => {
      let query = supabase.from(table).select(select);

      if (match && typeof match === "object") {
        query = query.match(match);
      }
      if (order?.column) {
        query = query.order(order.column, { ascending: order.ascending ?? false });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}
