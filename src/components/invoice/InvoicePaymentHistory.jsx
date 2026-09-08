import { format } from "date-fns";
import { formatCurrency } from "@/components/CurrencySelector";

const STATUS_LABEL = {
  pending: "Pending",
  requires_action: "Awaiting customer",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
};

export default function InvoicePaymentHistory({ history = [], currency = "ZAR" }) {
  if (!history.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Payment history
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {history.map((row) => {
          const when = row.created_at ? format(new Date(row.created_at), "d MMM yyyy") : "—";
          return (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{when}</p>
                <p className="text-xs capitalize text-muted-foreground">{row.provider || "ozow"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums text-foreground">
                  {formatCurrency(row.amount, row.currency || currency)}
                </p>
                <p className="text-xs text-muted-foreground">{STATUS_LABEL[row.status] || row.status}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
