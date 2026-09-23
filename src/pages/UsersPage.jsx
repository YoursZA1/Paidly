import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import { adminUserNameEmailLines } from '@/utils/adminUserDisplay';
import { Search, MoreHorizontal, UserPlus, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import MobileFilterSheet from '@/components/ui/MobileFilterSheet';
import MobileListCard from '@/components/ui/MobileListCard';
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
import { isKnownStaffRole } from '@/lib/staffDashboard';
import { adminRowPrimaryId, stableDirectoryRowKey } from '@/utils/stableListKey';
import { normalizePlanSlug, PLANS, isLegacyPlanSlug, familyForSlug } from '@/lib/plans.js';
import { adminActionErrorMessage, bulkUpdateUsers, setCompanyAccess, setCompanyPlan } from '@/api/userManagement';
import TablePagination from '@/components/ui/TablePagination';

const EMPTY_PLAN = '__empty__';
const USERS_PAGE_SIZE = 20;
const USERS_PAGE_REFETCH_MS = 90000;
const USERS_PAGE_STALE_MS = 60000;

/** Normalized billing slug from profile + merged user fields. */
function rawPlanSlug(u) {
  const raw = String(
    u.profile?.plan ?? u.profile?.subscription_plan ?? u.subscription_plan ?? u.plan ?? ''
  )
    .trim()
    .toLowerCase();
  return raw || EMPTY_PLAN;
}

/** Paidly tier bucket: current catalog family, needs_migration, other, or none */
function packageTierKey(u) {
  const raw = rawPlanSlug(u);
  if (raw === EMPTY_PLAN) return 'none';
  if (isLegacyPlanSlug(raw)) return 'needs_migration';
  const fam = familyForSlug(raw);
  if (fam && ['starter', 'business', 'growth', 'enterprise'].includes(fam)) return fam;
  const n = normalizePlanSlug(raw);
  if (n && PLANS[n] && !isLegacyPlanSlug(n)) return familyForSlug(n) || n;
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

function isExcludedFromBulk(userId, adminSelfId) {
  return Boolean(adminSelfId && userId === adminSelfId);
}

export default function UsersPage({ staffOnly = false } = {}) {
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
  const [editingUserId, setEditingUserId] = useState(null);
  const [bulkSuspendOpen, setBulkSuspendOpen] = useState(false);
  const [bulkSuspendIds, setBulkSuspendIds] = useState([]);
  const [usersPage, setUsersPage] = useState(0);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
    refetchInterval: USERS_PAGE_REFETCH_MS,
    staleTime: USERS_PAGE_STALE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const usersFetching = useIsFetching({ queryKey: ['platform-users'] }) > 0;

  // Always the freshest row for the open dialog (not a snapshot taken when it was opened).
  const editingUser = useMemo(
    () => (editingUserId ? users.find((u) => adminRowPrimaryId(u) === editingUserId) || null : null),
    [editingUserId, users]
  );

  const visibleUsers = useMemo(() => {
    const list = staffOnly
      ? users.filter((u) => isKnownStaffRole(u.role))
      : users;
    return list;
  }, [users, staffOnly]);

  const uniquePlanSlugs = useMemo(() => {
    const s = new Set();
    for (const u of visibleUsers) {
      const r = rawPlanSlug(u);
      if (r !== EMPTY_PLAN) s.add(r);
    }
    return [...s].sort();
  }, [visibleUsers]);

  const uniqueRoles = useMemo(() => {
    const s = new Set();
    for (const u of visibleUsers) {
      s.add(String(u.role || 'user').trim().toLowerCase() || 'user');
    }
    return [...s].sort();
  }, [visibleUsers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleUsers.filter((u) => {
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
    visibleUsers,
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
      visibleUsers.filter((u) => {
        const id = adminRowPrimaryId(u);
        return id && selectedIds.has(id);
      }),
    [visibleUsers, selectedIds]
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
      const result = await bulkUpdateUsers(ids, data);
      if (!result || !Array.isArray(result.results)) {
        throw new Error("Bulk update returned an invalid response.");
      }
      const failedItems = result.results.filter((row) => !row.ok);
      return {
        count: result.successCount ?? ids.length - failedItems.length,
        failedItems,
        label,
        audit,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      if (result.failedItems.length > 0) {
        const sample = result.failedItems.slice(0, 3).map((f) => f.id).join(", ");
        toast.warning(
          `Updated ${result.count} user(s), ${result.failedItems.length} failed${sample ? ` (e.g. ${sample})` : ""}.`
        );
      } else {
        toast.success(`Updated ${result.count} user(s)${result.label ? `: ${result.label}` : ''}`);
      }
      if (result.audit) {
        logAction({ actor: currentUser, ...result.audit });
      }
      clearSelection();
    },
    onError: (err) => toast.error(err?.message || 'Bulk update failed'),
  });

  // Account access lives on the company subscription (paused = suspended), never on profiles.
  const accessMutation = useMutation({
    mutationFn: ({ id, access }) => setCompanyAccess(id, access, `Admin ${access === 'paused' ? 'paused' : 'resumed'} account`),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
      toast.success(variables.access === 'paused' ? 'Account paused' : 'Account resumed');
    },
    onError: (err) => toast.error(adminActionErrorMessage(err, 'Unable to change this account\'s access. Please try again.')),
  });

  const handleStatusChange = (user, newStatus) => {
    const rowId = adminRowPrimaryId(user);
    if (!rowId) {
      toast.error('This row has no user id — cannot change access.');
      return;
    }
    const access = newStatus === 'active' ? 'active' : 'paused';
    const prevStatus = user.status;
    accessMutation.mutate(
      { id: rowId, access },
      {
        onSuccess: () => {
          logAction({
            actor: currentUser,
            action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
            category: 'users',
            entity: 'platform_user',
            description: `Changed account access of ${user.full_name || user.email} from "${prevStatus}" to "${access}"`,
            targetId: rowId,
            targetLabel: user.email,
            before: { status: prevStatus },
            after: { status: access },
          });
        },
      }
    );
  };

  const bulkAccessMutation = useMutation({
    mutationFn: async ({ ids, access }) => {
      const failedItems = [];
      for (const id of ids) {
        try {
          await setCompanyAccess(id, access, `Bulk ${access === 'paused' ? 'pause' : 'resume'}`);
        } catch (err) {
          failedItems.push({ id, error: adminActionErrorMessage(err, 'failed') });
        }
      }
      return { count: ids.length - failedItems.length, failedItems, access, ids };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      if (result.failedItems.length > 0) {
        toast.warning(`${result.count} account(s) updated, ${result.failedItems.length} failed (${result.failedItems[0].error}).`);
      } else {
        toast.success(`${result.count} account(s) ${result.access === 'paused' ? 'paused' : 'resumed'}`);
      }
      logAction({
        actor: currentUser,
        action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
        category: 'users',
        entity: 'platform_user',
        description: `Bulk account access → ${result.access} for ${result.count} user(s)`,
        after: { userIds: result.ids, status: result.access },
      });
      clearSelection();
    },
    onError: (err) => toast.error(adminActionErrorMessage(err, 'Bulk access change failed')),
  });

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
    if (newStatus === 'paused') {
      setBulkSuspendIds(ids);
      setBulkSuspendOpen(true);
      return;
    }
    bulkAccessMutation.mutate({ ids, access: 'active' });
  };

  const confirmBulkSuspend = () => {
    const ids = bulkSuspendIds;
    setBulkSuspendOpen(false);
    setBulkSuspendIds([]);
    if (!ids.length) return;
    bulkAccessMutation.mutate({ ids, access: 'paused' });
  };

  const bulkPlanMutation = useMutation({
    mutationFn: async ({ ids, planValue }) => {
      const failedItems = [];
      for (const id of ids) {
        try {
          await setCompanyPlan(id, planValue, `Bulk package change to ${planValue}`);
        } catch (err) {
          failedItems.push({ id, error: err?.response?.data?.error || err?.message || 'failed' });
        }
      }
      return { count: ids.length - failedItems.length, failedItems, planValue, ids };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] });
      if (result.failedItems.length > 0) {
        toast.warning(`Changed ${result.count} compan${result.count === 1 ? 'y' : 'ies'}, ${result.failedItems.length} failed.`);
      } else {
        toast.success(`Package → ${result.planValue} for ${result.count} compan${result.count === 1 ? 'y' : 'ies'}`);
      }
      logAction({
        actor: currentUser,
        action: AUDIT_ACTIONS.SUBSCRIPTION_STATUS_CHANGED,
        category: 'users',
        entity: 'platform_user',
        description: `Bulk package → ${result.planValue} for ${result.count} user(s)' companies`,
        after: { userIds: result.ids, plan: result.planValue },
      });
      clearSelection();
    },
    onError: (err) => toast.error(err?.message || 'Bulk package change failed'),
  });

  // Package changes go to the company subscription (server), never to profiles.plan.
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
    bulkPlanMutation.mutate({ ids, planValue });
  };

  useEffect(() => { setUsersPage(0); }, [search, statusFilter, confirmationFilter, packageFilter, planSlugFilter, profileFilter, roleFilter]);

  const totalUsersPages = Math.max(1, Math.ceil(filtered.length / USERS_PAGE_SIZE));
  const pagedFiltered = filtered.slice(usersPage * USERS_PAGE_SIZE, (usersPage + 1) * USERS_PAGE_SIZE);

  const colCount = 9;

  return (
    <div>
      <PageHeader
        title={staffOnly ? "Admin users" : "Users"}
        description={staffOnly ? "Platform staff accounts only." : "Paidly customer and staff accounts. Subscription status comes from billing, not invoice history."}
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
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email, company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 bg-card pl-10 md:min-h-10"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2 md:hidden"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="hidden w-full bg-card sm:w-[150px] md:flex">
              <Filter className="mr-2 h-4 w-4 shrink-0" />
              <SelectValue placeholder="Account status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All account access</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="pending">Awaiting payment</SelectItem>
              <SelectItem value="none">No subscription</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="hidden flex-wrap gap-2 md:flex">
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
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="business">Business</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
              <SelectItem value="needs_migration">Needs catalog migration</SelectItem>
              <SelectItem value="other">Other</SelectItem>
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

      <MobileFilterSheet
        open={mobileFiltersOpen}
        onOpenChange={setMobileFiltersOpen}
        title="User filters"
        onApply={() => setMobileFiltersOpen(false)}
        onClear={() => {
          setStatusFilter('all');
          setConfirmationFilter('all');
          setPackageFilter('all');
          setPlanSlugFilter('all');
          setProfileFilter('all');
          setRoleFilter('all');
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Account status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All account access</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="pending">Awaiting payment</SelectItem>
                <SelectItem value="none">No subscription</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Plan</Label>
            <Select value={packageFilter} onValueChange={setPackageFilter}>
              <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any package</SelectItem>
                <SelectItem value="none">No plan set</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any role</SelectItem>
                {uniqueRoles.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </MobileFilterSheet>

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
                <SelectValue placeholder="Set account access…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">→ Resume access</SelectItem>
                <SelectItem value="paused">→ Pause access</SelectItem>
              </SelectContent>
            </Select>

            <Select key={`bulk-plan-${bulkSelectEpoch}`} onValueChange={(v) => runBulkPlan(v)}>
              <SelectTrigger className="h-9 w-[200px] bg-card">
                <SelectValue placeholder="Set plan / package…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">→ none / free</SelectItem>
                <SelectItem value="starter">→ Starter</SelectItem>
                <SelectItem value="business">→ Business</SelectItem>
                <SelectItem value="growth">→ Growth</SelectItem>
                <SelectItem value="enterprise">→ Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="space-y-3 p-3 md:hidden">
          {pagedFiltered.map((u, rowIdx) => {
            const rowId = adminRowPrimaryId(u);
            const { primary } = adminUserNameEmailLines(u.full_name, u.email);
            return (
              <MobileListCard
                key={stableDirectoryRowKey(u, rowIdx)}
                title={primary}
                subtitle={u.email || '—'}
                meta={u.last_active_at ? `Last active ${format(new Date(u.last_active_at), 'dd MMM yyyy')}` : 'Last active —'}
                status={<StatusBadge status={u.status} />}
                value={<PlanBadge plan={u.plan || 'none'} />}
                action={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="min-h-11 min-w-11">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!rowId}
                        onClick={() => {
                          setShowAddUser(false);
                          setEditingUserId(adminRowPrimaryId(u));
                        }}
                      >
                        View / Edit
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            );
          })}
          {filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              {isLoading ? 'Loading users...' : 'No users match your filters'}
            </p>
          ) : null}
        </div>
        <div className="hidden overflow-x-auto md:block">
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
                <th className="px-4 py-3 text-left font-medium">Joined</th>
                <th className="px-4 py-3 text-left font-medium">Presence</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedFiltered.map((u, rowIdx) => {
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
                              setEditingUserId(adminRowPrimaryId(u));
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
        <TablePagination
          page={usersPage}
          totalPages={totalUsersPages}
          onPageChange={setUsersPage}
          totalItems={filtered.length}
          itemLabel="users"
        />
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
        open={showAddUser || !!editingUserId}
        onClose={() => {
          setShowAddUser(false);
          setEditingUserId(null);
        }}
        user={editingUser}
      />
    </div>
  );
}
