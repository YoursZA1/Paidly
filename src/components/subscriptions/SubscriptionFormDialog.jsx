import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
import { createAdminSubscription, updateAdminSubscription } from '@/api/mutateAdminSubscription';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PlatformUsersLoadErrorHint from '@/components/PlatformUsersLoadErrorHint';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  buildPublicCatalogFamilies,
  isLegacyPlanSlug,
  mapLegacySlugToCurrentFamily,
  resolveCurrentCatalogAssignment,
} from '@/lib/plans.js';
import { normalizePaidPackageKey } from '@/lib/subscriptionPlan';

function toLocalDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayDate() {
  return toLocalDateInput(new Date());
}

function endOfMonthDate() {
  const now = new Date();
  return toLocalDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function assignmentForForm(plan, billingCycle) {
  return resolveCurrentCatalogAssignment({
    plan,
    billing_cycle: billingCycle === 'yearly' ? 'annual' : billingCycle,
  });
}

function emptyForm() {
  const assigned = assignmentForForm('starter', 'monthly');
  return {
    user_id: '',
    user_name: '',
    user_email: '',
    plan: 'starter',
    status: 'active',
    amount: assigned?.amount ?? 50,
    billing_cycle: 'monthly',
    start_date: todayDate(),
    next_billing_date: endOfMonthDate(),
  };
}

function formatPlanOption(family) {
  if (!family) return '';
  if (family.contact_sales || family.family === 'enterprise') {
    return `${family.name} — Custom`;
  }
  const monthly = Number(family.monthly?.amount);
  const price = Number.isFinite(monthly) ? `R${monthly}/mo` : '';
  return price ? `${family.name} — ${price}` : family.name;
}

/**
 * Map profile / app plan names to current catalog families (legacy slugs migrate).
 */
export function mapProfilePlanToSubPlan(plan) {
  if (isLegacyPlanSlug(plan)) return mapLegacySlugToCurrentFamily(plan) || 'starter';
  return normalizePaidPackageKey(plan) === 'none' ? 'starter' : normalizePaidPackageKey(plan);
}

/**
 * @param {{ open: boolean, onClose: () => void, subscription: object | null }} props
 */
export default function SubscriptionFormDialog({ open, onClose, subscription }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const isEdit = Boolean(subscription?.id);
  const storedPlan = subscription?.plan || subscription?.plan_slug || subscription?.current_plan || '';
  const legacyStored = isLegacyPlanSlug(storedPlan);
  const { data: users = [], isError: platformUsersError, error: platformUsersErr } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(500),
    enabled: open,
  });
  const { data: catalogFamilies = [] } = useQuery({
    queryKey: ['subscription-plans-catalog'],
    enabled: open,
    queryFn: async () => {
      const res = await fetch('/api/subscriptions/plans');
      const data = await res.json().catch(() => ({}));
      const rows = res.ok && Array.isArray(data.plans) ? data.plans : [];
      return buildPublicCatalogFamilies(rows);
    },
    placeholderData: () => buildPublicCatalogFamilies([]),
  });

  useEffect(() => {
    if (!open) return;
    if (subscription?.id) {
      const family = mapProfilePlanToSubPlan(storedPlan);
      const cycleRaw = subscription.billing_cycle === 'annual' || subscription.billing_cycle === 'annually'
        ? 'yearly'
        : subscription.billing_cycle || 'monthly';
      const cycle = family === 'enterprise' ? 'monthly' : cycleRaw;
      const assigned = assignmentForForm(family, cycle);
      setForm({
        user_id: subscription.user_id || '',
        user_name: subscription.user_name || '',
        user_email: subscription.user_email || '',
        plan: family,
        status:
          subscription.status === 'suspended' ? 'paused' : subscription.status || 'active',
        amount: assigned?.amount ?? 0,
        billing_cycle: cycle === 'annual' ? 'yearly' : cycle,
        start_date: subscription.start_date
          ? String(subscription.start_date).slice(0, 10)
          : todayDate(),
        next_billing_date: subscription.next_billing_date
          ? String(subscription.next_billing_date).slice(0, 10)
          : endOfMonthDate(),
      });
    } else if (subscription?.user_id && !subscription?.id) {
      const p = mapProfilePlanToSubPlan(subscription.plan);
      const assigned = assignmentForForm(p, 'monthly');
      setForm({
        ...emptyForm(),
        user_id: String(subscription.user_id),
        user_name: subscription.user_name || '',
        user_email: subscription.user_email || '',
        plan: p,
        amount: assigned?.amount ?? 0,
        status: 'active',
        billing_cycle: 'monthly',
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, subscription, storedPlan]);

  const applyPlanAndCycle = (plan, billingCycle) => {
    const cycle = plan === 'enterprise' ? 'monthly' : billingCycle;
    const assigned = assignmentForForm(plan, cycle);
    setForm((f) => ({
      ...f,
      plan,
      billing_cycle: cycle,
      amount: assigned?.amount ?? 0,
    }));
  };

  const buildPayload = () => {
    const assigned = assignmentForForm(form.plan, form.billing_cycle);
    const amount = assigned?.amount ?? 0;
    return {
      user_id: form.user_id || null,
      user_name: form.user_name.trim(),
      user_email: form.user_email.trim().toLowerCase(),
      email: form.user_email.trim().toLowerCase(),
      full_name: form.user_name.trim(),
      plan: assigned?.family || form.plan,
      current_plan: assigned?.family || form.plan,
      plan_slug: assigned?.slug,
      status: form.status,
      amount,
      billing_cycle: assigned?.billing_cycle || 'monthly',
      start_date: form.start_date
        ? new Date(`${form.start_date}T12:00:00`).toISOString()
        : null,
      next_billing_date: form.next_billing_date
        ? new Date(`${form.next_billing_date}T12:00:00`).toISOString()
        : null,
    };
  };

  const createMutation = useMutation({
    mutationFn: (payload) => createAdminSubscription(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-overview'] });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Subscription created');
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Failed to create subscription'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAdminSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-overview'] });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Subscription updated');
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Failed to update subscription'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.user_email.trim()) {
      toast.error('Email is required');
      return;
    }
    const data = buildPayload();
    if (isEdit) {
      updateMutation.mutate({ id: subscription.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const pending = createMutation.isPending || updateMutation.isPending;
  const families = catalogFamilies.length ? catalogFamilies : buildPublicCatalogFamilies([]);
  const enterpriseSelected = form.plan === 'enterprise';
  const amountLabel = useMemo(() => {
    if (enterpriseSelected) return 'Custom';
    const n = Number(form.amount);
    return Number.isFinite(n) ? String(n) : '';
  }, [enterpriseSelected, form.amount]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit subscription' : 'Add subscription'}</DialogTitle>
        </DialogHeader>
        {platformUsersError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load users from the backend: {platformUsersErr?.message || 'Unknown error'}.
              <PlatformUsersLoadErrorHint message={platformUsersErr?.message} />
            </AlertDescription>
          </Alert>
        ) : null}
        {legacyStored ? (
          <Alert>
            <AlertDescription>
              This account is on a previous catalog plan ({String(storedPlan)}). Saving moves them onto
              Starter, Business, Growth, or Enterprise. Payment history is kept.
            </AlertDescription>
          </Alert>
        ) : null}
        <form id="subscription-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="sub-user">Select user</Label>
            <select
              id="sub-user"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              value={form.user_id}
              onChange={(e) => {
                const userId = e.target.value;
                const selected = users.find((u) => String(u.id) === userId);
                setForm((f) => ({
                  ...f,
                  user_id: userId,
                  user_name: selected?.full_name || f.user_name,
                  user_email: selected?.email || f.user_email,
                }));
              }}
            >
              <option value="">Choose existing user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.full_name || u.email || 'Unnamed user')} - {u.email}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-name">Name</Label>
            <Input
              id="sub-name"
              value={form.user_name}
              onChange={(e) => setForm({ ...form, user_name: e.target.value })}
              placeholder="Subscriber name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-email">Email</Label>
            <Input
              id="sub-email"
              type="email"
              required
              value={form.user_email}
              onChange={(e) => setForm({ ...form, user_email: e.target.value })}
              placeholder="user@company.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sub-plan">Plan</Label>
              <select
                id="sub-plan"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.plan}
                onChange={(e) => applyPlanAndCycle(e.target.value, form.billing_cycle)}
              >
                {families.map((family) => (
                  <option key={family.family} value={family.family}>
                    {formatPlanOption(family)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-amount">Amount (ZAR)</Label>
              <Input
                id="sub-amount"
                readOnly
                value={amountLabel}
                aria-readonly="true"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sub-status">Status</Label>
              <select
                id="sub-status"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="cancelled">cancelled</option>
                <option value="expired">expired</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-billing">Billing</Label>
              <select
                id="sub-billing"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.billing_cycle}
                disabled={enterpriseSelected}
                onChange={(e) => applyPlanAndCycle(form.plan, e.target.value)}
              >
                <option value="monthly">monthly</option>
                {enterpriseSelected ? null : <option value="yearly">yearly</option>}
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-start">Billing start (today default)</Label>
            <Input
              id="sub-start"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-next">Next billing (month-end default)</Label>
            <Input
              id="sub-next"
              type="date"
              value={form.next_billing_date}
              onChange={(e) => setForm({ ...form, next_billing_date: e.target.value })}
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="subscription-form" disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
