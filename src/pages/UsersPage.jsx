import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import { adminUserNameEmailLines } from '@/utils/adminUserDisplay';
import { Search, MoreHorizontal, UserPlus, Filter } from 'lucide-react';
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
import PlatformUsersLoadErrorHint from '@/components/PlatformUsersLoadErrorHint';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PlanBadge from '@/components/dashboard/PlanBadge';
import UserFormDialog from '@/components/users/UserFormDialog';
import { logAction, AUDIT_ACTIONS } from '@/lib/auditLogger';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function UsersPage() {
  const { user: currentUser } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const queryClient = useQueryClient();

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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => paidly.entities.PlatformUser.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('User updated successfully');
    },
    onError: (err) => toast.error(err?.message || 'Update failed'),
  });

  const filtered = users.filter((u) => {
    const matchSearch =
      !search ||
      (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleStatusChange = (user, newStatus) => {
    const prevStatus = user.status;
    updateMutation.mutate(
      { id: user.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          logAction({
            actor: currentUser,
            action: AUDIT_ACTIONS.USER_STATUS_CHANGED,
            category: 'users',
            description: `Changed status of ${user.full_name || user.email} from "${prevStatus}" to "${newStatus}"`,
            targetId: user.id,
            targetLabel: user.email,
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

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full bg-card sm:w-[160px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">User</th>
                <th className="px-6 py-3 text-left font-medium">Email</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium">Plan</th>
                <th className="px-6 py-3 text-left font-medium">Invoices Sent</th>
                <th className="px-6 py-3 text-left font-medium">Joined</th>
                <th className="px-6 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const { primary, secondary } = adminUserNameEmailLines(u.full_name, u.email);
                return (
                <tr key={u.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {(primary || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{primary}</p>
                        {secondary ? (
                          <p className="text-xs text-muted-foreground">{secondary}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {u.email_verified === false ? (
                      <StatusBadge status="unverified" />
                    ) : u.email_verified === true ? (
                      <StatusBadge status="verified" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-6 py-4">
                    <PlanBadge plan={u.plan || 'none'} />
                  </td>
                  <td className="px-6 py-4 text-sm">{u.invoices_sent ?? 0}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {u.created_date ? format(new Date(u.created_date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setShowAddUser(false);
                            setEditingUser(u);
                          }}
                        >
                          Edit User
                        </DropdownMenuItem>
                        {u.status === 'active' ? (
                          <DropdownMenuItem onClick={() => handleStatusChange(u, 'paused')}>
                            Pause User
                          </DropdownMenuItem>
                        ) : null}
                        {u.status === 'paused' ? (
                          <DropdownMenuItem onClick={() => handleStatusChange(u, 'active')}>
                            Activate User
                          </DropdownMenuItem>
                        ) : null}
                        {u.status !== 'suspended' ? (
                          <DropdownMenuItem
                            className="text-destructive"
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
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Loading users...' : 'No users found'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

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
