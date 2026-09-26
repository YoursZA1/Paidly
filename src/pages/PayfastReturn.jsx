import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { FilePlus2, LayoutDashboard, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import DoneState from "@/components/shared/DoneState";
import { longDate } from "@/components/shared/doneStateLabels";
import {
  getPendingSubscriptionId,
  pollUntilActive,
} from "@/services/subscriptionCheckoutService";

/**
 * PayFast return_url (/return, /success).
 *
 * Shows "Waiting for payment confirmation…", polls GET /api/subscriptions/status,
 * and shows the persistent "Subscription active" Done State only when the backend reports
 * currentStatus === "active" (or accessGranted). Never sets subscription.status = "active" on the client.
 */
export default function PayfastReturn() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState("waiting"); // waiting | active | failed | timeout
  const [statusLabel, setStatusLabel] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [activeSubscription, setActiveSubscription] = useState(null);

  useEffect(() => {
    const ac = new AbortController();
    const pendingId = getPendingSubscriptionId();

    const invalidateProfileCaches = () => {
      void queryClient.invalidateQueries({ queryKey: ["current-user"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["subscription-current"] });
    };

    const run = async () => {
      try {
        const result = await pollUntilActive({
          subscriptionId: pendingId || undefined,
          intervalMs: 3000,
          maxAttempts: 40,
          signal: ac.signal,
          onTick: (payload) => {
            if (payload?.error) {
              setErrorMessage(payload.error);
              return;
            }
            const st = payload?.currentStatus || payload?.status || null;
            if (st) setStatusLabel(String(st));
          },
        });

        if (ac.signal.aborted) return;

        const status = String(result?.currentStatus || result?.status || "").toLowerCase();
        const granted = Boolean(result?.accessGranted) || status === "active" || status === "trialing";

        if (granted) {
          setActiveSubscription(result);
          setPhase("active");
          try {
            await refreshUser();
          } catch {
            /* display uses backend status; profile refresh is best-effort */
          }
          invalidateProfileCaches();
          return;
        }

        if (status === "failed" || status === "cancelled" || status === "expired") {
          setPhase("failed");
          setStatusLabel(status);
          return;
        }

        setPhase("timeout");
        setStatusLabel(status || statusLabel);
      } catch (e) {
        if (e?.name === "AbortError") return;
        setPhase("timeout");
        setErrorMessage(e?.message || "Could not confirm payment status.");
      }
    };

    void run();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll once on mount
  }, [navigate, queryClient, refreshUser]);

  if (phase === "active") {
    const planName = activeSubscription?.currentPlanName || activeSubscription?.currentPlan || null;
    const trialing = String(activeSubscription?.currentStatus || "").toLowerCase() === "trialing";
    const nextBilling = longDate(activeSubscription?.nextBillingDate || activeSubscription?.renewDate);
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <DoneState
            title={planName ? `You're on Paidly ${planName}` : "Subscription active"}
            reference={{
              number: "Subscription",
              counterparty: planName ? `Paidly ${planName}` : null,
              meta: nextBilling ? `${trialing ? "Trial ends" : "Next billing date"} ${nextBilling}` : null,
            }}
            message="PayFast confirmed your payment. Everything in your plan is unlocked now."
            actions={[
              { label: "Go to dashboard", icon: LayoutDashboard, to: createPageUrl("Dashboard") },
              { label: "Create an invoice", icon: FilePlus2, to: createPageUrl("CreateInvoice"), variant: "outline" },
              { label: "Billing", to: createPageUrl("BillingAndInvoices"), variant: "ghost" },
            ]}
            status={{ label: "Subscription status", value: trialing ? "Trial active" : "Active", tone: "success" }}
            followUp={nextBilling ? `PayFast charges the same card automatically on ${nextBilling}.` : null}
          />
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center space-y-6 rounded-3xl border bg-card p-8 shadow-lg">
          <XCircle className="mx-auto h-14 w-14 text-red-500" aria-hidden />
          <div>
            <h1 className="text-2xl font-bold">Payment not completed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Status from server{statusLabel ? `: ${statusLabel}` : ""}. You can try again from
              subscription settings.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild className="rounded-2xl font-semibold">
              <Link to={createPageUrl("Settings")}>Subscription settings</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link to={createPageUrl("Dashboard")}>Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16 bg-gradient-to-b from-orange-50/80 to-background dark:from-orange-950/20">
      <div className="max-w-md w-full text-center space-y-6 rounded-3xl border border-orange-100 dark:border-orange-900/40 bg-card p-8 shadow-lg">
        <Loader2 className="mx-auto h-14 w-14 animate-spin text-orange-500" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Waiting for payment confirmation…</h1>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
            PayFast has returned you to Paidly. We are waiting for the server to confirm payment
            (usually under a minute). This page only shows the status returned by the backend — it
            never marks your subscription active in the browser.
          </p>
          {statusLabel && (
            <p className="mt-4 text-xs text-muted-foreground tabular-nums">
              Server status: <span className="font-medium text-foreground">{statusLabel}</span>
            </p>
          )}
          {errorMessage && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400" role="status">
              {errorMessage}
            </p>
          )}
          {phase === "timeout" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Confirmation is taking longer than usual. You can open the dashboard — access unlocks
              when the server activates your plan.
            </p>
          )}
        </div>
        {phase === "timeout" && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild className="rounded-2xl font-semibold">
              <Link to={createPageUrl("Dashboard")}>Go to dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link to={createPageUrl("Settings")}>Subscription settings</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
