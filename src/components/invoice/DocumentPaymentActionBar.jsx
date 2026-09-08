import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/components/CurrencySelector";
import {
  CreditCard,
  Download,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Send,
} from "lucide-react";
import {
  DOCUMENT_PAYMENT_ACTION,
  DOCUMENT_PAYMENT_BANNER,
  documentPaymentBannerLabel,
  resolveDocumentPaymentCtas,
} from "@shared/payments/documentPaymentCtas.js";
import {
  fetchDocumentPaymentHistory,
  remindDocumentPayment,
  startDocumentPayment,
} from "@/api/documentPaymentApi";
import { useToast } from "@/components/ui/use-toast";
import { INVOICE_STATUS, normalizeInvoiceStatus } from "@shared/commercial/documentStatuses.js";
import { createPageUrl } from "@/utils";

function isOverdue(invoice) {
  if (!invoice?.delivery_date) return false;
  return new Date(invoice.delivery_date).getTime() < Date.now();
}

export default function DocumentPaymentActionBar({
  invoice,
  client = null,
  shareToken = null,
  publicMode = false,
  onEdit,
  onSend,
  onDownloadReceipt,
  onRefresh,
}) {
  const { toast } = useToast();
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState("");

  const loadHistory = useCallback(async () => {
    if (!invoice?.id) return;
    try {
      const next = await fetchDocumentPaymentHistory({
        invoiceId: invoice.id,
        shareToken,
      });
      setSnapshot(next);
    } catch {
      setSnapshot(null);
    }
  }, [invoice?.id, shareToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const amountDue = snapshot?.amount_due ?? Number(invoice?.total_amount || 0);
  const currency = snapshot?.currency || invoice?.currency || invoice?.owner_currency || "ZAR";
  const ctas = useMemo(
    () =>
      snapshot?.ctas ||
      resolveDocumentPaymentCtas({
        invoiceStatus: invoice?.status,
        paymentStatus: snapshot?.payment_status,
        amountDue,
        overdue: isOverdue(invoice),
      }),
    [snapshot, invoice, amountDue]
  );

  const invoiceStatus = normalizeInvoiceStatus(invoice?.status);
  if (invoiceStatus === INVOICE_STATUS.draft && publicMode) return null;
  if (!ctas.actions.length && ctas.banner === DOCUMENT_PAYMENT_BANNER.cancelled) return null;

  const startPay = async (retry = false) => {
    setBusy(retry ? "retry" : "pay");
    try {
      const result = await startDocumentPayment({
        invoiceId: invoice.id,
        shareToken,
        retry,
      });
      if (result.redirect_url) {
        window.location.assign(result.redirect_url);
        return;
      }
      toast({
        title: "Payment could not start",
        description: "Ozow did not return a payment link.",
        variant: "destructive",
      });
    } catch (err) {
      toast({
        title: retry ? "Retry failed" : "Pay now failed",
        description: err?.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  const sendRemind = async () => {
    if (publicMode) return;
    setBusy("remind");
    try {
      await remindDocumentPayment(invoice.id);
      toast({
        title: "Reminder sent",
        description: client?.email ? `Sent to ${client.email}` : "The customer was emailed a payment link.",
        variant: "success",
      });
      onRefresh?.();
      await loadHistory();
    } catch (err) {
      toast({
        title: "Reminder not sent",
        description: err?.message || "Try again later.",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  };

  const viewStatusHref = snapshot?.latest_intent?.id
    ? `${createPageUrl(`ViewDocument/invoice/${invoice.id}`)}?pay=return&intent=${encodeURIComponent(snapshot.latest_intent.id)}`
    : createPageUrl(`ViewDocument/invoice/${invoice.id}`);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:pointer-events-auto md:static md:inset-auto">
      <div className="pointer-events-auto border-t border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm md:rounded-xl md:border md:shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-[max(0.25rem,env(safe-area-inset-bottom))] md:pb-0">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {documentPaymentBannerLabel(ctas.banner)}
            </p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {formatCurrency(amountDue, currency)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.edit) && (
              <Button type="button" variant="outline" onClick={onEdit} className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
            {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.send) && (
              <Button type="button" onClick={onSend} className="gap-2">
                <Send className="h-4 w-4" />
                Send
              </Button>
            )}
            {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.pay_now) && (
              <Button type="button" onClick={() => void startPay(false)} disabled={Boolean(busy)} className="gap-2">
                {busy === "pay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Pay now
              </Button>
            )}
            {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.retry) && (
              <Button type="button" onClick={() => void startPay(true)} disabled={Boolean(busy)} className="gap-2">
                {busy === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Retry payment
              </Button>
            )}
            {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.remind) && !publicMode && (
              <Button type="button" variant="outline" onClick={() => void sendRemind()} disabled={Boolean(busy)} className="gap-2">
                {busy === "remind" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Remind
              </Button>
            )}
            {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.view_status) && (
              publicMode ? (
                <Button type="button" variant="outline" onClick={() => void loadHistory()} className="gap-2">
                  View payment status
                </Button>
              ) : (
                <Button type="button" variant="outline" asChild className="gap-2">
                  <a href={viewStatusHref}>View payment status</a>
                </Button>
              )
            )}
            {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.view_payment) && (
              <Button type="button" variant="outline" onClick={() => void loadHistory()} className="gap-2">
                View payment
              </Button>
            )}
            {ctas.actions.includes(DOCUMENT_PAYMENT_ACTION.download_receipt) && (
              <Button type="button" variant="outline" onClick={onDownloadReceipt} className="gap-2">
                <Download className="h-4 w-4" />
                Download receipt
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
