import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { platformUsersQueryFn } from '@/api/platformUsersQueryFn';
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

const PLAN_DEFAULT_AMOUNT = {
  individual: 25,
  sme: 50,
  corporate: 110,
};

/** Map profile / app plan names to subscription plan keys */
export function mapProfilePlanToSubPlan(plan) {
  const x = String(plan || '').toLowerCase();
  if (['individual', 'basic', 'starter', 'free'].includes(x)) return 'individual';
  if (['sme', 'professional', 'business'].includes(x)) return 'sme';
  if (['corporate', 'enterprise'].includes(x)) return 'corporate';
  if (x === 'none' || x === 'trial' || !x) return 'individual';
  return 'individual';
}

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

function emptyForm() {
  return {
    user_id: '',
    user_name: '',
    user_email: '',
    plan: 'individual',
    status: 'active',
    amount: 25,
    billing_cycle: 'monthly',
    start_date: todayDate(),
    next_billing_date: endOfMonthDate(),
  };
}

/**
 * @param {{ open: boolean, onClose: () => void, subscription: object | null }} props
 */
export default function SubscriptionFormDialog({ open, onClose, subscription }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const isEdit = Boolean(subscription?.id);
  const { data: users = [] } = useQuery({
    queryKey: ['platform-users'],
    queryFn: () => platformUsersQueryFn(500),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (subscription?.id) {
      setForm({
        user_id: subscription.user_id || '',
        user_name: subscription.user_name || '',
        user_email: subscription.user_email || '',
        plan: subscription.plan || 'individual',
        status: subscription.status || 'active',
        amount: subscription.amount ?? PLAN_DEFAULT_AMOUNT[subscription.plan] ?? 25,
        billing_cycle: subscription.billing_cycle || 'monthly',
        start_date: subscription.start_date
          ? String(subscription.start_date).slice(0, 10)
          : todayDate(),
        next_billing_date: subscription.next_billing_date
          ? String(subscription.next_billing_date).slice(0, 10)
          : endOfMonthDate(),
      });
    } else {
      // Create flow: optional row prefill (user without subscription row yet)
      if (subscription?.user_id && !subscription?.id) {
        const p = mapProfilePlanToSubPlan(subscription.plan);
        setForm({
          ...emptyForm(),
          user_id: String(subscription.user_id),
          user_name: subscription.user_name || '',
          user_email: subscription.user_email || '',
          plan: p,
          amount: PLAN_DEFAULT_AMOUNT[p] ?? 25,
          status: 'active',
          billing_cycle: subscription.billing_cycle || 'monthly',
          start_date: todayDate(),
          next_billing_date: endOfMonthDate(),
        });
      } else {
        setForm(emptyForm());
      }
    }
  }, [open, subscription]);

  const buildPayload = () => {
    const amount = Number(form.amount);
    const payload = {
      user_id: form.user_id || null,
      user_name: form.user_name.trim(),
      user_email: form.user_email.trim().toLowerCase(),
      email: form.user_email.trim().toLowerCase(),
      full_name: form.user_name.trim(),
      plan: form.plan,
      current_plan: form.plan,
      status: form.status,
      amount,
      custom_price: amount,
      billing_cycle: form.billing_cycle,
      start_date: form.start_date
        ? new Date(`${form.start_date}T12:00:00`).toISOString()
        : null,
      next_billing_date: form.next_billing_date
        ? new Date(`${form.next_billing_date}T12:00:00`).toISOString()
        : null,
    };
    return payload;
  };

  const createMutation = useMutation({
    mutationFn: (payload) => paidly.entities.Subscription.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('Subscription created');
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Failed to create subscription'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => paidly.entities.Subscription.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit subscription' : 'Add subscription'}</DialogTitle>
        </DialogHeader>
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
                onChange={(e) => {
                  const plan = e.target.value;
                  setForm((f) => ({
                    ...f,
                    plan,
                    amount: PLAN_DEFAULT_AMOUNT[plan] ?? f.amount,
                  }));
                }}
              >
                <option value="individual">Individual</option>
                <option value="sme">SME</option>
                <option value="corporate">Corporate</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sub-amount">Amount (ZAR)</Label>
              <Input
                id="sub-amount"
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
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
                onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}
              >
                <option value="monthly">monthly</option>
                <option value="yearly">yearly</option>
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
