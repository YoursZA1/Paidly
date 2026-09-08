import { useQuery } from "@tanstack/react-query";
import { fetchAdminPlatformOverview } from "@/api/fetchAdminPlatformOverview";
import PageContainer from "@/components/admin/shell/PageContainer";
import MetricCard from "@/components/admin/ui/MetricCard";
import { AdminErrorState, AdminUnavailableState } from "@/components/admin/ui/AdminStates";

const COPY = {
  business: {
    title: "Business report",
    description: "Who is using Paidly — growth and subscription posture, not customer books.",
  },
  revenue: {
    title: "Revenue report",
    description: "Paidly SaaS revenue from payment_history and active subscriptions. Customer invoice/POS totals are excluded.",
  },
  documents: {
    title: "Document report",
    description: "Platform document creation volume. Amounts stay with the customer.",
  },
  workforce: {
    title: "Workforce report",
    description: "Workforce adoption across Paidly — not Admin’s own company HR.",
  },
  platform: {
    title: "Platform analytics",
    description: "How Paidly is being used: growth, feature volume, and operational health.",
  },
};

export default function AdminReportsPage({ report }) {
  const meta = COPY[report] || COPY.platform;
  const { data, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-overview", "monthly"],
    queryFn: () => fetchAdminPlatformOverview("monthly"),
    staleTime: 60000,
  });
  const usage = data?.usage || {};
  const growth = data?.growth || {};
  const kpis = data?.kpis || {};
  const subscriptions = data?.subscriptions || {};

  return (
    <PageContainer title={meta.title} description={meta.description} onRefresh={() => refetch()} isRefreshing={isFetching}>
      {isError ? <AdminErrorState message={error?.message} onRetry={() => refetch()} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {report === "business" ? (
          <>
            <MetricCard title="Active businesses" value={data?.health?.activeBusinesses} />
            <MetricCard title="New this period" value={growth.newBusinesses} change={growth.newBusinessesChange} compareLabel={data?.compareLabel} />
            <MetricCard title="On trial" value={subscriptions.trial ?? data?.health?.businessesOnTrial} />
            <MetricCard title="Cancelled this period" value={growth.cancelled} />
          </>
        ) : null}
        {report === "revenue" ? (
          <>
            <MetricCard title="MRR" value={kpis.mrr?.value} isMoney unavailable={kpis.mrr?.unavailable} unavailableReason={kpis.mrr?.unavailableReason} />
            <MetricCard title="Paidly revenue" value={data?.revenue?.total} isMoney />
            <MetricCard title="Active subscriptions" value={kpis.activeSubscriptions?.value} />
            <MetricCard title="Failed SaaS payments" value={data?.health?.failedPayments} />
          </>
        ) : null}
        {report === "documents" ? (
          <>
            <MetricCard title="Invoices (all time)" value={usage.invoices?.total ?? data?.reports?.documents?.invoices} />
            <MetricCard title="Invoices this period" value={usage.invoices?.period ?? data?.reports?.documents?.invoicesPeriod} change={usage.invoices?.change} compareLabel={data?.compareLabel} />
            <MetricCard title="Quotes this period" value={usage.quotes?.period ?? data?.reports?.documents?.quotesPeriod} />
            <MetricCard title="POS this period" value={usage.pos?.period ?? data?.reports?.documents?.posPeriod} />
          </>
        ) : null}
        {report === "workforce" ? (
          usage.workforce?.employees == null && data?.reports?.workforce?.employees == null ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <AdminUnavailableState reason="Workforce tables are not available in this environment." />
            </div>
          ) : (
            <>
              <MetricCard title="Employees managed" value={usage.workforce?.employees ?? data?.reports?.workforce?.employees} />
              <MetricCard title="Payroll profiles" value={usage.workforce?.payroll ?? data?.reports?.workforce?.payroll} />
              <MetricCard title="Leave requests" value={usage.workforce?.leave ?? data?.reports?.workforce?.leave} />
              <MetricCard title="Payslips" value={usage.workforce?.payslips ?? data?.reports?.workforce?.payslips} />
            </>
          )
        ) : null}
        {report === "platform" ? (
          <>
            <MetricCard title="Total users" value={kpis.totalUsers?.value ?? kpis.platformUsers?.value} />
            <MetricCard title="Active businesses" value={kpis.activeBusinesses?.value} />
            <MetricCard title="Feature usage this period" value={kpis.platformUsage?.value} change={kpis.platformUsage?.change} compareLabel={data?.compareLabel} />
            <MetricCard title="Failed SaaS payments" value={data?.health?.failedPayments} />
          </>
        ) : null}
      </div>
      {report === "platform" && usage.pageViews?.unavailable ? (
        <p className="mt-4 text-xs text-muted-foreground">{usage.pageViews.unavailableReason}</p>
      ) : null}
    </PageContainer>
  );
}
