import { useQuery } from "@tanstack/react-query";
import { fetchAdminPlatformOverview } from "@/api/fetchAdminPlatformOverview";
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { authedApiRequest } from "@/lib/authedApiRequest";
import PageContainer from "@/components/admin/shell/PageContainer";
import ChartCard from "@/components/admin/ui/ChartCard";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStates";

export default function AdminSystemHealthPage() {
  const overviewQuery = useQuery({
    queryKey: ["admin-overview", "monthly"],
    queryFn: () => fetchAdminPlatformOverview("monthly"),
    staleTime: 60000,
  });
  const healthQuery = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: async () => {
      const res = await authedApiRequest("/api/admin/system-health", { method: "GET" }, "admin-system-health-missing-token");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load system health");
      return json?.summary || json;
    },
    staleTime: 30000,
  });
  const securityQuery = useQuery({
    queryKey: ["security-events"],
    queryFn: async () => {
      const session = await getStableSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/security/events", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Security endpoint failed");
      return json?.summary || null;
    },
    staleTime: 60000,
    retry: false,
  });

  const health = overviewQuery.data?.health || {};

  return (
    <PageContainer
      title="System health"
      description="Live checks only: database probe, last SaaS payment_history row, last email send, and in-process HTTP counters. Decorative statuses are not invented."
      onRefresh={() => {
        overviewQuery.refetch();
        healthQuery.refetch();
        securityQuery.refetch();
      }}
      isRefreshing={overviewQuery.isFetching || healthQuery.isFetching}
    >
      {overviewQuery.isError ? <AdminErrorState message={overviewQuery.error?.message} onRetry={() => overviewQuery.refetch()} /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Business posture" description="Live counts from organisations and subscriptions.">
          {overviewQuery.isLoading ? <AdminLoadingState rows={3} /> : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Active businesses</dt><dd>{health.activeBusinesses ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">On trial</dt><dd>{health.businessesOnTrial ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">At risk</dt><dd>{health.businessesAtRisk ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Failed payments</dt><dd>{health.failedPayments ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Pending intents</dt><dd>{health.pendingPaymentIntents ?? "—"}</dd></div>
            </dl>
          )}
        </ChartCard>
        <ChartCard title="API / integrations" description="From /api/admin/system-health and security events.">
          {healthQuery.isLoading ? <AdminLoadingState rows={3} /> : null}
          {healthQuery.isError ? <p className="text-sm text-destructive">{healthQuery.error?.message}</p> : null}
          {healthQuery.data ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">API</dt><dd>{healthQuery.data.api?.label || healthQuery.data.api?.status || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd>{healthQuery.data.email?.label || healthQuery.data.email?.status || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Payments</dt><dd>{healthQuery.data.payments?.label || healthQuery.data.payments?.status || "—"}</dd></div>
            </dl>
          ) : null}
          <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
            {["status401", "status403", "status404", "status429", "status5xx"].map((key) => (
              <div key={key} className="rounded-xl border border-border p-2">
                <p className="text-muted-foreground">{key.replace("status", "")}</p>
                <p className="font-semibold tabular-nums">{securityQuery.data?.counts?.[key] ?? "—"}</p>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </PageContainer>
  );
}
