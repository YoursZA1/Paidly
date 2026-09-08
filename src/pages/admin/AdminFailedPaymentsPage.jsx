import { useQuery } from "@tanstack/react-query";
import { fetchAdminFailedPayments } from "@/api/fetchAdminFailedPayments";
import PageContainer from "@/components/admin/shell/PageContainer";
import FailedPaymentsTable from "@/components/dashboard/FailedPaymentsTable";

export default function AdminFailedPaymentsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["failed-payments"],
    queryFn: () => fetchAdminFailedPayments(80),
    staleTime: 60000,
  });

  return (
    <PageContainer
      title="Failed payments"
      description="Failed Paidly subscription payments. Use this to find businesses that need billing help. Customer Payment Engine failures are on Payment Intents."
      onRefresh={() => refetch()}
      isRefreshing={isFetching}
    >
      <FailedPaymentsTable
        rows={data?.failedPayments || []}
        isLoading={isLoading}
        errorMessage={isError ? error?.message : null}
      />
    </PageContainer>
  );
}
