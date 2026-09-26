import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import DoneState from "@/components/shared/DoneState";
import { formatCurrency } from "@/components/CurrencySelector";
import { fetchPaymentReturnStatus } from "@/api/documentPaymentApi";
import { PAYMENT_RETURN_OUTCOME, paymentReturnOutcome, dueFollowUpLabel } from "@shared/ux/doneStates.js";

const POLL_MS = 3000;
const MAX_POLLS = 10;

/**
 * Done State for someone returning from the online payment provider
 * (`?pay=return&intent=…[&result=cancel|error]`). Paid is shown only once the payment intent is
 * confirmed by the provider's verified webhook; until then it says "confirming" and polls briefly.
 *
 * @param {{
 *   invoice: object,
 *   intentId: string,
 *   resultParam?: string | null,
 *   shareToken?: string | null,
 *   publicMode?: boolean,         // customer view (/view/:token)
 *   onRetry?: () => void,         // start a new payment attempt
 *   onDownload?: () => void,
 *   onStatus?: (status: object) => void,  // latest fetchPaymentReturnStatus payload
 *   onDismiss?: () => void,
 * }} props
 */
export default function PaymentReturnDone({
  invoice,
  intentId,
  resultParam = null,
  shareToken = null,
  publicMode = false,
  onRetry,
  onDownload,
  onStatus,
  onDismiss,
}) {
  const [status, setStatus] = useState(null);
  const [failedToLoad, setFailedToLoad] = useState(false);
  const polls = useRef(0);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!intentId) return undefined;
    let cancelled = false;
    let timer = null;
    polls.current = 0;
    const tick = async () => {
      try {
        const next = await fetchPaymentReturnStatus({ intentId, shareToken });
        if (cancelled) return;
        setStatus(next);
        onStatusRef.current?.(next);
        const { outcome } = paymentReturnOutcome({ intentStatus: next?.payment_intent?.status, resultParam });
        polls.current += 1;
        if (outcome === PAYMENT_RETURN_OUTCOME.CONFIRMING && polls.current < MAX_POLLS) {
          timer = setTimeout(tick, POLL_MS);
        }
      } catch {
        if (!cancelled) setFailedToLoad(true);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [intentId, shareToken, resultParam]);

  if (!intentId || (!status && !failedToLoad)) return null;

  const intent = status?.payment_intent || null;
  const snapshot = status?.snapshot || null;
  const { outcome } = paymentReturnOutcome({ intentStatus: intent?.status, resultParam });
  const currency = intent?.currency || snapshot?.currency || invoice?.currency || "ZAR";
  const amount = intent?.amount ?? null;
  const amountDue = snapshot?.amount_due ?? null;
  const number = invoice?.invoice_number || snapshot?.invoice_number || "";
  const provider = intent?.provider_label && intent.provider_label !== "Payment provider" ? intent.provider_label : null;
  const reference = {
    number: number ? `Invoice ${number}` : null,
    counterparty: publicMode ? invoice?.owner_company_name || null : invoice?.client_name || null,
    amount: amount != null ? formatCurrency(amount, currency) : null,
    meta: provider ? `Paid online via ${provider}` : "Online payment",
  };

  if (outcome === PAYMENT_RETURN_OUTCOME.PAID) {
    const fullyPaid = amountDue != null && Number(amountDue) <= 0;
    return (
      <DoneState
        tone="success"
        title={publicMode ? "Payment received — thank you" : "Payment received"}
        reference={reference}
        message={
          amount != null
            ? `Payment of ${formatCurrency(amount, currency)} received${number ? ` for ${number}` : ""}.`
            : "Your payment was confirmed."
        }
        actions={[
          onDownload ? { label: publicMode ? "Download receipt" : "Download PDF", icon: Download, onClick: onDownload } : null,
          onDismiss ? { label: "Done", onClick: onDismiss, variant: "outline" } : null,
        ].filter(Boolean)}
        status={{
          label: "Invoice status",
          value: fullyPaid ? "Paid in full" : "Partially paid",
          tone: fullyPaid ? "success" : "pending",
        }}
        pending={
          fullyPaid || amountDue == null ? null : `${formatCurrency(amountDue, currency)} is still outstanding.`
        }
        onDismiss={onDismiss}
      />
    );
  }

  if (outcome === PAYMENT_RETURN_OUTCOME.NOT_COMPLETED) {
    return (
      <DoneState
        tone="failed"
        title="Payment not completed"
        reference={reference}
        message={
          publicMode
            ? "The payment was cancelled or didn't go through. You have not been charged for this attempt."
            : "The customer's payment was cancelled or didn't go through. Nothing was recorded against this invoice."
        }
        actions={[
          onRetry ? { label: publicMode ? "Try again" : "Retry payment", icon: RefreshCw, onClick: onRetry } : null,
          onDismiss ? { label: "Done", onClick: onDismiss, variant: "outline" } : null,
        ].filter(Boolean)}
        status={{ label: "Invoice status", value: "Awaiting payment", tone: "pending" }}
        pending={
          amountDue != null && Number(amountDue) > 0
            ? `${formatCurrency(amountDue, currency)} is still outstanding.`
            : null
        }
        followUp={dueFollowUpLabel(invoice?.delivery_date)}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <DoneState
      tone="pending"
      title="Confirming your payment"
      reference={reference}
      message={
        failedToLoad
          ? "We couldn't check the payment status just now. Refresh this page in a moment."
          : `We're waiting for ${provider || "the payment provider"} to confirm. This usually takes a few seconds — the invoice updates automatically.`
      }
      status={{ label: "Payment status", value: "Being confirmed", tone: "pending" }}
      pending="Please don't pay again while this is being confirmed."
      onDismiss={onDismiss}
    />
  );
}
