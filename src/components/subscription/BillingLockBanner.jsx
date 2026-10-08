import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";
import { MARKETING_PLANS } from "@shared/planMarketing.js";

/**
 * Shown while a company's subscription no longer grants access.
 *
 * The account stays usable read-only: existing data, settings and billing remain reachable.
 * Creating, editing, deleting, and sending are refused until they subscribe or an admin
 * extends the trial. The pay button on this banner stays available.
 */
export default function BillingLockBanner({ plan, planLabel, statusLabel }) {
  const billingUrl = `${createPageUrl("Settings")}?tab=subscription`;
  const heading = planLabel
    ? `Your ${planLabel} ${String(statusLabel || "").toLowerCase().includes("trial") ? "trial" : "subscription"} has ended`
    : "Your subscription has ended";

  // Known, self-serve package → "Pay [Package] — R[price]/mo" (real catalog price, never hardcoded).
  // Unknown package, or Enterprise (contact-sales, no self-serve price) → generic CTA.
  const marketingPlan = plan ? MARKETING_PLANS[plan] : null;
  const ctaLabel =
    marketingPlan && !marketingPlan.contactSales
      ? `Pay ${marketingPlan.name} — R${marketingPlan.monthlyPriceZar}/mo`
      : "Choose a plan";

  return (
    <div
      role="status"
      data-billing-allow
      className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
    >
      <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{heading}</p>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Your data is still here to view. Subscribe to create, edit, or send anything.
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0 rounded-xl">
        <Link to={billingUrl}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}
