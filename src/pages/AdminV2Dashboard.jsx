import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useIsFetching, useMutation } from '@tanstack/react-query';
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
  Wifi,
  UserX,
  UserCheck,
  TrendingUp,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  MoreHorizontal,
} from 'lucide-react';
import { format, formatDistanceToNow, subDays, isAfter } from 'date-fns';
import StatCard from '@/components/dashboard/StatCard';
import PageHeader from '@/components/dashboard/PageHeader';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PlanBadge from '@/components/dashboard/PlanBadge';
import RevenueChart from '@/components/dashboard/RevenueChart';
import RecentActivity from '@/components/dashboard/RecentActivity';
import SubscriptionOverview from '@/components/dashboard/SubscriptionOverview';
import RevenueOverview from '@/components/dashboard/RevenueOverview';
import FailedPaymentsTable from '@/components/dashboard/FailedPaymentsTable';
import SubscriptionDetailsSheet from '@/components/subscriptions/SubscriptionDetailsSheet';
import { fetchAdminSubscriptionOverview } from '@/api/fetchAdminSubscriptionOverview';
import { fetchAdminSubscriptionsList } from '@/api/fetchAdminSubscriptionsList';
import { fetchAdminRevenueMetrics } from '@/api/fetchAdminRevenueMetrics';
import { fetchAdminFailedPayments } from '@/api/fetchAdminFailedPayments';
import AffiliateApprovalResultDialog from '@/components/affiliates/AffiliateApprovalResultDialog';
import {
  approveAffiliateApplication,
  declineAffiliateApplication,
  resendAffiliateReferralEmail,
} from '@/api/affiliateAdminModerationApi';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { createAffiliateSignupShareUrl } from '@/utils';
import { toast } from 'sonner';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { getStableSession } from '@/core/auth/SessionCoordinator';
import { countByUserId, mergeUsersWithInvoiceCounts } from '@/utils/documentOwnership';
import {
  EMPTY_AFFILIATE_ADMIN_BUNDLE,
  normalizeAffiliateAdminQueryResult,
} from '@/utils/affiliateApplicationCounts';
import { pickPreferredSubscriptionRow } from '@/lib/subscriptionPlan';
import { stableDirectoryRowKey, stableEntityRowKey } from '@/utils/stableListKey';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import TablePagination from '@/components/ui/TablePagination';

const DASHBOARD_QUERY_KEYS = [
  'platform-users',
  'subscriptions',
  'subscription-overview',
  'revenue-metrics',
  'failed-payments',
  'affiliates',
  'waitlist',
  'invoices',
  'quotes',
  'payslips',
];
const ADMIN_DASHBOARD_REFETCH_MS = 120000;
const ADMIN_DASHBOARD_STALE_MS = 60000;
const DORMANT_DAYS = 30;
const SUBS_PER_PAGE = 10;
const BEHAVIOR_PAGE_SIZE = 25;

function burstWindowMinutes(securityEvents, kind) {
  const ms = securityEvents?.bursts?.windowsMs?.[kind];
  if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
    return Math.max(1, Math.round(ms / 60000));
  }
  return 10;
}

function relativeTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

