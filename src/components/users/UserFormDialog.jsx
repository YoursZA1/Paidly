import { useEffect, useState } from 'react';
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

function emptyForm() {
  return {
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    company_address: '',
    company_website: '',
    status: 'active',
    plan: 'none',
  };
}

/**
 * @param {{ open: boolean, onClose: () => void, user: object | null }} props
 */
export default function UserFormDialog({ open, onClose, user }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const editId = adminRowPrimaryId(user);
  const isEdit = Boolean(editId);

  useEffect(() => {
    if (!open) return;
    if (adminRowPrimaryId(user)) {
      setForm({
        full_name: user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        company_name: user.company_name || user.company || '',
        company_address: user.company_address || '',
        company_website: user.company_website || '',
        status: user.status || 'active',
        plan: user.plan || 'none',
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, user]);

  const buildPayload = () => {
    const planSlug = String(form.plan || "none").trim().toLowerCase();
    const billingPlan = planSlug === "none" ? "free" : planSlug;
    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      company_name: form.company_name.trim(),
      company_address: form.company_address.trim(),
      company_website: form.company_website.trim(),
      status: form.status,
      plan: billingPlan,
      subscription_plan: billingPlan,
    };
    if (["individual", "sme", "corporate"].includes(planSlug)) {
      payload.subscription_status = "active";
      payload.trial_ends_at = null;
      payload.is_pro = true;
    } else {
      payload.subscription_status = "inactive";
      payload.is_pro = false;
    }
    return payload;
  };

  const createMutation = useMutation({
    mutationFn: (payload) => paidly.entities.PlatformUser.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('User created');
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => paidly.entities.PlatformUser.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('User updated successfully');
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Failed to update user'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.email.trim()) {
      toast.error('Email is required');
      return;
    }
    const data = buildPayload();
    if (isEdit && editId) {
      updateMutation.mutate({ id: editId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const pending = createMutation.isPending || updateMutation.isPending;

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
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="user-status">Status</Label>
              <select
                id="user-status"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="suspended">suspended</option>
                <option value="pending">pending</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-plan">Plan</Label>
              <select
                id="user-plan"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
              >
                <option value="none">none</option>
                <option value="individual">individual</option>
                <option value="sme">sme</option>
                <option value="corporate">corporate</option>
              </select>
            </div>
          </div>
        </form>
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
