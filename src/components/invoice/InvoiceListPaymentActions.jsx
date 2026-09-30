import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, Mail, RefreshCw } from "lucide-react";
import { remindDocumentPayment, startDocumentPayment } from "@/api/documentPaymentApi";
import { useToast } from "@/components/ui/use-toast";
import { resolveDocumentPaymentCtas, DOCUMENT_PAYMENT_ACTION } from "@shared/payments/documentPaymentCtas.js";
import { INVOICE_STATUS, normalizeInvoiceStatus } from "@shared/commercial/documentStatuses.js";
import DemoInvoicePaymentDialog from "@/components/demo/DemoInvoicePaymentDialog";
import { notifyDemoNotSent } from "@/lib/demo/demoModeState";

function isOverdue(invoice) {
  if (!invoice?.delivery_date) return false;
  return new Date(invoice.delivery_date).getTime() < Date.now();
}

export default function InvoiceListPaymentActions({ invoice, onActionSuccess }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState("");
  const [demoPay, setDemoPay] = useState(null);
  const status = normalizeInvoiceStatus(invoice?.status);
  const ctas = resolveDocumentPaymentCtas({
    invoiceStatus: status,
    amountDue: Number(invoice?.total_amount || 0),
    overdue: isOverdue(invoice) || status === INVOICE_STATUS.overdue,
  });

  const pay = async (retry) => {
    setBusy(retry ? "retry" : "pay");
    try {
      const result = await startDocumentPayment({ invoiceId: invoice.id, retry });
      if (result?.demo && result?.simulated) {
        setDemoPay({
          invoiceId: invoice.id,
          invoiceNumber: result.invoice_number || invoice.invoice_number,
          amount: result.amount_due,
          currency: result.currency || invoice.currency || "ZAR",
        });
        return;
      }
      if (result.redirect_url) {
        window.location.assign(result.redirect_url);
        return;
      }
      toast({ title: "Payment could not start", variant: "destructive" });
    } catch (err) {
      toast({ title: "Pay failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  const remind = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setBusy("remind");
    try {
      const reminded = await remindDocumentPayment(invoice.id);
      if (reminded?.demo) {
        notifyDemoNotSent(reminded.preview);
        return;
      }
      toast({ title: "Reminder sent", variant: "success" });
      onActionSuccess?.();
    } catch (err) {
      toast({ title: "Reminder not sent", description: err?.message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  if (!ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.pay_now) && !ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.retry) && !ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.remind)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <DemoInvoicePaymentDialog
        open={Boolean(demoPay)}
        onOpenChange={(next) => (next ? null : setDemoPay(null))}
        demo={demoPay}
        onSettled={() => onActionSuccess?.()}
      />
      {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.pay_now) && (
        <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => void pay(false)} disabled={Boolean(busy)}>
          {busy === "pay" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          <span className="ml-1 hidden lg:inline">Pay</span>
        </Button>
      )}
      {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.retry) && (
        <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => void pay(true)} disabled={Boolean(busy)}>
          {busy === "retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      )}
      {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.remind) && (
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={remind} disabled={Boolean(busy)}>
          {busy === "remind" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          <span className="ml-1 hidden lg:inline">Remind</span>
        </Button>
      )}
    </div>
  );
}
