import { useQuery } from "@tanstack/react-query";
import { fetchAdminPlatformOverview } from "@/api/fetchAdminPlatformOverview";
import PageContainer from "@/components/admin/shell/PageContainer";
import MetricCard from "@/components/admin/ui/MetricCard";
import { AdminErrorState, AdminUnavailableState } from "@/components/admin/ui/AdminStates";

const COPY = {
  business: {
    title: "Business reports",
    description: "Organisation and trial posture from live tables.",
  },
  revenue: {
    title: "Revenue reports",
    description: "Source-split revenue for the current month.",
  },
  documents: {
    title: "Document reports",
    description: "Invoice, quote, and payslip counts from the latest overview sample.",
  },
  workforce: {
    title: "Workforce reports",
    description: "Platform-wide workforce analytics are not aggregated yet. Use Employees, Payroll, Leave, and Payslips modules.",
  },
  platform: {
    title: "Platform analytics",
    description: "High-level platform counts. No invented engagement scores.",
  },
};

export default function AdminReportsPage({ report }) {
  const meta = COPY[report] || COPY.platform;
  const { data, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-overview", "monthly"],
    queryFn: () => fetchAdminPlatformOverview("monthly"),
    staleTime: 60000,
  });

  return (
    <PageContainer title={meta.title} description={meta.description} onRefresh={() => refetch()} isRefreshing={isFetching}>
      {isError ? <AdminErrorState message={error?.message} onRetry={() => refetch()} /> : null}
      {report === "workforce" ? (
        <AdminUnavailableState reason={meta.description} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report === "business" ? (
            <>
              <MetricCard title="Active businesses" value={data?.health?.activeBusinesses} />
              <MetricCard title="On trial" value={data?.health?.businessesOnTrial} />
              <MetricCard title="At risk" value={data?.health?.businessesAtRisk} />
              <MetricCard title="Waitlist" value={data?.health?.waitlist} />
            </>
          ) : null}
          {report === "revenue" ? (
            <>
              <MetricCard title="Subscription" value={data?.revenue?.sources?.subscription?.amount} isMoney />
              <MetricCard title="Invoice" value={data?.revenue?.sources?.invoice?.amount} isMoney unavailable={data?.revenue?.sources?.invoice?.unavailable} unavailableReason={data?.revenue?.sources?.invoice?.unavailableReason} />
              <MetricCard title="POS" value={data?.revenue?.sources?.pos?.amount} isMoney unavailable={data?.revenue?.sources?.pos?.unavailable} unavailableReason={data?.revenue?.sources?.pos?.unavailableReason} />
              <MetricCard title="Total" value={data?.revenue?.total} isMoney />
            </>
          ) : null}
          {report === "documents" ? (
            <>
              <MetricCard title="Invoices (sample)" value={data?.reports?.documents?.invoices} />
              <MetricCard title="Quotes (sample)" value={data?.reports?.documents?.quotes} />
              <MetricCard title="Payslips (sample)" value={data?.reports?.documents?.payslips} />
              <MetricCard title="Documents this period" value={data?.kpis?.documentsProcessed?.value} />
            </>
          ) : null}
          {report === "platform" ? (
            <>
              <MetricCard title="Platform users" value={data?.kpis?.platformUsers?.value} />
              <MetricCard title="Active businesses" value={data?.kpis?.activeBusinesses?.value} />
              <MetricCard title="Payments this period" value={data?.kpis?.paymentsProcessed?.value} />
              <MetricCard title="Failed payments" value={data?.health?.failedPayments} />
            </>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
