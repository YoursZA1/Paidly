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
  mapProfilePlanToSubPlan,
} from '@/components/subscriptions/SubscriptionFormDialog';
import { pickPreferredSubscriptionRow, normalizePaidPackageKey } from '@/lib/subscriptionPlan';
import { isLegacyPlanSlug } from '@/lib/plans.js';
import { PLAN_DEFAULT_AMOUNT } from '@/data/paidlySubscriptionPlans';
import TablePagination from '@/components/ui/TablePagination';

const LIST_LIMIT = 500;
const SUBS_PAGE_SIZE = 15;

const CATALOG_TIERS = [
  { family: 'starter', label: 'Starter', price: 'R50/mo', color: 'border-blue-500/25' },
  { family: 'business', label: 'Business', price: 'R150/mo', color: 'border-primary/30' },
  { family: 'growth', label: 'Growth', price: 'R350/mo', color: 'border-purple-500/25' },
  { family: 'enterprise', label: 'Enterprise', price: 'Custom', color: 'border-amber-500/25' },
];

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
      const plan = mapProfilePlanToSubPlan(u.plan || u.subscription_plan);
      rows.push({
        id: null,
        user_id: u.id,
        user_name: u.full_name || '',
        user_email: u.email || '',
        company_name: u.company_name || u.company || '',
        company_address: u.company_address || '',
        phone: u.phone || '',
        plan,
        amount: PLAN_DEFAULT_AMOUNT[plan] ?? 0,
        billing_cycle: 'monthly',
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

export default function SubscriptionsPage() {
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
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

  useEffect(() => { setSubsPage(0); }, [search, planFilter, statusFilter]);

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
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'admin_granted'
        ? s.subscription_source === 'admin' && s.status === 'active'
        : s.status === statusFilter);
    return matchSearch && matchPlan && matchStatus;
  });

  const totalSubsPages = Math.max(1, Math.ceil(filtered.length / SUBS_PAGE_SIZE));
  const pagedFiltered = filtered.slice(subsPage * SUBS_PAGE_SIZE, (subsPage + 1) * SUBS_PAGE_SIZE);

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

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users and subscriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 bg-card pl-9 text-sm"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="h-8 w-full bg-card text-xs sm:w-[150px]">
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
          <SelectTrigger className="h-8 w-full bg-card text-xs sm:w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="trialing">Trial</SelectItem>
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
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">User</th>
                <th className="px-4 py-2 text-left font-medium">Company</th>
                <th className="px-4 py-2 text-left font-medium">Plan</th>
                <th className="px-4 py-2 text-left font-medium">Amount</th>
                <th className="px-4 py-2 text-left font-medium">Billing</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
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
                      <span className="text-muted-foreground">
                        R {PLAN_DEFAULT_AMOUNT[sub.plan] ?? PLAN_DEFAULT_AMOUNT[normalizePaidPackageKey(sub.plan)] ?? 0}{' '}
                        <span className="text-[10px]">(profile)</span>
                      </span>
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
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {sub.next_billing_date
                      ? format(new Date(sub.next_billing_date), 'dd MMM yyyy')
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {sub._isSynthetic ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setShowAdd(false);
                              setEditingSub(sub);
                            }}
                          >
                            Create subscription
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onClick={() => setDetailSubId(sub.id)}>
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setShowAdd(false);
                                setEditingSub(sub);
                              }}
                            >
                              Edit subscription
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateMutation.mutate({
                                  id: sub.id,
                                  data: { action: 'extend_trial', days: 7, reason: 'Admin extended trial by 7 days' },
                                })
                              }
                            >
                              Extend trial +7 days
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateMutation.mutate({
                                  id: sub.id,
                                  data: { action: 'grant', reason: 'Admin granted access' },
                                })
                              }
                            >
                              Grant access
                            </DropdownMenuItem>
                            {sub.status === 'active' ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  updateMutation.mutate({
                                    id: sub.id,
                                    data: { action: 'suspend', reason: 'Admin suspended subscription' },
                                  })
                                }
                              >
                                Suspend
                              </DropdownMenuItem>
                            ) : null}
                            {sub.status === 'paused' || sub.status === 'suspended' ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  updateMutation.mutate({
                                    id: sub.id,
                                    data: { action: 'activate', reason: 'Admin activated subscription' },
                                  })
                                }
                              >
                                Reactivate
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: sub.id,
                                  data: { action: 'cancel', reason: 'Admin cancelled subscription' },
                                })
                              }
                            >
                              Cancel
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Loading...' : 'No subscriptions found'}
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
