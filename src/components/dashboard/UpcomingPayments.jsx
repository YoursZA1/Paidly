import { Link } from "react-router-dom";
import { format, parseISO, isValid } from "date-fns";
import { formatCurrency } from "@/utils/currencyCalculations";
import { isInvoiceOpenReceivable } from "@shared/commercial/documentStatuses.js";
import { createPageUrl } from "@/utils";

const PREVIEW_ROWS = 5;

function formatDue(dateStr) {
  if (!dateStr) return null;
  const date = typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
  return isValid(date) ? format(date, "d MMM yyyy") : null;
}

export default function UpcomingPayments({ invoices = [], clients = [], currency = "ZAR" }) {
  const unpaidInvoices = invoices
    .filter((inv) => isInvoiceOpenReceivable(inv.status))
    .sort((a, b) => {
      const aDue = new Date(a.due_date || a.delivery_date || 0).getTime();
      const bDue = new Date(b.due_date || b.delivery_date || 0).getTime();
      return aDue - bDue;
    })
    .slice(0, PREVIEW_ROWS);

  const getClientName = (clientId) => clients.find((c) => c.id === clientId)?.name || "Unknown client";

  return (
    <section aria-labelledby="pending-payments-heading" className="dashboard-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="pending-payments-heading" className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Pending payments
        </h2>
        <Link
          to={createPageUrl("Invoices")}
          className="text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          View all →
        </Link>
      </div>
      {unpaidInvoices.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">
          No pending payments. Sent invoices will appear here with amount and due date.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {unpaidInvoices.map((invoice) => {
            const due = formatDue(invoice.due_date || invoice.delivery_date);
            return (
              <li key={invoice.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{getClientName(invoice.client_id)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {due ? `Due ${due}` : "No due date"}
                    {invoice.invoice_number ? ` · ${invoice.invoice_number}` : ""}
                  </p>
                </div>
                <p className="currency-nums shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(invoice.total_amount, currency)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
