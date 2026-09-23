import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLANS, PUBLIC_SELF_SERVE_MONTHLY_SLUGS, familyForSlug } from "@/lib/plans.js";
import { MARKETING_PLANS } from "@shared/planMarketing.js";
import { offerablePlans, resolveUpgradeTarget, PLAN_FAMILY_LABEL } from "@shared/planUpgrade.js";
import { useEntitlementAccess } from "@/hooks/useEntitlementAccess";
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

function familyFromSlug(slug) {
  return familyForSlug(slug) || String(slug || "").replace(/_monthly$|_annual$/, "");
}

/**
 * Plan picker + PayFast subscribe per tier. Controlled by `useUpgradeModalStore` via `UpgradeModalHost`.
 * Uses the current self-serve monthly catalog only (no grandfathered plans, no Enterprise checkout).
 * Tiers start from the company's package: above it while it grants access; it and above once lapsed
 * (renew). A Business or Growth company is never offered Starter here.
 */
export default function UpgradeModal({ open, onOpenChange, featureKey, title, description }) {
  const ent = useEntitlementAccess();
  const planInput = {
    currentPlan: ent.subscribedPlan || null,
    accessGranted: ent.accessGranted === true,
    featureKey: typeof featureKey === "string" && featureKey ? featureKey : null,
  };
  // A trial is the same package on a clock: offer it so the company can keep it after the trial.
  const trialing = Boolean(ent.accessGranted && ent.trialing);
  const offerInput = { ...planInput, accessGranted: planInput.accessGranted && !trialing };
  const slugs = PUBLIC_SELF_SERVE_MONTHLY_SLUGS.filter((slug) =>
    offerablePlans(offerInput, [familyFromSlug(slug)]).length > 0
  );
  const target = resolveUpgradeTarget(planInput);
  const currentLabel = planInput.currentPlan ? PLAN_FAMILY_LABEL[planInput.currentPlan] : null;

  const featureLabel =
    featureKey && typeof featureKey === "string"
      ? FEATURE_LABELS[featureKey] || featureKey.replace(/_/g, " ")
      : null;

  const heading =
    title ||
    (target.action === "renew"
      ? `Renew ${target.planLabel}`
      : featureLabel
        ? `Unlock ${featureLabel}`
        : currentLabel && ent.accessGranted
          ? "Upgrade your plan"
          : "Choose your plan");
  const sub =
    description ||
    (target.action === "renew"
      ? `Your ${target.planLabel} access has ended. Subscribe to continue — or move up a tier. Pay securely with PayFast.`
      : featureLabel
        ? `Subscribe on a tier that includes ${featureLabel.toLowerCase()}. Pay securely with PayFast.`
        : currentLabel && ent.accessGranted
          ? `You're on ${currentLabel}. Pick a higher tier. Pay securely with PayFast.`
          : "Pick the tier that fits you. Pay securely with PayFast.");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[min(90vh,880px)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl sm:text-2xl">{heading}</DialogTitle>
          <DialogDescription className="text-left text-base">{sub}</DialogDescription>
        </DialogHeader>

        {slugs.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            {currentLabel ? `You're already on ${currentLabel}, our highest self-serve plan.` : "No self-serve plan fits."}{" "}
            Contact sales for {PLAN_FAMILY_LABEL.enterprise}.
          </p>
        ) : null}
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          {slugs.map((slug) => {
            const plan = PLANS[slug];
            const family = familyFromSlug(slug);
            const copy = MARKETING_PLANS[family];
            const isRecommended = Boolean(copy?.highlighted);
            return (
              <div
                key={slug}
                className={`flex flex-col rounded-2xl border bg-card p-4 shadow-sm ${
                  isRecommended ? "border-orange-500/60 ring-2 ring-orange-500/25" : "border-border"
                }`}
              >
                {copy?.badge ? (
                  <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                    <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                    {copy.badge}
                  </p>
                ) : (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {family === planInput.currentPlan ? "Your plan" : family === "starter" ? "Entry" : "Top tier"}
                  </p>
                )}
                <h3 className="text-lg font-bold text-foreground">{copy?.name || plan.name}</h3>
                <p className="mt-1 text-2xl font-black tabular-nums">
                  R{plan.price}
                  <span className="text-sm font-normal text-muted-foreground"> / mo</span>
                </p>
                <p className="mt-2 min-h-[2.5rem] text-sm text-muted-foreground">{copy?.description || ""}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-xs text-muted-foreground">
                  {(copy?.features || []).map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  <PayFastSubscriptionForm
                    planSlug={slug}
                    planName={copy?.name || plan.name}
                    displayPriceZar={plan.price}
                    ctaLabel={
                      family === planInput.currentPlan
                        ? `${trialing ? "Keep" : "Renew"} ${copy?.name || plan.name}`
                        : planInput.currentPlan
                          ? "Upgrade"
                          : "Subscribe"
                    }
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
