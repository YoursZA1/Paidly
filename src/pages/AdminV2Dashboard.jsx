import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminPlatformOverview } from "@/api/fetchAdminPlatformOverview";
import { useCurrentUser } from "@/lib/useCurrentUser";
import MetricCard from "@/components/admin/ui/MetricCard";
import RevenueBreakdown from "@/components/admin/ui/RevenueBreakdown";
import AlertPanel from "@/components/admin/ui/AlertPanel";
import ActivityFeed from "@/components/admin/ui/ActivityFeed";
import QuickActions from "@/components/admin/ui/QuickActions";
import AdminDataTable from "@/components/admin/ui/AdminDataTable";
import ChartCard from "@/components/admin/ui/ChartCard";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStates";
import { greetingForHour } from "@/components/admin/ui/adminFormat";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  { label: "Add Business", to: "/admin-v2/settings" },
  { label: "View Users", to: "/admin-v2/users" },
  { label: "Review Payments", to: "/admin-v2/payments" },
  { label: "View Failed Payments", to: "/admin-v2/failed-payments" },
  { label: "Create Announcement", to: "/admin-v2/messages" },
  { label: "Manage Subscriptions", to: "/admin-v2/subscriptions" },
  { label: "View Audit Logs", to: "/admin-v2/audit-log" },
];

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
    queryKey: ["admin-overview", period],
    queryFn: () => fetchAdminPlatformOverview(period),
    staleTime: 60000,
    refetchInterval: 120000,
    refetchOnWindowFocus: false,
  });

  const firstName = useMemo(() => {
    const name = String(user?.full_name || user?.email || "Admin");
    return name.split(" ")[0] || "Admin";
  }, [user]);

  const health = overview?.health || {};
  const kpis = overview?.kpis || {};

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {greetingForHour()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here’s what’s happening across Paidly today.</p>
        </div>
      </div>

      {isError ? <AdminErrorState message={error?.message} onRetry={() => refetch()} /> : null}
      {isLoading && !overview ? <AdminLoadingState rows={3} className="mb-6" /> : null}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Active businesses"
          value={kpis.activeBusinesses?.value}
          change={kpis.activeBusinesses?.change}
          compareLabel={overview?.compareLabel}
          unavailable={kpis.activeBusinesses?.unavailable}
          unavailableReason={kpis.activeBusinesses?.unavailableReason}
        />
        <MetricCard
          title="Monthly revenue"
          value={kpis.monthlyRevenue?.value}
          change={kpis.monthlyRevenue?.change}
          compareLabel={overview?.compareLabel}
          isMoney
          sparkline={overview?.revenue?.sparkline}
        />
        <MetricCard
          title="Documents processed"
          value={kpis.documentsProcessed?.value}
          change={kpis.documentsProcessed?.change}
          compareLabel={overview?.compareLabel}
          unavailable={kpis.documentsProcessed?.unavailable}
          unavailableReason={kpis.documentsProcessed?.unavailableReason}
        />
        <MetricCard
          title="Payments processed"
          value={kpis.paymentsProcessed?.value}
          change={kpis.paymentsProcessed?.change}
          compareLabel={overview?.compareLabel}
        />
        <MetricCard
          title="Platform users"
          value={kpis.platformUsers?.value}
          unavailable={kpis.platformUsers?.unavailable}
          unavailableReason={kpis.platformUsers?.unavailableReason}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueBreakdown
            revenue={overview?.revenue}
            period={period}
            onPeriodChange={setPeriod}
            compareLabel={overview?.compareLabel}
          />
        </div>
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
            <div className="flex justify-between"><dt className="text-muted-foreground">Active businesses</dt><dd className="tabular-nums">{health.activeBusinesses ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">On trial</dt><dd className="tabular-nums">{health.businessesOnTrial ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">At risk</dt><dd className="tabular-nums">{health.businessesAtRisk ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Failed payments</dt><dd className="tabular-nums">{health.failedPayments ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Pending intents</dt><dd className="tabular-nums">{health.pendingPaymentIntents ?? "—"}</dd></div>
          </dl>
          <Link to="/admin-v2/system-health" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
            Open system health →
          </Link>
        </section>
      </div>

      <div className="mb-5">
        <AlertPanel items={overview?.attention || []} isLoading={isLoading && !overview} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ActivityFeed items={overview?.activity || []} isLoading={isLoading && !overview} />
        </div>
        <QuickActions actions={QUICK_ACTIONS} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Recent businesses"
          description="Newest organisations on Paidly."
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
              { key: "documents", label: "Documents" },
              { key: "revenue", label: "Revenue", type: "money" },
              { key: "date", label: "Created", type: "date" },
            ]}
            rows={overview?.recentBusinesses || []}
            isLoading={isLoading && !overview}
            emptyTitle="No businesses yet"
          />
        </ChartCard>
        <ChartCard
          title="Recent transactions"
          description="Subscription, invoice, POS, and refunds."
          action={
            <Link to="/admin-v2/transactions" className="text-xs font-medium text-primary hover:underline">
              View all transactions →
            </Link>
          }
        >
          <AdminDataTable
            columns={[
              { key: "title", label: "Transaction" },
              { key: "business", label: "Business" },
              { key: "type", label: "Type" },
              { key: "amount", label: "Amount", type: "money" },
              { key: "status", label: "Status", type: "status" },
              { key: "extra", label: "Method" },
              { key: "date", label: "Date", type: "date" },
            ]}
            rows={overview?.recentTransactions || []}
            isLoading={isLoading && !overview}
            emptyTitle="No transactions yet"
          />
        </ChartCard>
      </div>
    </div>
  );
}
