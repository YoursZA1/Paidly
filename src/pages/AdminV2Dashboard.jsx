import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { affiliateApplicationsAdminQueryFn } from '@/api/fetchAdminAffiliateApplications';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import { adminUserNameEmailLines } from '@/utils/adminUserDisplay';
import {
  Users,
  CreditCard,
  ClipboardList,
  DollarSign,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  FileText,
  ScrollText,
  Banknote,
} from 'lucide-react';
import { format } from 'date-fns';
import StatCard from '@/components/dashboard/StatCard';
import PageHeader from '@/components/dashboard/PageHeader';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PlanBadge from '@/components/dashboard/PlanBadge';
import RevenueChart from '@/components/dashboard/RevenueChart';
import RecentActivity from '@/components/dashboard/RecentActivity';
import { supabase } from '@/lib/supabaseClient';
import { countByUserId } from '@/utils/documentOwnership';
import {
  EMPTY_AFFILIATE_ADMIN_BUNDLE,
  normalizeAffiliateAdminQueryResult,
} from '@/utils/affiliateApplicationCounts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

const DASHBOARD_QUERY_KEYS = [
  'platform-users',
  'subscriptions',
  'affiliates',
  'waitlist',
  'invoices',
  'quotes',
  'payslips',
];

export default function AdminV2Dashboard() {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(Date.now());
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const dashboardRefreshing =
    useIsFetching({
      predicate: (q) => DASHBOARD_QUERY_KEYS.includes(String(q.queryKey[0])),
    }) > 0;

  const handleRefresh = () => {
    DASHBOARD_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  const {
    data: users = [],
    dataUpdatedAt: usersUpdatedAt,
    isError: platformUsersQueryError,
    error: platformUsersQueryErr,
  } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(500),
    refetchInterval: 45000,
    staleTime: 30000,
  });

  const { data: subscriptions = [], dataUpdatedAt: subscriptionsUpdatedAt } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => paidly.entities.Subscription.list('-created_date', 150),
    refetchInterval: 45000,
    staleTime: 30000,
  });

  const {
    data: affiliateAdmin = EMPTY_AFFILIATE_ADMIN_BUNDLE,
    dataUpdatedAt: affiliatesUpdatedAt,
    isError: affiliatesQueryError,
    error: affiliatesQueryErr,
  } = useQuery({
    queryKey: ['affiliates'],
    select: normalizeAffiliateAdminQueryResult,
    queryFn: () => affiliateApplicationsAdminQueryFn(150),
    refetchInterval: 45000,
    staleTime: 30000,
  });
  const affiliates = affiliateAdmin.applications;
  const affiliateStatusCounts = affiliateAdmin.counts;

  const { data: waitlist = [], dataUpdatedAt: waitlistUpdatedAt } = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => paidly.entities.WaitlistEntry.list('-created_date', 150),
    refetchInterval: 45000,
    staleTime: 30000,
  });

  const { data: invoices = [], dataUpdatedAt: invoicesUpdatedAt } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => paidly.entities.Invoice.list('-created_date', 500),
    refetchInterval: 45000,
    staleTime: 30000,
  });

  const { data: quotes = [], dataUpdatedAt: quotesUpdatedAt } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => paidly.entities.Quote.list('-created_date', 500),
    refetchInterval: 45000,
    staleTime: 30000,
  });

  const { data: payslips = [], dataUpdatedAt: payslipsUpdatedAt } = useQuery({
    queryKey: ['payslips'],
    queryFn: () => paidly.entities.Payroll.list('-created_date', 500),
    refetchInterval: 45000,
    staleTime: 30000,
  });

  const { data: securityEvents, isLoading: securityLoading, error: securityError } = useQuery({
    queryKey: ['security-events'],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/security/events', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || json?.message || `Security endpoint failed (${res.status})`);
      }
      return json?.summary || null;
    },
    refetchInterval: 45000,
    staleTime: 30000,
    retry: 1,
  });

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastUpdatedAt = useMemo(
    () =>
      Math.max(
        usersUpdatedAt || 0,
        subscriptionsUpdatedAt || 0,
        affiliatesUpdatedAt || 0,
        waitlistUpdatedAt || 0,
        invoicesUpdatedAt || 0,
        quotesUpdatedAt || 0,
        payslipsUpdatedAt || 0
      ),
    [
      usersUpdatedAt,
      subscriptionsUpdatedAt,
      affiliatesUpdatedAt,
      waitlistUpdatedAt,
      invoicesUpdatedAt,
      quotesUpdatedAt,
      payslipsUpdatedAt,
    ]
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
  /** Same source as admin API `counts.pending` (not `affiliates.filter` on an RLS-truncated list). */
  const pendingAffiliateReviewCount = affiliateStatusCounts.pending;
  const totalInvoicesSent = invoices.length;
  const totalQuotes = quotes.length;
  const totalPayslips = payslips.length;
  const userBehaviorRows = useMemo(() => {
    const subByUserId = new Map(
      subscriptions
        .filter((s) => s.user_id)
        .map((s) => [String(s.user_id), s])
    );
    const subByEmail = new Map(
      subscriptions
        .filter((s) => s.user_email || s.email)
        .map((s) => [String(s.user_email || s.email).toLowerCase(), s])
    );
    const invoiceCountByUser = countByUserId(invoices);
    const quoteCountByUser = countByUserId(quotes);
    const payslipCountByUser = countByUserId(payslips);
    const invoiceCountByEmail = new Map();
    for (const inv of invoices) {
      const email = String(inv?.user_email || inv?.owner_email || '').trim().toLowerCase();
      if (email) invoiceCountByEmail.set(email, Number(invoiceCountByEmail.get(email) || 0) + 1);
    }

    return users
      .map((u) => {
        const email = String(u.email || '').toLowerCase();
        const sub =
          subByUserId.get(String(u.id)) ||
          (email ? subByEmail.get(email) : null) ||
          null;
        const byUid = Number(invoiceCountByUser.get(String(u.id)) || 0);
        const byEmail = Number(invoiceCountByEmail.get(email) || 0);
        const profileFallback = Number(u.invoices_sent ?? u.invoices_count ?? 0);
        return {
          id: u.id,
          full_name: u.full_name || '—',
          email: u.email || '—',
          email_verified: u.email_verified,
          company_name: u.company_name || u.company || '—',
          plan: u.plan || u.subscription_plan || 'none',
          status: u.status || 'active',
          invoices_sent: byUid || byEmail || profileFallback,
          quotes_created: Number(quoteCountByUser.get(String(u.id)) || 0),
          payslips_created: Number(payslipCountByUser.get(String(u.id)) || 0),
          subscription_status: sub?.status || 'none',
          next_billing_date: sub?.next_billing_date || null,
          updated_at: u.updated_at || null,
          created_date: u.created_date || u.created_at || null,
        };
      })
      .sort((a, b) => b.invoices_sent - a.invoices_sent);
  }, [users, subscriptions, invoices, quotes, payslips]);

  const securitySpike = useMemo(() => {
    if (!securityEvents?.counts || !securityEvents?.bursts?.thresholds || !securityEvents?.bursts?.activeIps) {
      return false;
    }
    const counts = securityEvents.counts;
    const thresholds = securityEvents.bursts.thresholds;
    const activeIps = securityEvents.bursts.activeIps;

    const severe429 = Number(counts.status429 || 0) >= Math.max(10, Math.floor(Number(thresholds.rateLimited || 40) * 0.5));
    const severe401 = Number(counts.status401 || 0) >= Math.max(10, Math.floor(Number(thresholds.authFail || 30) * 0.5));
    const severe404 = Number(counts.status404 || 0) >= Math.max(20, Math.floor(Number(thresholds.notFound || 80) * 0.5));
    const activeBurstIps =
      Number(activeIps.authFail || 0) +
      Number(activeIps.notFound || 0) +
      Number(activeIps.rateLimited || 0) +
      Number(activeIps.serverError || 0);
    return severe429 || severe401 || severe404 || activeBurstIps > 0;
  }, [securityEvents]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Overview of your Paidly platform · ${lastUpdatedLabel}`}
        onRefresh={handleRefresh}
        isRefreshing={dashboardRefreshing}
      />

      {platformUsersQueryError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            Could not load platform users from the backend (admin directory is API-only):{' '}
            {platformUsersQueryErr?.message || 'Unknown error'}.
          </AlertDescription>
        </Alert>
      ) : null}

      {affiliatesQueryError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            Could not load affiliate submissions from the backend (admin data is API-only):{' '}
            {affiliatesQueryErr?.message || 'Unknown error'}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <StatCard
          title="Invoices Sent"
          value={totalInvoicesSent}
          change={`+${Math.min(totalInvoicesSent, 20)}`}
          icon={FileText}
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          title="Quotes (platform)"
          value={totalQuotes}
          change={`+${Math.min(totalQuotes, 20)}`}
          icon={ScrollText}
        />
        <StatCard
          title="Payslips (platform)"
          value={totalPayslips}
          change={`+${Math.min(totalPayslips, 20)}`}
          icon={Banknote}
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart subscriptions={subscriptions} />
        </div>
        <RecentActivity
          users={users}
          affiliates={affiliates}
          pendingAffiliateCount={pendingAffiliateReviewCount}
        />
      </div>

      <div
        className={`mb-8 overflow-hidden rounded-xl border bg-card ${
          securitySpike ? 'border-red-500/50 bg-red-500/5' : 'border-border'
        }`}
      >
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 font-semibold">
              {securitySpike ? (
                <ShieldAlert className="h-4 w-4 text-red-500" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              )}
              Security Events (last {Math.max(1, Math.round((Number(securityEvents?.windowMs || 600000) / 60000)))}m)
              {securityLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </h2>
            <Button
              type="button"
              size="sm"
              variant={securitySpike ? 'destructive' : 'outline'}
              className="h-8"
              onClick={() => setShowSecurityDetails(true)}
            >
              View details
            </Button>
          </div>
          <p className={`text-xs ${securitySpike ? 'text-red-600' : 'text-muted-foreground'}`}>
            {securityError
              ? `Could not load security telemetry: ${securityError?.message || 'unknown error'}`
              : securitySpike
                ? 'Spike detected in auth/API anomalies. Investigate logs and suspicious IPs.'
                : 'No active anomaly spikes detected.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 px-6 py-4 text-sm md:grid-cols-5">
          <div><span className="text-muted-foreground">401</span><p className="font-semibold">{securityEvents?.counts?.status401 ?? '—'}</p></div>
          <div><span className="text-muted-foreground">403</span><p className="font-semibold">{securityEvents?.counts?.status403 ?? '—'}</p></div>
          <div><span className="text-muted-foreground">404</span><p className="font-semibold">{securityEvents?.counts?.status404 ?? '—'}</p></div>
          <div><span className="text-muted-foreground">429</span><p className="font-semibold">{securityEvents?.counts?.status429 ?? '—'}</p></div>
          <div><span className="text-muted-foreground">5xx</span><p className="font-semibold">{securityEvents?.counts?.status5xx ?? '—'}</p></div>
        </div>
      </div>

      <Dialog open={showSecurityDetails} onOpenChange={setShowSecurityDetails}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Security Burst Details</DialogTitle>
            <DialogDescription>
              Active burst buckets and trigger thresholds for quicker incident triage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">authFail threshold</p>
              <p className="font-semibold">{securityEvents?.bursts?.thresholds?.authFail ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">authFail active IPs</p>
              <p className="font-semibold">{securityEvents?.bursts?.activeIps?.authFail ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">notFound threshold</p>
              <p className="font-semibold">{securityEvents?.bursts?.thresholds?.notFound ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">notFound active IPs</p>
              <p className="font-semibold">{securityEvents?.bursts?.activeIps?.notFound ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">rateLimited threshold</p>
              <p className="font-semibold">{securityEvents?.bursts?.thresholds?.rateLimited ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">rateLimited active IPs</p>
              <p className="font-semibold">{securityEvents?.bursts?.activeIps?.rateLimited ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">serverError threshold</p>
              <p className="font-semibold">{securityEvents?.bursts?.thresholds?.serverError ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">serverError active IPs</p>
              <p className="font-semibold">{securityEvents?.bursts?.activeIps?.serverError ?? '—'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold inline-flex items-center gap-2">
            Recent Subscriptions
            {dashboardRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </h2>
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

      <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold inline-flex items-center gap-2">
            User Behavior
            {dashboardRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </h2>
          <p className="text-xs text-muted-foreground">
            Per-user activity from invoices, quotes, and payslips (linked by user id), plus plan and billing.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">User</th>
                <th className="px-6 py-3 text-left font-medium">Company</th>
                <th className="px-6 py-3 text-left font-medium">Plan</th>
                <th className="px-6 py-3 text-left font-medium">Profile</th>
                <th className="px-6 py-3 text-left font-medium">Email</th>
                <th className="px-6 py-3 text-left font-medium">Invoices</th>
                <th className="px-6 py-3 text-left font-medium">Quotes</th>
                <th className="px-6 py-3 text-left font-medium">Payslips</th>
                <th className="px-6 py-3 text-left font-medium">Subscription</th>
                <th className="px-6 py-3 text-left font-medium">Next Billing</th>
                <th className="px-6 py-3 text-left font-medium">Created</th>
                <th className="px-6 py-3 text-left font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {userBehaviorRows.map((row) => {
                const { primary, secondary } = adminUserNameEmailLines(row.full_name, row.email);
                return (
                <tr key={row.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium">{primary}</p>
                    {secondary ? (
                      <p className="text-xs text-muted-foreground">{secondary}</p>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-sm">{row.company_name}</td>
                  <td className="px-6 py-4">
                    <PlanBadge plan={row.plan} />
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-6 py-4">
                    {row.email_verified === false ? (
                      <StatusBadge status="unverified" />
                    ) : row.email_verified === true ? (
                      <StatusBadge status="verified" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">{row.invoices_sent}</td>
                  <td className="px-6 py-4 text-sm font-medium">{row.quotes_created}</td>
                  <td className="px-6 py-4 text-sm font-medium">{row.payslips_created}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={row.subscription_status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {row.next_billing_date ? format(new Date(row.next_billing_date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {row.created_date ? format(new Date(row.created_date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {row.updated_at
                      ? `Updated ${format(new Date(row.updated_at), 'dd MMM yyyy')}`
                      : row.created_date
                        ? `Joined ${format(new Date(row.created_date), 'dd MMM yyyy')}`
                        : '—'}
                  </td>
                </tr>
              );
              })}
              {userBehaviorRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No user behavior data yet
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
