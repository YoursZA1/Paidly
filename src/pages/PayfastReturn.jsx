import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { hasActivePaidSubscription, isProPlan } from "@/lib/subscriptionPlan";

/**
 * PayFast return_url landing — used for /return and /success after completing checkout.
 * Refreshes auth + invalidates profile caches so upgrade/downgrade shows everywhere without a full reload.
 * Reads `profiles` (same as `select("*").eq("id", user.id).single()`) via `useUserProfileQuery` for unlock UI.
 */
export default function PayfastReturn() {
  const { refreshUser, user } = useAuth();
  const queryClient = useQueryClient();
  const { profile, isFetching, refetch: refetchProfile } = useUserProfileQuery();

  const paidActive = useMemo(() => hasActivePaidSubscription(profile), [profile]);
  const proUnlocked = useMemo(
    () => paidActive && isProPlan(profile),
    [paidActive, profile]
  );

  useEffect(() => {
    let cancelled = false;

    const bumpCaches = () => {
      if (cancelled) return;
      void queryClient.invalidateQueries({ queryKey: ["current-user"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    };

    const sync = async () => {
      try {
        await refreshUser();
      } finally {
        bumpCaches();
        if (!cancelled) void refetchProfile();
      }
    };

    void sync();

    let polls = 0;
    const maxPolls = 12;
    const intervalMs = 4000;
    const id = setInterval(() => {
      polls += 1;
      void sync();
      if (polls >= maxPolls) clearInterval(id);
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshUser, queryClient, refetchProfile]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-gradient-to-b from-orange-50/80 to-background dark:from-orange-950/20">
      <div className="max-w-md w-full text-center space-y-6 rounded-3xl border border-orange-100 dark:border-orange-900/40 bg-card p-8 shadow-lg">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-orange-500" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payment received</h1>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            Thanks — PayFast has returned you to Paidly. We are refreshing your account in the background while
            PayFast confirms payment (usually within a minute). Open the app below; your dashboard and subscription
            settings should show the new tier shortly.
          </p>
          {user?.id && paidActive && (
            <p className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-100">
              <span className="font-semibold">Subscription active.</span> Your profile is updated — paid features in
              the app use this plan.
            </p>
          )}
          {user?.id && proUnlocked && (
            <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
              Pro-tier plan unlocked (SME / Corporate or higher).
            </p>
          )}
          {user?.id && !paidActive && isFetching && (
            <p className="mt-4 text-xs text-muted-foreground">Checking your plan…</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="rounded-2xl font-semibold">
            <Link to={createPageUrl("Settings")}>Open subscription settings</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link to={createPageUrl("Home")}>Back to home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
