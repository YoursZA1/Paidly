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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import PageHeader from '@/components/dashboard/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PlanBadge from '@/components/dashboard/PlanBadge';
import SubscriptionOverview from '@/components/dashboard/SubscriptionOverview';
import SubscriptionDetailsSheet from '@/components/subscriptions/SubscriptionDetailsSheet';
import TrialMigrationPanel, { TRIAL_MIGRATION_QUERY_KEY } from '@/components/subscriptions/TrialMigrationPanel';
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
import {
  MIGRATION_OVERRIDE_STATUSES,
  MIGRATION_STATUS,
  MIGRATION_STATUS_LABEL,
} from '@shared/trialMigration.js';

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

const NOTIFICATION_LABEL = {
  TRIAL_ENDING_3_DAYS: 'Ending soon',
  TRIAL_EXPIRED: 'Trial ended',
  TRIAL_EXPIRED_FOLLOWUP: 'Follow-up',
  TRIAL_REACTIVATION: 'Subscription prompt',
  TRIAL_EXTENDED: 'Trial extended',
  SUBSCRIPTION_CONFIRMED: 'Subscribed',
};

function LastNotificationLine({ sub }) {
  const note = sub?.last_notification;
  if (!note) return <span className="text-xs text-muted-foreground">—</span>;
  const when = note.at ? format(new Date(note.at), 'dd MMM') : null;
  const failed = note.status === 'failed';
  return (
    <div>
      <p className={`text-xs font-medium ${failed ? 'text-destructive' : ''}`}>
        {NOTIFICATION_LABEL[note.type] || 'Email'} {failed ? 'failed' : 'sent'}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {[when, note.source === 'admin' ? 'by admin' : null].filter(Boolean).join(' · ') || '—'}
      </p>
    </div>
  );
}

