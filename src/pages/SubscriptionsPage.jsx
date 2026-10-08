import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import { Search, MoreHorizontal, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import PageHeader from '@/components/dashboard/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PlanBadge from '@/components/dashboard/PlanBadge';
import SubscriptionOverview from '@/components/dashboard/SubscriptionOverview';
import SubscriptionDetailsSheet from '@/components/subscriptions/SubscriptionDetailsSheet';
import { fetchAdminSubscriptionOverview } from '@/api/fetchAdminSubscriptionOverview';
import { fetchAdminSubscriptionsList } from '@/api/fetchAdminSubscriptionsList';
import { updateAdminSubscription } from '@/api/mutateAdminSubscription';
import SubscriptionFormDialog, {
} from '@/components/subscriptions/SubscriptionFormDialog';
import { pickPreferredSubscriptionRow, normalizePaidPackageKey } from '@/lib/subscriptionPlan';
import { isLegacyPlanSlug } from '@/lib/plans.js';
import { MARKETING_PLAN_ORDER, MARKETING_PLANS, formatMarketingZar } from '@shared/planMarketing.js';
import TablePagination from '@/components/ui/TablePagination';
import {
  SUBSCRIPTION_STATUS_FILTER,
  subscriptionMatchesStatusFilter,
} from '@shared/subscriptionOverviewBuckets.js';
import {
  FREE_ACCESS_DAY_OPTIONS,
  TRIAL_EXTEND_DAY_OPTIONS,
  TRIAL_PHASE,
  TRIAL_PHASE_LABEL,
  deriveTrialPhase,
} from '@shared/trialLifecycle.js';

const STATUS_FILTER_LABELS = {
  [SUBSCRIPTION_STATUS_FILTER.ALL]: 'All',
  [SUBSCRIPTION_STATUS_FILTER.ACTIVE]: 'Active',
  [SUBSCRIPTION_STATUS_FILTER.PENDING]: 'Pending',
  [SUBSCRIPTION_STATUS_FILTER.EXPIRED]: 'Expired',
  [SUBSCRIPTION_STATUS_FILTER.CANCELLED]: 'Cancelled',
  [SUBSCRIPTION_STATUS_FILTER.TRIAL]: 'Trial',
  [SUBSCRIPTION_STATUS_FILTER.PAST_DUE]: 'Past due',
  [SUBSCRIPTION_STATUS_FILTER.FAILED]: 'Failed',
  [SUBSCRIPTION_STATUS_FILTER.SUSPENDED]: 'Suspended',
  [SUBSCRIPTION_STATUS_FILTER.ADMIN_GRANTED]: 'Admin granted',
  [SUBSCRIPTION_STATUS_FILTER.NONE]: 'No subscription row',
  [SUBSCRIPTION_STATUS_FILTER.LIVE_TRIAL]: 'Trial in progress',
  [SUBSCRIPTION_STATUS_FILTER.EXPIRED_TRIALS]: 'Expired trial',
};

const LIST_LIMIT = 500;
const SUBS_PAGE_SIZE = 15;

const CATALOG_TIER_COLORS = {
  starter: 'border-blue-500/25',
  business: 'border-primary/30',
  growth: 'border-purple-500/25',
  enterprise: 'border-amber-500/25',
};

const CATALOG_TIERS = MARKETING_PLAN_ORDER.map((family) => {
  const copy = MARKETING_PLANS[family];
  return {
    family,
    label: copy.name,
    price: copy.contactSales ? 'Custom' : `${formatMarketingZar(copy.monthlyPriceZar)}/mo`,
    color: CATALOG_TIER_COLORS[family],
  };
});

function pickLatestSubscriptionForUser(subs, userId) {
  const uid = String(userId);
  const matches = subs.filter((s) => s.user_id && String(s.user_id) === uid);
  return pickPreferredSubscriptionRow(matches);
}

/** One row per platform user: real subscription or synthetic “no record” row */
function buildSubscriptionRows(users, subscriptions) {
  const assignedSubIds = new Set();
  const rows = [];

  for (const u of users) {
    const sub = pickLatestSubscriptionForUser(subscriptions, u.id);
    if (sub) {
      assignedSubIds.add(sub.id);
      rows.push({
        ...sub,
        user_name: sub.user_name || u.full_name || '',
        user_email: sub.user_email || u.email || '',
        company_name: u.company_name || u.company || '',
        company_address: u.company_address || '',
        phone: u.phone || '',
        _rowKey: sub.id,
      });
    } else {
      // No subscription row: show that plainly. Do NOT infer a plan from the profile
      // mirror or price it from a static table — subscriptions are the billing source of truth.
      rows.push({
        id: null,
        user_id: u.id,
        user_name: u.full_name || '',
        user_email: u.email || '',
        company_name: u.company_name || u.company || '',
        company_address: u.company_address || '',
        phone: u.phone || '',
        plan: null,
        amount: null,
        billing_cycle: null,
        status: 'none',
        next_billing_date: null,
        _isSynthetic: true,
        _rowKey: `syn-${u.id}`,
      });
    }
  }

  for (const s of subscriptions) {
    if (s.id && !assignedSubIds.has(s.id)) {
      rows.push({ ...s, _rowKey: s.id });
    }
  }

  return rows;
}

function TrialPhaseLine({ sub }) {
  if (sub?._isSynthetic) return <span className="text-xs text-muted-foreground">—</span>;
  const phase = deriveTrialPhase(sub);
  const label = TRIAL_PHASE_LABEL[phase.phase] || '—';
  let detail = null;
  if (phase.phase === TRIAL_PHASE.TRIAL_ACTIVE || phase.phase === TRIAL_PHASE.TRIAL_ENDING_SOON) {
    detail = `${phase.daysRemaining} day${phase.daysRemaining === 1 ? '' : 's'} left`;
  } else if (phase.phase === TRIAL_PHASE.TRIAL_EXPIRED && phase.daysSinceExpiry != null) {
    detail = phase.daysSinceExpiry === 0 ? 'Expired today' : `Expired ${phase.daysSinceExpiry} day${phase.daysSinceExpiry === 1 ? '' : 's'} ago`;
  }
  return (
    <div>
      <p className="text-xs font-medium">{label}</p>
      {detail ? <p className="text-[11px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function SubscriptionActions({ sub, onView, onEdit, onUpdate }) {
  if (sub._isSynthetic) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Manage subscription">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>Create subscription</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const email = sub.user_email || 'this user';
  const run = (data, confirmMessage) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    onUpdate({ id: sub.id, data });
  };
  const extend = (days) =>
    run({
      action: 'extend_trial',
      days,
      reason: `Admin extended trial by ${days} days`,
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Manage subscription">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuItem onClick={onView}>View account</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>View subscription</DropdownMenuItem>
        <DropdownMenuSeparator />
        {TRIAL_EXTEND_DAY_OPTIONS.map((days) => (
          <DropdownMenuItem key={days} onClick={() => extend(days)}>
            Extend trial +{days} days
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onClick={() => {
            const raw = window.prompt('Extend trial by how many days? (1–365)');
            if (raw == null || raw.trim() === '') return;
            const days = Number(raw);
            if (!Number.isFinite(days) || days < 1 || days > 365) {
              toast.error('Enter a number of days between 1 and 365.');
              return;
            }
            extend(days);
          }}
        >
          Extend trial — custom
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {FREE_ACCESS_DAY_OPTIONS.map((days) => (
          <DropdownMenuItem
            key={days}
            onClick={() =>
              run(
                { action: 'grant_free_access', days, reason: `Admin granted free access for ${days} days` },
                `Grant ${days} days of free access to:\n\n${email}`
              )
            }
          >
            Free access — {days} days
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onClick={() =>
            run(
              { action: 'grant_free_access', indefinite: true, reason: 'Admin granted indefinite free access' },
              `Grant indefinite free access to:\n\n${email}`
            )
          }
        >
          Free access — indefinite
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            run(
              { action: 'remove_free_access', reason: 'Admin removed free access' },
              `Remove free access for:\n\n${email}`
            )
          }
        >
          Remove free access
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => run({ action: 'send_trial_reminder' }, `Send notification to:\n\n${email}`)}
        >
          Send trial reminder
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => run({ action: 'send_subscription_prompt' }, `Send notification to:\n\n${email}`)}
        >
          Send subscription prompt
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            run(
              { action: 'activate', reason: 'Admin activated subscription' },
              `Activate the subscription for:\n\n${email}`
            )
          }
        >
          Activate subscription
        </DropdownMenuItem>
        {sub.status === 'suspended' ? (
          <DropdownMenuItem
            onClick={() =>
              run(
                { action: 'activate', reason: 'Admin reactivated subscription' },
                `Reactivate:\n\n${email}`
              )
            }
          >
            Reactivate account
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() =>
              run(
                { action: 'suspend', reason: 'Admin suspended subscription' },
                `Suspend ${email}? They stay signed in, but Paidly stays closed until you reactivate them.`
              )
            }
          >
            Suspend account
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive"
          onClick={() =>
            run(
              { action: 'cancel', reason: 'Admin cancelled subscription' },
              `Cancel the subscription for ${email}? Their invoices, customers, and other records stay.`
            )
          }
        >
          Cancel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function SubscriptionsPage() {
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(SUBSCRIPTION_STATUS_FILTER.ALL);
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showAdd, setShowAdd] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [detailSubId, setDetailSubId] = useState(null);
  const [subsPage, setSubsPage] = useState(0);
  const queryClient = useQueryClient();

  const { data: subscriptions = [], isLoading: subsLoading, isError: subsError, error: subsErr, refetch } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => fetchAdminSubscriptionsList({ limit: LIST_LIMIT }),
    refetchInterval: 30000,
  });

  const {
    data: subscriptionOverviewPayload,
    isLoading: overviewLoading,
    isError: overviewError,
    error: overviewErr,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['subscription-overview'],
    queryFn: () => fetchAdminSubscriptionOverview(),
    refetchInterval: 30000,
  });
  const subscriptionOverview = subscriptionOverviewPayload?.overview;
  const billingReporting = subscriptionOverviewPayload?.reporting;

  const {
    data: platformUsers = [],
    isLoading: usersLoading,
    isError: platformUsersError,
    error: platformUsersErr,
  } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(LIST_LIMIT),
    refetchInterval: 30000,
  });

  const rows = useMemo(
    () => buildSubscriptionRows(platformUsers, subscriptions),
    [platformUsers, subscriptions]
  );

  const isLoading = subsLoading || usersLoading;

  const subsFetching = useIsFetching({ queryKey: ['subscriptions'] }) > 0;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAdminSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-overview'] });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('Subscription updated');
    },
    onError: (err) => toast.error(err?.message || 'Update failed'),
  });

  useEffect(() => { setSubsPage(0); }, [search, planFilter, statusFilter, phaseFilter, sortBy]);

  const filtered = rows.filter((s) => {
    const matchSearch =
      !search ||
      (s.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.user_email || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.company_address || '').toLowerCase().includes(search.toLowerCase());
    const matchPlan =
      planFilter === 'all' ||
      (planFilter === 'needs_migration'
        ? Boolean(s.needs_plan_migration || isLegacyPlanSlug(s.plan || s.plan_slug))
        : normalizePaidPackageKey(s.plan) === planFilter);
    // Same status definitions the summary cards are counted with, so a card's number and the rows
    // it filters to always agree.
    const matchStatus = subscriptionMatchesStatusFilter(s, statusFilter);
    const matchPhase =
      phaseFilter === 'all' ||
      (!s._isSynthetic && deriveTrialPhase(s).phase === phaseFilter);
    return matchSearch && matchPlan && matchStatus && matchPhase;
  });

  const sorted = [...filtered].sort((a, b) => {
    const time = (value) => {
      const t = new Date(value || 0).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    if (sortBy === 'ending') {
      const ae = a.trial_ends_at ? time(a.trial_ends_at) : Number.POSITIVE_INFINITY;
      const be = b.trial_ends_at ? time(b.trial_ends_at) : Number.POSITIVE_INFINITY;
      return ae - be;
    }
    if (sortBy === 'expired') return time(b.trial_ends_at) - time(a.trial_ends_at);
    if (sortBy === 'subscribed') return time(b.activated_at || b.updated_at) - time(a.activated_at || a.updated_at);
    return time(b.created_at || b.created_date) - time(a.created_at || a.created_date);
  });

  const trialCounts = rows.reduce(
    (acc, row) => {
      if (row._isSynthetic) return acc;
      const phase = deriveTrialPhase(row).phase;
      if (phase === TRIAL_PHASE.TRIAL_ACTIVE) acc.active += 1;
      else if (phase === TRIAL_PHASE.TRIAL_ENDING_SOON) acc.ending += 1;
      else if (phase === TRIAL_PHASE.TRIAL_EXPIRED) acc.expired += 1;
      else if (phase === TRIAL_PHASE.FREE_ACCESS) acc.free += 1;
      else if (phase === TRIAL_PHASE.SUBSCRIPTION_ACTIVE) acc.subscribed += 1;
      if (row.subscription_source === 'payfast' && row.status === 'active' && row.trial_started_at) acc.converted += 1;
      return acc;
    },
    { active: 0, ending: 0, expired: 0, converted: 0, free: 0, subscribed: 0 }
  );

  const statusFilterLabel = STATUS_FILTER_LABELS[statusFilter] || statusFilter;
  const isFilteredView =
    statusFilter !== SUBSCRIPTION_STATUS_FILTER.ALL || planFilter !== 'all' || phaseFilter !== 'all' || Boolean(search.trim());
  const emptyMessage =
    statusFilter === SUBSCRIPTION_STATUS_FILTER.ALL
      ? 'No subscriptions found'
      : `No ${statusFilterLabel.toLowerCase()} subscriptions found`;

  const totalSubsPages = Math.max(1, Math.ceil(filtered.length / SUBS_PAGE_SIZE));
  const pagedFiltered = sorted.slice(subsPage * SUBS_PAGE_SIZE, (subsPage + 1) * SUBS_PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Platform users and billed plans. Previous-catalog rows are flagged for migration and cannot be selected as new plans."
        onRefresh={() => {
          void refetch();
          void refetchOverview();
        }}
        isRefreshing={subsFetching}
      >
        <Button size="sm" onClick={() => setShowAdd(true)} className="h-8 rounded-xl text-xs font-medium bg-primary hover:bg-primary/90">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Subscription
        </Button>
      </PageHeader>

      {platformUsersError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Could not load platform users from the backend (needed for subscription rows):{' '}
            {platformUsersErr?.message || 'Unknown error'}.
          </AlertDescription>
        </Alert>
      ) : null}

      {subsError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Could not load subscriptions: {subsErr?.message || 'Unknown error'}.
          </AlertDescription>
        </Alert>
      ) : null}

      <SubscriptionOverview
        className="mb-4"
        overview={subscriptionOverview}
        reporting={billingReporting}
        isLoading={overviewLoading}
        showManageLink={false}
        statusFilter={statusFilter}
        onSelectFilter={setStatusFilter}
        errorMessage={
          overviewError ? overviewErr?.message || 'Could not load subscription overview' : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CATALOG_TIERS.map((p) => {
          const count = rows.filter(
            (s) => normalizePaidPackageKey(s.plan) === p.family && s.status === 'active'
          ).length;
          return (
            <div key={p.family} className={`rounded-xl border bg-card px-3.5 py-3 ${p.color}`}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">
                {count}{' '}
                <span className="text-xs font-normal text-muted-foreground">active</span>
              </p>
              <p className="mt-0.5 text-xs font-medium text-foreground">{p.price}</p>
            </div>
          );
        })}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Active Trials', subscriptionOverview?.trialLifecycle?.active ?? trialCounts.active],
          ['Ending Soon', subscriptionOverview?.trialLifecycle?.ending ?? trialCounts.ending],
          ['Expired Trials', subscriptionOverview?.trialLifecycle?.expired ?? trialCounts.expired],
          ['Converted Trials', subscriptionOverview?.trialLifecycle?.converted ?? trialCounts.converted],
          ['Free Access', subscriptionOverview?.trialLifecycle?.free ?? trialCounts.free],
          ['Active Subscribers', subscriptionOverview?.trialLifecycle?.subscribed ?? trialCounts.subscribed],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl border border-border bg-card px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{count}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users and subscriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 bg-card pl-9 text-sm md:h-8"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="h-11 w-full bg-card text-xs sm:w-[150px] md:h-8">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
            <SelectItem value="needs_migration">Needs migration</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 w-full bg-card text-xs sm:w-[150px] md:h-8">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="trialing">Trial</SelectItem>
            <SelectItem value="live_trial">Trial — in progress</SelectItem>
            <SelectItem value="expired_trials">Expired trials</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="admin_granted">Admin Granted</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="none">No subscription row</SelectItem>
          </SelectContent>
        </Select>
        <Select value={phaseFilter} onValueChange={setPhaseFilter}>
          <SelectTrigger className="h-11 w-full bg-card text-xs sm:w-[160px] md:h-8">
            <SelectValue placeholder="Trial" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All trials</SelectItem>
            <SelectItem value={TRIAL_PHASE.TRIAL_ACTIVE}>Active Trial</SelectItem>
            <SelectItem value={TRIAL_PHASE.TRIAL_ENDING_SOON}>Ending Soon</SelectItem>
            <SelectItem value={TRIAL_PHASE.TRIAL_EXPIRED}>Expired</SelectItem>
            <SelectItem value={TRIAL_PHASE.SUBSCRIPTION_ACTIVE}>Subscribed</SelectItem>
            <SelectItem value={TRIAL_PHASE.FREE_ACCESS}>Free Access</SelectItem>
            <SelectItem value={TRIAL_PHASE.SUSPENDED}>Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-11 w-full bg-card text-xs sm:w-[180px] md:h-8">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ending">Trial ending soonest</SelectItem>
            <SelectItem value="expired">Recently expired</SelectItem>
            <SelectItem value="subscribed">Recently subscribed</SelectItem>
            <SelectItem value="newest">Newest users</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {isLoading
            ? 'Loading subscriptions…'
            : `Showing ${filtered.length} of ${rows.length} ${
                statusFilter === SUBSCRIPTION_STATUS_FILTER.ALL ? '' : `${statusFilterLabel.toLowerCase()} `
              }record${filtered.length === 1 ? '' : 's'}`}
        </span>
        {isFilteredView ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setStatusFilter(SUBSCRIPTION_STATUS_FILTER.ALL);
              setPlanFilter('all');
              setPhaseFilter('all');
              setSearch('');
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="space-y-3 p-3 md:hidden">
          {pagedFiltered.map((sub) => (
            <article key={sub._rowKey || sub.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{sub.user_name || '—'}</p>
                  <p className="truncate text-xs text-muted-foreground">{sub.user_email}</p>
                </div>
                <StatusBadge status={sub.status} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <TrialPhaseLine sub={sub} />
                <SubscriptionActions
                  sub={sub}
                  onView={() => setDetailSubId(sub.id)}
                  onEdit={() => {
                    setShowAdd(false);
                    setEditingSub(sub);
                  }}
                  onUpdate={(payload) => updateMutation.mutate(payload)}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                <PlanBadge plan={sub.plan} />
                <span className="font-medium tabular-nums">
                  {sub._isSynthetic ? (
                    <span className="text-muted-foreground">No subscription</span>
                  ) : (
                    `R ${Number(sub.amount ?? 0).toFixed(2)}`
                  )}
                </span>
              </div>
            </article>
          ))}
          {filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              {isLoading ? 'Loading...' : emptyMessage}
            </p>
          ) : null}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">User</th>
                <th className="px-4 py-2 text-left font-medium">Company</th>
                <th className="px-4 py-2 text-left font-medium">Plan</th>
                <th className="px-4 py-2 text-left font-medium">Amount</th>
                <th className="px-4 py-2 text-left font-medium">Billing</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Trial</th>
                <th className="px-4 py-2 text-left font-medium">Next Billing</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedFiltered.map((sub) => (
                <tr
                  key={sub._rowKey || sub.id}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-medium">{sub.user_name || '—'}</p>
                    <p className="text-[11px] text-muted-foreground">{sub.user_email}</p>
                    {sub.phone ? <p className="text-[11px] text-muted-foreground">{sub.phone}</p> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm">{sub.company_name || '—'}</p>
                    <p className="text-[11px] text-muted-foreground">{sub.company_address || '—'}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <PlanBadge plan={sub.plan} />
                    {sub.needs_plan_migration || isLegacyPlanSlug(sub.plan || sub.plan_slug) ? (
                      <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">Needs catalog migration</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium tabular-nums">
                    {sub._isSynthetic ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>R {Number(sub.amount ?? 0).toFixed(2)}</>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">
                    {sub.billing_cycle || 'monthly'}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={sub.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <TrialPhaseLine sub={sub} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {sub.next_billing_date
                      ? format(new Date(sub.next_billing_date), 'dd MMM yyyy')
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <SubscriptionActions
                      sub={sub}
                      onView={() => setDetailSubId(sub.id)}
                      onEdit={() => {
                        setShowAdd(false);
                        setEditingSub(sub);
                      }}
                      onUpdate={(payload) => updateMutation.mutate(payload)}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Loading...' : emptyMessage}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={subsPage}
          totalPages={totalSubsPages}
          onPageChange={setSubsPage}
          totalItems={filtered.length}
          itemLabel="subscriptions"
        />
      </div>

      <SubscriptionFormDialog
        open={showAdd || !!editingSub}
        onClose={() => {
          setShowAdd(false);
          setEditingSub(null);
        }}
        subscription={editingSub}
      />

      <SubscriptionDetailsSheet
        subscriptionId={detailSubId}
        open={Boolean(detailSubId)}
        onOpenChange={(next) => {
          if (!next) setDetailSubId(null);
        }}
      />
    </div>
  );
}
