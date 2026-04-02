import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function PayoutCalculator({ open, onClose, affiliate }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const commissionRate = Number(affiliate?.commission_rate ?? 15);

  const { data: payouts = [] } = useQuery({
    queryKey: ['affiliate-payouts'],
    queryFn: () => paidly.entities.AffiliatePayout.list('-created_date', 500),
    enabled: open,
  });

  const eligibleCommissions = useMemo(
    () =>
      (payouts || []).filter(
        (p) =>
          p.affiliate_id === affiliate?.id &&
          (p.status === 'pending' || p.status === 'approved') &&
          String(p.source || '').toLowerCase().includes('subscription')
      ),
    [payouts, affiliate?.id]
  );

  const commissionAmount = useMemo(
    () => eligibleCommissions.reduce((sum, p) => sum + Number(p.amount ?? p.commission_amount ?? 0), 0),
    [eligibleCommissions]
  );

  const paidUsersCount = useMemo(
    () => new Set(eligibleCommissions.map((p) => p.referral_id).filter(Boolean)).size,
    [eligibleCommissions]
  );

  const grossAmount = useMemo(() => {
    if (!commissionRate) return 0;
    return (commissionAmount * 100) / commissionRate;
  }, [commissionAmount, commissionRate]);

  const createMutation = useMutation({
    mutationFn: (payload) => paidly.entities.AffiliatePayout.create(payload),
    onSuccess: () => {
      toast.success('Payout generated');
      queryClient.invalidateQueries({ queryKey: ['affiliate-payouts'] });
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Failed to generate payout'),
  });

  const handleCreate = () => {
    if (!affiliate?.id) return;
    if (commissionAmount <= 0 || paidUsersCount <= 0) {
      toast.error('No eligible paid first-month referrals available for payout.');
      return;
    }
    createMutation.mutate({
      affiliate_id: affiliate.id,
      affiliate_name: affiliate.applicant_name,
      affiliate_email: affiliate.applicant_email,
      referral_code: affiliate.referral_code || null,
      gross_amount: Number(grossAmount || 0),
      referrals_count: Number(paidUsersCount || 0),
      commission_rate: Number(commissionRate || 0),
      commission_amount: Number(commissionAmount || 0),
      amount: Number(commissionAmount || 0),
      status: 'pending',
      notes: notes.trim() || null,
      period_month: new Date().toISOString().slice(0, 7),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Payout</DialogTitle>
          <DialogDescription className="sr-only">Enter gross amount and commission details for this payout.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">{affiliate?.applicant_name || 'Affiliate'}</p>
            <p className="text-muted-foreground">{affiliate?.applicant_email || '—'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Gross amount (derived)</Label>
              <Input type="number" value={Number(grossAmount || 0).toFixed(2)} disabled />
            </div>
            <div className="grid gap-2">
              <Label>Paid first-month referrals</Label>
              <Input type="number" value={paidUsersCount} disabled />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Commission rate (%)</Label>
            <Input type="number" min={0} max={100} value={commissionRate} disabled />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          <div className="rounded-lg bg-muted/30 p-3 text-sm">
            <p className="text-muted-foreground">Commission Amount</p>
            <p className="text-lg font-semibold">R {Number(commissionAmount || 0).toFixed(2)}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Create Payout'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
