import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminPlatformOverview } from "@/api/fetchAdminPlatformOverview";
import { useCurrentUser } from "@/lib/useCurrentUser";
import MetricCard from "@/components/admin/ui/MetricCard";
import RevenueBreakdown from "@/components/admin/ui/RevenueBreakdown";
import AlertPanel from "@/components/admin/ui/AlertPanel";
import ActivityFeed from "@/components/admin/ui/ActivityFeed";
import AdminDataTable from "@/components/admin/ui/AdminDataTable";
import ChartCard from "@/components/admin/ui/ChartCard";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStates";
import { formatAdminZar, greetingForHour } from "@/components/admin/ui/adminFormat";
import { cn } from "@/lib/utils";

function healthLabel(status) {
  if (status === "critical") return "Critical";
  if (status === "attention") return "Attention required";
  return "Healthy";
}

export default function AdminV2Dashboard() {
  const { user } = useCurrentUser();
  const [period, setPeriod] = useState("monthly");
  const {
    data: overview,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-overview", period, null, null],
    queryFn: () => fetchAdminPlatformOverview(period),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const firstName = useMemo(() => {
    const name = String(user?.full_name || user?.email || "Admin");
    return name.split(" ")[0] || "Admin";
  }, [user]);

  const health = overview?.health || {};
  const kpis = overview?.kpis || {};
  const usage = overview?.usage || {};
  const subscriptions = overview?.subscriptions || {};
  const definitions = overview?.definitions || {};
  const contracted = kpis.contractedMrr || {};

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {greetingForHour()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Platform overview for Paidly — not a customer account.</p>
        </div>
        <Link to="/admin-v2/analytics" className="text-xs font-medium text-primary hover:underline">
          Open analytics →
        </Link>
      </div>

      {isError ? <AdminErrorState message={error?.message} onRetry={() => refetch()} /> : null}
      {isLoading && !overview ? <AdminLoadingState rows={3} className="mb-6" /> : null}

      {/* Who is on Paidly, and what is actually being earned. */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total users"
          value={kpis.totalUsers?.value}
          change={kpis.totalUsers?.change}
          compareLabel={overview?.compareLabel}
          hint={definitions.totalUsers}
          unavailable={kpis.totalUsers?.unavailable}
          unavailableReason={kpis.totalUsers?.unavailableReason}
        />
        <MetricCard
          title="Active businesses"
          value={kpis.activeBusinesses?.value}
          change={kpis.activeBusinesses?.change}
          compareLabel={overview?.compareLabel}
          hint={definitions.activeBusinesses}
          footnote={
            kpis.totalBusinesses?.value != null
              ? `${kpis.totalBusinesses.value} businesses registered`
              : null
          }
          unavailable={kpis.activeBusinesses?.unavailable}
          unavailableReason={kpis.activeBusinesses?.unavailableReason}
        />
        <MetricCard
          title="MRR"
          value={kpis.mrr?.value}
          isMoney
          hint={definitions.mrr}
          footnote={
            contracted.value
              ? `${formatAdminZar(contracted.value)} contracted${contracted.note ? ` · ${contracted.note}` : ""}`
              : null
          }
          unavailable={kpis.mrr?.unavailable}
          unavailableReason={kpis.mrr?.unavailableReason}
        />
        <MetricCard
          title="Revenue this period"
          value={overview?.revenue?.total}
          isMoney
          change={overview?.revenue?.change}
          compareLabel={overview?.compareLabel}
          hint={definitions.revenue}
          sparkline={overview?.revenue?.sparkline}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Platform health</h2>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                health.status === "critical" && "bg-red-50 text-red-700",
                health.status === "attention" && "bg-amber-50 text-amber-800",
                (!health.status || health.status === "healthy") && "bg-emerald-50 text-emerald-700"
              )}
            >
              {healthLabel(health.status)}
            </span>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Failed SaaS payments</dt><dd className="tabular-nums">{health.failedPayments ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Pending intents</dt><dd className="tabular-nums">{health.pendingPaymentIntents ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Subscriptions at risk</dt><dd className="tabular-nums">{health.businessesAtRisk ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Active subscriptions</dt><dd className="tabular-nums">{subscriptions.active ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">On trial</dt><dd className="tabular-nums">{subscriptions.trial ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">POS adoption</dt><dd className="tabular-nums">{usage.pos?.adoptionRate == null ? "—" : `${usage.pos.adoptionRate}%`}</dd></div>
          </dl>
          <Link to="/admin-v2/system-health" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
            Open system health →
          </Link>
        </section>
        <div className="xl:col-span-2">
          <AlertPanel items={overview?.attention || []} isLoading={isLoading && !overview} />
        </div>
      </div>

      <div className="mb-5">
        <RevenueBreakdown
          revenue={overview?.revenue}
          period={period}
          onPeriodChange={setPeriod}
          compareLabel={overview?.compareLabel}
        />
      </div>

      {/* Product usage — one row, no repeats of the same underlying count. */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard title="Invoices created" value={usage.invoices?.period} change={usage.invoices?.change} compareLabel={overview?.compareLabel} />
        <MetricCard title="Quotes created" value={usage.quotes?.period} change={usage.quotes?.change} compareLabel={overview?.compareLabel} />
        <MetricCard title="POS transactions" value={usage.pos?.period} compareLabel={overview?.compareLabel} />
        <MetricCard
          title="Employees managed"
          value={usage.workforce?.employees}
          hint={definitions.employees}
          footnote={
            usage.workforce?.companiesWithEmployees != null
              ? `across ${usage.workforce.companiesWithEmployees} businesses`
              : null
          }
        />
      </div>

      <div className="mb-5">
        <ActivityFeed items={overview?.activity || []} isLoading={isLoading && !overview} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Recent businesses"
          description="Newest organisations on Paidly. Internal/test tenants are labelled."
          action={
            <Link to="/admin-v2/businesses" className="text-xs font-medium text-primary hover:underline">
              View all businesses →
            </Link>
          }
        >
          <AdminDataTable
            columns={[
              { key: "business", label: "Business" },
              { key: "plan", label: "Plan" },
              { key: "status", label: "Status", type: "status" },
              { key: "extra", label: "Flag" },
              { key: "date", label: "Created", type: "date" },
            ]}
            rows={overview?.recentBusinesses || []}
            isLoading={isLoading && !overview}
            emptyTitle="No businesses yet"
          />
        </ChartCard>
        <ChartCard
          title="Paidly transactions"
          description="Subscription payments from payment_history. Customer invoice/POS sales are not Paidly revenue."
          action={
            <Link to="/admin-v2/transactions" className="text-xs font-medium text-primary hover:underline">
              View Paidly transactions →
            </Link>
          }
        >
          <AdminDataTable
            columns={[
              { key: "title", label: "Transaction" },
              { key: "business", label: "Business" },
              { key: "amount", label: "Amount", type: "money" },
              { key: "status", label: "Status", type: "status" },
              { key: "extra", label: "Method" },
              { key: "date", label: "Date", type: "date" },
            ]}
            rows={overview?.recentTransactions || []}
            isLoading={isLoading && !overview}
            emptyTitle="No Paidly payments yet"
          />
        </ChartCard>
      </div>
    </div>
  );
}
