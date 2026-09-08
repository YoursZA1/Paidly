import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/utils/currencyCalculations";
import { REVENUE_SERIES } from "@/lib/dashboard/revenueComposition";
import DocumentEngagementWidget from "@/components/dashboard/DocumentEngagementWidget";

const DashboardRevenueChart = lazy(() => import("@/components/dashboard/DashboardRevenueChart"));

const RANGES = [30, 60, 90];

function SourceRow({ label, amount, percent, hint, currency, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className={`text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}>{label}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="currency-nums text-sm tabular-nums text-foreground">{formatCurrency(amount, currency)}</p>
        {percent != null ? (
          <p className="text-[11px] tabular-nums text-muted-foreground">{percent.toFixed(1)}%</p>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardRevenueWidget({
  breakdown,
  rangeDays,
  onRangeChange,
  currency,
  isLoading,
  compact = false,
  className = "",
}) {
  const [activityOpen, setActivityOpen] = useState(false);
  const activityRef = useRef(null);
  const showQuotes = Boolean(breakdown?.hasQuotePoints || breakdown?.quotes);
  const empty = Boolean(breakdown?.empty);

  const openActivity = () => setActivityOpen(true);

  useEffect(() => {
    if (!activityOpen) return;
    activityRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activityOpen]);

  return (
    <div className={`space-y-6 ${compact ? "h-full min-h-0" : ""} ${className}`.trim()}>
    <section
      aria-labelledby="dashboard-revenue-heading"
      className={`dashboard-card px-4 py-4 sm:px-5 ${compact ? "flex h-full min-h-0 flex-col" : "py-5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="dashboard-revenue-heading" className="text-sm font-semibold text-foreground">
            Revenue
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Total realized across your business</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Revenue period">
          {RANGES.map((range) => {
            const selected = Number(rangeDays) === range;
            return (
              <button
                key={range}
                type="button"
                onClick={() => onRangeChange(range)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium tabular-nums ${
                  selected
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {range}D
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className={`mt-3 h-10 w-48 ${compact ? "mt-2 h-8" : "mt-4"}`} />
      ) : (
        <p className={`currency-nums font-semibold leading-none tracking-tight text-foreground ${compact ? "mt-2 text-[1.75rem] sm:text-[2rem]" : "mt-4 text-[2rem] sm:text-[2.25rem]"}`}>
          {formatCurrency(breakdown?.realized || 0, currency)}
        </p>
      )}

      {!compact && !isLoading && breakdown?.trend ? (
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">
          {breakdown.trend.direction === "down" ? "↘" : "↗"} {breakdown.trend.text}
        </p>
      ) : null}

      {!isLoading && empty ? (
        <p className="mt-6 text-sm text-muted-foreground">No revenue recorded for this period.</p>
      ) : (
        <>
          <div className={compact ? "mt-3 flex min-h-0 flex-1 flex-col" : "mt-6"}>
            {compact ? null : (
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Revenue trend
              </p>
            )}
            {isLoading ? (
              <Skeleton className={compact ? "min-h-[112px] flex-1 w-full" : "h-[220px] w-full"} />
            ) : (
              <div className={compact ? "min-h-[112px] flex-1" : undefined}>
                <Suspense fallback={<Skeleton className={compact ? "h-full w-full" : "h-[220px] w-full"} />}>
                  <DashboardRevenueChart
                    chart={breakdown?.chart || []}
                    userCurrency={currency}
                    showQuotes={showQuotes}
                    onChartClick={openActivity}
                    compact={compact}
                  />
                </Suspense>
              </div>
            )}
            <ul className={`flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground ${compact ? "mt-2" : "mt-3"}`}>
              <li className="flex items-center gap-1.5">
                <span className="h-px w-3.5" style={{ backgroundColor: REVENUE_SERIES.invoices.color }} />
                Invoices
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-px w-3.5" style={{ backgroundColor: REVENUE_SERIES.pos.color }} />
                POS
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-px w-3.5" style={{ backgroundColor: REVENUE_SERIES.other.color }} />
                Other
              </li>
              {showQuotes ? (
                <li className="flex items-center gap-1.5">
                  <span className="w-3.5 border-t border-dashed" style={{ borderColor: REVENUE_SERIES.quotes.color }} />
                  Potential quotes
                </li>
              ) : null}
            </ul>
            {compact ? null : (
              <p className="mt-2 text-[11px] text-muted-foreground">Click the chart to open quote and invoice activity.</p>
            )}
          </div>

          {compact ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
              {(breakdown?.sources || []).map((source) => (
                <span key={source.key}>
                  {source.label}{" "}
                  <span className="currency-nums tabular-nums text-foreground">
                    {formatCurrency(source.amount, currency)}
                  </span>
                  {source.percent != null ? (
                    <span className="tabular-nums"> ({source.percent.toFixed(1)}%)</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : (
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Revenue sources
            </p>
            {(breakdown?.sources || []).map((source) => (
              <SourceRow
                key={source.key}
                label={source.label}
                amount={source.amount}
                percent={source.percent}
                currency={currency}
              />
            ))}
            {showQuotes ? (
              <SourceRow
                label="Potential quotes"
                amount={breakdown.quotes}
                hint="Not included in realized revenue"
                currency={currency}
                muted
              />
            ) : null}
          </div>
          )}
        </>
      )}

      {compact ? null : (
      <button
        type="button"
        onClick={openActivity}
        aria-expanded={activityOpen}
        aria-controls="quote-invoice-activity"
        className="mt-5 text-sm font-medium text-primary hover:text-primary/80"
      >
        View quote and invoice activity →
      </button>
      )}
    </section>
    {activityOpen ? (
      <div ref={activityRef}>
        <DocumentEngagementWidget onClose={() => setActivityOpen(false)} />
      </div>
    ) : null}
    </div>
  );
}
