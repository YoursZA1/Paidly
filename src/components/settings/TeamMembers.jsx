import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import { useAuth } from '@/components/auth/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PlatformUsersLoadErrorHint from '@/components/PlatformUsersLoadErrorHint';
import { toast } from 'sonner';
import { ROLE_LABELS, ROLES, STAFF_ROLES } from '@/lib/permissions';

const INVITE_ROLES = [...STAFF_ROLES];

export default function TeamMembers() {
  const queryClient = useQueryClient();
  const { sendUserInvite } = useAuth();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(ROLES.MANAGEMENT);
  const [plan, setPlan] = useState('none');
  const [pending, setPending] = useState(false);

  const {
    data: users = [],
    isLoading,
    isError: platformUsersError,
    error: platformUsersErr,
  } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(200),
    refetchInterval: 60000,
  });

  const staff = users.filter((u) =>
    INVITE_ROLES.includes((u.role || '').toLowerCase())
  );

  const handleInvite = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error('Enter an email address');
      return;
    }
    setPending(true);
    try {
      const msg = await sendUserInvite(trimmed, fullName.trim() || trimmed.split('@')[0], role, plan);
      toast.success(msg || 'Invitation sent');
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      setEmail('');
      setFullName('');
    } catch (err) {
      toast.error(err?.message || 'Invite failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-8">
      {platformUsersError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Could not load team directory from the backend: {platformUsersErr?.message || 'Unknown error'}.
            <PlatformUsersLoadErrorHint message={platformUsersErr?.message} />
          </AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={handleInvite} className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground">
          Sends a Supabase invite email. After they set a password, their role (management, sales, or support) is
          applied from the invite and they can open the staff dashboard and sidebar links for that role.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] || r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-plan">Plan</Label>
            <select
              id="invite-plan"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="none">none</option>
              <option value="individual">individual</option>
              <option value="sme">sme</option>
              <option value="corporate">corporate</option>
            </select>
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </form>

      <div>
        <p className="mb-2 text-sm font-medium">Dashboard accounts (staff roles)</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff profiles found yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {staff.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="font-medium">{u.full_name || u.email}</span>
                <span className="text-muted-foreground">
                  {ROLE_LABELS[u.role] || u.role} · {u.email}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
