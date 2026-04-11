import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Current user's rows in `public.subscriptions` (PayFast ITN writes). Requires RLS `subscriptions_user_select_own`.
 */
export function useMySubscriptionsQuery() {
  const { user } = useAuth();
  const userId = user?.supabase_id || user?.auth_id || user?.id || null;

  return useSupabaseQuery({
    queryKey: ["my-subscriptions", userId],
    table: "subscriptions",
    select:
      "id, plan, current_plan, status, amount, custom_price, billing_cycle, provider, next_billing_date, last_payment_at, created_at, updated_at, start_date, payfast_subscription_id",
    match: userId ? { user_id: userId } : undefined,
    order: { column: "created_at", ascending: false },
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}
