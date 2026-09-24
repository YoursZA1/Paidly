import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { hasSessionAccessToken } from "@/lib/authUserId";

export const MY_SUBSCRIPTIONS_QUERY_ROOT = "my-subscriptions";

const MY_SUBSCRIPTIONS_SELECT =
  "id, user_id, plan, current_plan, status, amount, custom_price, billing_cycle, provider, next_billing_date, last_payment_at, created_at, updated_at, start_date, payfast_subscription_id";

/**
 * A failed subscription-history read. Keeps the PostgREST / Postgres fields
 * (`code` is the SQLSTATE, e.g. 42501 permission denied, 42703 unknown column)
 * so the billing page can show them instead of an empty history.
 */
export class SubscriptionHistoryError extends Error {
  constructor(source) {
    const message = String(source?.message || source || "Unknown error");
    super(message);
    this.name = "SubscriptionHistoryError";
    this.code = source?.code ? String(source.code) : null;
    this.details = source?.details ?? null;
    this.hint = source?.hint ?? null;
  }
}

/**
 * Own rows in `public.subscriptions` for the signed-in Supabase user.
 * RLS `subscriptions_user_select_own` (user_id = auth.uid()) is the security boundary;
 * the explicit filter keeps the query index-backed and the check below catches policy drift.
 */
export async function fetchMySubscriptions(client, authUserId) {
  if (!authUserId) {
    throw new SubscriptionHistoryError({ code: "NOT_AUTHENTICATED", message: "No signed-in Supabase user" });
  }
  const { data, error } = await client
    .from("subscriptions")
    .select(MY_SUBSCRIPTIONS_SELECT)
    .eq("user_id", authUserId)
    .order("created_at", { ascending: false });

  if (error) {
    const err = new SubscriptionHistoryError(error);
    console.error("[billing] subscription history query failed", {
      code: err.code,
      message: err.message,
      details: err.details,
      hint: err.hint,
    });
    throw err;
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.some((row) => row?.user_id !== authUserId)) {
    const err = new SubscriptionHistoryError({
      code: "FOREIGN_ROWS",
      message: "Subscription history returned rows owned by another user; refusing to display them.",
    });
    console.error("[billing]", err.message);
    throw err;
  }
  return rows;
}

/**
 * Current user's subscription agreements for Billing & Invoices.
 * Waits for a real Supabase session (JWT) and keys on its `user.id` — the value `auth.uid()` sees.
 */
export function useMySubscriptionsQuery() {
  const { session, authReady } = useAuth();
  const hasToken = hasSessionAccessToken(session);
  const authUserId = hasToken ? session?.user?.id || null : null;

  const query = useQuery({
    queryKey: [MY_SUBSCRIPTIONS_QUERY_ROOT, authUserId],
    queryFn: () => fetchMySubscriptions(supabase, authUserId),
    enabled: Boolean(authUserId),
    staleTime: 60_000,
    retry: false,
  });

  return {
    ...query,
    /** Auth still bootstrapping — render the loading state, not "no records". */
    isAwaitingAuth: !authReady,
    /** Auth finished without a Supabase session — nothing to query. */
    isSignedOut: Boolean(authReady) && !authUserId,
  };
}
