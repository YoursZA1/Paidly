import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/utils/currencyCalculations";
import { createPageUrl } from "@/utils";
import { payrollApi } from "@/services/PayrollApiService";

function Metric({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="currency-nums mt-1 truncate text-lg font-medium tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CashRow({ label, value, sign, strong = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 text-sm ${strong ? "border-t border-border pt-2 font-semibold" : ""}`}>
      <span className={strong ? "text-foreground" : "text-muted-foreground"}>
        {sign ? <span className="mr-1 inline-block w-3 text-center">{sign}</span> : null}
        {label}
      </span>
      <span className="currency-nums tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Payroll's share of the company financial picture (current month, finalised runs).
 * Revenue is the dashboard's recognised revenue for the month; expenses exclude
 * bank lines already matched to a pay run so salaries are never counted twice.
 * This is a cash view, not accounting profit.
 */
export default function PayrollDashboardCard({ currency = "ZAR", revenueThisMonth = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    payrollApi
      .dashboard()
      .then((next) => {
        if (cancelled) return;
        // Businesses without payroll activity keep their dashboard unchanged.
        if (!next?.finalized_runs?.length && !next?.open_run) setHidden(true);
        setData(next);
      })
      .catch(() => {
        if (!cancelled) setHidden(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden) return null;
  const money = (n) => formatCurrency(Number(n || 0), currency);
  const payrollCost = Number(data?.total_employer_cost || 0);
  const operating = Number(data?.expenses?.operating || 0);
  const remaining = Number(revenueThisMonth || 0) - operating - payrollCost;
  const recon = data?.reconciliation;
  const reconHint = !data?.finalized_runs?.length
    ? "No finalised payroll yet this month"
    : recon?.variance
      ? `${recon.variance} pay run${recon.variance === 1 ? "" : "s"} with a bank variance`
      : recon?.awaiting
        ? "Bank payment not yet reconciled"
        : "Bank payment reconciled";

  return (
    <section className="dashboard-card px-4 py-4" aria-labelledby="dashboard-payroll-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="dashboard-payroll-heading" className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Payroll · {data?.month_label || "This month"}
        </h2>
        <Button variant="ghost" size="sm" asChild className="h-8 rounded-lg px-2 text-xs text-muted-foreground">
          <Link to={createPageUrl("Workforce/reports")}>
            Reports
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Metric label="Gross payroll" value={money(data?.gross_payroll)} hint={`${data?.employee_count || 0} employees`} />
            <Metric label="Net payroll" value={money(data?.net_payroll)} hint={reconHint} />
            <Metric label="PAYE liability" value={money(data?.paye)} />
            <Metric label="UIF liability" value={money(data?.uif_total)} hint="Employee + employer" />
            <Metric label="Employer cost" value={money(data?.total_employer_cost)} hint="Gross + employer contributions" />
            <Metric
              label="Payroll run"
              value={data?.open_run ? data.open_run.status?.replace(/_/g, " ") : "Up to date"}
              hint={
                data?.exceptions
                  ? `${data.exceptions} exception${data.exceptions === 1 ? "" : "s"} to review`
                  : data?.open_run?.period_label || null
              }
            />
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">Cash view (not accounting profit)</p>
            <CashRow label="Revenue received" value={money(revenueThisMonth)} />
            <CashRow label="Expenses" sign="−" value={money(operating)} />
            <CashRow label="Payroll (employer cost)" sign="−" value={money(payrollCost)} />
            <CashRow label="Remaining" sign="=" value={money(remaining)} strong />
            {Number(data?.expenses?.unmatched_salary || 0) > 0 ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {money(data.expenses.unmatched_salary)} of Salary expenses are not matched to a pay run and may double
                count payroll. Match them under Bank reconciliation on the pay run.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
