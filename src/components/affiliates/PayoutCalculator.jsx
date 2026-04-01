import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function PayoutCalculator({ open, onClose, affiliate }) {
  const queryClient = useQueryClient();
  const [grossAmount, setGrossAmount] = useState(0);
  const [referralsCount, setReferralsCount] = useState(0);
  const [commissionRate, setCommissionRate] = useState(15);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setCommissionRate(Number(affiliate?.commission_rate ?? 15));
  }, [affiliate?.commission_rate, open]);

  const commissionAmount = useMemo(
    () => (Number(grossAmount || 0) * Number(commissionRate || 0)) / 100,
    [grossAmount, commissionRate]
  );

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
    createMutation.mutate({
      affiliate_id: affiliate.id,
      affiliate_name: affiliate.applicant_name,
      affiliate_email: affiliate.applicant_email,
      referral_code: affiliate.referral_code || null,
      gross_amount: Number(grossAmount || 0),
      referrals_count: Number(referralsCount || 0),
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
              <Label htmlFor="gross">Gross amount</Label>
              <Input id="gross" type="number" min={0} value={grossAmount} onChange={(e) => setGrossAmount(Number(e.target.value))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="referrals">Referrals</Label>
              <Input id="referrals" type="number" min={0} value={referralsCount} onChange={(e) => setReferralsCount(Number(e.target.value))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rate">Commission rate (%)</Label>
            <Input id="rate" type="number" min={0} max={100} value={commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value))} />
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
