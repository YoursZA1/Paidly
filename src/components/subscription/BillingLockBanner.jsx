import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

/**
 * Shown while a company's subscription no longer grants access.
 *
 * The account stays usable read-only: existing data, settings and billing remain reachable.
 * Creating and editing is refused by the entitlement layer (server gates + the client write gate),
 * not by hiding this banner's buttons.
 */
export default function BillingLockBanner({ planLabel, statusLabel }) {
  const billingUrl = `${createPageUrl("Settings")}?tab=subscription`;
  const heading = planLabel
    ? `Your ${planLabel} ${String(statusLabel || "").toLowerCase().includes("trial") ? "trial" : "subscription"} has ended`
    : "Your subscription has ended";

  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
    >
      <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{heading}</p>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Your data is still here to view. Subscribe to continue creating and editing.
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0 rounded-xl">
        <Link to={billingUrl}>Choose a plan</Link>
      </Button>
    </div>
  );
}
