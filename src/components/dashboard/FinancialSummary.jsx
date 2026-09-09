import { lazy, Suspense, useState } from "react";
import PropTypes from "prop-types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/utils/currencyCalculations";
import { REVENUE_HERO_PERIOD } from "@/lib/dashboard/revenueComposition";

const RevenueHeroChart = lazy(() => import("@/components/dashboard/RevenueHeroChart"));

const PERIOD_OPTIONS = [
  { value: REVENUE_HERO_PERIOD.month, label: "This Month" },
  { value: REVENUE_HERO_PERIOD.year, label: "This Year" },
];

function SecondaryMetric({ label, value, hint, isLoading, className }) {
  return (
    <div className={cn("min-w-0 dashboard-card px-4 py-3", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-2 h-6 w-20" />
      ) : (
        <p className="currency-nums mt-1 truncate text-lg font-medium tabular-nums tracking-tight text-foreground sm:text-xl">
          {value}
        </p>
      )}
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

SecondaryMetric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  hint: PropTypes.node,
  isLoading: PropTypes.bool,
  className: PropTypes.string,
};

function trendClassName(direction) {
  if (direction === "down") return "text-white/80";
  return "text-white/90";
}

export default function FinancialSummary({
  heroByPeriod,
  currency,
  outstanding,
  outstandingHint,
  overdue,
  overdueHint,
  pending,
  pendingHint,
  quoted,
  quotedHint,
  invoiced,
  invoicedHint,
  drafts,
  draftsHint,
  isLoading,
}) {
  const [period, setPeriod] = useState(REVENUE_HERO_PERIOD.month);
  const hero = heroByPeriod?.[period] || {};
  const paidHint =
    period === REVENUE_HERO_PERIOD.year ? "Recognised this year" : "Recognised this month";

  return (
    <section data-testid="dashboard-stats" aria-labelledby="dashboard-primary-metric">
      <div className="dashboard-card dashboard-card-revenue-hero px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="dashboard-primary-metric"
            className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/75"
          >
            Total Revenue
          </h2>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger
              aria-label="Revenue period"
              data-testid="dashboard-revenue-period"
              className="hidden h-8 w-[138px] shrink-0 rounded-md border-white/25 bg-white/15 px-2.5 text-xs text-white shadow-none hover:bg-white/20 focus:ring-white/40 md:flex [&>svg]:text-white/80"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 flex flex-col gap-4 md:mt-5 md:flex-row md:items-end md:justify-between md:gap-8">
          <div className="min-w-0">
            {isLoading ? (
              <Skeleton className="h-11 w-56 max-w-full bg-white/25" />
            ) : (
              <p className="currency-nums truncate text-[2rem] font-semibold leading-none tracking-tight text-white sm:text-[2.5rem]">
                {formatCurrency(Number(hero.realized) || 0, currency)}
              </p>
            )}
            {isLoading ? (
              <Skeleton className="mt-3 h-4 w-40 bg-white/25" />
            ) : hero.trend ? (
              <p className={`mt-2.5 text-sm tabular-nums ${trendClassName(hero.trend.direction)}`}>
                {hero.trend.text}
              </p>
            ) : (
              <p className="mt-2.5 text-sm text-white/75">Not enough historical data</p>
            )}
          </div>
          <div className="md:hidden">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger
                aria-label="Revenue period"
                className="min-h-11 w-full rounded-md border-white/25 bg-white/15 px-3 text-sm text-white shadow-none hover:bg-white/20 focus:ring-white/40 [&>svg]:text-white/80"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full min-w-0 md:w-[44%] md:max-w-md md:shrink-0">
            {isLoading ? (
              <Skeleton className="h-[120px] w-full bg-white/25 md:h-[128px]" />
            ) : (
              <Suspense fallback={<Skeleton className="h-[120px] w-full bg-white/25 md:h-[128px]" />}>
                <RevenueHeroChart chart={hero.chart || []} userCurrency={currency} />
              </Suspense>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SecondaryMetric
          label="Outstanding"
          value={outstanding}
          hint={outstandingHint}
          isLoading={isLoading}
        />
        <SecondaryMetric label="Overdue" value={overdue} hint={overdueHint} isLoading={isLoading} />
        <SecondaryMetric
          label="Paid"
          className="hidden lg:block"
          value={isLoading ? undefined : formatCurrency(Number(hero.realized) || 0, currency)}
          hint={paidHint}
          isLoading={isLoading}
        />
        <SecondaryMetric
          label="Pending"
          className="col-span-2 lg:col-span-1"
          value={pending}
          hint={pendingHint}
          isLoading={isLoading}
        />
      </div>

      {quoted != null || invoiced != null || drafts != null ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SecondaryMetric
            label="Quoted"
            value={quoted}
            hint={quotedHint || "Proposed value — not revenue"}
            isLoading={isLoading}
          />
          <SecondaryMetric
            label="Invoiced"
            value={invoiced}
            hint={invoicedHint || "Issued invoices"}
            isLoading={isLoading}
          />
          <SecondaryMetric label="Drafts" value={drafts} hint={draftsHint} isLoading={isLoading} />
        </div>
      ) : null}
    </section>
  );
}

FinancialSummary.propTypes = {
  heroByPeriod: PropTypes.shape({
    month: PropTypes.object,
    year: PropTypes.object,
  }),
  currency: PropTypes.string,
  outstanding: PropTypes.node,
  outstandingHint: PropTypes.node,
  overdue: PropTypes.node,
  overdueHint: PropTypes.node,
  pending: PropTypes.node,
  pendingHint: PropTypes.node,
  quoted: PropTypes.node,
  quotedHint: PropTypes.node,
  invoiced: PropTypes.node,
  invoicedHint: PropTypes.node,
  drafts: PropTypes.node,
  draftsHint: PropTypes.node,
  isLoading: PropTypes.bool,
};
