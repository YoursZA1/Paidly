import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paidly } from '@/api/paidlyClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { SystemSettingsService } from '@/services/SystemSettingsService';

export default function PayoutCalculator({ open, onClose, affiliate }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const defaultPct = SystemSettingsService.getAffiliateDefaultCommissionPercent();
  const baseRate = Number(affiliate?.commission_rate ?? defaultPct);
  const [payoutCommissionPct, setPayoutCommissionPct] = useState(baseRate);

  const partnerAffiliateId = affiliate?.affiliate_partner_id ?? null;

  useEffect(() => {
    if (!open || !affiliate) return;
    setPayoutCommissionPct(Number(affiliate.commission_rate ?? defaultPct));
    setNotes('');
  }, [open, affiliate?.id, affiliate?.commission_rate, defaultPct, affiliate]);

  const { data: payouts = [] } = useQuery({
    queryKey: ['affiliate-payouts'],
    queryFn: () => paidly.entities.AffiliatePayout.list('-created_date', 500),
    enabled: open,
  });

  const eligibleCommissions = useMemo(
    () =>
      (payouts || []).filter(
        (p) =>
          partnerAffiliateId &&
          String(p.affiliate_id) === String(partnerAffiliateId) &&
          (p.status === 'pending' || p.status === 'approved') &&
          String(p.source || '').toLowerCase().includes('subscription')
      ),
    [payouts, partnerAffiliateId]
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
    if (!payoutCommissionPct) return 0;
    return (commissionAmount * 100) / payoutCommissionPct;
  }, [commissionAmount, payoutCommissionPct]);

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
    if (!partnerAffiliateId) {
      toast.error('Partner profile is missing — re-fetch affiliates or re-approve if this persists.');
      return;
    }
    if (commissionAmount <= 0 || paidUsersCount <= 0) {
      toast.error('No eligible subscription commission rows for payout (check affiliate partner id and source).');
      return;
    }
    createMutation.mutate({
      affiliate_id: partnerAffiliateId,
      affiliate_name: affiliate.applicant_name,
      affiliate_email: affiliate.applicant_email,
      referral_code: affiliate.referral_code || null,
      gross_amount: Number(grossAmount || 0),
      referrals_count: Number(paidUsersCount || 0),
      commission_rate: Number(payoutCommissionPct || 0),
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
          {!partnerAffiliateId ? (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              No linked partner row yet — referral stats and payouts need an approved affiliate profile.
            </p>
          ) : null}
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
              <Label>Approved paying referrals</Label>
              <Input type="number" value={paidUsersCount} disabled />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Commission rate (%) — payout adjustment</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={Number.isFinite(payoutCommissionPct) ? payoutCommissionPct : ''}
              onChange={(e) => setPayoutCommissionPct(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Changing this only affects derived gross for this payout record; ledger commission total stays the same.
            </p>
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
