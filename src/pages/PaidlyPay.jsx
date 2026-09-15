import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CreditCard, Loader2, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchPosPaymentIntent, postPosPaymentIntentAction } from "@/services/PosIntegrationService";
import { formatCurrency } from "@/utils/currencyCalculations";
import { createPageUrl } from "@/utils";

function publicStatus(intent) {
  const status = String(intent?.status || "").trim().toLowerCase();
  if (status === "paid") return "succeeded";
  if (status === "requires_action") return "pending";
  return status || "pending";
}

export default function PaidlyPay() {
  const [searchParams] = useSearchParams();
  const intentId = String(searchParams.get("payment_intent_id") || searchParams.get("intent") || "").trim();
  const qrMode = String(searchParams.get("method") || "").trim().toLowerCase() === "qr";
  const [intent, setIntent] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!intentId) {
      setError("Missing payment intent.");
      setLoading(false);
      return null;
    }
    const json = await fetchPosPaymentIntent(intentId);
    setIntent(json.payment_intent || null);
    setError("");
    return json.payment_intent || null;
  }, [intentId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load this payment.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const status = publicStatus(intent);
  const mock = Boolean(intent?.next_action?.mock);
  const openUrl = intent?.next_action?.open_url || intent?.next_action?.qr_payload || "";

  useEffect(() => {
    if (!intentId || status === "succeeded" || status === "failed" || status === "cancelled" || status === "expired") {
      return undefined;
    }
    const timer = window.setInterval(() => {
      void load().catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [intentId, load, status]);

  const amountLabel = useMemo(
    () => formatCurrency(Number(intent?.amount) || 0, intent?.currency || "ZAR"),
    [intent]
  );

  const runMock = async (outcome) => {
    if (!intentId || busy) return;
    setBusy(outcome);
    try {
      const json = await postPosPaymentIntentAction(intentId, { action: "mock", outcome });
      setIntent(json.payment_intent || intent);
    } catch (err) {
      setError(err?.message || "Could not complete mock payment");
    } finally {
      setBusy("");
    }
  };

  const cancelPayment = async () => {
    if (!intentId || busy) return;
    setBusy("cancel");
    try {
      const json = await postPosPaymentIntentAction(intentId, { action: "cancel" });
      setIntent(json.payment_intent || intent);
    } catch (err) {
      setError(err?.message || "Could not cancel payment");
    } finally {
      setBusy("");
    }
  };

  const heading =
    status === "succeeded"
      ? "Payment successful"
      : status === "failed"
        ? "Payment failed"
        : status === "cancelled"
          ? "Payment cancelled"
          : status === "processing"
            ? "Processing payment..."
            : qrMode
              ? "Ready for payment"
              : "Ready for payment";

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Paidly Pay</p>
      {loading ? (
        <Loader2 className="mt-8 size-8 animate-spin text-primary" />
      ) : error && !intent ? (
        <p className="mt-6 max-w-sm text-sm text-destructive">{error}</p>
      ) : (
        <>
          <p className="mt-6 font-display text-5xl font-bold tabular-nums">{amountLabel}</p>
          <p className="mt-3 text-lg font-medium">{heading}</p>
          {status === "pending" || status === "requires_action" || status === "created" || status === "processing" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {qrMode ? "Scan to pay with the same payment intent." : "Tap card or phone"}
            </p>
          ) : null}
          {status === "succeeded" ? <p className="mt-2 text-sm font-semibold uppercase tracking-wide">PAID</p> : null}
          {error ? <p className="mt-3 max-w-sm text-sm text-destructive">{error}</p> : null}

          {qrMode && (status === "pending" || status === "requires_action" || status === "created") ? (
            <div className="mt-8 flex aspect-square w-56 flex-col items-center justify-center rounded-2xl border-2 border-foreground/20 bg-white p-4 text-foreground">
              <QrCode className="size-16" />
              <p className="mt-3 break-all text-[10px] leading-tight">{openUrl || intentId}</p>
            </div>
          ) : null}

          {mock && (status === "pending" || status === "requires_action" || status === "created" || status === "processing") ? (
            <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
              <Button className="h-12" disabled={Boolean(busy)} onClick={() => void runMock("succeeded")}>
                {busy === "succeeded" ? <Loader2 className="size-5 animate-spin" /> : <CreditCard className="size-5" />}
                Mock tap success
              </Button>
              <Button variant="secondary" className="h-12" disabled={Boolean(busy)} onClick={() => void runMock("failed")}>
                {busy === "failed" ? <Loader2 className="size-5 animate-spin" /> : null}
                Mock failure
              </Button>
              <Button variant="ghost" className="h-12" disabled={Boolean(busy)} onClick={() => void cancelPayment()}>
                {busy === "cancel" ? <Loader2 className="size-5 animate-spin" /> : <X className="size-5" />}
                Cancel
              </Button>
            </div>
          ) : null}

          {!mock && (status === "pending" || status === "requires_action" || status === "created") ? (
            <Button variant="ghost" className="mt-8 h-12" disabled={Boolean(busy)} onClick={() => void cancelPayment()}>
              Cancel
            </Button>
          ) : null}

          <Button variant="outline" className="mt-6 h-12 min-w-40" asChild>
            <Link to={createPageUrl("POS")}>{status === "succeeded" ? "Done" : "Back to POS"}</Link>
          </Button>
        </>
      )}
    </div>
  );
}
