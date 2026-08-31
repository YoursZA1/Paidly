import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLANS, PUBLIC_SELF_SERVE_MONTHLY_SLUGS } from "@/lib/plans.js";
import PayFastSubscriptionForm from "./PayFastSubscriptionForm";

const FEATURE_LABELS = {
  quotes: "Quotes",
  clients: "Clients",
  invoices: "Invoices",
  email: "Email sending",
  templates: "Templates",
  basic_reports: "Basic reports",
  advanced_reports: "Advanced reports",
};

function tierHint(slug) {
  if (slug === "starter_monthly") return "Entry — get started";
  if (slug === "business_monthly") return "Best for growing teams";
  if (slug === "growth_monthly") return "Full capability";
  return "";
}

/**
 * Plan picker + PayFast subscribe per tier. Controlled by `useUpgradeModalStore` via `UpgradeModalHost`.
 * Uses the current self-serve monthly catalog only (no grandfathered plans, no Enterprise checkout).
 */
export default function UpgradeModal({ open, onOpenChange, featureKey, title, description }) {
  const featureLabel =
    featureKey && typeof featureKey === "string"
      ? FEATURE_LABELS[featureKey] || featureKey.replace(/_/g, " ")
      : null;

  const heading =
    title ||
    (featureLabel ? `Unlock ${featureLabel}` : "Choose your plan");
  const sub =
    description ||
    (featureLabel
      ? `Subscribe on a tier that includes ${featureLabel.toLowerCase()}. Pay securely with PayFast.`
      : "Pick the tier that fits you. Pay securely with PayFast.");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[min(90vh,880px)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl sm:text-2xl">{heading}</DialogTitle>
          <DialogDescription className="text-left text-base">{sub}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          {PUBLIC_SELF_SERVE_MONTHLY_SLUGS.map((slug) => {
            const plan = PLANS[slug];
            const isRecommended = slug === "business_monthly";
            return (
              <div
                key={slug}
                className={`flex flex-col rounded-2xl border bg-card p-4 shadow-sm ${
                  isRecommended ? "border-orange-500/60 ring-2 ring-orange-500/25" : "border-border"
                }`}
              >
                {isRecommended ? (
                  <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                    <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                    Recommended
                  </p>
                ) : (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {slug === "starter_monthly" ? "Entry" : "Top tier"}
                  </p>
                )}
                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-2xl font-black tabular-nums">
                  R{plan.price}
                  <span className="text-sm font-normal text-muted-foreground"> / mo</span>
                </p>
                <p className="mt-2 min-h-[2.5rem] text-sm text-muted-foreground">{tierHint(slug)}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-xs text-muted-foreground">
                  {plan.features.slice(0, 5).map((f) => (
                    <li key={f}>· {FEATURE_LABELS[f] || f.replace(/_/g, " ")}</li>
                  ))}
                  {plan.features.length > 5 ? (
                    <li className="text-muted-foreground/80">+ more</li>
                  ) : null}
                </ul>
                <div className="mt-4">
                  <PayFastSubscriptionForm
                    planSlug={slug}
                    planName={plan.name}
                    displayPriceZar={plan.price}
                    ctaLabel="Subscribe"
                    className="w-full"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
