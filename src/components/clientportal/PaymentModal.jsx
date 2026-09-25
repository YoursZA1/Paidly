import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { invoiceAmountDue } from "@shared/payments/invoiceBalance.js";
import { formatCurrency } from "../CurrencySelector";

/**
 * Client portal never captures card details or records payments from the browser.
 * "Pay" hands off to the invoice's secure payment page (/view/:token), which runs the Payment Engine:
 * document-pay → payment_intent → Ozow → verified Notify → settlement.
 */
export default function PaymentModal({ isOpen, onClose, invoice }) {
  const outstandingAmount = invoiceAmountDue(invoice, invoice?.payments || []);
  const currency = invoice?.currency || invoice?.owner_currency || "ZAR";
  const payUrl = invoice?.public_share_token ? `/view/${encodeURIComponent(invoice.public_share_token)}` : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            {payUrl ? "Pay this invoice" : "Online payment unavailable"}
          </DialogTitle>
          <DialogDescription>
            Invoice #{invoice?.invoice_number || "—"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/60 p-4">
            <p className="mb-1 text-sm text-muted-foreground">Outstanding amount</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {formatCurrency(outstandingAmount, currency)}
            </p>
          </div>
          {payUrl ? (
            <>
              <p className="text-sm text-muted-foreground">
                You&apos;ll continue on the invoice&apos;s secure payment page and pay by instant EFT (Ozow). The
                invoice is marked paid only after Ozow confirms the payment to Paidly.
              </p>
              <Button asChild className="w-full">
                <a href={payUrl}>Continue to secure payment</a>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This invoice has no online payment link yet. Contact the business to arrange payment.
              Paidly only records a payment after the provider confirms it.
            </p>
          )}
          <Button type="button" variant={payUrl ? "outline" : "default"} className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
