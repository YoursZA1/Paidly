import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { Users, CreditCard, ClipboardList, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import StatCard from '@/components/dashboard/StatCard';
import PageHeader from '@/components/dashboard/PageHeader';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PlanBadge from '@/components/dashboard/PlanBadge';
import RevenueChart from '@/components/dashboard/RevenueChart';
import RecentActivity from '@/components/dashboard/RecentActivity';

const DASHBOARD_QUERY_KEYS = ['platform-users', 'subscriptions', 'affiliates', 'waitlist'];

export default function AdminV2Dashboard() {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(Date.now());
  const dashboardRefreshing =
    useIsFetching({
      predicate: (q) => DASHBOARD_QUERY_KEYS.includes(String(q.queryKey[0])),
    }) > 0;

  const handleRefresh = () => {
    DASHBOARD_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  const { data: users = [], dataUpdatedAt: usersUpdatedAt } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => paidly.entities.PlatformUser.list('-created_date', 100),
    refetchInterval: 30000,
  });

  const { data: subscriptions = [], dataUpdatedAt: subscriptionsUpdatedAt } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => paidly.entities.Subscription.list('-created_date', 100),
    refetchInterval: 30000,
  });

  const { data: affiliates = [], dataUpdatedAt: affiliatesUpdatedAt } = useQuery({
    queryKey: ['affiliates'],
    queryFn: () => paidly.entities.AffiliateSubmission.list('-created_date', 100),
    refetchInterval: 30000,
  });

  const { data: waitlist = [], dataUpdatedAt: waitlistUpdatedAt } = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => paidly.entities.WaitlistEntry.list('-created_date', 100),
    refetchInterval: 30000,
  });

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastUpdatedAt = useMemo(
    () => Math.max(usersUpdatedAt || 0, subscriptionsUpdatedAt || 0, affiliatesUpdatedAt || 0, waitlistUpdatedAt || 0),
    [usersUpdatedAt, subscriptionsUpdatedAt, affiliatesUpdatedAt, waitlistUpdatedAt]
  );

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return 'Last updated: waiting for data...';
    const seconds = Math.max(0, Math.floor((tick - lastUpdatedAt) / 1000));
    if (seconds < 5) return 'Last updated: just now';
    if (seconds < 60) return `Last updated: ${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Last updated: ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `Last updated: ${hours}h ago`;
  }, [lastUpdatedAt, tick]);

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
  const monthlyRevenue = activeSubscriptions.reduce((sum, s) => sum + (s.amount || 0), 0);
  const pendingAffiliates = affiliates.filter((a) => a.status === 'pending');

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Overview of your Paidly platform · ${lastUpdatedLabel}`}
        onRefresh={handleRefresh}
        isRefreshing={dashboardRefreshing}
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={users.length}
          change={`+${Math.min(users.length, 12)}`}
          icon={Users}
        />
        <StatCard
          title="Active Subscriptions"
          value={activeSubscriptions.length}
          change={`+${Math.min(activeSubscriptions.length, 8)}`}
          icon={CreditCard}
        />
        <StatCard
          title="Monthly Revenue"
          value={`R ${monthlyRevenue.toLocaleString()}`}
          change="+12%"
          icon={DollarSign}
        />
        <StatCard
          title="Waitlist"
          value={waitlist.length}
          change={`+${Math.min(waitlist.length, 5)}`}
          icon={ClipboardList}
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart subscriptions={subscriptions} />
        </div>
        <RecentActivity
          users={users}
          affiliates={affiliates}
          pendingAffiliateCount={pendingAffiliates.length}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold">Recent Subscriptions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">User</th>
                <th className="px-6 py-3 text-left font-medium">Plan</th>
                <th className="px-6 py-3 text-left font-medium">Amount</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.slice(0, 5).map((sub) => (
                <tr key={sub.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium">{sub.user_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{sub.user_email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <PlanBadge plan={sub.plan || 'none'} />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">R {sub.amount}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={sub.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {sub.created_date ? format(new Date(sub.created_date), 'dd MMM yyyy') : '—'}
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No subscriptions yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
