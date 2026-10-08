import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function eftPaymentRows(source, invoiceNumber = "") {
  const row = source && typeof source === "object" ? source : null;
  const lines = [];
  const add = (label, value) => {
    const next = text(value);
    if (next) lines.push({ label, value: next });
  };
  add("Bank", row?.bank_name);
  add("Account name", row?.account_name);
  add("Account number", row?.account_number);
  add("Branch code", row?.branch_code || row?.routing_number);
  add("SWIFT", row?.swift_code);
  add("Reference", row?.reference || invoiceNumber);
  return lines;
}

export default function EftPaymentNotice({ open, onOpenChange, rows = [] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Please use EFT</DialogTitle>
          <DialogDescription>
            Online payment is not available for this invoice. Pay by EFT using these details.
          </DialogDescription>
        </DialogHeader>
        {rows.length ? (
          <dl className="divide-y divide-border rounded-xl border border-border">
            {rows.map((line) => (
              <div key={line.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 px-3 py-2.5 text-sm">
                <dt className="text-muted-foreground">{line.label}</dt>
                <dd className="font-medium text-foreground break-all">{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">The payment details are on the invoice.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
