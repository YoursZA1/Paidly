import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { formatCurrency } from "../CurrencySelector";

/**
 * Client portal must not simulate card capture or record payments from the browser.
 * Customer money settles only via Payment Engine (verified Ozow Notify), typically
 * from the public invoice pay link the business sends.
 */
export default function PaymentModal({ isOpen, onClose, invoice }) {
  const outstandingAmount = invoice?.total_amount || 0;
  const currency = invoice?.owner_currency || "ZAR";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Online payment unavailable
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
          <p className="text-sm text-muted-foreground">
            This portal does not accept card details or mark invoices paid. Use the secure
            payment link on your invoice email (Ozow), or contact the business to arrange
            payment. Paidly only records a payment after the provider confirms it.
          </p>
          <Button type="button" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
