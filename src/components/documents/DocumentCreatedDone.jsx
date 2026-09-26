import { useEffect, useState } from "react";
import { Download, Pencil, Send } from "lucide-react";
import DoneState from "@/components/shared/DoneState";
import { longDate } from "@/components/shared/doneStateLabels";
import { formatCurrency } from "@/components/CurrencySelector";
import { CELEBRATION, dueFollowUpLabel } from "@shared/ux/doneStates.js";
import { detectFirstDocument } from "@/services/milestoneService";

/**
 * "Invoice / Quote created" Done State, shown on the new document itself (no bounce to the list).
 * Creating is only half the job: the status line says it has not been sent, and Send is the first action.
 */
export default function DocumentCreatedDone({ docType, record, client, fromQuote = false, onSend, onDownload, onEdit, onDismiss }) {
  const [celebration, setCelebration] = useState(CELEBRATION.NONE);
  const isQuote = docType === "quote";

  useEffect(() => {
    let cancelled = false;
    detectFirstDocument(isQuote ? "quotes" : "invoices").then((level) => {
      if (!cancelled) setCelebration(level);
    });
    return () => {
      cancelled = true;
    };
  }, [isQuote]);

  if (!record) return null;
  const number = isQuote ? record.quote_number : record.invoice_number;
  const label = isQuote ? "Quote" : "Invoice";
  const due = isQuote ? record.valid_until : record.delivery_date;
  const isDraft = String(record.status || "draft").toLowerCase() === "draft";
  const sourceQuote = record.source_quote_number || record.quote_number_source || null;

  return (
    <DoneState
      title={number ? `${label} ${number} created` : `${label} created`}
      reference={{
        number: number ? `${label} ${number}` : null,
        counterparty: client?.name || record.client_name || null,
        amount: record.total_amount != null ? formatCurrency(record.total_amount, record.currency || "ZAR") : null,
        meta: due ? `${isQuote ? "Valid until" : "Due"} ${longDate(due)}` : null,
      }}
      message={
        fromQuote
          ? `Created from ${sourceQuote ? `quote ${sourceQuote}` : "the accepted quote"}. ${isDraft ? "It's saved as a draft." : ""}`.trim()
          : isDraft
            ? `Saved as a draft. Your client hasn't received it yet.`
            : `${label} saved.`
      }
      actions={[
        onSend ? { label: `Send ${label.toLowerCase()}`, icon: Send, onClick: onSend } : null,
        onDownload ? { label: "Download PDF", icon: Download, onClick: onDownload, variant: "outline" } : null,
        onEdit && isDraft ? { label: "Edit", icon: Pencil, onClick: onEdit, variant: "ghost" } : null,
      ].filter(Boolean)}
      status={{
        label: isQuote ? "Quote status" : "Payment status",
        value: isDraft ? "Not sent yet" : isQuote ? "Awaiting acceptance" : "Awaiting payment",
        tone: isDraft ? "neutral" : "pending",
      }}
      pending={
        isQuote
          ? "Send it so your client can accept it."
          : "Send it to start collecting — the payment clock starts when your client receives it."
      }
      followUp={dueFollowUpLabel(due)}
      celebration={celebration}
      celebrationLabel={isQuote ? "Your first quote" : "Your first invoice"}
      onDismiss={onDismiss}
    />
  );
}
