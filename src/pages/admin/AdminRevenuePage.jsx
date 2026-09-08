import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminPlatformOverview } from "@/api/fetchAdminPlatformOverview";
import { fetchAdminRevenueMetrics } from "@/api/fetchAdminRevenueMetrics";
import PageContainer from "@/components/admin/shell/PageContainer";
import RevenueBreakdown from "@/components/admin/ui/RevenueBreakdown";
import MetricCard from "@/components/admin/ui/MetricCard";
import { AdminErrorState } from "@/components/admin/ui/AdminStates";

export default function AdminRevenuePage() {
  const [period, setPeriod] = useState("monthly");
  const overviewQuery = useQuery({
    queryKey: ["admin-overview", period],
    queryFn: () => fetchAdminPlatformOverview(period),
    staleTime: 60000,
  });
  const saasQuery = useQuery({
    queryKey: ["revenue-metrics"],
    queryFn: () => fetchAdminRevenueMetrics(),
    staleTime: 60000,
  });

  const overview = overviewQuery.data;
  const saas = saasQuery.data?.metrics;

  return (
    <PageContainer
      title="Revenue"
      description="SaaS subscription cash is payment_history. Invoice and POS totals come from their own settlement tables."
      onRefresh={() => {
        overviewQuery.refetch();
        saasQuery.refetch();
      }}
      isRefreshing={overviewQuery.isFetching || saasQuery.isFetching}
    >
      {overviewQuery.isError ? <AdminErrorState message={overviewQuery.error?.message} onRetry={() => overviewQuery.refetch()} /> : null}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard title="Recognised MRR" value={saas?.mrr} isMoney unavailable={saasQuery.isError} unavailableReason={saasQuery.error?.message} />
        <MetricCard title="ARR" value={saas?.arr} isMoney unavailable={saasQuery.isError} unavailableReason={saasQuery.error?.message} />
        <MetricCard title="Period total" value={overview?.revenue?.total} isMoney />
      </div>
      <RevenueBreakdown
        revenue={overview?.revenue}
        period={period}
        onPeriodChange={setPeriod}
        compareLabel={overview?.compareLabel}
      />
    </PageContainer>
  );
}
