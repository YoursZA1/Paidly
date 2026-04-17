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
import AffiliateApprovalResultDialog from '@/components/affiliates/AffiliateApprovalResultDialog';
import {
  approveAffiliateApplication,
  declineAffiliateApplication,
  resendAffiliateReferralEmail,
} from '@/api/affiliateAdminModerationApi';
import { SystemSettingsService } from '@/services/SystemSettingsService';
import { createAffiliateSignupShareUrl } from '@/utils';
import { toast } from 'sonner';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { supabase } from '@/lib/supabaseClient';
import { countByUserId, mergeUsersWithInvoiceCounts } from '@/utils/documentOwnership';
import {
  EMPTY_AFFILIATE_ADMIN_BUNDLE,
  normalizeAffiliateAdminQueryResult,
} from '@/utils/affiliateApplicationCounts';
import { pickPreferredSubscriptionRow } from '@/lib/subscriptionPlan';
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

function burstWindowMinutes(securityEvents, kind) {
  const ms = securityEvents?.bursts?.windowsMs?.[kind];
  if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
    return Math.max(1, Math.round(ms / 60000));
  }
  return 10;
}

export default function AdminV2Dashboard() {
  const { user: currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(Date.now());
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const [affiliateApprovalNotice, setAffiliateApprovalNotice] = useState(null);
  const [busyAffiliateId, setBusyAffiliateId] = useState(null);
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
    queryFn: () => platformUsersQueryFn(),
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
    queryFn: () => affiliateApplicationsAdminQueryFn(),
    refetchInterval: 45000,
    staleTime: 30000,
  });
  const affiliates = affiliateAdmin.applications;
  const affiliateStatusCounts = affiliateAdmin.counts;

  const defaultAffiliateCommissionPct = SystemSettingsService.getAffiliateDefaultCommissionPercent();

  const handleDashboardApproveAffiliate = async (aff) => {
    setBusyAffiliateId(aff.id);
    try {
      const result = await approveAffiliateApplication({
        applicationId: aff.id,
        commissionRate: Number(aff.commission_rate ?? defaultAffiliateCommissionPct),
      });
      await queryClient.invalidateQueries({ queryKey: ['affiliates'] });

      const origin = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
      const code = String(result?.referral_code || '').trim();
      const link =
        String(result?.referral_link || '').trim() ||
        (code ? createAffiliateSignupShareUrl(code, origin) : '');

      setAffiliateApprovalNotice({
        applicantName: String(aff.applicant_name || '').trim() || 'Applicant',
        applicantEmail: String(aff.applicant_email || '').trim(),
        referralCode: code,
        referralLink: link,
        emailSent: result?.email_sent !== false,
        emailError: result?.email_error != null ? String(result.email_error) : null,
      });

      toast.success('Affiliate approved', {
        description:
          result?.email_sent === false
            ? 'Saved — email failed. Copy the link from the dialog.'
            : `Confirmation email sent to ${String(aff.applicant_email || '').trim() || 'applicant'}.`,
      });

      logAction({
        actor: currentUser,
        action: AUDIT_ACTIONS.AFFILIATE_APPROVED,
        category: 'affiliates',
        description: `Approved affiliate application for ${aff.applicant_name} (${aff.applicant_email})`,
        targetId: aff.id,
        targetLabel: aff.applicant_email,
        before: { status: 'pending' },
        after: {
          status: 'approved',
          referral_code: result?.referral_code,
          referral_link: result?.referral_link,
          email_sent: result?.email_sent,
        },
      });
    } catch (e) {
      toast.error(e?.message || 'Could not approve affiliate');
    } finally {
      setBusyAffiliateId(null);
    }
  };

  const handleDashboardDeclineAffiliate = async (aff) => {
    const name = String(aff.applicant_name || aff.applicant_email || 'this applicant');
    if (!window.confirm(`Decline affiliate application for ${name}?`)) return;
    setBusyAffiliateId(aff.id);
    try {
      await declineAffiliateApplication({ applicationId: aff.id });
      await queryClient.invalidateQueries({ queryKey: ['affiliates'] });
      toast.success('Application declined', {
        description: `${String(aff.applicant_email || '').trim() || 'Applicant'} was not approved. Queue updated.`,
      });
      logAction({
        actor: currentUser,
        action: AUDIT_ACTIONS.AFFILIATE_DECLINED,
        category: 'affiliates',
        description: `Declined affiliate application for ${aff.applicant_name} (${aff.applicant_email})`,
        targetId: aff.id,
        targetLabel: aff.applicant_email,
        before: { status: 'pending' },
        after: { status: 'declined' },
      });
    } catch (e) {
      toast.error(e?.message || 'Could not decline application');
    } finally {
      setBusyAffiliateId(null);
    }
  };

  const handleDashboardResendAffiliateLink = async (aff) => {
    setBusyAffiliateId(aff.id);
    try {
      const result = await resendAffiliateReferralEmail({ applicationId: aff.id });
      await queryClient.invalidateQueries({ queryKey: ['affiliates'] });
      const origin = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
      const code = String(result?.referral_code || '').trim();
      const link =
        String(result?.referral_link || '').trim() ||
        (code ? createAffiliateSignupShareUrl(code, origin) : '');
      setAffiliateApprovalNotice({
        applicantName: String(aff.applicant_name || '').trim() || 'Applicant',
        applicantEmail: String(aff.applicant_email || '').trim(),
        referralCode: code,
        referralLink: link,
        emailSent: true,
        emailError: null,
        isResend: true,
      });
      toast.success('Referral link emailed again', {
        description: `Sent to ${String(aff.applicant_email || '').trim() || 'applicant'}.`,
      });
    } catch (e) {
      toast.error(e?.message || 'Could not resend link');
    } finally {
      setBusyAffiliateId(null);
    }
  };

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
  const verifiedUsers = users.filter((u) => u.email_verified === true);
  const monthlyRevenue = activeSubscriptions.reduce((sum, s) => sum + (s.amount || 0), 0);
  /** Pending count from `affiliate_applications` via GET /api/admin/affiliates (not a client-side filter on a truncated list). */
  const pendingAffiliateReviewCount = affiliateStatusCounts.pending;
  const totalInvoicesSent = invoices.length;
  const totalQuotes = quotes.length;
  const totalPayslips = payslips.length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const prebillInvoicesToday = invoices.filter((inv) => {
    const invoiceDateIso = String(
      inv.invoice_date || inv.created_date || inv.created_at || ""
    ).slice(0, 10);
    const title = String(inv.project_title || "").toLowerCase();
    const notes = String(inv.notes || "").toLowerCase();
    return (
      invoiceDateIso === todayIso &&
      (title.includes("subscription renewal") || notes.includes("auto-generated")) &&
      notes.includes("before subscription billing date")
    );
  }).length;
  const userBehaviorRows = useMemo(() => {
    const usersWithInvoiceCounts = mergeUsersWithInvoiceCounts(users, invoices);
    const subByUserId = new Map();
    for (const s of subscriptions) {
      if (!s.user_id) continue;
      const id = String(s.user_id);
      const cur = subByUserId.get(id);
      subByUserId.set(id, pickPreferredSubscriptionRow(cur ? [cur, s] : [s]));
    }
    const subByEmail = new Map(
      subscriptions
        .filter((s) => s.user_email || s.email)
        .map((s) => [String(s.user_email || s.email).toLowerCase(), s])
    );
    const quoteCountByUser = countByUserId(quotes);
    const payslipCountByUser = countByUserId(payslips);
    return usersWithInvoiceCounts
      .map((u) => {
        const email = String(u.email || '').toLowerCase();
        const sub =
          subByUserId.get(String(u.id)) ||
          (email ? subByEmail.get(email) : null) ||
          null;
        const profilePlan = u.plan || u.subscription_plan || '';
        const subSt = String(sub?.status || '').toLowerCase();
        const planFromSub =
          sub && subSt === 'active' && sub.plan ? String(sub.plan).trim() : '';
        return {
          id: u.id,
          full_name: u.full_name || '—',
          email: u.email || '—',
          email_verified: u.email_verified,
          company_name: u.company_name || u.company || '—',
          plan: planFromSub || profilePlan || 'none',
          status: u.status || 'active',
          invoices_sent: Number(u.invoices_sent || 0),
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
    const seTh = Number(thresholds.serverError || 30);
    const severe5xx =
      Number(counts.status5xx || 0) >= Math.max(5, Math.floor(seTh * 0.5));
    const activeBurstIps =
      Number(activeIps.authFail || 0) +
      Number(activeIps.notFound || 0) +
      Number(activeIps.rateLimited || 0) +
      Number(activeIps.serverError || 0);
    return severe429 || severe401 || severe404 || severe5xx || activeBurstIps > 0;
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

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <StatCard
          title="Pre-bill invoices (today)"
          value={prebillInvoicesToday}
          icon={FileText}
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart
            subscriptions={subscriptions}
            totalUsers={users.length}
            activeSubscriptions={activeSubscriptions.length}
            verifiedUsers={verifiedUsers.length}
          />
        </div>
        <RecentActivity
          users={users}
          affiliates={affiliates}
          pendingAffiliateCount={pendingAffiliateReviewCount}
          busyAffiliateId={busyAffiliateId}
          onApproveAffiliate={
            affiliatesQueryError ? undefined : handleDashboardApproveAffiliate
          }
          onDeclineAffiliate={
            affiliatesQueryError ? undefined : handleDashboardDeclineAffiliate
          }
          onResendAffiliateLink={
            affiliatesQueryError ? undefined : handleDashboardResendAffiliateLink
          }
        />
      </div>

      <div
        className={`mb-8 overflow-hidden rounded-xl border bg-card ${
          securitySpike ? 'border-red-500/50 bg-red-500/5' : 'border-border'
        }`}
      >
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
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
                ? 'Spike detected in auth/API traffic, 5xx volume, or per-IP burst buckets. Investigate logs and suspicious IPs.'
                : 'No active anomaly spikes detected.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 px-4 py-4 text-sm sm:px-6 md:grid-cols-5">
          <div><span className="text-muted-foreground">401</span><p className="font-semibold">{securityEvents?.counts?.status401 ?? '—'}</p></div>
          <div><span className="text-muted-foreground">403</span><p className="font-semibold">{securityEvents?.counts?.status403 ?? '—'}</p></div>
          <div><span className="text-muted-foreground">404</span><p className="font-semibold">{securityEvents?.counts?.status404 ?? '—'}</p></div>
          <div><span className="text-muted-foreground">429</span><p className="font-semibold">{securityEvents?.counts?.status429 ?? '—'}</p></div>
          <div><span className="text-muted-foreground">5xx</span><p className="font-semibold">{securityEvents?.counts?.status5xx ?? '—'}</p></div>
        </div>
      </div>

      <AffiliateApprovalResultDialog
        notice={affiliateApprovalNotice}
        onOpenChange={(open) => {
          if (!open) setAffiliateApprovalNotice(null);
        }}
      />

      <Dialog open={showSecurityDetails} onOpenChange={setShowSecurityDetails}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Security burst details</DialogTitle>
            <DialogDescription>
              Per–client-IP rolling windows on the Node API. When an IP hits the threshold, a warning is logged.
              Override with <code className="text-xs">SECURITY_*</code> env vars (see server security middleware).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-foreground">401 API failures (per IP)</p>
              <p className="text-[10px] text-muted-foreground">
                {burstWindowMinutes(securityEvents, 'authFail')} min window · warn at threshold (
                <code className="text-[10px]">SECURITY_AUTH_FAIL_BURST_THRESHOLD</code>, default 30)
              </p>
              <p className="mt-1 font-semibold tabular-nums">{securityEvents?.bursts?.thresholds?.authFail ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">IPs at/above threshold</p>
              <p className="font-semibold tabular-nums">{securityEvents?.bursts?.activeIps?.authFail ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-foreground">404 responses (per IP)</p>
              <p className="text-[10px] text-muted-foreground">
                {burstWindowMinutes(securityEvents, 'notFound')} min window · warn at threshold (
                <code className="text-[10px]">SECURITY_404_BURST_THRESHOLD</code>, default 80)
              </p>
              <p className="mt-1 font-semibold tabular-nums">{securityEvents?.bursts?.thresholds?.notFound ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">IPs at/above threshold</p>
              <p className="font-semibold tabular-nums">{securityEvents?.bursts?.activeIps?.notFound ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-foreground">429 rate limits (per IP)</p>
              <p className="text-[10px] text-muted-foreground">
                {burstWindowMinutes(securityEvents, 'rateLimited')} min window · warn at threshold (
                <code className="text-[10px]">SECURITY_RATE_LIMIT_BURST_THRESHOLD</code>, default 40)
              </p>
              <p className="mt-1 font-semibold tabular-nums">{securityEvents?.bursts?.thresholds?.rateLimited ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">IPs at/above threshold</p>
              <p className="font-semibold tabular-nums">{securityEvents?.bursts?.activeIps?.rateLimited ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-foreground">5xx server errors (per IP)</p>
              <p className="text-[10px] text-muted-foreground">
                {burstWindowMinutes(securityEvents, 'serverError')} min window · warn at threshold (
                <code className="text-[10px]">SECURITY_5XX_BURST_THRESHOLD</code>, default 30)
              </p>
              <p className="mt-1 font-semibold tabular-nums">{securityEvents?.bursts?.thresholds?.serverError ?? '—'}</p>
              <p className="text-[10px] text-muted-foreground">IPs at/above threshold</p>
              <p className="font-semibold tabular-nums">{securityEvents?.bursts?.activeIps?.serverError ?? '—'}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="font-semibold inline-flex items-center gap-2">
            Recent Subscriptions
            {dashboardRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </h2>
        </div>
        <div className="space-y-3 p-4 sm:hidden">
          {subscriptions.slice(0, 5).map((sub) => (
            <article key={sub.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{sub.user_name || 'Unknown'}</p>
                  <p className="truncate text-xs text-muted-foreground">{sub.user_email || '—'}</p>
                </div>
                <StatusBadge status={sub.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Plan</p>
                  <div className="mt-1"><PlanBadge plan={sub.plan || 'none'} /></div>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="mt-1 font-medium">R {sub.amount}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Date</p>
                  <p className="mt-1 text-sm">
                    {sub.created_date ? format(new Date(sub.created_date), 'dd MMM yyyy') : '—'}
                  </p>
                </div>
              </div>
            </article>
          ))}
          {subscriptions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No subscriptions yet</p>
          ) : null}
        </div>
        <div className="hidden overflow-x-auto sm:block">
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
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="font-semibold inline-flex items-center gap-2">
            User Behavior
            {dashboardRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </h2>
          <p className="text-xs text-muted-foreground">
            Per-user activity from invoices, quotes, and payslips (linked by user id), plus plan and billing.
          </p>
        </div>
        <div className="space-y-3 p-4 sm:hidden">
          {userBehaviorRows.slice(0, 20).map((row) => {
            const { primary, secondary } = adminUserNameEmailLines(row.full_name, row.email);
            return (
              <article key={row.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{primary}</p>
                    {secondary ? (
                      <p className="truncate text-xs text-muted-foreground">{secondary}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Company</p>
                    <p className="mt-1 truncate text-sm">{row.company_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Plan</p>
                    <div className="mt-1"><PlanBadge plan={row.plan} /></div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Invoices</p>
                    <p className="mt-1 text-sm font-medium">{row.invoices_sent}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Quotes</p>
                    <p className="mt-1 text-sm font-medium">{row.quotes_created}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payslips</p>
                    <p className="mt-1 text-sm font-medium">{row.payslips_created}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Subscription</p>
                    <div className="mt-1"><StatusBadge status={row.subscription_status} /></div>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Email confirmation</p>
                    <div className="mt-1">
                      {row.email_verified === false ? (
                        <StatusBadge status="unverified" />
                      ) : row.email_verified === true ? (
                        <StatusBadge status="verified" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {userBehaviorRows.length > 20 ? (
            <p className="text-xs text-muted-foreground">
              Showing top 20 users on mobile. View desktop for the full user behavior table.
            </p>
          ) : null}
          {userBehaviorRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No user behavior data yet</p>
          ) : null}
        </div>
        <div className="hidden overflow-x-auto sm:block">
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
