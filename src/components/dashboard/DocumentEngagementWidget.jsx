import { useEffect, useState } from "react";
import { fetchDocumentEngagementMetrics } from "@/api/documentPaymentApi";
import { formatCurrency } from "@/utils/currencyCalculations";
import { Skeleton } from "@/components/ui/skeleton";

function Metric({ label, value, hint }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium tabular-nums">{value ?? "—"}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function hoursLabel(hours) {
  if (hours == null) return "—";
  if (hours < 24) return `${hours}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

function percentLabel(value) {
  return value == null ? "—" : `${value}%`;
}

export default function DocumentEngagementWidget({ onClose } = {}) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDocumentEngagementMetrics()
      .then((payload) => {
        if (!cancelled) setMetrics(payload.metrics || null);
      })
      .catch(() => {
        if (!cancelled) setMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const quotes = metrics?.quotes || {};
  const invoices = metrics?.invoices || {};

  return (
    <section
      id="quote-invoice-activity"
      aria-labelledby="quote-invoice-activity-heading"
      className="dashboard-card p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="quote-invoice-activity-heading" className="text-sm font-semibold tracking-tight">
            Quote and invoice activity
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Quotes are proposals. Revenue comes from confirmed invoice payments only.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            Hide
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !metrics ? (
        <p className="mt-4 text-sm text-muted-foreground">Could not load quote and invoice activity.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border/50 pb-4 sm:grid-cols-5">
            <Metric label="Quoted" value={formatCurrency(metrics.quotedValue || 0)} hint="Proposed" />
            <Metric label="Invoiced" value={formatCurrency(metrics.invoicedValue || 0)} />
            <Metric label="Paid" value={formatCurrency(metrics.paidValue || 0)} hint="Confirmed" />
            <Metric label="Outstanding" value={formatCurrency(metrics.outstandingValue || 0)} />
            <Metric label="Overdue" value={formatCurrency(metrics.overdueValue || 0)} />
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quotes</h3>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Metric label="Created" value={quotes.quotesCreated} />
                <Metric label="Sent" value={quotes.quotesSent} />
                <Metric label="Opened" value={quotes.quotesOpened} />
                <Metric label="Accepted" value={quotes.quotesAccepted} />
                <Metric label="Rejected" value={quotes.quotesRejected} />
                <Metric label="Expired" value={quotes.quotesExpired} />
                <Metric label="Converted" value={quotes.quotesConverted} />
                <Metric label="Acceptance" value={percentLabel(quotes.acceptanceRate)} />
                <Metric
                  label="Avg to accept"
                  value={hoursLabel(quotes.averageHoursToAcceptance)}
                  hint={`Avg value ${formatCurrency(quotes.averageQuoteValue || 0)}`}
                />
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Invoices</h3>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Metric label="Created" value={invoices.invoicesCreated} />
                <Metric label="Sent" value={invoices.invoicesSent} />
                <Metric label="Opened" value={invoices.invoicesOpened} />
                <Metric label="Pay clicks" value={invoices.paymentCtaClicks} />
                <Metric label="Viewed unpaid" value={invoices.viewedButUnpaid} />
                <Metric label="Payment intents" value={invoices.paymentIntents} />
                <Metric label="Reminders" value={invoices.remindersSent} />
                <Metric label="Due soon" value={invoices.dueSoon} />
                <Metric label="Due today" value={invoices.dueToday} />
                <Metric label="Overdue" value={invoices.overdueDocuments} />
                <Metric label="Paid" value={invoices.paidDocuments} />
                <Metric
                  label="Avg sent → paid"
                  value={hoursLabel(invoices.averageHoursSentToPaid)}
                  hint={`Open ${hoursLabel(invoices.averageHoursSentToOpened)} · Pay ${hoursLabel(invoices.averageHoursOpenedToPaid)}`}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
