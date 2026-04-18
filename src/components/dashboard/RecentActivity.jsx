import { Link } from 'react-router-dom';
import { stableDirectoryRowKey, stableEntityRowKey } from '@/utils/stableListKey';
import { UserPlus, UserCheck, AlertCircle, Loader2, Mail, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/dashboard/StatusBadge';

function normStatus(s) {
  return String(s || '').toLowerCase();
}

/**
 * @param {{
 *   users: object[],
 *   affiliates: object[],
 *   pendingAffiliateCount?: number,
 *   busyAffiliateId?: string | null,
 *   onApproveAffiliate?: (aff: object) => void | Promise<void>,
 *   onDeclineAffiliate?: (aff: object) => void | Promise<void>,
 *   onResendAffiliateLink?: (aff: object) => void | Promise<void>,
 * }} props
 */
export default function RecentActivity({
  users,
  affiliates,
  pendingAffiliateCount,
  busyAffiliateId = null,
  onApproveAffiliate,
  onDeclineAffiliate,
  onResendAffiliateLink,
}) {
  const recentUsers = users.slice(0, 4);
  const pendingList = affiliates.filter((a) => normStatus(a.status) === 'pending');
  const pendingAffiliates = pendingList.slice(0, 5);
  const pendingCount =
    typeof pendingAffiliateCount === 'number' ? pendingAffiliateCount : pendingList.length;

  const approvedRecent = affiliates
    .filter((a) => {
      const st = normStatus(a.status);
      return st === 'approved' || st === 'accepted';
    })
    .slice(0, 4);

  const showAffiliateActions = Boolean(
    onApproveAffiliate || onDeclineAffiliate || onResendAffiliateLink
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h2 className="font-semibold">Recent Activity</h2>
        {showAffiliateActions ? (
          <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" asChild>
            <Link to="/admin-v2/affiliates">Full queue</Link>
          </Button>
        ) : null}
      </div>
      <p className="mb-5 text-xs text-muted-foreground">{pendingCount} pending affiliate reviews</p>

      <div className="space-y-4">
        {recentUsers.map((user, idx) => (
          <div key={stableDirectoryRowKey(user, idx)} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
              <UserPlus className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.full_name || user.email}</p>
              <p className="text-xs text-muted-foreground">Joined recently</p>
            </div>
          </div>
        ))}

        {showAffiliateActions && (pendingAffiliates.length > 0 || approvedRecent.length > 0) ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Affiliates</p>
            {pendingAffiliates.map((aff, idx) => {
              const busy = busyAffiliateId === aff.id;
              return (
                <div
                  key={stableEntityRowKey(aff, idx)}
                  className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
                      <UserCheck className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{aff.applicant_name || '—'}</p>
                      <p className="truncate text-xs text-muted-foreground">{aff.applicant_email}</p>
                      <div className="mt-1">
                        <StatusBadge status="pending" />
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {onApproveAffiliate ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={busy}
                        onClick={() => onApproveAffiliate(aff)}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                        <span className="ml-1">Approve</span>
                      </Button>
                    ) : null}
                    {onDeclineAffiliate ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 border-red-500/30 text-red-600 hover:bg-red-500/10"
                        disabled={busy}
                        onClick={() => onDeclineAffiliate(aff)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span className="ml-1">Decline</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {onResendAffiliateLink && approvedRecent.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-medium text-muted-foreground">Approved — resend link</p>
                {approvedRecent.map((aff, idx) => {
                  const busy = busyAffiliateId === aff.id;
                  return (
                    <div
                      key={stableEntityRowKey(aff, idx)}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{aff.applicant_name || '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">{aff.applicant_email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge status="approved" />
                          {aff.referral_code ? (
                            <code className="rounded bg-muted px-1 text-[10px]">{aff.referral_code}</code>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0 gap-1"
                        disabled={busy}
                        onClick={() => onResendAffiliateLink(aff)}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                        <span className="ml-0.5">Resend</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          pendingAffiliates.map((aff, idx) => (
            <div key={stableEntityRowKey(aff, idx)} className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                <UserCheck className="h-4 w-4 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{aff.applicant_name}</p>
                <p className="text-xs text-muted-foreground">Affiliate application pending</p>
              </div>
            </div>
          ))
        )}

        {recentUsers.length === 0 && pendingAffiliates.length === 0 && (!showAffiliateActions || approvedRecent.length === 0) ? (
          <div className="py-6 text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : null}
      </div>
      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Affiliate queue:{' '}
        <code className="rounded bg-muted/80 px-1 font-mono text-[10px] text-foreground">affiliate_applications</code>{' '}
        (admin API). Actions refresh counts after approve or decline.
      </p>
    </div>
  );
}
