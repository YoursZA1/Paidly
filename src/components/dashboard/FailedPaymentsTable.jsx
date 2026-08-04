import { format } from "date-fns";
import { AlertTriangle, Loader2 } from "lucide-react";

function formatZar(amount, currency = "ZAR") {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "R 0";
  const prefix = String(currency || "ZAR").toUpperCase() === "ZAR" ? "R" : String(currency).toUpperCase();
  return `${prefix} ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  try {
    return format(d, "dd MMM yyyy HH:mm");
  } catch {
    return "—";
  }
}

/**
 * Admin Dashboard — Failed Payments
 * Columns: Company | Date | Reason | Retry Count | Amount
 */
export default function FailedPaymentsTable({
  rows = [],
  isLoading = false,
  errorMessage = null,
  className = "",
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <h2 className="inline-flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
          Failed Payments
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </h2>
        <p className="text-xs text-muted-foreground">
          Company · Date · Reason · Retry Count · Amount (from payment history)
        </p>
      </div>

      {errorMessage ? (
        <p className="px-4 py-3 text-sm text-destructive sm:px-6" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {/* Mobile cards */}
      <div className="space-y-3 p-4 sm:hidden">
        {rows.map((row) => (
          <article key={row.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.company}</p>
                {row.email && row.companyName ? (
                  <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                ) : null}
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">
                {formatZar(row.amount, row.currency)}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Date</dt>
                <dd className="mt-0.5">{formatDate(row.date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Retry Count</dt>
                <dd className="mt-0.5 tabular-nums">{row.retryCount}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="mt-0.5 break-words">{row.reason}</dd>
              </div>
            </dl>
          </article>
        ))}
        {!isLoading && rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No failed payments</p>
        ) : null}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-6 py-3 text-left font-medium">Company</th>
              <th className="px-6 py-3 text-left font-medium">Date</th>
              <th className="px-6 py-3 text-left font-medium">Reason</th>
              <th className="px-6 py-3 text-left font-medium">Retry Count</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/50 transition-colors hover:bg-muted/30"
              >
                <td className="px-6 py-3">
                  <p className="text-sm font-medium">{row.company}</p>
                  {row.email && row.companyName ? (
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                  ) : null}
                </td>
                <td className="px-6 py-3 text-sm text-muted-foreground whitespace-nowrap">
                  {formatDate(row.date)}
                </td>
                <td className="max-w-xs px-6 py-3 text-sm">
                  <span className="line-clamp-2" title={row.reason}>
                    {row.reason}
                  </span>
                </td>
                <td className="px-6 py-3 text-sm tabular-nums">{row.retryCount}</td>
                <td className="px-6 py-3 text-right text-sm font-medium tabular-nums whitespace-nowrap">
                  {formatZar(row.amount, row.currency)}
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  No failed payments
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
