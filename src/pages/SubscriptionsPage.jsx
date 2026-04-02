import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
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
import StatusBadge from '@/components/dashboard/StatusBadge';
import PlanBadge from '@/components/dashboard/PlanBadge';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { useCurrentUser } from '@/lib/useCurrentUser';
import SubscriptionFormDialog, {
  mapProfilePlanToSubPlan,
} from '@/components/subscriptions/SubscriptionFormDialog';

const PLAN_DEFAULT_AMOUNT = { individual: 25, sme: 50, corporate: 110 };
const LIST_LIMIT = 500;

function pickLatestSubscriptionForUser(subs, userId) {
  const uid = String(userId);
  const matches = subs.filter((s) => s.user_id && String(s.user_id) === uid);
  if (!matches.length) return null;
  return matches.sort(
    (a, b) => new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0)
  )[0];
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
  const { user: currentUser } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const queryClient = useQueryClient();

  const { data: subscriptions = [], isLoading: subsLoading, refetch } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => paidly.entities.Subscription.list('-created_date', LIST_LIMIT),
    refetchInterval: 30000,
  });

  const { data: platformUsers = [], isLoading: usersLoading } = useQuery({
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
    mutationFn: ({ id, data }) => paidly.entities.Subscription.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('Subscription updated');
    },
    onError: (err) => toast.error(err?.message || 'Update failed'),
  });

  const filtered = rows.filter((s) => {
    const matchSearch =
      !search ||
      (s.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.user_email || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.company_address || '').toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === 'all' || s.plan === planFilter;
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchPlan && matchStatus;
  });

  const handleStatusChange = (sub, newStatus) => {
    const prevStatus = sub.status;
    updateMutation.mutate(
      { id: sub.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          logAction({
            actor: currentUser,
            action: AUDIT_ACTIONS.SUBSCRIPTION_STATUS_CHANGED,
            category: 'subscriptions',
            description: `Changed subscription status of ${sub.user_name || sub.user_email} from "${prevStatus}" to "${newStatus}"`,
            targetId: sub.id,
            targetLabel: sub.user_email,
            before: { status: prevStatus },
            after: { status: newStatus },
          });
        },
      }
    );
  };

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="All platform users and their subscription records (profile plan shown when no subscription row exists)"
        onRefresh={() => refetch()}
        isRefreshing={subsFetching}
      >
        <Button onClick={() => setShowAdd(true)} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" /> Add Subscription
        </Button>
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { plan: 'individual', label: 'Individual', price: 'R25/mo', color: 'border-blue-500/30' },
          { plan: 'sme', label: 'SME', price: 'R50/mo', color: 'border-primary/30' },
          { plan: 'corporate', label: 'Corporate', price: 'R110/mo', color: 'border-purple-500/30' },
        ].map((p) => {
          const count = rows.filter((s) => s.plan === p.plan && s.status === 'active').length;
          return (
            <div key={p.plan} className={`rounded-xl border-2 bg-card p-5 ${p.color}`}>
              <p className="text-sm text-muted-foreground">{p.label}</p>
              <p className="mt-1 text-2xl font-bold">
                {count}{' '}
                <span className="text-sm font-normal text-muted-foreground">active</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{p.price}</p>
            </div>
          );
        })}
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users and subscriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card pl-10"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-full bg-card sm:w-[150px]">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="sme">SME</SelectItem>
            <SelectItem value="corporate">Corporate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full bg-card sm:w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="none">No subscription row</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">User</th>
                <th className="px-6 py-3 text-left font-medium">Company</th>
                <th className="px-6 py-3 text-left font-medium">Plan</th>
                <th className="px-6 py-3 text-left font-medium">Amount</th>
                <th className="px-6 py-3 text-left font-medium">Billing</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium">Next Billing</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub) => (
                <tr
                  key={sub._rowKey || sub.id}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium">{sub.user_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{sub.user_email}</p>
                    {sub.phone ? <p className="text-xs text-muted-foreground">{sub.phone}</p> : null}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm">{sub.company_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{sub.company_address || '—'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <PlanBadge plan={sub.plan} />
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    {sub._isSynthetic ? (
                      <span className="text-muted-foreground">
                        R {PLAN_DEFAULT_AMOUNT[sub.plan] ?? 0}{' '}
                        <span className="text-xs">(profile)</span>
                      </span>
                    ) : (
                      <>R {Number(sub.amount ?? 0).toFixed(2)}</>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm capitalize text-muted-foreground">
                    {sub.billing_cycle || 'monthly'}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={sub.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {sub.next_billing_date
                      ? format(new Date(sub.next_billing_date), 'dd MMM yyyy')
                      : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
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
                            <DropdownMenuItem
                              onClick={() => {
                                setShowAdd(false);
                                setEditingSub(sub);
                              }}
                            >
                              Edit subscription
                            </DropdownMenuItem>
                            {sub.status === 'active' ? (
                              <DropdownMenuItem onClick={() => handleStatusChange(sub, 'paused')}>
                                Pause
                              </DropdownMenuItem>
                            ) : null}
                            {sub.status === 'paused' ? (
                              <DropdownMenuItem onClick={() => handleStatusChange(sub, 'active')}>
                                Reactivate
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleStatusChange(sub, 'cancelled')}
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
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Loading...' : 'No subscriptions found'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <SubscriptionFormDialog
        open={showAdd || !!editingSub}
        onClose={() => {
          setShowAdd(false);
          setEditingSub(null);
        }}
        subscription={editingSub}
      />
    </div>
  );
}
