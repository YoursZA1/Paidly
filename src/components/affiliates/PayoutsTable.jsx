import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { paidly } from '@/api/paidlyClient';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { toast } from 'sonner';

export default function PayoutsTable() {
  const queryClient = useQueryClient();
  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['affiliate-payouts'],
    queryFn: () => paidly.entities.AffiliatePayout.list('-created_date', 200),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => paidly.entities.AffiliatePayout.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliate-payouts'] });
      toast.success('Payout updated');
    },
    onError: (e) => toast.error(e?.message || 'Failed to update payout'),
  });

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left px-6 py-3 font-medium">Affiliate</th>
              <th className="text-left px-6 py-3 font-medium">Code</th>
              <th className="text-left px-6 py-3 font-medium">Period</th>
              <th className="text-left px-6 py-3 font-medium">Rate</th>
              <th className="text-left px-6 py-3 font-medium">Approved Referrals</th>
              <th className="text-left px-6 py-3 font-medium">Gross</th>
              <th className="text-left px-6 py-3 font-medium">Commission</th>
              <th className="text-left px-6 py-3 font-medium">Status</th>
              <th className="text-right px-6 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium">{p.affiliate_name || '—'}</p>
                  <p className="text-xs text-muted-foreground">{p.affiliate_email || '—'}</p>
                </td>
                <td className="px-6 py-4 text-xs font-mono">{p.referral_code || '—'}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{p.period_month || '—'}</td>
                <td className="px-6 py-4 text-sm">{p.commission_rate != null ? `${Number(p.commission_rate).toFixed(2)}%` : '—'}</td>
                <td className="px-6 py-4 text-sm">{p.referrals_count ?? '—'}</td>
                <td className="px-6 py-4 text-sm">R {Number(p.gross_amount ?? 0).toFixed(2)}</td>
                <td className="px-6 py-4 text-sm font-medium">R {Number(p.commission_amount ?? p.amount ?? 0).toFixed(2)}</td>
                <td className="px-6 py-4"><StatusBadge status={p.status || 'pending'} /></td>
                <td className="px-6 py-4 text-right">
                  {p.status !== 'paid' ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateMutation.mutate({
                          id: p.id,
                          data: { status: 'paid', payment_date: new Date().toISOString() },
                        })
                      }
                    >
                      Mark Paid
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {p.payment_date ? format(new Date(p.payment_date), 'dd MMM yyyy') : 'Paid'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {payouts.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground text-sm">
                  {isLoading ? 'Loading payouts...' : 'No payouts yet'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
