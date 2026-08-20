import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeDashboardSubscriptionBanner } from "../../../shared/subscriptionDashboardCopy.js";

function ctaHref(ctaTo) {
  if (ctaTo === "billing") return createPageUrl("BillingAndInvoices");
  return `${createPageUrl("Settings")}?tab=subscription`;
}

const TONE_CLASS = {
  positive:
    "border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-500/10",
  warning:
    "border-amber-500/30 bg-amber-500/10",
  neutral:
    "border-border/70 bg-muted/40",
};

/**
 * Display-only subscription status. Access control remains server-side.
 */
export default function DashboardSubscriptionBanner({
  serverStatus = null,
  profileFallback = null,
  isLoading = false,
  className = "",
}) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "mb-4 sm:mb-5 h-[4.5rem] animate-pulse rounded-xl border border-border/70 bg-muted/40",
          className
        )}
        aria-hidden
      />
    );
  }

  const source = serverStatus && typeof serverStatus === "object"
    ? serverStatus
    : profileFallback && typeof profileFallback === "object"
      ? {
          status: profileFallback.subscription_status || profileFallback.status,
          plan: profileFallback.subscription_plan || profileFallback.plan,
          trialStartAt: profileFallback.trial_started_at || profileFallback.trialStartAt,
          trialEndAt: profileFallback.trial_ends_at || profileFallback.trialEndAt,
          trial_ends_at: profileFallback.trial_ends_at,
          subscription_source: profileFallback.subscription_source,
          admin_override: profileFallback.admin_override,
          managedByAdministrator:
            profileFallback.subscription_source === "admin" ||
            profileFallback.admin_override === true,
          nextBillingDate: profileFallback.next_billing_date,
        }
      : null;

  if (!source) return null;

  const copy = serverStatus?.presentation?.heading
    ? serverStatus.presentation
    : describeDashboardSubscriptionBanner(source);

  if (!copy?.heading) return null;

  const href = ctaHref(copy.ctaTo);

  return (
    <div
      className={cn(
        "mb-4 sm:mb-5 flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-3",
        TONE_CLASS[copy.tone] || TONE_CLASS.neutral,
        className
      )}
      data-subscription-banner={copy.kind}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground sm:text-[15px]">{copy.heading}</p>
        {copy.supporting ? (
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{copy.supporting}</p>
        ) : null}
        {copy.countdown ? (
          <p className="mt-1 text-xs font-medium tabular-nums text-foreground sm:text-sm">
            {copy.countdown}
          </p>
        ) : null}
      </div>
      {copy.ctaLabel ? (
        <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
          <Link to={href}>{copy.ctaLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
