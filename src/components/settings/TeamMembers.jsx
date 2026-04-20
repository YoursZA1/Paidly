import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PlatformUsersLoadErrorHint from '@/components/PlatformUsersLoadErrorHint';
import { toast } from 'sonner';
import { ROLE_LABELS, ROLES, STAFF_ROLES } from '@/lib/permissions';

const INVITE_ROLES = [...STAFF_ROLES];

function formatLastSignIn(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function inviterMatches(u, inviterId) {
  if (!inviterId || u?.invited_by == null || u.invited_by === '') return false;
  return String(u.invited_by).toLowerCase() === String(inviterId).toLowerCase();
}

export default function TeamMembers() {
  const queryClient = useQueryClient();
  const { sendUserInvite, user, session } = useAuth();
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

  const myId = user?.id || session?.user?.id || null;

  const { signedInInvitees, pendingInvitees } = useMemo(() => {
    const mine = myId ? staff.filter((u) => inviterMatches(u, myId)) : [];
    const signedIn = mine.filter((u) => u.last_sign_in_at);
    const pending = mine.filter((u) => !u.last_sign_in_at);
    return {
      signedInInvitees: signedIn,
      pendingInvitees: pending,
    };
  }, [staff, myId]);

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
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <form onSubmit={handleInvite} className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="space-y-1">
              <p className="text-base font-semibold">Invite Team Member</p>
              <p className="text-xs text-muted-foreground">
                Send a secure invite and assign role-based dashboard access.
              </p>
            </div>

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

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'Sending…' : 'Send Invite'}
            </Button>
          </form>
        </div>

        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-base font-semibold">Team List</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Live roster of invited staff with role and access status.
            </p>

            {isLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
            ) : staff.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No staff profiles found yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {staff.map((u) => {
                  const isActive = Boolean(u.last_sign_in_at);
                  const statusTone = isActive
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400';
                  return (
                    <li key={u.id} className="rounded-md border bg-background px-3 py-3">
                      <p className="text-sm font-medium">
                        {u.full_name || u.email} — {ROLE_LABELS[u.role] || u.role}
                      </p>
                      <p className={`mt-1 text-xs ${statusTone}`}>
                        Status: {isActive ? 'Active' : 'Pending'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{u.email}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {myId ? (
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium">Your invite pipeline</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Active invites: {signedInInvitees.length} · Pending invites: {pendingInvitees.length}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
