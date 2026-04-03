import { CheckCircle, Copy, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * @param {{
 *   notice: {
 *     applicantName: string,
 *     applicantEmail: string,
 *     referralCode: string,
 *     referralLink: string,
 *     emailSent: boolean,
 *     emailError: string | null,
 *     isResend?: boolean,
 *   } | null,
 *   onOpenChange: (open: boolean) => void,
 * }} props
 */
export default function AffiliateApprovalResultDialog({ notice, onOpenChange }) {
  const open = notice != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby="affiliate-approval-notice-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            {notice?.isResend ? (
              <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            ) : (
              <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            )}
            {notice?.isResend ? 'Referral link sent' : 'Affiliate approved'}
          </DialogTitle>
          <DialogDescription id="affiliate-approval-notice-desc" className="text-left">
            {notice?.isResend
              ? `Another email with their signup link was sent to ${notice.applicantEmail || 'the applicant'}.`
              : `${notice?.applicantName || 'Applicant'} is approved. Their unique referral link is below — the same URL was included in the email when delivery succeeded.`}
          </DialogDescription>
        </DialogHeader>
        {notice ? (
          <div className="space-y-4">
            {!notice.isResend && !notice.emailSent ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Confirmation email could not be sent
                  {notice.emailError ? `: ${notice.emailError}` : ''}. Copy the link below and send it to{' '}
                  {notice.applicantEmail || 'the applicant'} manually.
                </AlertDescription>
              </Alert>
            ) : null}
            {!notice.isResend && notice.emailSent ? (
              <Alert className="border-emerald-500/35 bg-emerald-500/[0.08] text-foreground">
                <AlertDescription>
                  Sent to <span className="font-medium">{notice.applicantEmail}</span> — includes their referral code and
                  unique share link for signups.
                </AlertDescription>
              </Alert>
            ) : null}
            {notice.isResend ? (
              <Alert className="border-border bg-muted/40">
                <AlertDescription>
                  If they still don&apos;t see it, ask them to check spam. You can copy the link below as a backup.
                </AlertDescription>
              </Alert>
            ) : null}
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Referral code</p>
              <p className="font-mono text-sm">{notice.referralCode || '—'}</p>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Unique share link</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <p className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 p-2 font-mono text-xs leading-relaxed">
                  {notice.referralLink || '—'}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 gap-2"
                  disabled={!notice.referralLink}
                  onClick={async () => {
                    if (!notice.referralLink) return;
                    await navigator.clipboard.writeText(notice.referralLink);
                    toast.success('Link copied to clipboard');
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  Copy link
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
