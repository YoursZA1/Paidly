import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DoneState from "@/components/shared/DoneState";
import { longDate } from "@/components/shared/doneStateLabels";
import { formatCurrency } from "@/components/CurrencySelector";
import { dueFollowUpLabel, invoiceOutcome } from "@shared/ux/doneStates.js";
import { createViewDocumentUrl } from "@/utils";

const TITLES = { invoice: "Invoice sent", quote: "Quote sent", payslip: "Payslip sent" };

/**
 * "Invoice / Quote / Payslip sent" Done State. The user's goal is getting paid (or accepted),
 * so the status line shows what is still outstanding rather than "email delivered".
 *
 * @param {{
 *   docType: "invoice" | "quote" | "payslip",
 *   record: object,
 *   client?: object | null,
 *   recipient: string,
 *   actions?: Array<object> | null,   // override next actions (max 3)
 *   extraActions?: Array<object>,     // prepended to the default actions
 *   onDone: () => void,
 *   currency?: string,
 * }} props
 */
export function DocumentSentDone({ docType, record = {}, client = null, recipient, actions = null, extraActions = [], onDone, currency }) {
  const cur = record.currency || currency || "ZAR";
  const docNumber = record.invoice_number || record.quote_number || record.payslip_number || "";
  const counterparty = client?.name || record.client_name || record.employee_name || "";
  const doneAction = { label: "Done", onClick: onDone, variant: "ghost" };
  const to = <span className="font-medium">{recipient}</span>;

  if (docType === "payslip") {
    return (
      <DoneState
        variant="dialog"
        title={TITLES.payslip}
        reference={{
          number: docNumber ? `Payslip ${docNumber}` : null,
          counterparty,
          amount: record.net_pay != null ? formatCurrency(record.net_pay, cur) : null,
          meta:
            record.pay_period_start && record.pay_period_end
              ? `${longDate(record.pay_period_start)} – ${longDate(record.pay_period_end)}`
              : null,
        }}
        message={recipient ? <>Sent to {to}. The employee opens it with a secure link.</> : "Payslip sent."}
        actions={actions || [...extraActions, doneAction].slice(0, 3)}
      />
    );
  }

  if (docType === "quote") {
    const validUntil = record.valid_until || null;
    const expiry = dueFollowUpLabel(validUntil);
    return (
      <DoneState
        variant="dialog"
        title={TITLES.quote}
        reference={{
          number: docNumber ? `Quote ${docNumber}` : null,
          counterparty,
          amount: record.total_amount != null ? formatCurrency(record.total_amount, cur) : null,
          meta: validUntil ? `Valid until ${longDate(validUntil)}` : null,
        }}
        message={recipient ? <>Sent to {to}.</> : "Quote sent."}
        actions={
          actions ||
          [
            ...extraActions,
            record.id ? { label: "View quote", icon: Eye, to: createViewDocumentUrl("quote", record.id) } : null,
            doneAction,
          ]
            .filter(Boolean)
            .slice(0, 3)
        }
        status={{ label: "Quote status", value: "Awaiting acceptance", tone: "pending" }}
        pending="Convert it to an invoice once the client accepts."
        followUp={expiry ? expiry.replace(/^Due/, "Expires").replace(/^Overdue by/, "Expired") : null}
      />
    );
  }

  const dueDate = record.delivery_date || record.due_date || null;
  const outcome = invoiceOutcome({
    status: record.status === "draft" ? "sent" : record.status,
    total: record.total_amount,
    amountDue: record.amount_due ?? record.total_amount,
    dueDate,
  });
  return (
    <DoneState
      variant="dialog"
      title={TITLES.invoice}
      reference={{
        number: docNumber ? `Invoice ${docNumber}` : null,
        counterparty,
        amount: record.total_amount != null ? formatCurrency(record.total_amount, cur) : null,
        meta: dueDate ? `Due ${longDate(dueDate)}` : null,
      }}
      message={recipient ? <>Sent successfully to {to}.</> : "Invoice sent."}
      actions={
        actions ||
        [
          ...extraActions,
          record.id ? { label: "View invoice", icon: Eye, to: createViewDocumentUrl("invoice", record.id) } : null,
          doneAction,
        ]
          .filter(Boolean)
          .slice(0, 3)
      }
      status={{ label: "Payment status", value: outcome.statusLabel, tone: outcome.pending ? "pending" : "success" }}
      pending={outcome.pending ? "Payment is still outstanding. Paidly updates this invoice when the client pays." : null}
      followUp={outcome.followUp}
    />
  );
}

/** Standalone dialog wrapper for send paths that do not already have a modal open. */
export default function DocumentSentDialog({ open, onOpenChange, ...props }) {
  if (!open) return null;
  const close = () => onOpenChange(false);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>{TITLES[props.docType] || "Sent"}</DialogTitle>
          <DialogDescription>{props.recipient ? `Sent to ${props.recipient}` : "Sent"}</DialogDescription>
        </DialogHeader>
        <DocumentSentDone {...props} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}
