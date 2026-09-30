import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DoneState from "@/components/shared/DoneState";
import DemoPaymentPanel from "@/components/demo/DemoPaymentPanel";
import { startDocumentPayment } from "@/api/documentPaymentApi";
import { formatCurrency } from "@/utils/currencyCalculations";
import { demoPaymentOutcomeLabel } from "@shared/demo/demoPayments.js";

/**
 * Demo Mode "Pay now" for an invoice. The visitor picks the outcome; a successful one is recorded by
 * the server through the normal Payment Engine receipt path (invoice → paid, payment, reports).
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, demo: { invoiceId: string, invoiceNumber?: string,
 *   amount: number, currency?: string } | null, shareToken?: string | null, onSettled?: () => void }} props
 */
export default function DemoInvoicePaymentDialog({ open, onOpenChange, demo, shareToken = null, onSettled }) {
  const [outcome, setOutcome] = useState(null);
  const keyRef = useRef(null);

  useEffect(() => {
    if (open) {
      setOutcome(null);
      keyRef.current = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
    }
  }, [open]);

  if (!demo) return null;
  const currency = demo.currency || "ZAR";
  const amountLabel = formatCurrency(Number(demo.amount) || 0, currency);

  const apply = async (choice) => {
    const res = await startDocumentPayment({
      invoiceId: demo.invoiceId,
      shareToken,
      demoOutcome: choice,
      idempotencyKey: choice === "succeeded" ? keyRef.current : null,
    });
    setOutcome({ choice, invoiceStatus: res?.invoice_status || null, amountDue: res?.amount_due ?? null });
    onSettled?.();
  };

  const tone = outcome?.choice === "succeeded" ? "success" : outcome?.choice === "failed" ? "failed" : "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:rounded-2xl" data-testid="demo-invoice-payment">
        {outcome ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{demoPaymentOutcomeLabel(outcome.choice)}</DialogTitle>
              <DialogDescription>{demo.invoiceNumber}</DialogDescription>
            </DialogHeader>
            <DoneState
              variant="dialog"
              tone={tone}
              title={demoPaymentOutcomeLabel(outcome.choice)}
              reference={{ number: demo.invoiceNumber, amount: amountLabel, meta: "Simulated · no money moved" }}
              message={
                outcome.choice === "succeeded"
                  ? "The payment is recorded against the invoice, so the dashboard, transactions and reports now include it."
                  : outcome.choice === "failed"
                    ? "Nothing was recorded. In a real account the customer would see the failure and could try again."
                    : "Nothing is recorded yet — in a real account the invoice waits until the provider confirms."
              }
              status={{
                label: "Invoice",
                value: outcome.choice === "succeeded" ? "Paid" : `${amountLabel} still outstanding`,
                tone: outcome.choice === "succeeded" ? "success" : "pending",
              }}
              actions={[
                ...(outcome.choice === "succeeded" ? [] : [{ label: "Try another outcome", onClick: () => setOutcome(null) }]),
                { label: "Done", onClick: () => onOpenChange(false), variant: outcome.choice === "succeeded" ? "default" : "outline" },
              ]}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pay {demo.invoiceNumber || "invoice"}</DialogTitle>
              <DialogDescription>This is where your customer would pay online. In the demo, choose how the payment ends.</DialogDescription>
            </DialogHeader>
            <DemoPaymentPanel amount={demo.amount} currency={currency} title="Invoice payment" onOutcome={apply} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
