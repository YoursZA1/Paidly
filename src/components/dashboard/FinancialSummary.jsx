import PropTypes from "prop-types";
import { Skeleton } from "@/components/ui/skeleton";
import MiniSparkline from "@/components/dashboard/MiniSparkline";

function SecondaryMetric({ label, value, hint, isLoading, trendText, sparklineValues }) {
  return (
    <div className="min-w-0 dashboard-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-2 h-6 w-20" />
      ) : (
        <p className="currency-nums mt-1 text-lg font-medium tabular-nums tracking-tight text-foreground sm:text-xl">
          {value}
        </p>
      )}
      {(sparklineValues?.length > 1 || trendText) ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
          {sparklineValues?.length > 1 ? (
            <MiniSparkline values={sparklineValues} className="text-foreground/50" />
          ) : null}
          {trendText ? <p className="text-xs tabular-nums">{trendText}</p> : null}
        </div>
      ) : null}
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

SecondaryMetric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  hint: PropTypes.node,
  isLoading: PropTypes.bool,
  trendText: PropTypes.string,
  sparklineValues: PropTypes.arrayOf(PropTypes.number),
};

export default function FinancialSummary({
  primaryLabel = "Total outstanding",
  primaryValue,
  primaryHint,
  trendText,
  sparklineValues,
  paidThisMonth,
  paidHint,
  overdue,
  overdueHint,
  drafts,
  draftsHint,
  isLoading,
}) {
  return (
    <section data-testid="dashboard-stats" aria-labelledby="dashboard-primary-metric">
      <div className="dashboard-card dashboard-card-hero px-4 py-5 sm:px-5 sm:py-6">
        <p
          id="dashboard-primary-metric"
          className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/75"
        >
          {primaryLabel}
        </p>
        {isLoading ? (
          <Skeleton className="mt-2 h-11 w-56 max-w-full bg-white/25" />
        ) : (
          <p className="currency-nums mt-1 text-[2rem] font-semibold leading-none tracking-tight text-white sm:text-[2.5rem]">
            {primaryValue}
          </p>
        )}
        {primaryHint ? <p className="mt-2 text-xs text-white/75">{primaryHint}</p> : null}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SecondaryMetric
          label="Paid this month"
          value={paidThisMonth}
          hint={paidHint}
          trendText={trendText}
          sparklineValues={sparklineValues}
          isLoading={isLoading}
        />
        <SecondaryMetric label="Overdue" value={overdue} hint={overdueHint} isLoading={isLoading} />
        <SecondaryMetric label="Drafts" value={drafts} hint={draftsHint} isLoading={isLoading} />
      </div>
    </section>
  );
}

FinancialSummary.propTypes = {
  primaryLabel: PropTypes.string,
  primaryValue: PropTypes.node,
  primaryHint: PropTypes.node,
  trendText: PropTypes.string,
  sparklineValues: PropTypes.arrayOf(PropTypes.number),
  paidThisMonth: PropTypes.node,
  paidHint: PropTypes.node,
  overdue: PropTypes.node,
  overdueHint: PropTypes.node,
  drafts: PropTypes.node,
  draftsHint: PropTypes.node,
  isLoading: PropTypes.bool,
};
