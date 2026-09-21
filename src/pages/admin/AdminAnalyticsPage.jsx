import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchAdminPlatformOverview } from "@/api/fetchAdminPlatformOverview";
import PageContainer from "@/components/admin/shell/PageContainer";
import ChartCard from "@/components/admin/ui/ChartCard";
import MetricCard from "@/components/admin/ui/MetricCard";
import AdminDataTable from "@/components/admin/ui/AdminDataTable";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStates";
import { formatAdminZar } from "@/components/admin/ui/adminFormat";
import { cn } from "@/lib/utils";

/**
 * Platform analytics. Every series comes from `admin_platform_metrics`
 * (one aggregate query, Africa/Johannesburg buckets) — the same payload the
 * dashboard KPIs use, so a chart can never disagree with a card.
 * Ranges change the database query, not just the axis labels.
 */
const RANGES = [
  { id: "7d", label: "7 days", days: 7, period: "weekly", grain: "daily" },
  { id: "30d", label: "30 days", days: 30, period: "monthly", grain: "daily" },
  { id: "90d", label: "90 days", days: 90, period: "monthly", grain: "daily" },
  { id: "12m", label: "12 months", months: 12, period: "yearly", grain: "monthly" },
];

function shortDay(iso) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function shortMonth(value) {
  if (!value) return "";
  const d = new Date(`${value}-01T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
}

function ChartFrame({ children }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 11, tickLine: false, axisLine: false };
const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid hsl(var(--border))",
    fontSize: 12,
    background: "hsl(var(--card))",
  },
};

/** Distinguishes "nothing happened" from "we have no history yet". */
function SeriesEmpty({ metric, firstEventAt }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-medium text-foreground">No {metric} in this period</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {firstEventAt
          ? `Paidly has data from ${shortDay(firstEventAt)}. Pick a wider range to see more.`
          : `Paidly has not recorded any ${metric} yet, so there is nothing to chart.`}
      </p>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [rangeId, setRangeId] = useState("30d");
  const range = RANGES.find((r) => r.id === rangeId) || RANGES[1];

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-overview", range.period, range.days || null, range.months || null],
    queryFn: () =>
      fetchAdminPlatformOverview(range.period, { days: range.days, months: range.months }),
    staleTime: 60_000,
  });

  const daily = useMemo(() => data?.series?.daily || [], [data?.series?.daily]);
  const monthly = useMemo(() => data?.series?.monthly || [], [data?.series?.monthly]);
  const history = data?.series?.history || {};
  const isMonthly = range.grain === "monthly";

  const growth = useMemo(
    () =>
      isMonthly
        ? monthly.map((m) => ({ label: shortMonth(m.month), users: m.newUsers, businesses: m.newBusinesses }))
        : daily.map((d) => ({ label: shortDay(d.day), users: d.newUsers, businesses: d.newBusinesses })),
    [isMonthly, monthly, daily]
  );
  const revenue = useMemo(
    () =>
      isMonthly
        ? monthly.map((m) => ({ label: shortMonth(m.month), revenue: m.revenue, payments: m.payments }))
        : daily.map((d) => ({ label: shortDay(d.day), revenue: d.revenue })),
    [isMonthly, monthly, daily]
  );
  const subscriptionTrend = useMemo(
    () => monthly.map((m) => ({ label: shortMonth(m.month), started: m.subscriptionsStarted, cancelled: m.subscriptionsCancelled })),
    [monthly]
  );
  // Daily grain only — the monthly series does not carry per-document counts.
  const documents = useMemo(
    () => (isMonthly ? [] : daily.map((d) => ({ label: shortDay(d.day), invoices: d.invoices, quotes: d.quotes }))),
    [isMonthly, daily]
  );

  const usage = data?.usage || {};
  const productUsage = [
    { name: "Invoices", value: usage.invoices?.period ?? 0 },
    { name: "Quotes", value: usage.quotes?.period ?? 0 },
    { name: "Payslips", value: usage.payslips?.period ?? 0 },
    { name: "POS sales", value: usage.pos?.period ?? 0 },
    { name: "Leave", value: usage.leave?.period ?? 0 },
    { name: "Recurring", value: usage.recurring?.period ?? 0 },
  ];

  const growthHasData = growth.some((r) => r.users || r.businesses);
  const revenueHasData = revenue.some((r) => Number(r.revenue) > 0);
  const subsHasData = subscriptionTrend.some((r) => r.started || r.cancelled);
  const docsHasData = documents.some((r) => r.invoices || r.quotes);
  const usageHasData = productUsage.some((r) => Number(r.value) > 0);

  return (
    <PageContainer
      title="Platform analytics"
      description="Growth, revenue and product usage from Paidly's own records. Customer invoice and POS money belongs to the tenant and is never counted as Paidly revenue."
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border bg-muted/40 p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              className={cn(
                "min-h-9 rounded-full px-3 text-xs font-medium",
                rangeId === r.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {data?.timezone ? (
          <span className="text-[11px] text-muted-foreground">Days grouped in {data.timezone}</span>
        ) : null}
      </div>

      {isError ? <AdminErrorState message={error?.message} onRetry={() => refetch()} /> : null}
      {isLoading && !data ? <AdminLoadingState rows={3} className="mb-6" /> : null}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="New users" value={data?.growth?.newUsers} change={data?.growth?.newUsersChange} compareLabel={data?.compareLabel} />
        <MetricCard title="New businesses" value={data?.growth?.newBusinesses} change={data?.growth?.newBusinessesChange} compareLabel={data?.compareLabel} />
        <MetricCard title="Paidly revenue" value={data?.revenue?.total} isMoney change={data?.revenue?.change} compareLabel={data?.compareLabel} />
        <MetricCard title="Feature usage" value={data?.kpis?.platformUsage?.value} change={data?.kpis?.platformUsage?.change} compareLabel={data?.compareLabel} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="User & business growth" description={`New signups per ${isMonthly ? "month" : "day"} from auth accounts and customer organisations.`}>
          {growthHasData ? (
            <ChartFrame>
              <LineChart data={growth} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" {...axis} minTickGap={16} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="users" name="Users" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="businesses" name="Businesses" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartFrame>
          ) : (
            <SeriesEmpty metric="signups" firstEventAt={history.first_user_at} />
          )}
        </ChartCard>

        <ChartCard title="Paidly revenue" description="Completed subscription payments (payment_history).">
          {revenueHasData ? (
            <ChartFrame>
              <LineChart data={revenue} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" {...axis} minTickGap={16} />
                <YAxis {...axis} tickFormatter={(v) => formatAdminZar(v)} width={78} />
                <Tooltip {...tooltipStyle} formatter={(v) => formatAdminZar(v)} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartFrame>
          ) : (
            <SeriesEmpty metric="completed payments" firstEventAt={history.first_payment_at} />
          )}
        </ChartCard>

        <ChartCard title="Subscription trend" description="Subscriptions started vs cancelled per month.">
          {subsHasData ? (
            <ChartFrame>
              <BarChart data={subscriptionTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" {...axis} minTickGap={12} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="started" name="Started" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancelled" name="Cancelled" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartFrame>
          ) : (
            <SeriesEmpty metric="subscription changes" firstEventAt={history.first_business_at} />
          )}
        </ChartCard>

        <ChartCard title="Product usage" description={`Documents and activity created in the selected period (${data?.compareLabel || "current period"}).`}>
          {usageHasData ? (
            <ChartFrame>
              <BarChart data={productUsage} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" name="Created" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartFrame>
          ) : (
            <SeriesEmpty metric="document activity" firstEventAt={history.first_business_at} />
          )}
        </ChartCard>

        {!isMonthly ? (
          <ChartCard title="Document activity" description="Invoices and quotes created per day.">
            {docsHasData ? (
              <ChartFrame>
                <LineChart data={documents} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" {...axis} minTickGap={16} />
                  <YAxis allowDecimals={false} {...axis} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="invoices" name="Invoices" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="quotes" name="Quotes" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartFrame>
            ) : (
              <SeriesEmpty metric="documents" firstEventAt={history.first_business_at} />
            )}
          </ChartCard>
        ) : null}

        <ChartCard title="Plan mix" description="Live subscriptions by plan family, with monthly-equivalent value.">
          <AdminDataTable
            columns={[
              { key: "label", label: "Plan" },
              { key: "live", label: "Live subscriptions" },
              { key: "mrrLabel", label: "Contracted / month" },
            ]}
            rows={(data?.planMix || []).map((p) => ({ ...p, mrrLabel: formatAdminZar(p.mrr) }))}
            isLoading={isLoading && !data}
            emptyTitle="No live subscriptions"
          />
        </ChartCard>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Revenue counts completed rows in payment_history only. Contracted value of live subscriptions is shown separately on the
        dashboard, because a subscription that has never been paid is not revenue.
      </p>
    </PageContainer>
  );
}
