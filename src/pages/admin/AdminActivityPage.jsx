import { useQuery } from "@tanstack/react-query";
import { fetchAdminPlatformOverview } from "@/api/fetchAdminPlatformOverview";
import PageContainer from "@/components/admin/shell/PageContainer";
import ActivityFeed from "@/components/admin/ui/ActivityFeed";

export default function AdminActivityPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-overview", "monthly"],
    queryFn: () => fetchAdminPlatformOverview("monthly"),
    staleTime: 60000,
  });

  return (
    <PageContainer
      title="Activity"
      description="Recent platform events from businesses, subscriptions, invoices, POS, and failed payments."
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
    >
      <ActivityFeed
        items={data?.activity || []}
        isLoading={isLoading}
        errorMessage={isError ? error?.message : null}
        onRetry={() => refetch()}
        viewAllTo="/admin-v2/activity"
      />
    </PageContainer>
  );
}
