import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { changeSubscriptionPlan } from "@/services/subscriptionCheckoutService";

function formatDate(iso) {
  if (!iso) return "your next billing date";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "your next billing date";
  }
}

/**
 * Switch plans on the existing PayFast recurring agreement (same card, no new checkout).
 * Upgrades apply now; downgrades apply from the next billing date. PayFast does not prorate,
 * so the new amount is charged from the next run date either way.
 */
export default function PlanSwitchButton({ planSlug, planName, priceLabel, direction, nextBillingDate, onChanged }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isUpgrade = direction !== "downgrade";

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await changeSubscriptionPlan({ planSlug });
      if (result?.changed) {
        toast({ title: isUpgrade ? `Upgraded to ${planName}` : `Downgrade scheduled`, description: result.message });
        setOpen(false);
        onChanged?.(result);
      }
      // Otherwise the service has redirected to PayFast checkout (no live agreement).
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Plan not changed",
        description: err?.message || "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full py-4 rounded-2xl font-bold ${
          isUpgrade
            ? "bg-orange-600 hover:bg-orange-700 text-white"
            : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        {isUpgrade ? `Upgrade to ${planName}` : `Downgrade to ${planName}`}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isUpgrade ? `Upgrade to ${planName}?` : `Downgrade to ${planName}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {isUpgrade
                ? `You get ${planName} features straight away. Your PayFast subscription changes to ${priceLabel} from ${formatDate(nextBillingDate)} — same card, no new checkout.`
                : `You keep your current features until ${formatDate(nextBillingDate)}. From then your PayFast subscription is ${priceLabel} — same card, no new checkout.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep current plan</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              {busy ? "Updating PayFast…" : isUpgrade ? "Upgrade" : "Schedule downgrade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
