import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLANS, PLAN_SLUGS } from "@shared/plans.js";
import { payfastAmountZar } from "@/data/paidlySubscriptionPlans";
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
  if (slug === "individual") return "Entry — get started";
  if (slug === "sme") return "Best for growing teams";
  if (slug === "corporate") return "Full capability";
  return "";
}

/**
 * Plan picker + PayFast subscribe per tier. Controlled by `useUpgradeModalStore` via `UpgradeModalHost`.
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
          {PLAN_SLUGS.map((slug) => {
            const plan = PLANS[slug];
            const isSme = slug === "sme";
            return (
              <div
                key={slug}
                className={`flex flex-col rounded-2xl border bg-card p-4 shadow-sm ${
                  isSme ? "border-orange-500/60 ring-2 ring-orange-500/25" : "border-border"
                }`}
              >
                {isSme ? (
                  <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                    <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                    Recommended
                  </p>
                ) : (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {slug === "individual" ? "Entry" : "Top tier"}
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
                    amountZar={payfastAmountZar(plan.name)}
                    planName={plan.name}
                    itemDescription={`Paidly ${plan.name} — monthly`}
                    ctaLabel={`Pay — ${plan.name}`}
                    submitVariant="button"
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