function SubscriptionActions({ sub, onView, onEdit, onRequest, extra = null }) {
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
  const who = sub.company_name || sub.user_name || email;
  const phase = deriveTrialPhase(sub).phase;
  const paying = phase === TRIAL_PHASE.SUBSCRIPTION_ACTIVE || phase === TRIAL_PHASE.PAST_DUE;
  const free = phase === TRIAL_PHASE.FREE_ACCESS || sub.free_access === true;
  const suspended = phase === TRIAL_PHASE.SUSPENDED;
  const ask = (request) => onRequest({ sub, ...request });
  const extend = (days) =>
    ask({ data: { action: 'extend_trial', days }, success: `Trial extended by ${days} days` });

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
        {!paying && !suspended ? (
          <>
            <DropdownMenuSeparator />
            {TRIAL_EXTEND_DAY_OPTIONS.map((days) => (
              <DropdownMenuItem key={days} onClick={() => extend(days)}>
                Extend trial +{days} days
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => ask({ kind: 'extend_custom' })}>Extend trial — custom</DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        {FREE_ACCESS_DAY_OPTIONS.map((days) => (
          <DropdownMenuItem
            key={days}
            onClick={() =>
              ask({
                data: { action: 'grant_free_access', days, reason: `Admin granted free access for ${days} days` },
                title: `Grant ${days} days of free access?`,
                body: `${who} (${email}) gets full access until the free period ends. Trial emails stop.`,
                confirmLabel: 'Grant free access',
                success: `Free access granted for ${days} days`,
              })
            }
          >
            Free access — {days} days
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onClick={() =>
            ask({
              data: { action: 'grant_free_access', indefinite: true, reason: 'Admin granted indefinite free access' },
              title: 'Grant indefinite free access?',
              body: `${who} (${email}) keeps full access until you remove it. Trial emails stop.`,
              confirmLabel: 'Grant free access',
              success: 'Indefinite free access granted',
            })
          }
        >
          Free access — indefinite
        </DropdownMenuItem>
        {free ? (
          <DropdownMenuItem
            onClick={() =>
              ask({
                data: { action: 'remove_free_access', reason: 'Admin removed free access' },
                title: 'Remove free access?',
                body: `${who} (${email}) goes back to their trial or, if it has ended, to view-only until they subscribe. No data is deleted.`,
                confirmLabel: 'Remove free access',
                destructive: true,
                success: 'Free access removed',
              })
            }
          >
            Remove free access
          </DropdownMenuItem>
        ) : null}
        {!paying && !free && !suspended ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                ask({
                  data: { action: 'send_trial_reminder' },
                  title: 'Send trial reminder',
                  body: 'Send notification to:',
                  recipient: email,
                  confirmLabel: 'Send',
                  success: `Trial reminder sent to ${email}`,
                })
              }
            >
              Send trial reminder
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                ask({
                  data: { action: 'send_subscription_prompt' },
                  title: 'Send subscription prompt',
                  body: 'Send notification to:',
                  recipient: email,
                  confirmLabel: 'Send',
                  success: `Subscription prompt sent to ${email}`,
                })
              }
            >
              Send subscription prompt
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        {!paying && !suspended ? (
          <DropdownMenuItem
            onClick={() =>
              ask({
                data: { action: 'activate', reason: 'Admin activated subscription' },
                title: 'Activate subscription?',
                body: `${who} (${email}) gets full access with no end date, managed by an administrator.`,
                confirmLabel: 'Activate',
                success: 'Subscription activated',
              })
            }
          >
            Activate subscription
          </DropdownMenuItem>
        ) : null}
        {suspended ? (
          <DropdownMenuItem
            onClick={() =>
              ask({
                data: { action: 'activate', reason: 'Admin reactivated account' },
                title: 'Reactivate account?',
                body: `${who} (${email}) gets full access again.`,
                confirmLabel: 'Reactivate',
                success: 'Account reactivated',
              })
            }
          >
            Reactivate account
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() =>
              ask({
                data: { action: 'suspend', reason: 'Admin suspended account' },
                title: 'Suspend account?',
                body: `${who} (${email}) can still sign in, but Paidly stays closed until you reactivate them. No data is deleted.`,
                confirmLabel: 'Suspend',
                destructive: true,
                success: 'Account suspended',
              })
            }
          >
            Suspend account
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive"
          onClick={() =>
            ask({
              data: { action: 'cancel', reason: 'Admin cancelled subscription' },
              title: 'Cancel subscription?',
              body: `${who} (${email}) loses access. Their invoices, customers, and other records stay.`,
              confirmLabel: 'Cancel subscription',
              destructive: true,
              success: 'Subscription cancelled',
            })
          }
        >
          Cancel
        </DropdownMenuItem>
        {extra ? (
          <>
            <DropdownMenuSeparator />
            {extra}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Existing-user migration items for one subscription row. */
function MigrationMenuItems({ sub, onRequest }) {
  const email = sub.user_email || 'this user';
  const who = sub.company_name || sub.user_name || email;
  const ask = (request) => onRequest({ sub, ...request });
  return (
    <>
      <DropdownMenuItem
        onClick={() =>
          ask({
            data: { action: 'migration_mark_reviewed' },
            title: 'Mark as reviewed?',
            body: `${who} keeps their current access. The migration will not email them or change their state again.`,
            confirmLabel: 'Mark as reviewed',
            success: 'Marked as reviewed',
          })
        }
      >
        Mark as reviewed
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Set migration state</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {MIGRATION_OVERRIDE_STATUSES.map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() =>
                ask({
                  data: { action: 'migration_override', status },
                  title: `Set to ${MIGRATION_STATUS_LABEL[status]}?`,
                  body:
                    status === MIGRATION_STATUS.MIGRATED_EXPIRED
                      ? `${who} gets a 7-day grace period with full access and the existing-user emails, then becomes view-only until they subscribe. No data is deleted.`
                      : `Records the migration state for ${who}. Their access does not change.`,
                  confirmLabel: 'Set state',
                  success: `Migration state set to ${MIGRATION_STATUS_LABEL[status]}`,
                })
              }
            >
              {MIGRATION_STATUS_LABEL[status]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {sub.migration_excluded ? (
        <DropdownMenuItem
          onClick={() =>
            ask({
              data: { action: 'migration_include' },
              title: 'Remove the migration exclusion?',
              body: `${who} goes back to the normal trial rules. If their trial has ended, access follows those rules again.`,
              confirmLabel: 'Remove exclusion',
              success: 'Exclusion removed',
            })
          }
        >
          Remove migration exclusion
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          onClick={() =>
            ask({
              data: { action: 'migration_exclude' },
              title: 'Exclude from trial migration?',
              body: `${who} keeps full access, gets no trial or migration emails, and is never expired automatically until you remove the exclusion.`,
              askReason: true,
              confirmLabel: 'Exclude',
              success: 'Excluded from the trial migration',
            })
          }
        >
          Exclude from trial migration
        </DropdownMenuItem>
      )}
      {sub.trial_migration_status ? (
        <DropdownMenuItem
          className="text-destructive"
          onClick={() =>
            ask({
              data: { action: 'migration_reset' },
              title: 'Reset the migration for this account?',
              body: `Removes ${who}'s migration state and any grace period. If their trial has ended, they become view-only now. No data is deleted.`,
              confirmLabel: 'Reset migration',
              destructive: true,
              success: 'Migration reset',
            })
          }
        >
          Reset migration
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

function AdminActionDialog({ request, pending, onClose, onConfirm }) {
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (request) {
      setDays('');
      setReason('');
    }
  }, [request]);
  const open = Boolean(request);
  const custom = request?.kind === 'extend_custom';
  const dayCount = Number(days);
  const validDays = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 365;
  const confirm = () => {
    if (!request) return;
    if (custom) {
      if (!validDays) return;
      onConfirm({ ...request, data: { action: 'extend_trial', days: dayCount }, success: `Trial extended by ${dayCount} days` });
      return;
    }
    if (request.askReason) {
      onConfirm({ ...request, data: { ...request.data, reason: reason.trim() || undefined } });
      return;
    }
    onConfirm(request);
  };
  const email = request?.sub?.user_email || '';
  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next && !pending ? onClose() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{custom ? 'Extend trial' : request?.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {custom ? (
                <>
                  <p>Add days to the trial for {email || 'this user'}. The start date stays the same.</p>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    autoFocus
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirm();
                    }}
                    placeholder="Days (1–365)"
                    aria-label="Days to add"
                    className="h-11 md:h-9"
                  />
                  {days && !validDays ? (
                    <p className="text-xs text-destructive">Enter a whole number of days between 1 and 365.</p>
                  ) : null}
                </>
              ) : (
                <>
                  <p>{request?.body}</p>
                  {request?.recipient ? <p className="font-medium text-foreground">{request.recipient}</p> : null}
                  {request?.askReason ? (
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                      placeholder="Reason (optional)"
                      aria-label="Reason"
                      className="h-11 md:h-9"
                    />
                  ) : null}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant={request?.destructive ? 'destructive' : 'default'}
            disabled={pending || (custom && !validDays)}
            onClick={confirm}
          >
            {pending ? 'Working…' : custom ? 'Extend trial' : request?.confirmLabel || 'Confirm'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const [actionRequest, setActionRequest] = useState(null);
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
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-overview'] });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: [TRIAL_MIGRATION_QUERY_KEY] });
      setActionRequest(null);
      toast.success(variables?.success || 'Subscription updated');
    },
    onError: (err) => {
      setActionRequest(null);
      toast.error(err?.message || 'Update failed');
    },
  });

  // Actions with a title or custom input confirm first; quick trial extensions run directly.
  const requestAction = (request) => {
    if (request.kind || request.title) {
      setActionRequest(request);
      return;
    }
    updateMutation.mutate({ id: request.sub.id, data: request.data, success: request.success });
  };

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

      <TrialMigrationPanel
        renderActions={(row) => {
          const sub = row.subscriptionRow;
          if (!sub) {
            return (
              <SubscriptionActions
                sub={{ _isSynthetic: true, user_id: row.userId, user_email: row.ownerEmail, user_name: row.ownerName }}
                onEdit={() => {
                  setShowAdd(false);
                  setEditingSub({ _isSynthetic: true, user_id: row.userId, user_email: row.ownerEmail, user_name: row.ownerName });
                }}
              />
            );
          }
          return (
            <SubscriptionActions
              sub={sub}
              onView={() => setDetailSubId(sub.id)}
              onEdit={() => {
                setShowAdd(false);
                setEditingSub(sub);
              }}
              onRequest={requestAction}
              extra={<MigrationMenuItems sub={sub} onRequest={requestAction} />}
            />
          );
        }}
      />

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
                <div className="flex min-w-0 items-start gap-4">
                  <TrialPhaseLine sub={sub} />
                  <LastNotificationLine sub={sub} />
                </div>
                <SubscriptionActions
                  sub={sub}
                  onView={() => setDetailSubId(sub.id)}
                  onEdit={() => {
                    setShowAdd(false);
                    setEditingSub(sub);
                  }}
                  onRequest={requestAction}
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
                <th className="px-4 py-2 text-left font-medium">Last notification</th>
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
                  <td className="px-4 py-2.5">
                    <LastNotificationLine sub={sub} />
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
                      onRequest={requestAction}
                    />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
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

      <AdminActionDialog
        request={actionRequest}
        pending={updateMutation.isPending}
        onClose={() => setActionRequest(null)}
        onConfirm={(request) =>
          updateMutation.mutate({ id: request.sub.id, data: request.data, success: request.success })
        }
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