function SortTh({ col, label, sort, onSort, className = '' }) {
  const active = sort.col === col;
  return (
    <th
      className={`px-4 py-2 text-left font-medium cursor-pointer select-none group hover:text-foreground transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          sort.dir === 'desc'
            ? <ChevronDown className="h-3 w-3 text-primary" />
            : <ChevronUp className="h-3 w-3 text-primary" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-25 group-hover:opacity-60" />
        )}
      </span>
    </th>
  );
}

export default function AdminV2Dashboard() {
  const { user: currentUser } = useCurrentUser();
  const adminSelfId = currentUser?.id || currentUser?.supabase_id || null;
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(Date.now());
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const [affiliateApprovalNotice, setAffiliateApprovalNotice] = useState(null);
  const [busyAffiliateId, setBusyAffiliateId] = useState(null);
  const [behaviorSort, setBehaviorSort] = useState({ col: 'activity_score', dir: 'desc' });
  const [behaviorPage, setBehaviorPage] = useState(0);
  const [subsPage, setSubsPage] = useState(0);
  const [detailSubId, setDetailSubId] = useState(null);

  const dashboardRefreshing =
    useIsFetching({
      predicate: (q) => DASHBOARD_QUERY_KEYS.includes(String(q.queryKey[0])),
    }) > 0;

  const handleRefresh = () => {
    DASHBOARD_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  const toggleBehaviorSort = (col) => {
    setBehaviorSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { col, dir: 'desc' }
    );
    setBehaviorPage(0);
  };

  const {
    data: users = [],
    dataUpdatedAt: usersUpdatedAt,
    isError: platformUsersQueryError,
    error: platformUsersQueryErr,
  } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: subscriptions = [], dataUpdatedAt: subscriptionsUpdatedAt } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => fetchAdminSubscriptionsList({ limit: 150 }),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const {
    data: subscriptionOverviewPayload,
    dataUpdatedAt: subscriptionOverviewUpdatedAt,
    isLoading: subscriptionOverviewLoading,
    isError: subscriptionOverviewError,
    error: subscriptionOverviewErr,
  } = useQuery({
    queryKey: ['subscription-overview'],
    queryFn: () => fetchAdminSubscriptionOverview(),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const subscriptionOverview = subscriptionOverviewPayload?.overview;

  const {
    data: revenueMetricsPayload,
    dataUpdatedAt: revenueMetricsUpdatedAt,
    isLoading: revenueMetricsLoading,
    isError: revenueMetricsError,
    error: revenueMetricsErr,
  } = useQuery({
    queryKey: ['revenue-metrics'],
    queryFn: () => fetchAdminRevenueMetrics(),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const revenueMetrics = revenueMetricsPayload?.metrics;

  const {
    data: failedPaymentsPayload,
    dataUpdatedAt: failedPaymentsUpdatedAt,
    isLoading: failedPaymentsLoading,
    isError: failedPaymentsError,
    error: failedPaymentsErr,
  } = useQuery({
    queryKey: ['failed-payments'],
    queryFn: () => fetchAdminFailedPayments(50),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const failedPayments = failedPaymentsPayload?.failedPayments || [];

  const {
    data: affiliateAdmin = EMPTY_AFFILIATE_ADMIN_BUNDLE,
    dataUpdatedAt: affiliatesUpdatedAt,
    isError: affiliatesQueryError,
    error: affiliatesQueryErr,
  } = useQuery({
    queryKey: ['affiliates'],
    select: normalizeAffiliateAdminQueryResult,
    queryFn: () => affiliateApplicationsAdminQueryFn(),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const affiliates = affiliateAdmin.applications;
  const affiliateStatusCounts = affiliateAdmin.counts;

  const { affiliateDefaultCommissionPercent: defaultAffiliateCommissionPct } = useAdminSettings();

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
        entity: 'affiliate_application',
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
        entity: 'affiliate_application',
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
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: invoices = [], dataUpdatedAt: invoicesUpdatedAt } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => paidly.entities.Invoice.list('-created_date', 500),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: quotes = [], dataUpdatedAt: quotesUpdatedAt } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => paidly.entities.Quote.list('-created_date', 500),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: payslips = [], dataUpdatedAt: payslipsUpdatedAt } = useQuery({
    queryKey: ['payslips'],
    queryFn: () => paidly.entities.Payroll.list('-created_date', 500),
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: securityEvents, isLoading: securityLoading, error: securityError } = useQuery({
    queryKey: ['security-events'],
    queryFn: async () => {
      const session = await getStableSession();
      const token = session?.access_token;
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
    refetchInterval: ADMIN_DASHBOARD_REFETCH_MS,
    staleTime: ADMIN_DASHBOARD_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const behaviorStatusMutation = useMutation({
    mutationFn: ({ id, status }) => paidly.entities.PlatformUser.update(id, { status }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success(`User ${status === 'active' ? 'reactivated' : status}`);
    },
    onError: (err) => toast.error(err?.message || 'Update failed'),
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
        subscriptionOverviewUpdatedAt || 0,
        revenueMetricsUpdatedAt || 0,
        failedPaymentsUpdatedAt || 0,
        affiliatesUpdatedAt || 0,
        waitlistUpdatedAt || 0,
        invoicesUpdatedAt || 0,
        quotesUpdatedAt || 0,
        payslipsUpdatedAt || 0
      ),
    [
      usersUpdatedAt,
      subscriptionsUpdatedAt,
      subscriptionOverviewUpdatedAt,
      revenueMetricsUpdatedAt,
      failedPaymentsUpdatedAt,
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
  const activeSubscriptionCount =
    subscriptionOverview?.active != null
      ? subscriptionOverview.active
      : activeSubscriptions.length;
  const verifiedUsers = users.filter((u) => u.email_verified === true);
  const monthlyRevenueFallback = activeSubscriptions.reduce((sum, s) => sum + (s.amount || 0), 0);
  const monthlyRevenue =
    revenueMetrics?.monthlyRevenue != null
      ? revenueMetrics.monthlyRevenue
      : monthlyRevenueFallback;
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

  const thirtyDaysAgo = useMemo(() => subDays(new Date(), DORMANT_DAYS), []);

  const onlineNowCount = useMemo(() => users.filter((u) => u.is_online).length, [users]);

  const newThisMonthCount = useMemo(() => {
    return users.filter((u) => {
      const d = u.created_date || u.created_at;
      if (!d) return false;
      return isAfter(new Date(d), thirtyDaysAgo);
    }).length;
  }, [users, thirtyDaysAgo]);

  const unverifiedCount = useMemo(
    () => users.filter((u) => u.email_verified === false).length,
    [users]
  );

  const dormantCount = useMemo(() => {
    return users.filter((u) => {
      if (u.is_online) return false;
      if (!u.last_active_at) return true;
      return !isAfter(new Date(u.last_active_at), thirtyDaysAgo);
    }).length;
  }, [users, thirtyDaysAgo]);

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
    return usersWithInvoiceCounts.map((u) => {
      const email = String(u.email || '').toLowerCase();
      const sub =
        subByUserId.get(String(u.id)) ||
        (email ? subByEmail.get(email) : null) ||
        null;
      const profilePlan = u.plan || u.subscription_plan || '';
      const subSt = String(sub?.status || '').toLowerCase();
      const planFromSub =
        sub && subSt === 'active' && sub.plan ? String(sub.plan).trim() : '';
      const invoices_sent = Number(u.invoices_sent || 0);
      const quotes_created = Number(quoteCountByUser.get(String(u.id)) || 0);
      const payslips_created = Number(payslipCountByUser.get(String(u.id)) || 0);
      return {
        id: u.id,
        full_name: u.full_name || '—',
        email: u.email || '—',
        email_verified: u.email_verified,
        company_name: u.company_name || u.company || '—',
        plan: planFromSub || profilePlan || 'none',
        status: u.status || 'active',
        invoices_sent,
        quotes_created,
        payslips_created,
        activity_score: invoices_sent + quotes_created + payslips_created,
        subscription_status: sub?.status || 'none',
        next_billing_date: sub?.next_billing_date || null,
        updated_at: u.updated_at || null,
        last_active_at: u.last_active_at || null,
        is_online: Boolean(u.is_online),
        last_active_path: u.last_active_path || null,
        created_date: u.created_date || u.created_at || null,
      };
    });
  }, [users, subscriptions, invoices, quotes, payslips]);

  const sortedBehaviorRows = useMemo(() => {
    const { col, dir } = behaviorSort;
    return [...userBehaviorRows].sort((a, b) => {
      let av = a[col];
      let bv = b[col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (col === 'last_active_at' || col === 'created_date') {
        av = String(av);
        bv = String(bv);
      }
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [userBehaviorRows, behaviorSort]);

  const totalBehaviorPages = Math.max(1, Math.ceil(sortedBehaviorRows.length / BEHAVIOR_PAGE_SIZE));
  const pagedBehaviorRows = sortedBehaviorRows.slice(behaviorPage * BEHAVIOR_PAGE_SIZE, (behaviorPage + 1) * BEHAVIOR_PAGE_SIZE);

  const topActiveUsers = useMemo(() => {
    return [...userBehaviorRows]
      .filter((u) => u.activity_score > 0)
      .sort((a, b) => b.activity_score - a.activity_score)
      .slice(0, 5);
  }, [userBehaviorRows]);

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
        description={`Platform overview · ${lastUpdatedLabel}`}
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

      {/* Primary stats */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Users"
          value={users.length}
          change={`+${Math.min(users.length, 12)}`}
          icon={Users}
        />
        <StatCard
          title="Active Subscriptions"
          value={activeSubscriptionCount}
          change={`+${Math.min(activeSubscriptionCount, 8)}`}
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

      <SubscriptionOverview
        className="mb-4"
        overview={subscriptionOverview}
        isLoading={subscriptionOverviewLoading}
        errorMessage={
          subscriptionOverviewError
            ? subscriptionOverviewErr?.message || 'Could not load subscription overview'
            : null
        }
      />

      <RevenueOverview
        className="mb-4"
        metrics={revenueMetrics}
        isLoading={revenueMetricsLoading}
        errorMessage={
          revenueMetricsError
            ? revenueMetricsErr?.message || 'Could not load revenue metrics'
            : null
        }
      />

      {/* Document stats */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Activity / engagement stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Online Now"
          value={onlineNowCount}
          icon={Wifi}
        />
        <StatCard
          title={`New (last ${DORMANT_DAYS}d)`}
          value={newThisMonthCount}
          change={newThisMonthCount > 0 ? `+${newThisMonthCount}` : undefined}
          icon={UserCheck}
        />
        <StatCard
          title="Unverified Email"
          value={unverifiedCount}
          change={unverifiedCount > 0 ? `−${unverifiedCount}` : undefined}
          icon={ShieldAlert}
        />
        <StatCard
          title={`Dormant (${DORMANT_DAYS}d+)`}
          value={dormantCount}
          icon={UserX}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 lg:col-span-2">
          <RevenueChart
            subscriptions={subscriptions}
            totalUsers={users.length}
            activeSubscriptions={activeSubscriptions.length}
            verifiedUsers={verifiedUsers.length}
          />
        </div>
        <RecentActivity
          className="w-full min-w-0"
          users={users}
          affiliates={affiliates}
          invoices={invoices}
          quotes={quotes}
          payslips={payslips}
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

      {/* Top Active Users leaderboard */}
      <div className="mb-5 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-medium inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Top Active Users
            {dashboardRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </h2>
          <p className="text-xs text-muted-foreground">
            Ranked by total documents created (invoices + quotes + payslips).
          </p>
        </div>
        {topActiveUsers.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No activity data yet
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {topActiveUsers.map((row, i) => {
              const { primary, secondary } = adminUserNameEmailLines(row.full_name, row.email);
              return (
                <li key={row.id || i} className="flex items-center gap-4 px-4 py-3 sm:px-6 hover:bg-muted/30 transition-colors">
                  <span className="w-6 shrink-0 text-center text-sm font-bold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(primary || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{primary}</p>
                      {row.is_online ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Online
                        </span>
                      ) : null}
                    </div>
                    {secondary ? (
                      <p className="truncate text-xs text-muted-foreground">{secondary}</p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {row.invoices_sent} inv · {row.quotes_created} quot · {row.payslips_created} pay
                    </p>
                  </div>
                  <div className="hidden shrink-0 sm:block">
                    <PlanBadge plan={row.plan} />
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {row.activity_score}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {row.last_active_at
                        ? relativeTime(row.last_active_at)
                        : '—'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Security Events */}
      <div
        className={`mb-5 overflow-hidden rounded-xl border bg-card ${
          securitySpike ? 'border-red-500/50 bg-red-500/5' : 'border-border'
        }`}
      >
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium">
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

      <FailedPaymentsTable
        className="mb-5"
        rows={failedPayments}
        isLoading={failedPaymentsLoading}
        errorMessage={
          failedPaymentsError
            ? failedPaymentsErr?.message || 'Could not load failed payments'
            : null
        }
      />

      {/* Recent Subscriptions — paginated */}
      {(() => {
        const totalSubsPages = Math.max(1, Math.ceil(subscriptions.length / SUBS_PER_PAGE));
        const safePage = Math.min(subsPage, totalSubsPages - 1);
        const pageSlice = subscriptions.slice(safePage * SUBS_PER_PAGE, (safePage + 1) * SUBS_PER_PAGE);
        const pageNumbers = Array.from({ length: totalSubsPages }, (_, i) => i);

        return (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium inline-flex items-center gap-2">
                  Recent Subscriptions
                  {dashboardRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {subscriptions.length} total · page {safePage + 1} of {totalSubsPages}
                </p>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 p-4 sm:hidden">
              {pageSlice.map((sub, idx) => (
                <article
                  key={stableEntityRowKey(sub, safePage * SUBS_PER_PAGE + idx)}
                  className={`rounded-lg border border-border bg-card p-3 ${sub.id ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                  onClick={() => {
                    if (sub.id) setDetailSubId(sub.id);
                  }}
                >
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
                      <p className="mt-1 font-medium tabular-nums">R {Number(sub.amount ?? 0).toFixed(2)}</p>
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

            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">#</th>
                    <th className="px-4 py-2 text-left font-medium">User</th>
                    <th className="px-4 py-2 text-left font-medium">Plan</th>
                    <th className="px-4 py-2 text-left font-medium">Amount</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-right font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.map((sub, idx) => {
                    const rowNum = safePage * SUBS_PER_PAGE + idx + 1;
                    return (
                      <tr
                        key={stableEntityRowKey(sub, rowNum)}
                        className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${sub.id ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (sub.id) setDetailSubId(sub.id);
                        }}
                      >
                        <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">{rowNum}</td>
                        <td className="px-4 py-2.5">
                          <div>
                            <p className="text-sm font-medium">{sub.user_name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{sub.user_email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <PlanBadge plan={sub.plan || 'none'} />
                        </td>
                        <td className="px-4 py-2.5 text-sm font-medium tabular-nums">R {Number(sub.amount ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={sub.status} />
                        </td>
                        <td className="px-4 py-2.5 text-sm text-muted-foreground">
                          {sub.created_date ? format(new Date(sub.created_date), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-medium text-primary">
                          {sub.id ? 'View' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground">
                        No subscriptions yet
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Pagination controls */}
            {totalSubsPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setSubsPage((p) => Math.max(0, p - 1))}
                >
                  ← Previous
                </Button>

                <div className="flex flex-wrap items-center gap-1">
                  {pageNumbers.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSubsPage(n)}
                      className={`h-8 min-w-[2rem] rounded-md px-2.5 text-sm font-medium transition-colors ${
                        n === safePage
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {n + 1}
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalSubsPages - 1}
                  onClick={() => setSubsPage((p) => Math.min(totalSubsPages - 1, p + 1))}
                >
                  Next →
                </Button>
              </div>
            ) : null}
          </div>
        );
      })()}

      <SubscriptionDetailsSheet
        subscriptionId={detailSubId}
        open={Boolean(detailSubId)}
        onOpenChange={(next) => {
          if (!next) setDetailSubId(null);
        }}
      />

      {/* User Behavior — sortable table with inline actions */}
      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium inline-flex items-center gap-2">
                User Behavior
                {dashboardRefreshing ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              </h2>
              <p className="text-xs text-muted-foreground">
                Per-user activity from invoices, quotes, and payslips. Click column headers to sort.
              </p>
            </div>
            <p className="text-xs text-muted-foreground self-center">
              {sortedBehaviorRows.length} user{sortedBehaviorRows.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 p-4 sm:hidden">
          {pagedBehaviorRows.map((row, idx) => {
            const { primary, secondary } = adminUserNameEmailLines(row.full_name, row.email);
            const isSelf = row.id && row.id === adminSelfId;
            return (
              <article key={stableDirectoryRowKey(row, idx)} className="rounded-lg border border-border bg-card p-3">
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
                    <p className="text-muted-foreground">Plan</p>
                    <div className="mt-1"><PlanBadge plan={row.plan} /></div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Activity score</p>
                    <p className="mt-1 text-sm font-bold">{row.activity_score}</p>
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
                    <p className="text-muted-foreground">Last active</p>
                    <p className="mt-1 text-sm">
                      {row.is_online ? (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">Online now</span>
                      ) : row.last_active_at ? (
                        <span title={format(new Date(row.last_active_at), 'dd MMM yyyy HH:mm')}>
                          {relativeTime(row.last_active_at)}
                        </span>
                      ) : '—'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Email</p>
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
                  {!isSelf ? (
                    <div className="col-span-2 mt-1 flex gap-2">
                      {row.status !== 'active' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={behaviorStatusMutation.isPending}
                          onClick={() => row.id && behaviorStatusMutation.mutate({ id: row.id, status: 'active' })}
                        >
                          Reactivate
                        </Button>
                      ) : null}
                      {row.status !== 'suspended' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          disabled={behaviorStatusMutation.isPending}
                          onClick={() => {
                            if (!row.id) return;
                            if (window.confirm(`Suspend ${row.email}?`)) {
                              behaviorStatusMutation.mutate({ id: row.id, status: 'suspended' });
                            }
                          }}
                        >
                          Suspend
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          <TablePagination
            page={behaviorPage}
            totalPages={totalBehaviorPages}
            onPageChange={setBehaviorPage}
            totalItems={sortedBehaviorRows.length}
            itemLabel="users"
          />
          {sortedBehaviorRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No user behavior data yet</p>
          ) : null}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <SortTh col="full_name" label="User" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <th className="px-4 py-2 text-left font-medium">Company</th>
                <SortTh col="plan" label="Plan" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <th className="px-4 py-2 text-left font-medium">Profile</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <SortTh col="activity_score" label="Score" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <SortTh col="invoices_sent" label="Inv" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <SortTh col="quotes_created" label="Quot" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <SortTh col="payslips_created" label="Pay" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <SortTh col="subscription_status" label="Sub" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <th className="px-4 py-2 text-left font-medium">Next billing</th>
                <SortTh col="created_date" label="Joined" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <SortTh col="last_active_at" label="Last active" sort={behaviorSort} onSort={toggleBehaviorSort} />
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedBehaviorRows.map((row, idx) => {
                const { primary, secondary } = adminUserNameEmailLines(row.full_name, row.email);
                const isSelf = row.id && row.id === adminSelfId;
                return (
                  <tr key={stableDirectoryRowKey(row, idx)} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {row.is_online ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Online now" />
                        ) : (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-border" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {primary}
                            {isSelf ? (
                              <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground">You</span>
                            ) : null}
                          </p>
                          {secondary ? (
                            <p className="text-xs text-muted-foreground">{secondary}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-sm">{row.company_name}</td>
                    <td className="px-4 py-2.5">
                      <PlanBadge plan={row.plan} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      {row.email_verified === false ? (
                        <StatusBadge status="unverified" />
                      ) : row.email_verified === true ? (
                        <StatusBadge status="verified" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-bold tabular-nums">{row.activity_score}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm tabular-nums">{row.invoices_sent}</td>
                    <td className="px-4 py-2.5 text-sm tabular-nums">{row.quotes_created}</td>
                    <td className="px-4 py-2.5 text-sm tabular-nums">{row.payslips_created}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={row.subscription_status} />
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">
                      {row.next_billing_date ? format(new Date(row.next_billing_date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">
                      {row.created_date ? format(new Date(row.created_date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {row.is_online ? (
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">Online now</span>
                      ) : row.last_active_at ? (
                        <span
                          className="text-muted-foreground"
                          title={format(new Date(row.last_active_at), 'dd MMM yyyy HH:mm')}
                        >
                          {relativeTime(row.last_active_at)}
                        </span>
                      ) : row.updated_at ? (
                        <span className="text-muted-foreground" title={format(new Date(row.updated_at), 'dd MMM yyyy HH:mm')}>
                          {relativeTime(row.updated_at)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!isSelf ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={behaviorStatusMutation.isPending}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {row.status !== 'active' ? (
                              <DropdownMenuItem
                                disabled={!row.id}
                                onClick={() => row.id && behaviorStatusMutation.mutate({ id: row.id, status: 'active' })}
                              >
                                Reactivate
                              </DropdownMenuItem>
                            ) : null}
                            {row.status === 'active' ? (
                              <DropdownMenuItem
                                disabled={!row.id}
                                onClick={() => row.id && behaviorStatusMutation.mutate({ id: row.id, status: 'paused' })}
                              >
                                Pause
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            {row.status !== 'suspended' ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={!row.id}
                                onClick={() => {
                                  if (!row.id) return;
                                  if (window.confirm(`Suspend ${row.email}?`)) {
                                    behaviorStatusMutation.mutate({ id: row.id, status: 'suspended' });
                                  }
                                }}
                              >
                                Suspend
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sortedBehaviorRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    No user behavior data yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <TablePagination
            page={behaviorPage}
            totalPages={totalBehaviorPages}
            onPageChange={setBehaviorPage}
            totalItems={sortedBehaviorRows.length}
            itemLabel="users"
          />
        </div>
      </div>
    </div>
  );
}
