import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { adminRowPrimaryId } from '@/utils/stableListKey';
import { adminActionErrorMessage, setCompanyAccess, setCompanyPlan } from '@/api/userManagement';
import StatusBadge from '@/components/dashboard/StatusBadge';
import {
  ASSIGNABLE_PROFILE_PLAN_SLUGS,
  coerceAssignableProfilePlan,
  isLegacyPlanSlug,
  mapLegacySlugToCurrentFamily,
} from '@/lib/plans.js';

/** Identity fields only. Package and access live on the company subscription, not on profiles. */
function profilePayloadFrom(values) {
  return {
    full_name: (values.full_name || '').trim(),
    email: (values.email || '').trim().toLowerCase(),
    phone: (values.phone || '').trim(),
    company_name: (values.company_name || '').trim(),
    company_address: (values.company_address || '').trim(),
    company_website: (values.company_website || '').trim(),
  };
}

function emptyForm() {
  return {
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    company_address: '',
    company_website: '',
    plan: 'none',
  };
}

/**
 * @param {{ open: boolean, onClose: () => void, user: object | null }} props
 */
export default function UserFormDialog({ open, onClose, user }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [legacyStoredPlan, setLegacyStoredPlan] = useState('');
  const editId = adminRowPrimaryId(user);
  const isEdit = Boolean(editId);
  // Values the dialog opened with: only real changes are written (no-op saves touch nothing).
  const initialPlanRef = useRef('none');
  const initialProfileRef = useRef(null);

  // Seed the form when the dialog opens or a different user is selected — never on a background
  // refetch of the users list, which would discard what the admin is typing. The Actions panel
  // below reads `user` directly, so it still shows live state.
  useEffect(() => {
    if (!open) return;
    if (editId) {
      const stored = String(user.plan || user.subscription_plan || 'none').trim().toLowerCase();
      const mapped = isLegacyPlanSlug(stored)
        ? mapLegacySlugToCurrentFamily(stored) || 'starter'
        : coerceAssignableProfilePlan(stored) || stored || 'none';
      setLegacyStoredPlan(isLegacyPlanSlug(stored) ? stored : '');
      setForm({
        full_name: user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        company_name: user.company_name || user.company || '',
        company_address: user.company_address || '',
        company_website: user.company_website || '',
        plan: mapped === 'free' ? 'none' : mapped,
      });
      initialPlanRef.current = mapped === 'free' ? 'none' : mapped;
      initialProfileRef.current = profilePayloadFrom({
        full_name: user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        company_name: user.company_name || user.company || '',
        company_address: user.company_address || '',
        company_website: user.company_website || '',
      });
    } else {
      setLegacyStoredPlan('');
      setForm(emptyForm());
      initialPlanRef.current = 'none';
      initialProfileRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const buildPayload = () => {
    const planSlug = String(form.plan || 'none').trim().toLowerCase();
    const billingPlan =
      planSlug === 'none' || planSlug === 'free' ? 'free' : coerceAssignableProfilePlan(planSlug);
    return {
      payload: profilePayloadFrom(form),
      plan: billingPlan && billingPlan !== 'free' ? billingPlan : 'none',
    };
  };

  const applyPlanIfChanged = async (userId, plan) => {
    if (!userId || plan === initialPlanRef.current) return;
    await setCompanyPlan(userId, plan, `Admin set package to ${plan}`);
    queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
  };

  const accessMutation = useMutation({
    mutationFn: ({ id, access }) =>
      setCompanyAccess(id, access, `Admin ${access === 'paused' ? 'paused' : 'resumed'} account`),
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
      toast.success(
        data?.unchanged
          ? 'No change — the account was already in that state'
          : variables.access === 'paused'
            ? 'Account paused. Sign-in, data and billing history are untouched.'
            : 'Account resumed'
      );
    },
    onError: (err) =>
      toast.error(adminActionErrorMessage(err, "Unable to change this account's access. Please try again.")),
  });

  const createMutation = useMutation({
    mutationFn: async ({ payload, plan }) => {
      const created = await paidly.entities.PlatformUser.create(payload);
      await applyPlanIfChanged(adminRowPrimaryId(created) || created?.id, plan);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('User created');
      onClose();
    },
    // Form values are kept on failure so the admin can retry without retyping.
    onError: (e) => toast.error(adminActionErrorMessage(e, 'Unable to create this user. Please try again.')),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: { payload, plan } }) => {
      const updated = await paidly.entities.PlatformUser.update(id, payload);
      await applyPlanIfChanged(id, plan);
      return updated;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      const plan = variables?.data?.plan;
      toast.success(
        plan && plan !== initialPlanRef.current
          ? `Package changed successfully. This account now has ${plan === 'none' ? 'no package' : plan} access.`
          : 'User updated successfully'
      );
      onClose();
    },
    onError: (e) => toast.error(adminActionErrorMessage(e, 'Unable to update this user. Please try again.')),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.email.trim()) {
      toast.error('Email is required');
      return;
    }
    const data = buildPayload();
    if (isEdit && editId) {
      const profileUnchanged =
        initialProfileRef.current != null &&
        JSON.stringify(data.payload) === JSON.stringify(initialProfileRef.current);
      if (profileUnchanged && data.plan === initialPlanRef.current) {
        toast.info('No changes to save');
        onClose();
        return;
      }
      updateMutation.mutate({ id: editId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const pending = createMutation.isPending || updateMutation.isPending;
  /** Live account access derived by the server from the company subscription (never profiles.status). */
  const liveStatus = user?.status || 'none';
  const trialEndsAt = user?.subscription_trial_ends_at || null;
  const trialLabel = (() => {
    if (!trialEndsAt) return '—';
    const ms = new Date(trialEndsAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return '—';
    if (ms <= 0) return 'Ended';
    const days = Math.ceil(ms / 86_400_000);
    return `${days} day${days === 1 ? '' : 's'} remaining`;
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit user' : 'Add user'}</DialogTitle>
        </DialogHeader>
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Jane Doe"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="user@company.com"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="user-phone">Phone</Label>
              <Input
                id="user-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+27 00 000 0000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-company-name">Company</Label>
              <Input
                id="user-company-name"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Acme Pty Ltd"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-company-address">Company address</Label>
            <Input
              id="user-company-address"
              value={form.company_address}
              onChange={(e) => setForm({ ...form, company_address: e.target.value })}
              placeholder="123 Main Road, Cape Town"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-company-website">Website</Label>
            <Input
              id="user-company-website"
              value={form.company_website}
              onChange={(e) => setForm({ ...form, company_website: e.target.value })}
              placeholder="https://example.com"
            />
          </div>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="user-plan">Plan</Label>
              <select
                id="user-plan"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
              >
                <option value="none">none</option>
                {ASSIGNABLE_PROFILE_PLAN_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug === "enterprise" ? "enterprise — custom" : slug}
                  </option>
                ))}
              </select>
              {legacyStoredPlan ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Stored previous-catalog plan ({legacyStoredPlan}). Saving applies the current catalog package
                  to this company&apos;s subscription.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Changing the package updates the company subscription. Trial dates and billing history are kept.
              </p>
            </div>
          </div>
        </form>

        {isEdit ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Account actions</p>
              <StatusBadge status={liveStatus} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Package</dt>
              <dd className="capitalize text-foreground">{user?.plan || 'none'}</dd>
              <dt className="text-muted-foreground">Subscription</dt>
              <dd className="text-foreground">{user?.subscription_status || 'none'}</dd>
              <dt className="text-muted-foreground">Trial</dt>
              <dd className="text-foreground">{trialLabel}</dd>
              {user?.subscription_managed_by_admin ? (
                <>
                  <dt className="text-muted-foreground">Managed</dt>
                  <dd className="text-foreground">By administrator</dd>
                </>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              {liveStatus === 'paused' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={accessMutation.isPending || !editId}
                  onClick={() => accessMutation.mutate({ id: editId, access: 'active' })}
                >
                  Resume account
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={accessMutation.isPending || !editId || liveStatus === 'none'}
                  onClick={() => accessMutation.mutate({ id: editId, access: 'paused' })}
                >
                  Pause account
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Pausing restricts access only. The user, company data, documents, payroll records and payment
              history are kept, and sign-in credentials are unchanged.
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
