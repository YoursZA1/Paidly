import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import { adminUserNameEmailLines } from '@/utils/adminUserDisplay';
import { Search, MoreHorizontal, UserPlus, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PlatformUsersLoadErrorHint from '@/components/PlatformUsersLoadErrorHint';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PlanBadge from '@/components/dashboard/PlanBadge';
import UserFormDialog from '@/components/users/UserFormDialog';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { mergeUsersWithInvoiceCounts } from '@/utils/documentOwnership';
import { adminRowPrimaryId, stableDirectoryRowKey } from '@/utils/stableListKey';
import { normalizePlanSlug, PLANS } from '@shared/plans.js';

const EMPTY_PLAN = '__empty__';

/** Normalized billing slug from profile + merged user fields. */
function rawPlanSlug(u) {
  const raw = String(
    u.profile?.plan ?? u.profile?.subscription_plan ?? u.subscription_plan ?? u.plan ?? ''
  )
    .trim()
    .toLowerCase();
  return raw || EMPTY_PLAN;
}

/** Paidly tier bucket: individual | sme | corporate | other | none */
function packageTierKey(u) {
  const raw = rawPlanSlug(u);
  if (raw === EMPTY_PLAN) return 'none';
  const n = normalizePlanSlug(raw);
  if (n && PLANS[n]) return n;
  return 'other';
}

/** For profile filter dropdown + row display. */
function profileBillingKey(u) {
  if (!u.profile) return 'missing';
  const st = String(u.profile.subscription_status || '').trim().toLowerCase();
  if (!st) return 'unset';
  if (st === 'canceled') return 'cancelled';
  return st;
}

/** Matches UserFormDialog plan → profile payload for bulk updates. */
function planFieldsForBulk(planSelectValue) {
  const slug = String(planSelectValue || 'none').trim().toLowerCase();
  const billingPlan = slug === 'none' ? 'free' : slug;
  const payload = {
    plan: billingPlan,
    subscription_plan: billingPlan,
  };
  if (['individual', 'sme', 'corporate'].includes(slug)) {
    payload.subscription_status = 'active';
    payload.trial_ends_at = null;
    payload.is_pro = true;
  } else {
    payload.subscription_status = 'inactive';
    payload.is_pro = false;
  }
  return payload;
}

function isExcludedFromBulk(userId, adminSelfId) {
  return Boolean(adminSelfId && userId === adminSelfId);
}

export default function UsersPage() {
  const { user: currentUser } = useCurrentUser();
  const adminSelfId = currentUser?.id || currentUser?.supabase_id || null;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmationFilter, setConfirmationFilter] = useState('all');
  const [packageFilter, setPackageFilter] = useState('all');
  const [planSlugFilter, setPlanSlugFilter] = useState('all');
  const [profileFilter, setProfileFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  /** Remount bulk-action Selects after apply so placeholders return. */
  const [bulkSelectEpoch, setBulkSelectEpoch] = useState(0);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [bulkSuspendOpen, setBulkSuspendOpen] = useState(false);
  const [bulkSuspendIds, setBulkSuspendIds] = useState([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!adminSelfId) return;
    setSelectedIds((prev) => {
      if (!prev.has(adminSelfId)) return prev;
      const next = new Set(prev);
      next.delete(adminSelfId);
      return next;
    });
  }, [adminSelfId]);

  const {
    data: users = [],
    isLoading,
    refetch,
    isError: platformUsersError,
    error: platformUsersErr,
  } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(),
    refetchInterval: 30000,
  });

  const usersFetching = useIsFetching({ queryKey: ['platform-users'] }) > 0;

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => paidly.entities.Invoice.list('-created_date', 500),
    refetchInterval: 30000,
  });

  const usersWithInvoiceCounts = useMemo(() => {
    return mergeUsersWithInvoiceCounts(users, invoices);
  }, [users, invoices]);

  const uniquePlanSlugs = useMemo(() => {
    const s = new Set();
    for (const u of usersWithInvoiceCounts) {
      const r = rawPlanSlug(u);
      if (r !== EMPTY_PLAN) s.add(r);
    }
    return [...s].sort();
  }, [usersWithInvoiceCounts]);

  const uniqueRoles = useMemo(() => {
    const s = new Set();
    for (const u of usersWithInvoiceCounts) {
      s.add(String(u.role || 'user').trim().toLowerCase() || 'user');
    }
    return [...s].sort();
  }, [usersWithInvoiceCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return usersWithInvoiceCounts.filter((u) => {
      const matchSearch =
        !q ||
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.company_name || '').toLowerCase().includes(q) ||
        (u.company || '').toLowerCase().includes(q);
      if (!matchSearch) return false;

      if (statusFilter !== 'all' && u.status !== statusFilter) return false;

      if (confirmationFilter === 'verified' && u.email_verified !== true) return false;
      if (confirmationFilter === 'unverified' && u.email_verified !== false) return false;
      if (confirmationFilter === 'unknown' && u.email_verified != null) return false;

      if (packageFilter !== 'all' && packageTierKey(u) !== packageFilter) return false;

      if (planSlugFilter !== 'all' && rawPlanSlug(u) !== planSlugFilter) return false;

      if (profileFilter !== 'all') {
        const key = profileBillingKey(u);
        if (profileFilter === 'has_profile' && !u.profile) return false;
        if (profileFilter === 'missing' && u.profile) return false;
        if (!['has_profile', 'missing'].includes(profileFilter) && key !== profileFilter) return false;
      }

      if (roleFilter !== 'all') {
        const r = String(u.role || 'user').trim().toLowerCase() || 'user';
        if (r !== roleFilter) return false;
      }

      return true;
    });
  }, [
    usersWithInvoiceCounts,
    search,
    statusFilter,
    confirmationFilter,
    packageFilter,
    planSlugFilter,
    profileFilter,
    roleFilter,
  ]);

  const filteredSelectableIds = useMemo(
    () =>
      filtered
        .map((u) => adminRowPrimaryId(u))
        .filter((id) => id && !isExcludedFromBulk(id, adminSelfId)),
    [filtered, adminSelfId]
  );
  const allFilteredSelected =
    filteredSelectableIds.length > 0 && filteredSelectableIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = filteredSelectableIds.some((id) => selectedIds.has(id));

  const toggleRow = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredSelectableIds.forEach((id) => next.delete(id));
      } else {
        filteredSelectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allFilteredSelected, filteredSelectableIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkSelectEpoch((e) => e + 1);
  }, []);

  const selectedUsers = useMemo(
    () =>
      usersWithInvoiceCounts.filter((u) => {
        const id = adminRowPrimaryId(u);
        return id && selectedIds.has(id);
      }),
    [usersWithInvoiceCounts, selectedIds]
  );

  const bulkEligibleUsers = useMemo(
    () =>
      selectedUsers.filter((u) => {
        const id = adminRowPrimaryId(u);
        return id && !isExcludedFromBulk(id, adminSelfId);
      }),
    [selectedUsers, adminSelfId]
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => paidly.entities.PlatformUser.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('User updated successfully');
    },
    onError: (err) => toast.error(err?.message || 'Update failed'),
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, data, label, audit }) => {
      let failed = 0;
      for (const id of ids) {
        try {
          await paidly.entities.PlatformUser.update(id, data);
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) {
        throw new Error(`${failed} of ${ids.length} updates failed`);
      }
      return { count: ids.length, label, audit };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success(`Updated ${result.count} user(s)${result.label ? `: ${result.label}` : ''}`);
      if (result.audit) {
        logAction({ actor: currentUser, ...result.audit });
      }
      clearSelection();
    },
    onError: (err) => toast.error(err?.message || 'Bulk update failed'),
  });

  const handleStatusChange = (user, newStatus) => {
    const rowId = adminRowPrimaryId(user);
    if (!rowId) {
      toast.error('This row has no user id — cannot update status.');
      return;
    }
    const prevStatus = user.status;
    updateMutation.mutate(
      { id: rowId, data: { status: newStatus } },
      {
        onSuccess: () => {
          logAction({
            actor: currentUser,
            action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
            category: 'users',
            entity: 'platform_user',
            description: `Changed status of ${user.full_name || user.email} from "${prevStatus}" to "${newStatus}"`,
            targetId: rowId,
            targetLabel: user.email,
            before: { status: prevStatus },
            after: { status: newStatus },
          });
        },
      }
    );
  };

  const runBulkAccountStatus = (newStatus) => {
    const ids = bulkEligibleUsers.map((u) => adminRowPrimaryId(u)).filter(Boolean);
    if (!ids.length) {
      toast.error(
        adminSelfId && selectedUsers.length > 0
          ? 'Your account is excluded from bulk actions. Select other users.'
          : 'Select at least one user'
      );
      return;
    }
    if (newStatus === 'suspended') {
      setBulkSuspendIds(ids);
      setBulkSuspendOpen(true);
      return;
    }
    bulkMutation.mutate({
      ids,
      data: { status: newStatus },
      label: `account status → ${newStatus}`,
      audit: {
        action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
        category: 'users',
        entity: 'platform_user',
        description: `Bulk account status → ${newStatus} for ${ids.length} user(s)`,
        after: { userIds: ids, status: newStatus },
      },
    });
  };

  const confirmBulkSuspend = () => {
    const ids = bulkSuspendIds;
    if (!ids.length) {
      setBulkSuspendOpen(false);
      return;
    }
    bulkMutation.mutate({
      ids,
      data: { status: 'suspended' },
      label: 'account status → suspended',
      audit: {
        action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
        category: 'users',
        entity: 'platform_user',
        description: `Bulk account status → suspended for ${ids.length} user(s)`,
        after: { userIds: ids, status: 'suspended' },
      },
    });
    setBulkSuspendOpen(false);
    setBulkSuspendIds([]);
  };

  const runBulkPlan = (planValue) => {
    const ids = bulkEligibleUsers.map((u) => adminRowPrimaryId(u)).filter(Boolean);
    if (!ids.length) {
      toast.error(
        adminSelfId && selectedUsers.length > 0
          ? 'Your account is excluded from bulk actions. Select other users.'
          : 'Select at least one user'
      );
      return;
    }
    const data = planFieldsForBulk(planValue);
    bulkMutation.mutate({
      ids,
      data,
      label: `plan → ${planValue}`,
      audit: {
        action: AUDIT_ACTIONS.SUBSCRIPTION_STATUS_CHANGED,
        category: 'users',
        entity: 'platform_user',
        description: `Bulk plan update for ${ids.length} user(s)`,
        after: { userIds: ids, ...data },
      },
    });
  };

  const runBulkProfileSubscriptionStatus = (subscriptionStatus) => {
    const ids = bulkEligibleUsers.map((u) => adminRowPrimaryId(u)).filter(Boolean);
    if (!ids.length) {
      toast.error(
        adminSelfId && selectedUsers.length > 0
          ? 'Your account is excluded from bulk actions. Select other users.'
          : 'Select at least one user'
      );
      return;
    }
    bulkMutation.mutate({
      ids,
      data: { subscription_status: subscriptionStatus },
      label: `subscription_status → ${subscriptionStatus}`,
      audit: {
        action: AUDIT_ACTIONS.SUBSCRIPTION_STATUS_CHANGED,
        category: 'users',
        entity: 'platform_user',
        description: `Bulk subscription_status → ${subscriptionStatus} for ${ids.length} user(s)`,
        after: { userIds: ids, subscription_status: subscriptionStatus },
      },
    });
  };

  const colCount = 10;

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage platform users and their accounts"
        onRefresh={() => refetch()}
        isRefreshing={usersFetching}
      >
        <Button onClick={() => setShowAddUser(true)} className="bg-primary hover:bg-primary/90">
          <UserPlus className="mr-2 h-4 w-4" /> Add User
        </Button>
      </PageHeader>

      {platformUsersError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Could not load users from the backend (API-only): {platformUsersErr?.message || 'Unknown error'}.
            <PlatformUsersLoadErrorHint message={platformUsersErr?.message} />
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-card pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full bg-card sm:w-[150px]">
              <Filter className="mr-2 h-4 w-4 shrink-0" />
              <SelectValue placeholder="Account status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All account status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={confirmationFilter} onValueChange={setConfirmationFilter}>
            <SelectTrigger className="w-full min-w-[160px] flex-1 bg-card sm:max-w-[200px]">
              <SelectValue placeholder="Email confirmation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any confirmation</SelectItem>
              <SelectItem value="verified">Email confirmed</SelectItem>
              <SelectItem value="unverified">Not confirmed</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>

          <Select value={packageFilter} onValueChange={setPackageFilter}>
            <SelectTrigger className="w-full min-w-[160px] flex-1 bg-card sm:max-w-[200px]">
              <SelectValue placeholder="Package tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any package</SelectItem>
              <SelectItem value="none">No plan set</SelectItem>
              <SelectItem value="individual">Individual tier</SelectItem>
              <SelectItem value="sme">SME tier</SelectItem>
              <SelectItem value="corporate">Corporate tier</SelectItem>
              <SelectItem value="other">Other / legacy</SelectItem>
            </SelectContent>
          </Select>

          <Select value={planSlugFilter} onValueChange={setPlanSlugFilter}>
            <SelectTrigger className="w-full min-w-[160px] flex-1 bg-card sm:max-w-[220px]">
              <SelectValue placeholder="Plan slug" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="all">Any plan slug</SelectItem>
              <SelectItem value={EMPTY_PLAN}>Empty slug</SelectItem>
              {uniquePlanSlugs.map((slug) => (
                <SelectItem key={slug} value={slug}>
                  {slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger className="w-full min-w-[180px] flex-1 bg-card sm:max-w-[240px]">
              <SelectValue placeholder="Profile / billing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any profile</SelectItem>
              <SelectItem value="has_profile">Has profile row</SelectItem>
              <SelectItem value="missing">Missing profile</SelectItem>
              <SelectItem value="unset">Sub status unset</SelectItem>
              <SelectItem value="trial">Subscription: trial</SelectItem>
              <SelectItem value="active">Subscription: active</SelectItem>
              <SelectItem value="expired">Subscription: expired</SelectItem>
              <SelectItem value="inactive">Subscription: inactive</SelectItem>
              <SelectItem value="cancelled">Subscription: cancelled</SelectItem>
              <SelectItem value="past_due">Subscription: past due</SelectItem>
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full min-w-[140px] flex-1 bg-card sm:max-w-[180px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any role</SelectItem>
              {uniqueRoles.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <p className="text-sm font-medium text-foreground sm:mr-2 sm:self-center">
            {selectedIds.size} selected
            {bulkEligibleUsers.length !== selectedIds.size ? (
              <span className="ml-1 font-normal text-muted-foreground">
                ({bulkEligibleUsers.length} eligible for bulk actions)
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select key={`bulk-acct-${bulkSelectEpoch}`} onValueChange={(v) => runBulkAccountStatus(v)}>
              <SelectTrigger className="h-9 w-[200px] bg-card">
                <SelectValue placeholder="Set account status…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">→ Active</SelectItem>
                <SelectItem value="paused">→ Paused</SelectItem>
                <SelectItem value="suspended">→ Suspended</SelectItem>
                <SelectItem value="pending">→ Pending</SelectItem>
              </SelectContent>
            </Select>

            <Select key={`bulk-plan-${bulkSelectEpoch}`} onValueChange={(v) => runBulkPlan(v)}>
              <SelectTrigger className="h-9 w-[200px] bg-card">
                <SelectValue placeholder="Set plan / package…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">→ none / free</SelectItem>
                <SelectItem value="individual">→ individual</SelectItem>
                <SelectItem value="sme">→ sme</SelectItem>
                <SelectItem value="corporate">→ corporate</SelectItem>
              </SelectContent>
            </Select>

            <Select
              key={`bulk-sub-${bulkSelectEpoch}`}
              onValueChange={(v) => runBulkProfileSubscriptionStatus(v)}
            >
              <SelectTrigger className="h-9 w-[220px] bg-card">
                <SelectValue placeholder="Set subscription status…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">→ trial</SelectItem>
                <SelectItem value="active">→ active</SelectItem>
                <SelectItem value="expired">→ expired</SelectItem>
                <SelectItem value="inactive">→ inactive</SelectItem>
                <SelectItem value="cancelled">→ cancelled</SelectItem>
                <SelectItem value="past_due">→ past_due</SelectItem>
              </SelectContent>
            </Select>

            <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="w-10 px-3 py-3 text-left font-medium">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={() => toggleAllFiltered()}
                    disabled={filteredSelectableIds.length === 0 || bulkMutation.isPending}
                    aria-label={allFilteredSelected ? 'Deselect all filtered users' : 'Select all filtered users'}
                    className={someFilteredSelected && !allFilteredSelected ? 'opacity-70' : ''}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Acct status</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">Profile billing</th>
                <th className="px-4 py-3 text-left font-medium">Invoices</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
                <th className="px-4 py-3 text-left font-medium">Presence</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, rowIdx) => {
                const rowId = adminRowPrimaryId(u);
                const { primary, secondary } = adminUserNameEmailLines(u.full_name, u.email);
                const slug = rawPlanSlug(u);
                const slugDisplay = slug === EMPTY_PLAN ? '—' : slug;
                const pKey = profileBillingKey(u);
                const pLabel =
                  pKey === 'missing'
                    ? 'No profile'
                    : pKey === 'unset'
                      ? '—'
                      : pKey.replace(/_/g, ' ');
                const rowIsSelf = rowId ? isExcludedFromBulk(rowId, adminSelfId) : false;
                return (
                  <tr key={stableDirectoryRowKey(u, rowIdx)} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="px-3 py-4">
                      <Checkbox
                        checked={rowId ? selectedIds.has(rowId) : false}
                        onCheckedChange={() => rowId && toggleRow(rowId)}
                        disabled={bulkMutation.isPending || rowIsSelf || !rowId}
                        title={
                          !rowId
                            ? 'This row has no user id — cannot select for bulk actions'
                            : rowIsSelf
                              ? 'Your account is excluded from bulk actions'
                              : undefined
                        }
                        aria-label={`Select ${u.email || u.full_name || 'user'}`}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {(primary || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {primary}
                            {rowIsSelf ? (
                              <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                                You
                              </span>
                            ) : null}
                          </p>
                          {secondary ? (
                            <p className="truncate text-xs text-muted-foreground">{secondary}</p>
                          ) : null}
                          <p className="truncate text-xs text-muted-foreground capitalize">role: {u.role || 'user'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[200px] px-4 py-4">
                      <p className="truncate text-sm text-foreground" title={u.email}>
                        {u.email || '—'}
                      </p>
                      <div className="mt-1">
                        {u.email_verified === false ? (
                          <StatusBadge status="unverified" />
                        ) : u.email_verified === true ? (
                          <StatusBadge status="verified" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Unknown</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-4">
                      <PlanBadge plan={u.plan || 'none'} />
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-xs font-medium capitalize text-foreground">{pLabel}</p>
                      <p className="text-xs text-muted-foreground" title={slugDisplay}>
                        slug: {slugDisplay}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-sm">{u.invoices_sent ?? 0}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      {u.created_date ? format(new Date(u.created_date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      {u.last_active_at ? (
                        <div className="space-y-0.5">
                          <p className={u.is_online ? "font-medium text-emerald-600 dark:text-emerald-400" : ""}>
                            {u.is_online ? "Online now" : "Offline"}
                          </p>
                          <p>{format(new Date(u.last_active_at), 'dd MMM yyyy HH:mm')}</p>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={!rowId}
                            onClick={() => {
                              setShowAddUser(false);
                              setEditingUser(u);
                            }}
                          >
                            Edit User
                          </DropdownMenuItem>
                          {u.status === 'active' ? (
                            <DropdownMenuItem disabled={!rowId} onClick={() => handleStatusChange(u, 'paused')}>
                              Pause User
                            </DropdownMenuItem>
                          ) : null}
                          {u.status === 'paused' ? (
                            <DropdownMenuItem disabled={!rowId} onClick={() => handleStatusChange(u, 'active')}>
                              Activate User
                            </DropdownMenuItem>
                          ) : null}
                          {u.status !== 'suspended' ? (
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={!rowId}
                              onClick={() => handleStatusChange(u, 'suspended')}
                            >
                              Suspend User
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Loading users...' : 'No users match your filters'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog
        open={bulkSuspendOpen}
        onOpenChange={(open) => {
          setBulkSuspendOpen(open);
          if (!open) setBulkSuspendIds([]);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {bulkSuspendIds.length} user(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Selected users will be set to suspended and may lose access until you activate them again from this list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                confirmBulkSuspend();
              }}
            >
              Suspend users
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UserFormDialog
        open={showAddUser || !!editingUser}
        onClose={() => {
          setShowAddUser(false);
          setEditingUser(null);
        }}
        user={editingUser}
      />
    </div>
  );
}
