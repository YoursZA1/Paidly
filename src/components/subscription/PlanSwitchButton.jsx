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
import DoneState from "@/components/shared/DoneState";

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
  // "Subscription changed" Done State. Billing refreshes when it closes — refreshing first would make
  // this plan "current" and unmount the button (and its dialog) before the user reads the result.
  const [changed, setChanged] = useState(null);
  const isUpgrade = direction !== "downgrade";

  const closeDone = () => {
    const result = changed;
    setChanged(null);
    setOpen(false);
    onChanged?.(result);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await changeSubscriptionPlan({ planSlug });
      if (result?.changed) {
        setChanged(result);
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
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          if (!next && changed) closeDone();
          else setOpen(next);
        }}
      >
        <AlertDialogContent>
          {changed ? (
            <>
              <AlertDialogHeader className="sr-only">
                <AlertDialogTitle>{isUpgrade ? `Upgraded to ${planName}` : "Downgrade scheduled"}</AlertDialogTitle>
                <AlertDialogDescription>{changed.message || ""}</AlertDialogDescription>
              </AlertDialogHeader>
              <DoneState
                variant="dialog"
                tone={isUpgrade ? "success" : "pending"}
                title={isUpgrade ? `You're on ${planName}` : `Downgrade to ${planName} scheduled`}
                reference={{
                  number: "Subscription",
                  counterparty: `Paidly ${planName}`,
                  amount: priceLabel,
                  meta: `${isUpgrade ? "New amount charged from" : "Changes on"} ${formatDate(nextBillingDate)}`,
                }}
                message={
                  changed.message ||
                  (isUpgrade
                    ? `${planName} features are unlocked now. Same card, no new checkout.`
                    : `You keep your current features until ${formatDate(nextBillingDate)}.`)
                }
                actions={[{ label: "Done", onClick: closeDone }]}
                status={{
                  label: "Plan",
                  value: isUpgrade ? `${planName} · active` : `Current plan until ${formatDate(nextBillingDate)}`,
                  tone: isUpgrade ? "success" : "pending",
                }}
                followUp={`PayFast charges ${priceLabel} from ${formatDate(nextBillingDate)}.`}
              />
            </>
          ) : (
          <>
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
          </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
