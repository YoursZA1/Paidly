import { useState } from "react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/currencyCalculations";
import { DEMO_PAYMENT_NOTICE, DEMO_PAYMENT_OUTCOMES } from "@shared/demo/demoPayments.js";

const ICONS = { succeeded: CheckCircle2, failed: XCircle, processing: Clock };

/**
 * Simulated payment (DEMO_PAYMENT). The visitor chooses the outcome; the server applies it through
 * the same verified-event pipeline a provider would. Clearly labelled — no money moves.
 * @param {{ amount: number, currency?: string, onOutcome: (outcome: "succeeded" | "failed" | "processing") => Promise<void> | void,
 *   title?: string, disabled?: boolean }} props
 */
export default function DemoPaymentPanel({ amount, currency = "ZAR", onOutcome, title = "Simulated payment", disabled = false }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const choose = async (outcome) => {
    if (busy) return;
    setBusy(outcome);
    setError("");
    try {
      await onOutcome(outcome);
    } catch (err) {
      setError(err?.message || "The simulated payment could not be applied. Please try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3" data-testid="demo-payment-panel">
      <div className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Demo Mode · {title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{DEMO_PAYMENT_NOTICE}</p>
      </div>
      <p className="font-display text-4xl font-bold tabular-nums">{formatCurrency(Number(amount) || 0, currency)}</p>
      <div className="grid gap-2">
        {DEMO_PAYMENT_OUTCOMES.map((o) => {
          const Icon = ICONS[o.id];
          return (
            <Button
              key={o.id}
              type="button"
              variant={o.id === "succeeded" ? "default" : "outline"}
              className="h-12 min-h-11 w-full justify-start"
              disabled={disabled || Boolean(busy)}
              onClick={() => void choose(o.id)}
              data-testid={`demo-outcome-${o.id}`}
            >
              {busy === o.id ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
              {o.label}
            </Button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
