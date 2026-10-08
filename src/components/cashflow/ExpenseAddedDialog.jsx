import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DoneState from "@/components/shared/DoneState";
import { formatCurrency } from "@/components/CurrencySelector";
import { expenseAddedOutcome } from "@shared/ux/doneStates.js";

export default function ExpenseAddedDialog({ expense, currency = "ZAR", onAddAnother, onView, onClose }) {
  if (!expense) return null;
  const outcome = expenseAddedOutcome(expense);
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose?.())}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>{outcome.title}</DialogTitle>
          <DialogDescription>
            {outcome.counterparty} was recorded in cash flow.
          </DialogDescription>
        </DialogHeader>
        <DoneState
          variant="dialog"
          title={outcome.title}
          reference={{
            counterparty: outcome.counterparty,
            amount: formatCurrency(outcome.amount, currency),
            meta: outcome.category || null,
          }}
          message={outcome.detail || "It's included in your cash flow."}
          actions={[
            { label: "Add another", onClick: onAddAnother },
            { label: "View expense", onClick: onView, variant: "outline" },
          ]}
          status={{ label: "Status", value: "Recorded", tone: "success" }}
          followUp="Included in money out."
        />
      </DialogContent>
    </Dialog>
  );
}
